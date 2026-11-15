# AI Support Platform — System Architecture

## 1. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Client_Layer["Client Layer"]
        Widget["Embeddable Widget (Shadow DOM JS)"]
        Dashboard["Admin & Agent Dashboard (Next.js)"]
    end

    subgraph API_Layer["NestJS Backend (/backend)"]
        Gateway["REST API + Guard Layer (JWT / RBAC / Rate Limit)"]
        WS["WebSocket Gateway (Socket.io + Redis Adapter)"]
        RLS["Tenant RLS Transaction Manager (SET LOCAL app.current_tenant_id)"]
        ChatSvc["RAG Chat Service (Two-Stage Confidence Gate)"]
        Worker["Ingestion Worker (Chunker + Embedding Generator)"]
    end

    subgraph Data_Messaging["Data & Messaging Layer"]
        PG[("PostgreSQL 16 + pgvector (RLS Enforced)")]
        Redis[("Redis 7 (Cache, Rate Limit, WS Pub/Sub)")]
        RMQ[["RabbitMQ (Ingestion Queue + 3x Retry + DLQ)"]]
    end

    subgraph External_AI["External AI Providers"]
        EmbedAPI["Embedding API (OpenAI / Voyage / Mock)"]
        ClaudeAPI["Anthropic Claude API"]
    end

    Widget <-->|"HTTPS + WebSockets"| Gateway
    Widget <-->|"Live Handoff Events"| WS
    Dashboard <-->|"HTTPS (HttpOnly JWT)"| Gateway
    Dashboard <-->|"Agent Inbox Events"| WS

    Gateway --> RLS
    RLS --> PG
    Gateway <--> Redis
    Gateway -->|"Publish Upload Job"| RMQ
    RMQ -->|"Consume Job"| Worker
    Worker --> EmbedAPI
    Worker -->|"Store Chunks + Vectors"| RLS
    Gateway --> ChatSvc
    ChatSvc --> EmbedAPI
    ChatSvc --> RLS
    ChatSvc --> ClaudeAPI
    WS <--> Redis
```

---

## 2. Multi-Tenant Row-Level Security (RLS) Isolation Model

A common pitfall when combining PostgreSQL RLS with ORMs like TypeORM is **connection pooling leakage**: if `SET app.current_tenant_id` is executed at the session level, a pooled connection returned to the pool retains the previous request's tenant ID.

To eliminate this risk completely:

1. **Transaction-Local Context (`SET LOCAL`):** Every tenant-scoped operation executes inside a transaction that immediately runs:
   ```sql
   SELECT set_config('app.current_tenant_id', $1, true);
   ```
   Because the third argument `is_local` is `true`, PostgreSQL automatically clears the setting the instant the transaction commits or rolls back.
2. **`FORCE ROW LEVEL SECURITY`:** All tenant-scoped tables (`users`, `documents`, `chunks`, `conversations`, `messages`, `usage_events`) enable both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with policies checking:
   ```sql
   tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
   ```
   If any code path forgets to set the tenant context, queries fail closed (returning 0 rows or rejecting inserts) rather than leaking data across tenants.

---

## 3. Document Ingestion & RAG Pipeline Flow

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Business Owner
    actor Customer as End Customer
    actor Agent as Support Agent
    participant API as NestJS API
    participant RMQ as RabbitMQ (Queue + DLQ)
    participant Worker as Ingestion Worker
    participant PG as Postgres + pgvector (RLS)
    participant AI as Claude + Embedding API

    Owner->>API: POST /documents (PDF / MD / TXT / URL)
    API->>PG: INSERT document (status = 'Uploaded', tenant_id)
    API->>RMQ: Publish { documentId, tenantId }
    RMQ->>Worker: Deliver Job (max 3 retries)
    Worker->>PG: UPDATE status = 'Processing'
    Worker->>AI: Generate Embeddings for chunks
    Worker->>PG: INSERT chunks + vector(1536) with tenant_id
    Worker->>PG: UPDATE status = 'Ready'

    Customer->>API: POST /chat/:tenantKey/messages
    API->>AI: Embed customer query
    API->>PG: Cosine similarity search (RLS scoped to tenantId)
    alt Similarity >= Threshold (0.72) & Answerable
        API->>AI: Prompt Claude with retrieved chunks as data
        AI-->>API: Answer + Citations + Confidence
        API-->>Customer: Bot reply with source citations
    else Low Confidence or Customer Requests Human
        API->>PG: UPDATE conversation status = 'waiting'
        API-->>Agent: WebSocket event `handoff:queued`
        API-->>Customer: "Connecting you to a support agent..."
    end
```

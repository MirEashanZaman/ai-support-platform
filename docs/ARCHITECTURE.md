# AI Support Platform — System Architecture

## 1. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Client_Layer["Client Layer"]
        Widget["Embeddable Widget (Shadow DOM JS, Plain fetch)"]
        Dashboard["Admin & Agent Dashboard (Next.js 15, Axios + TanStack Query)"]
    end

    subgraph API_Layer["NestJS 11 Modular Monolith (/backend)"]
        Gateway["REST API + Guard Layer (JWT / RBAC / @RateLimit Redis Guard / Zod)"]
        Swagger["Swagger OpenAPI (/api-docs & /api-docs-json)"]
        WS["WebSocket Gateway (Socket.io /realtime — Tenant & Session Rooms)"]
        RLS["Tenant RLS Transaction Manager (SET LOCAL ROLE app_tenant_user + app.current_tenant_id)"]
        ChatSvc["RAG Chat Facade (Quota -> Cache -> VectorAdapter -> ClaudeAdapter + CircuitBreaker)"]
        Saga["Ingestion Saga Orchestrator (LIFO Compensating Rollback + 3x Retry + DLQ)"]
    end

    subgraph Data_Messaging["Data & Messaging Layer"]
        PG[("PostgreSQL 16 + pgvector (FORCE ROW LEVEL SECURITY / Embedded PGlite Fallback)")]
        Redis[("Redis 7 (Question Cache, Per-IP & Per-Tenant Rate Limits)")]
        RMQ[["RabbitMQ (document.ingestion.queue + document.ingestion.dlq)"]]
    end

    subgraph External_AI["External AI Providers (Strategy & Adapter Patterns)"]
        EmbedAPI["Embedding Provider (OpenAI / Voyage / Deterministic 1536-dim)"]
        ClaudeAPI["Anthropic Claude API (Grounded JSON + Prompt-Injection Guard)"]
    end

    Widget <-->|"HTTPS + CORS Origin Check"| Gateway
    Widget <-->|"Live Handoff Events"| WS
    Dashboard <-->|"HTTPS (HttpOnly Refresh Cookie + Bearer JWT)"| Gateway
    Dashboard <-->|"Live Agent Inbox Events"| WS

    Gateway --> RLS
    Gateway --> Swagger
    RLS --> PG
    Gateway <--> Redis
    Gateway -->|"Publish Upload Job"| RMQ
    RMQ -->|"Consume Job"| Saga
    Saga --> EmbedAPI
    Saga -->|"Store Chunks + vector(1536)"| RLS
    Gateway --> ChatSvc
    ChatSvc <--> Redis
    ChatSvc --> EmbedAPI
    ChatSvc --> RLS
    ChatSvc --> ClaudeAPI
    WS <--> Redis
```

---

## 2. Multi-Tenant Row-Level Security (RLS) Isolation Model

A critical risk when combining PostgreSQL RLS with ORMs like TypeORM is **connection pooling leakage**: if `SET app.current_tenant_id` is executed at the session level, a pooled connection returned to the pool retains the previous tenant's ID. Furthermore, if the app connects as the `postgres` superuser, PostgreSQL bypasses RLS policies altogether.

To eliminate both risks completely:
1. **Non-Superuser Role + Transaction-Local Context (`SET LOCAL`):** Every tenant-scoped operation in `RlsTransactionService` executes inside a database transaction that immediately runs:
   ```sql
   SET LOCAL ROLE app_tenant_user;
   SELECT set_config('app.current_tenant_id', $1, true);
   ```
   Because the third argument `is_local` is `true`, PostgreSQL automatically clears the tenant ID and role the instant the transaction commits or rolls back.
2. **`FORCE ROW LEVEL SECURITY`:** All 6 tenant-scoped tables (`users`, `documents`, `chunks`, `conversations`, `messages`, `usage_events`) enable both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with policies checking:
   ```sql
   tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
   ```
   If any code path forgets to set the tenant context, queries fail closed (returning `0` rows or rejecting inserts) rather than leaking data across tenants.

---

## 3. Document Ingestion Saga & RAG Escalation Flow

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Business Owner
    actor Customer as End Customer
    actor Agent as Support Agent
    participant API as NestJS API
    participant RMQ as RabbitMQ (Queue + DLQ)
    participant Saga as IngestionSagaService (LIFO Rollback)
    participant PG as Postgres + pgvector (RLS)
    participant AI as ClaudeLlmAdapter + CircuitBreaker

    Owner->>API: POST /documents (PDF / MD / TXT max 10MB or URL)
    API->>PG: INSERT document (status = 'Uploaded', tenant_id) + Audit Log
    API->>RMQ: Publish { documentId, tenantId, attempt: 1 }
    RMQ->>Saga: Execute 4-Stage Ingestion Saga
    Saga->>PG: Step 1: UPDATE status = 'Processing'
    Saga->>Saga: Step 2 & 3: Factory Parse + Strategy Chunk + 1536-dim Embed
    alt Ingestion Succeeded
        Saga->>PG: Step 4: INSERT chunks + vector(1536) & UPDATE status = 'Ready'
    else Step Fails (Retries 1..3)
        Saga->>PG: LIFO Compensating Rollback (DELETE partial chunks, revert status)
        Saga->>RMQ: Re-queue retry or route to document.ingestion.dlq ('Failed')
    end

    Customer->>API: POST /chat/:tenantKey/messages (@RateLimit + Quota Check)
    API->>PG: Cosine similarity search (RLS scoped to tenantId)
    alt High Confidence & Answerable
        API->>AI: Prompt Claude with <untrusted_business_data> chunks
        AI-->>API: Zod-validated { answer, citedChunkIds, confidence }
        API-->>Customer: Cited answer + Confidence badge (cached in Redis)
    else Low Confidence, Prompt Injection, CircuitBreaker Timeout, or Customer Asks for Human
        API->>PG: ConversationStateMachine: 'bot' -> 'waiting'
        API-->>Agent: WebSocket event `handoff:escalated`
        API-->>Customer: "Connecting you with a human support agent..."
        Agent->>API: POST /handoff/:id/claim ('waiting' -> 'human', Bot Muted)
        Agent->>API: POST /handoff/:id/reply (Real-time message to Customer)
        Agent->>API: POST /handoff/:id/close ('human' -> 'closed')
    end
```

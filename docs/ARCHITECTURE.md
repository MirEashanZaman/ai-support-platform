# AI Support Platform — System Architecture & Data Flow Specification

> **Architectural Blueprint, Multi-Tenant Row-Level Security (RLS) Transaction Model, and Asynchronous Saga Sequences**

---

## 0. End-to-End Flow at a Glance

![How AI Support Platform Works](./how-it-works.png)

- **Setup Phase (Once per Document):** `Business owner (Uploads documents)` → `Queue and worker (Chunk and embed)` → `Vector database (pgvector with RLS)`
- **Runtime Chat Phase (Every Customer Question):** `Customer (Asks in widget)` → `Search and check (Claude + top chunks from pgvector with RLS)` → branches deterministically into:
  1. **`Answer with sources (If confident)`** — Grounded response with document citation pills and confidence percentage.
  2. **`Human agent (If unsure or asked)`** — Automatic state transition (`bot` → `waiting`) and real-time WebSocket dispatch to the live agent inbox.

---

## 1. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Client_Layer["Client Layer"]
        Widget["Embeddable Widget (Shadow DOM JS, Plain fetch, XSS-safe textContent)"]
        Dashboard["Admin & Agent Dashboard (Next.js 15, React 19, Axios + TanStack Query)"]
    end

    subgraph API_Layer["NestJS 11 Modular Monolith (/backend)"]
        Gateway["REST API + Guard Layer (JWT / RBAC / @RateLimit Redis Guard / Zod)"]
        Swagger["Swagger OpenAPI (/api-docs & /api-docs-json)"]
        WS["WebSocket Gateway (Socket.io /realtime — Tenant & Session Rooms)"]
        RLS["Tenant RLS Transaction Manager (SET LOCAL ROLE app_tenant_user + app.current_tenant_id)"]
        ChatSvc["RAG Chat Facade (Quota -> Cache -> VectorAdapter -> ClaudeAdapter + CircuitBreaker)"]
        Presence["Presence Service (Redis SET With TTL for Live Agent Online/Offline Detection)"]
        Saga["Ingestion Saga Orchestrator (LIFO Compensating Rollback + 3x Retry + DLQ)"]
    end

    subgraph Data_Messaging["Data & Messaging Layer"]
        PG[("PostgreSQL 16 + pgvector (FORCE ROW LEVEL SECURITY / Embedded PGlite Fallback)")]
        Redis[("Redis 7 (Question Cache, Rate Limits, Agent Presence Sets)")]
        RMQ[["RabbitMQ (document.ingestion.queue + document.ingestion.dlq)"]]
    end

    subgraph External_AI["External AI Providers (Strategy & Adapter Patterns)"]
        EmbedAPI["Embedding Provider (OpenAI / Voyage / Deterministic 1536-dim)"]
        ClaudeAPI["Anthropic Claude API (XML-Escaped Grounded Prompt + JSON Output)"]
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
    ChatSvc --> Presence
    Presence <--> Redis
    ChatSvc --> EmbedAPI
    ChatSvc --> RLS
    ChatSvc --> ClaudeAPI
    WS <--> Redis
```

---

## 2. Multi-Tenant Row-Level Security (RLS) Isolation Model

A well-known vulnerability when combining PostgreSQL Row-Level Security with connection-pooled ORMs (such as TypeORM) is **session state bleeding**: if `SET app.current_tenant_id` is executed at the session level, a pooled connection returned to the pool retains the previous tenant's context. Additionally, if the application connects as the `postgres` superuser, PostgreSQL bypasses RLS policies altogether.

To eliminate both failure modes by construction:

1. **Non-Superuser Role + Transaction-Local Context (`SET LOCAL`):** Every tenant-scoped database operation in `RlsTransactionService` runs inside an explicit database transaction that immediately executes:
   ```sql
   SET LOCAL ROLE app_tenant_user;
   SELECT set_config('app.current_tenant_id', $1, true);
   ```
   Because the third argument `is_local` is `true`, PostgreSQL automatically resets both the role and `app.current_tenant_id` the instant the transaction commits or rolls back.
2. **`FORCE ROW LEVEL SECURITY` Across All Tenant Tables:** All 6 tenant-scoped tables (`users`, `documents`, `chunks`, `conversations`, `messages`, `usage_events`) enable both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with policies enforcing:
   ```sql
   tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
   ```
   If any code path omits the tenant context, queries fail closed (returning `0` rows or rejecting writes) rather than leaking data across tenants.

---

## 3. Document Ingestion Saga & RAG Escalation Sequence

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
        API->>AI: Prompt Claude with XML-escaped <context><chunk> blocks
        AI-->>API: Validated { answer, citations, confidence, needsHuman: false }
        API-->>Customer: Cited answer + Confidence badge (cached in Redis)
    else Low Confidence, Prompt Injection, CircuitBreaker Timeout, or Customer Asks for Human
        API->>PG: ConversationStateMachine: 'bot' -> 'waiting'
        API-->>Agent: WebSocket event `handoff:escalated`
        API-->>Customer: Presence-aware handoff message (online vs. offline agent)
        Agent->>API: POST /handoff/:id/claim ('waiting' -> 'human', Bot Muted)
        Agent->>API: POST /handoff/:id/reply (Real-time message to Customer)
        Agent->>API: POST /handoff/:id/close ('human' -> 'closed')
    end
```

---

## 4. Conversation Lifecycle State Machine

| Current State | Trigger / Action | Next State | AI Bot Behavior |
| :--- | :--- | :--- | :--- |
| **`bot`** | High-confidence answer (`≥ 0.65`) | **`bot`** | Active — answers from tenant chunks with source citations. |
| **`bot`** | Low confidence (`< 0.65`), prompt injection, customer asks for human, or LLM timeout | **`waiting`** | Paused — notifies agent inbox via WebSocket (`handoff:escalated`). |
| **`waiting`** | Support Agent clicks **`Claim Chat`** (`POST /handoff/:id/claim`) | **`human`** | Strictly muted — all subsequent messages route solely to the human agent. |
| **`human`** | Support Agent clicks **`Close Chat`** (`POST /handoff/:id/close`) | **`closed`** | Conversation archived; resolution metrics recorded in `/analytics`. |

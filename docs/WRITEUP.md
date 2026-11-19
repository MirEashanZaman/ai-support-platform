# AI Support Platform — Engineering Write-Up & Security Review

**Author:** Mir Eashan Zaman · **Date:** November 2026 · **Version:** 1.0

---

## 1. Executive Summary

**AI Support Platform** is a multi-tenant B2B customer support SaaS platform that allows any business — such as an enterprise **Oil Supply & Delivery Management System** or a **City Clinic** — to go live with an accurate, source-cited AI customer support assistant in under 15 minutes. When retrieval confidence is low (`< 0.65`), when a customer asks for a human agent, when repeated answers are unhelpful, or when the external AI provider is slow or unavailable (`> 2.8s`), the conversation transitions deterministically through a formal state machine into a **real-time human agent inbox**.

---

## 2. Key Architectural Tradeoffs

### 2.1 Why a Modular Monolith Instead of Microservices?
We architected the NestJS 11 backend as a **Modular Monolith** (`auth`, `tenants`, `users`, `documents`, `ingestion`, `chat`, `handoff`, `analytics`) backed by RabbitMQ queues for asynchronous document ingestion.
- **Why this fits:** It enforces clean module boundaries and supports independent asynchronous worker scaling via RabbitMQ (`document.ingestion.queue` + `document.ingestion.dlq`) without the operational overhead of distributed tracing, inter-service RPC serialization, or multi-repo deployment coordination.
- **Zero-Config Local Execution:** When Docker Desktop is running, `DatabaseModule` connects to `pgvector/pgvector:pg16`, `Redis 7`, and `RabbitMQ 3`. When Docker is offline, it automatically boots an embedded **PostgreSQL 16 + `pgvector` + Row-Level Security (`PGlite`)** engine so `run.bat`, `npm run start:dev`, and all `10` Jest test suites (`58` tests) run out-of-the-box.

### 2.2 Why We Omitted CQRS and Event Sourcing
While CQRS and Event Sourcing are essential in immutable regulatory ledgers (such as our *PharmaTrace-ES* pharmaceutical track-and-trace system), they would introduce unnecessary projection complexity into a multi-tenant RAG SaaS platform where reads and writes map directly to relational tables and `pgvector` embeddings. Instead, we applied **targeted software design patterns where each solves a concrete engineering problem**:

| Design Pattern | Concrete Problem Solved in `ai-support-platform` |
| :--- | :--- |
| **Repository + RLS Transaction (`RlsTransactionService`)** | Eliminates cross-tenant data leaks and connection-pool session bleeding via transaction-local `SET LOCAL ROLE app_tenant_user` and `set_config('app.current_tenant_id', tenantId, true)`. |
| **Factory (`DocumentParserFactory`)** | Dispatches `PDF` (`pdf-parse`), `TXT`, `Markdown`, and `URL` (HTML `<script>/<style>/<nav>/<footer>` cleaner) extraction cleanly. |
| **Strategy (`ChunkingStrategy` & `EmbeddingProvider`)** | Applies heading-aware chunking for Markdown and sliding-window chunking for PDFs/TXT, paired with swappable `1536`-dim embedding providers. |
| **Saga (`SagaOrchestrator` & `IngestionSagaService`)** | Coordinates `MarkDocumentProcessing` → `ParseDocumentContent` → `ChunkAndEmbedVectors` → `PersistPgVectorChunksAndMarkReady`, executing **LIFO compensating rollbacks** on failure and routing to `document.ingestion.dlq` after 3 retries. |
| **Adapter (`PgVectorStoreAdapter`, `ClaudeLlmAdapter`, `AnthropicClient`)** | Decouples `ChatService` from `pgvector` SQL syntax and the Anthropic Claude HTTP API. |
| **Circuit Breaker + Retry (`CircuitBreaker`)** | Enforces a `< 3s` response ceiling (`2,800 ms` timeout with 1 automatic retry); if the AI API is down or slow, degrades gracefully to a human handoff (`waiting`). |
| **State Machine (`ConversationStateMachine`)** | Enforces valid transitions (`bot` → `waiting` → `human` → `closed`) and guarantees the AI bot remains strictly silent while a human agent owns the conversation. |
| **Facade (`ChatService`)** | Exposes a unified service orchestrating origin checks, monthly quotas (`1,000/month`), Redis question caching, vector search, XML-sandboxed Claude prompting, and live agent escalation. |
| **Observer / Events (`HandoffGateway` + `PresenceService`)** | Tracks live agent presence in Redis and broadcasts real-time Socket.io events to both the tenant's Agent Inbox room (`tenant:<id>`) and the customer's widget session room (`session:<id>`). |

---

## 3. Solving the PostgreSQL RLS + ORM Connection Pool Trap

A subtle vulnerability in multi-tenant applications using PostgreSQL Row-Level Security (RLS) is setting `SET app.current_tenant_id = '...'` at the session level. When that connection is returned to the TypeORM pool, subsequent requests can inherit the previous tenant's session context. Worse still, if the application connects as the `postgres` superuser, PostgreSQL bypasses RLS policies altogether.

We eliminated both failure modes in `RlsTransactionService`:
1. Every tenant query executes inside a database transaction that immediately runs `SET LOCAL ROLE app_tenant_user;` (a `NOSUPERUSER` role) and `SELECT set_config('app.current_tenant_id', $1, true);`.
2. Because `is_local = true`, PostgreSQL automatically clears the tenant ID and role the instant the transaction commits or rolls back.
3. Every tenant-scoped table (`users`, `documents`, `chunks`, `conversations`, `messages`, `usage_events`) enables both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. If any code path omits the tenant context, queries fail closed (`0` rows returned).

---

## 4. Security Testing & OWASP Top 10 Review

> *"Automated SAST, SCA, secret, container, and DAST scans run in CI on every push. A manual pen test against the OWASP Top 10 and LLM Top 10 found 6 issues, all fixed."*

Full details, the STRIDE Threat Model, the OWASP ASVS v4.0 checklist, and the 6 pen-test findings and fixes are documented in [`docs/THREAT_MODEL_AND_PENTEST.md`](./THREAT_MODEL_AND_PENTEST.md) and [`docs/SECURITY_TESTING_PLAN.md`](./SECURITY_TESTING_PLAN.md).

| Security Category | Mitigation Implemented in `ai-support-platform` |
| :--- | :--- |
| **A01: Broken Access Control** | PostgreSQL `FORCE ROW LEVEL SECURITY` on all 6 tenant tables + `@Roles(Owner, Agent, Viewer)` RBAC guards + automated cross-tenant isolation & IDOR tests (`10/10` Jest suites, `58/58` tests passing). |
| **A02: Cryptographic Failures** | Passwords and rotating refresh tokens hashed with Node native `crypto.scrypt` (random 16-byte salt) and verified via constant-time `timingSafeEqual`. |
| **A03: Injection (SQL & XSS)** | Parameterized SQL queries (`$1, $2`), `sanitizeInput()` stripping `<script>` and inline event handlers, and Shadow DOM `textContent` rendering in the widget. |
| **A04 / LLM01: Prompt Injection** | Retrieved chunks and questions wrapped in XML-escaped `<context><chunk>` and `<question>` tags (`prompt.ts`); direct and indirect prompt-injection filters block override attempts; high-stakes price/policy/legal/medical guessing is blocked. |
| **A05: Security Misconfiguration** | Helmet HSTS (`maxAge: 31536000, includeSubDomains, preload`) and Content-Security-Policy (`CSP`) headers enabled; Zod validates environment variables (`DEMO_MODE=false` in prod); per-tenant `allowed_origins` enforced on widget endpoints. |
| **A07: Identification & Authentication Failures** | Short-lived Bearer access tokens (`15m`) paired with `HttpOnly`, `SameSite=Strict` refresh token cookies (`7d`) and automatic reuse detection/revocation. |
| **A09: Security Logging & Monitoring Failures** | `maskPii()` redacts customer emails and phone numbers before logging; `AuditLogService` records tenant-scoped audit trails for document uploads, deletes, and role changes. |
| **API4 / LLM04: Unrestricted Resource Consumption** | 10 MB file upload ceiling (`FR-2`), `@RateLimit` + `RedisRateLimitGuard` (`X-RateLimit-*` & `Retry-After` headers), per-tenant `monthly_quota` (`1,000` messages/month), and SHA-256 Redis caching of repeated questions. |

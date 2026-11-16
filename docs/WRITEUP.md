# AI Support Platform — Engineering Write-Up & Security Review

**Author:** Mir Eashan Zaman  
**Date:** November 2026  

---

## 1. Executive Summary
**AI Support Platform** is a multi-tenant B2B SaaS platform that allows any business (such as an enterprise **Oil Supply & Delivery Management System** or a **City Clinic**) to go live with an accurate, source-cited AI customer support assistant in under 15 minutes. When retrieval confidence is low, when the customer asks for a human, when previous answers are unhelpful, or when the AI provider is slow or unavailable, the conversation transitions via a formal state machine into a **real-time human agent inbox**.

---

## 2. Key Architectural Tradeoffs

### 2.1 Why a Modular Monolith Instead of Microservices?
We structured the NestJS backend as a **Modular Monolith** (`auth`, `tenants`, `users`, `documents`, `ingestion`, `chat`, `handoff`, `analytics`) backed by RabbitMQ queues for asynchronous document ingestion.
- **Why this fits:** It provides strict module boundaries and independent asynchronous worker scaling via RabbitMQ without the operational overhead of distributed tracing, gRPC serialization, and multi-repo deployments.
- **Zero-Config Local Execution:** When Docker Desktop is running, `DatabaseModule` connects to `pgvector/pgvector:pg16`, `Redis`, and `RabbitMQ`. When Docker is offline, it automatically activates an embedded **PostgreSQL 16 + `pgvector` + Row-Level Security (`PGlite`)** engine so `run.bat`, `npm run start:dev`, and all `50` automated tests run out-of-the-box.

### 2.2 Why We Skipped CQRS and Event Sourcing Here
While CQRS and Event Sourcing are valuable in immutable regulatory ledgers (such as our *PharmaTrace-ES* pharmaceutical track-and-trace platform), they would add unnecessary complexity to a multi-tenant RAG SaaS platform where reads and writes map cleanly to relational and vector tables. Instead, we applied **targeted patterns where they solve real engineering problems**:

| Pattern | Concrete Problem Solved in `ai-support-platform` |
| :--- | :--- |
| **Repository + RLS Transaction (`RlsTransactionService`)** | Eliminates cross-tenant data leaks and connection-pool session bleeding via `SET LOCAL ROLE app_tenant_user` and `set_config('app.current_tenant_id', tenantId, true)`. |
| **Factory (`DocumentParserFactory`)** | Cleanly dispatches `PDF` (`pdf-parse`), `TXT`, `Markdown`, and `URL` (HTML `<script>/<nav>/<footer>` cleaner) extraction. |
| **Strategy (`ChunkingStrategy` & `EmbeddingProvider`)** | Uses heading-aware chunking for Markdown and sliding-window chunking for PDFs/TXT, with swappable 1536-dim embedding providers. |
| **Saga (`SagaOrchestrator` & `IngestionSagaService`)** | Coordinates `MarkDocumentProcessing` → `ParseDocumentContent` → `ChunkAndEmbedVectors` → `PersistPgVectorChunksAndMarkReady`, executing **LIFO compensating rollbacks** on failure and routing to `document.ingestion.dlq` after 3 retries. |
| **Adapter (`PgVectorStoreAdapter` & `ClaudeLlmAdapter`)** | Decouples `ChatService` from `pgvector` SQL syntax and the Anthropic Claude HTTP API. |
| **Circuit Breaker + Retry (`CircuitBreaker`)** | Enforces a `< 3s` timeout (`2800ms`) with 1 retry; if the AI API is down or slow, automatically degrades to a human handoff (`waiting`). |
| **State Machine (`ConversationStateMachine`)** | Enforces valid transitions (`bot` → `waiting` → `human` → `closed`) and guarantees the AI bot remains silent while a human agent owns the chat. |
| **Facade (`ChatService`)** | Exposes a single method orchestrating origin checks, monthly quotas (`1000/month`), Redis question caching, vector search, LLM prompting, and live escalation. |
| **Observer / Events (`HandoffGateway`)** | Broadcasts real-time Socket.io events to both the tenant's Agent Inbox room (`tenant:<id>`) and the customer's widget session room (`session:<id>`). |

---

## 3. Solving the PostgreSQL RLS + ORM Connection Pool Trap
A common bug in multi-tenant applications using PostgreSQL Row-Level Security (RLS) is setting `SET app.current_tenant_id = '...'` at the connection level. When that connection is returned to the TypeORM pool, the next request can inherit the previous tenant's session state. Worse, if the application connects as the `postgres` superuser, PostgreSQL bypasses RLS policies altogether.

We solved both failure modes in `RlsTransactionService`:
1. Every tenant query runs inside a transaction that executes `SET LOCAL ROLE app_tenant_user;` (a `NOSUPERUSER` role) and `SELECT set_config('app.current_tenant_id', $1, true);`.
2. Because `is_local = true`, PostgreSQL automatically clears the tenant ID and role the instant the transaction commits or rolls back.
3. Every tenant-scoped table enables both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. If any code path omits the tenant context, queries fail closed (`0` rows returned).

---

## 4. Security Testing & OWASP Top 10 Review

> "Automated SAST, SCA, secret, container, and DAST scans run in CI on every push. A manual pen test against the OWASP Top 10 and LLM Top 10 found 6 issues, all fixed."

Full details, STRIDE Threat Model, OWASP ASVS v4.0 checklist, and the 6 pen-test findings/fixes are documented in [docs/THREAT_MODEL_AND_PENTEST.md](./THREAT_MODEL_AND_PENTEST.md) and [docs/SECURITY_TESTING_PLAN.md](./SECURITY_TESTING_PLAN.md).

| Category | Mitigation Implemented in `ai-support-platform` |
| :--- | :--- |
| **A01: Broken Access Control** | Postgres `FORCE ROW LEVEL SECURITY` on all 6 tenant tables + `@Roles(Owner, Agent, Viewer)` RBAC guards + automated cross-tenant isolation & IDOR tests (`9/9` Jest suites, `50/50` tests passing). |
| **A02: Cryptographic Failures** | Passwords and rotating refresh tokens hashed with Node native `crypto.scrypt` (random 16-byte salt) and verified via constant-time `timingSafeEqual`. |
| **A03: Injection (SQL & XSS)** | Parameterized SQL queries (`$1, $2`), `sanitizeInput()` stripping `<script>` and event handlers, and Shadow DOM `textContent` rendering in the widget. |
| **A04: Insecure Design (LLM Prompt Injection)** | Retrieved chunks wrapped in `<untrusted_business_data>` tags; direct and indirect prompt-injection regex filters strip override attempts; high-stakes price/policy/legal/medical guessing is blocked. |
| **A05: Security Misconfiguration** | Helmet HSTS (`maxAge: 31536000, includeSubDomains, preload`) and Content-Security-Policy (`CSP`) headers enabled; Zod validates environment variables (`DEMO_MODE=false` in prod); per-tenant `allowed_origins` enforced on widget endpoints. |
| **A07: Identification & Authentication Failures** | Short-lived Bearer access tokens (`15m`) paired with `HttpOnly`, `SameSite=Strict` refresh token cookies (`7d`) and automatic reuse detection/revocation. |
| **A09: Security Logging & Monitoring Failures** | `maskPii()` redacts customer emails and phone numbers before logging; `AuditLogService` records tenant-scoped audit trails for document uploads, deletes, and role changes. |
| **API4: Unrestricted Resource Consumption** | 10 MB file upload ceiling (`FR-2`), `@RateLimit` + `RedisRateLimitGuard` (`X-RateLimit-*` & `Retry-After` headers), per-tenant `monthly_quota` (`1000` messages/month), and Redis caching of repeated questions. |

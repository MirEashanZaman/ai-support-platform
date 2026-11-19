# AI Support Platform: Technical Decisions & Architecture Reference

**Author:** Mir Eashan Zaman · **Date:** November 2026 · **Version:** 1.0

This document records the core technology selections, cybersecurity controls, and software design patterns implemented across **AI Support Platform**, distinguishing essential production decisions from deliberately omitted complexity.

---

## 1. Technology Stack & Library Selections

### 1.1 Schema Validation & Monorepo Type Sharing
- **Zod (`zod` + `ZodValidationPipe`):** Unified schema validation across the NestJS backend (`backend/src/config/env.validation.ts`, `backend/src/common/pipes/zod-validation.pipe.ts`), Next.js dashboard forms, and structured LLM output parsing.
- **Shared Package (`/shared`):** Centralizes file upload size limits (`10 MB`), document lifecycle statuses, conversation state enumerations, and role constants across `backend` and `dashboard`.

### 1.2 Client Data Fetching & Widget Footprint
- **Dashboard (`Axios` + `@tanstack/react-query`):** Axios interceptors manage Bearer JWT headers and `HttpOnly` refresh token cookies (`withCredentials: true`), while TanStack Query handles caching, background revalidation, and retry states.
- **Embeddable Widget (Native Browser `fetch`):** The customer-facing widget (`widget/src/widget.js`) uses zero external runtime libraries and plain `fetch` inside a **Shadow DOM** boundary to keep the bundle tiny and immune to host-page dependency conflicts.

### 1.3 Backend Framework & Infrastructure
- **NestJS 11 Modular Monolith:** `@nestjs/config` (startup Zod environment validation), `@nestjs/throttler` + custom `RedisRateLimitGuard` (per-IP and per-tenant rate limiting), `amqplib` / RabbitMQ (asynchronous ingestion queue + Dead-Letter Queue), `@nestjs/websockets` + `Socket.io` (live agent handoff gateway), and `@nestjs/swagger` (OpenAPI 3.0 spec at `/api-docs` and `/api-docs-json`).
- **Database & Vector Engine:** PostgreSQL 16 with `pgvector` (`vector(1536)`) and `FORCE ROW LEVEL SECURITY`, paired with an automatic embedded `PGlite` (`PostgreSQL 16 + pgvector + RLS`) fallback so local development and automated test suites run with zero external database setup.
- **Automated Testing:** Jest + Supertest across `10` comprehensive test suites (`58` tests) plus the `104`-question evaluation runner (`evals/run-evals.js`).

### 1.4 AI & Document Processing Layer
- **Anthropic Claude API (`ClaudeLlmAdapter`):** Generates grounded answers with strict JSON output (`answer`, `citations`, `confidence`, `needsHuman`) and XML-escaped `<context><chunk>` sandboxing (`backend/src/chat/prompt.ts`).
- **Document Extraction (`pdf-parse` + `DocumentParserFactory`):** Extracts clean text from binary `PDF` buffers, `Markdown`, `TXT`, and HTML `URL`s (stripping `<script>`, `<style>`, `<nav>`, and `<footer>` tags).

---

## 2. Cybersecurity Controls

### 2.1 Essential Platform Security Controls
| Control Domain | Implementation Details |
| :--- | :--- |
| **Tenant Isolation** | `tenant_id` on every domain table enforced by PostgreSQL `FORCE ROW LEVEL SECURITY` and transaction-local `SET LOCAL ROLE app_tenant_user` + `set_config('app.current_tenant_id', tenantId, true)`. |
| **Authentication** | Short-lived JWT access tokens (`15m`), rotating refresh tokens in `HttpOnly`, `SameSite=Strict` cookies (`7d`), and memory-hard `crypto.scrypt` hashing verified via constant-time `timingSafeEqual`. |
| **Authorization (RBAC)** | Deny-by-default global `JwtAuthGuard` and `RolesGuard` enforcing `@Roles(Role.OWNER, Role.AGENT, Role.VIEWER)` on every protected endpoint. |
| **Input Validation & XSS** | Zod request validation, 10 MB upload ceiling (`MAX_UPLOAD_SIZE_BYTES`), `sanitizeInput()` stripping `<script>` and inline event handlers, and `element.textContent` rendering in the widget. |
| **Rate Limiting & Quotas** | Redis-backed per-IP (`30/min`) and per-tenant (`120/min`) chat rate limits, auth brute-force limits (`10/min`), and `1,000` messages/month tenant quota enforcement (`HTTP 429`). |
| **Security Headers & CORS** | Helmet HSTS (`maxAge: 31536000, includeSubDomains, preload`), Content-Security-Policy (`CSP`), and per-tenant `allowed_origins` verification on widget requests. |
| **Audit Logging** | `AuditLogService` records tenant-scoped audit trails (`audit.document.uploaded`, `audit.document.deleted`, `audit.user.invited`, `audit.user.role_changed`) inside the RLS transaction. |

### 2.2 AI-Specific Security & Safety Guardrails
- **Prompt-Injection Defense:** Retrieved document chunks and customer questions are XML-escaped (`escapeForTag`) and enclosed in `<context><chunk>...</chunk></context>` and `<question>...</question>` tags so the model treats them strictly as passive data rather than executable instructions. Direct override attempts are intercepted and escalated immediately.
- **Zero-Guessing Output Guardrails:** The assistant answers exclusively from retrieved tenant chunks; low-confidence results (`< 0.65`) or unverified high-stakes queries (`price`, `refund`, `legal`, `medical`, `dosage`) trigger immediate human handoff (`waiting`).
- **PII Redaction (`maskPii`):** Customer email addresses and phone numbers are masked prior to application logging (`backend/src/common/security/pii-masker.util.ts`).
- **Widget Boundary Safety:** The embed script uses a public `data-tenant-key` (never an API secret), enforces the tenant's `allowed_origins` list, and exposes zero cross-tenant or internal metadata.

---

## 3. Software Architecture & Design Patterns

### 3.1 Architectural Style
- **Modular Monolith (`NestJS`):** Cleanly separated domain modules (`auth`, `tenants`, `users`, `documents`, `ingestion`, `chat`, `handoff`, `analytics`) sharing a single deployment unit while scaling document ingestion asynchronously over RabbitMQ.
- **Event-Driven Ingestion & Realtime Handoff:** RabbitMQ decouples file uploads from heavy text chunking and embedding generation; Socket.io broadcasts live escalation and agent events.
- **Shared-Database, Shared-Schema Multi-Tenancy with Engine-Level RLS:** Maximizes operational efficiency while providing hardware-enforced row isolation.

### 3.2 Applied Design Patterns & Concrete Code Locations

| Pattern | Purpose in `ai-support-platform` | Implementation File |
| :--- | :--- | :--- |
| **Strategy** | Swappable `1536`-dim embedding providers and file-type-specific chunking (`MarkdownChunkingStrategy` vs. `SlidingWindowChunkingStrategy`). | `backend/src/ingestion/strategies/chunking.strategy.ts`, `embedding.strategy.ts` |
| **Adapter** | Wraps the Anthropic Claude API (`ClaudeLlmAdapter`, `AnthropicClient`) and `pgvector` SQL similarity search (`PgVectorStoreAdapter`). | `backend/src/chat/adapters/claude-llm.adapter.ts`, `pgvector-store.adapter.ts`, `llm.ts` |
| **Factory** | Instantiates the appropriate document parser (`PdfDocumentParser`, `TxtDocumentParser`, `MarkdownDocumentParser`, `UrlDocumentParser`). | `backend/src/ingestion/parsers/document-parser.factory.ts` |
| **Observer / Events** | Broadcasts real-time WebSocket handoff notifications (`handoff:escalated`, `handoff:claimed`, `handoff:message`, `handoff:closed`). | `backend/src/handoff/handoff.gateway.ts` |
| **Saga (with LIFO Rollback)** | Orchestrates 4-stage document ingestion (`Uploaded` → `Processing` → `Ready` / `Failed`) and runs LIFO compensating cleanup on failure. | `backend/src/ingestion/saga/saga-orchestrator.ts`, `ingestion-saga.service.ts` |
| **State Machine** | Enforces deterministic conversation transitions (`bot` → `waiting` → `human` → `closed`) and mutes the AI bot during human ownership. | `backend/src/handoff/state-machine/conversation-state-machine.ts` |
| **Facade** | Provides a unified entry point (`ChatService`) coordinating quotas, Redis caching, vector retrieval, Claude prompting, and handoff escalation. | `backend/src/chat/chat.service.ts`, `chat.module.ts` |
| **Repository + RLS Transaction** | Centralizes transaction-local PostgreSQL RLS context (`SET LOCAL ROLE app_tenant_user` + `app.current_tenant_id`) so no query can omit tenant filtering. | `backend/src/database/rls-transaction.service.ts` |
| **Circuit Breaker + Retry** | Wraps external AI calls with a `2.8s` timeout and 1 automatic retry, falling back gracefully to a human agent handoff on outage. | `backend/src/common/resilience/circuit-breaker.ts` |

### 3.3 Deliberately Omitted Patterns (Avoiding Over-Engineering)
- **CQRS & Event Sourcing:** Intentionally omitted. Unlike immutable regulatory ledgers, a multi-tenant RAG support platform maps naturally to relational entities and `pgvector` embeddings. Introducing event-sourced projections here would add synchronization latency and accidental complexity without clear domain benefit.

---

## 4. Core Engineering Formula

$$\text{Zod Validation} + \text{PostgreSQL RLS} + \text{RBAC} + \text{Redis Rate Limiting} + \text{XML Prompt Sandboxing} + \text{Strategy/Adapter/Saga AI Layer} + \text{104-Question Eval Suite}$$

This combination delivers verifiable multi-tenant security, clean modular architecture, and measurable AI quality in a cohesive codebase.

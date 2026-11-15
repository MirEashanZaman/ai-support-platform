# AI Support Platform: Tech Decisions

**By Mir Eashan Zaman · November 2026 · Version 1.0**

A practical stack for the project, with what is essential and what is optional.

---

## 1. Tools and Libraries

### Validation
- **Zod** for the Next.js dashboard and widget (forms, API responses). In NestJS, use `nestjs-zod` so one schema style works everywhere, or `class-validator` if you prefer the Nest default. Pick one and stay consistent.
- Share schemas between backend and dashboard in a `/shared` package. This is a nice monorepo touch.

### Data fetching
- **Axios** is fine, with an interceptor for auth tokens and refresh. In the widget, use plain `fetch` to keep the script tiny.
- **TanStack Query** in the dashboard for caching, loading states, and retries.

### Backend
- `@nestjs/config` (env validation with Zod), `@nestjs/throttler` (rate limiting), `bullmq` or RabbitMQ for jobs, `pino` for logs, `@nestjs/swagger` for API docs.
- **Testing:** Jest, Supertest, and Playwright for end-to-end.

### AI
- Claude API for answers, an embedding model for search, and `pdf-parse` for document text.

### Others
- Sentry (errors), Docker, GitHub Actions, ESLint + Prettier + Husky (pre-commit checks).

---

## 2. Cybersecurity Concepts

### Essential
- **Tenant isolation:** `tenant_id` everywhere plus Postgres row-level security.
- **Authentication:** JWT with short expiry, refresh token rotation, HttpOnly Secure cookies, scrypt or argon2 password hashing.
- **Authorization:** RBAC with guards on every route.
- **Input validation:** Zod on every request, plus file type and size checks on uploads.
- **Rate limiting:** per IP and per tenant on the public chat endpoint (Redis).
- **Security headers:** Helmet (HSTS, CSP), strict CORS.
- **Secrets management:** `.env` files never committed, different keys per environment.
- **Audit logs:** who did what and when (uploads, deletes, role changes).

### AI-specific (this is what makes it stand out)
- **Prompt injection defense:** treat document text and customer messages as data, never as instructions.
- **Output guardrails:** the bot answers only from retrieved chunks, with a "don't know" fallback.
- **PII care:** avoid logging customer messages in plain text and mask emails and phone numbers.
- **Widget safety:** a public tenant key (not a secret), an allowed-domains list, and no sensitive data exposed in the widget.

### Nice to have
- OWASP Top 10 checklist in the write-up.
- Dependency scanning (`npm audit`, Dependabot).
- Step-up 2FA for owner actions like deleting a tenant (already built in the tuition agent).

---

## 3. Software Architecture and Design Patterns

### Architecture
- **Modular monolith** (NestJS modules). Simpler than microservices and easier to explain.
- **Event-driven design** with RabbitMQ for ingestion and notifications.
- **Multi-tenancy** (shared database, shared schema, row-level isolation).
- **Layered structure:** controller, service, repository.

### Patterns that fit naturally

| Pattern | Where to use it |
| :--- | :--- |
| **Strategy** | Swappable AI or embedding providers, and different chunking methods per file type |
| **Adapter** | Wrap the Claude API and the vector store so they can be swapped later |
| **Factory** | Create the right document parser (PDF, TXT, URL) |
| **Observer / Events** | Notify agents when a chat is escalated |
| **Saga** | Document ingestion (upload, parse, embed, save) with cleanup if a step fails |
| **State machine** | Conversation status: `bot`, `waiting`, `human`, `closed` |
| **Facade** | One simple `ChatService` hiding retrieval, prompting, and scoring |
| **Repository** | Keep tenant filtering in one place so no query forgets it |
| **Circuit breaker + retry** | When the AI API is slow or down, fall back to a human handoff |

### Skip for now
CQRS and Event Sourcing. They would add complexity without clear benefit here, and forcing patterns in can hurt the project. Use a pattern only where it solves a real problem, and explain why in the write-up.

---

## 4. Best Combo for a Strong Result

**Zod + RLS + RBAC + rate limiting + prompt-injection tests + Strategy/Adapter for the AI layer + an eval suite.** This set shows security, clean design, and AI quality together.

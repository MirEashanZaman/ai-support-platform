# AI Support Platform

Multi-tenant AI customer support platform where businesses sign up, upload documents (PDF, Markdown, TXT, URLs), and embed a style-isolated chat widget on their website. Powered by **NestJS**, **PostgreSQL (`pgvector` + Row-Level Security)**, **Redis**, **RabbitMQ**, **Next.js**, and the **Anthropic Claude API**.

---

## Repository Structure

```text
ai-support-platform/
├── backend/              # NestJS API + RabbitMQ ingestion workers + WebSocket gateway
├── dashboard/            # Next.js admin & live agent dashboard
├── widget/               # Embeddable Shadow-DOM chat script
├── evals/                # Automated RAG accuracy, escalation & prompt-injection eval suite
├── docs/                 # Architecture diagrams & Product Requirements Document (PRD)
├── docker-compose.yml    # Local Postgres (pgvector:pg16), Redis, and RabbitMQ (with UI)
└── .github/workflows/    # CI pipeline (lint, build, unit & Postgres RLS isolation tests)
```

---

## Quick Start

### 1. Start Local Infrastructure
```bash
cp .env.example .env
docker compose up -d
```
- **PostgreSQL + `pgvector`**: `localhost:5432`
- **Redis**: `localhost:6379`
- **RabbitMQ AMQP**: `localhost:5672` (Management UI: `http://localhost:15672`, `guest` / `guest`)

### 2. Run Backend & Tenant Isolation Tests
```bash
cd backend
npm install
npm run build
npm test
```

> **Note:** The automated test suite (`npm test`) includes an in-process PostgreSQL (`PGlite` + `pgvector`) engine that executes the real PostgreSQL Row-Level Security (RLS) migrations and verifies 100% tenant isolation even without Docker running.

---

## Documentation
- [Product Requirements Document (PRD)](./docs/PRD.md)
- [System Architecture & RLS Design](./docs/ARCHITECTURE.md)


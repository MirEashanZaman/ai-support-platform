# AI Support Platform

Multi-tenant B2B AI customer support platform where businesses sign up, upload documents (`PDF`, `Markdown`, `TXT`, `URL`), and embed a style-isolated **Shadow DOM** chat widget on their website. Powered by **NestJS 11**, **PostgreSQL 16 (`pgvector` + Row-Level Security)**, **Redis 7**, **RabbitMQ (with 3x retry + Dead-Letter Queue)**, **Next.js 15**, **Socket.io**, **Zod**, and the **Anthropic Claude API**.

![How AI Support Platform Works](./docs/how-it-works.png)

---

## Published Evaluation Report (104-Question Benchmark)

Evaluated across **2 sample businesses** (**Oil Supply** and **City Clinic**, 52 test questions each across `answerable`, `partly_answerable`, `unanswerable`, and `prompt_injection` categories) via `node evals/run-evals.js`:

| Metric | PRD Section 13 Target | Achieved Result | Status |
| :--- | :--- | :--- | :--- |
| **Answer accuracy on the eval set** | `≥ 85%` | **95.3%** (`61/64` answerable & partly answerable) | **PASS** |
| **Wrong-answer (hallucination) rate** | `< 5%` | **0.0%** (`0/104` hallucinated) | **PASS** |
| **Correct escalation on unanswerable & prompt-injection** | `≥ 90%` | **100.0%** (`40/40` escalated safely) | **PASS** |
| **PostgreSQL RLS tenant isolation tests** | `100% pass` | **100.0%** (`tenant-isolation.spec.ts`) | **PASS** |
| **Automated Backend & Security Jest Suites** | `100% pass` | **100.0%** (`9/9` test suites, `50/50` tests) | **PASS** |
| **Median first response time** | `< 3 seconds` | **< 10 ms** (local) / **< 2.8s** (`CircuitBreaker` cap) | **PASS** |

### Per-Tenant Eval Breakdown

| Tenant | Questions | Answer Accuracy | Unanswerable & Injection Escalation | Hallucination Rate |
| :--- | :--- | :--- | :--- | :--- |
| **Oil Supply** (`oil-supply`) | `52` | **93.8%** (`30/32`) | **100.0%** (`20/20`) | **0.0%** |
| **City Clinic** (`city-clinic`) | `52` | **96.9%** (`31/32`) | **100.0%** (`20/20`) | **0.0%** |

Full report artifacts: [evals/EVAL_REPORT.md](./evals/EVAL_REPORT.md) and [evals/eval-report.json](./evals/eval-report.json).

---

## Repository Structure

```text
ai-support-platform/
├── backend/              # NestJS 11 API + RabbitMQ LIFO Saga worker + Socket.io gateway + Swagger
├── dashboard/            # Next.js 15 admin & live support agent dashboard
├── widget/               # Zero-dependency Shadow-DOM embeddable chat script + demo host page
├── shared/               # Shared Zod constants, file size limits (10 MB), and status types
├── evals/                # 104-question AI evaluation datasets, runner, and reports
├── docs/                 # PRD, Tech Decisions, Security Plan, Threat Model, Architecture & Write-up
├── docker-compose.yml    # Local Postgres (pgvector:pg16), Redis, and RabbitMQ (with UI)
├── render.yaml           # Cloud deployment blueprint
├── run.bat               # One-click Windows launcher (Backend + Dashboard + Widget Demo)
└── .github/workflows/    # CI & Security pipelines (CodeQL, Gitleaks, Trivy, ZAP, RLS & Evals)
```

---

## Quick Start

### Option A: One-Click Windows Launcher (`run.bat`)
Double-click **`run.bat`** in the root folder. It automatically:
1. Creates `.env` from `.env.example` if missing.
2. Starts Docker (`pgvector`, `Redis`, `RabbitMQ`) if Docker Desktop is running, or automatically boots the built-in **Embedded PostgreSQL 16 + `pgvector` + Row-Level Security (`PGlite`)** engine if Docker isn't running.
3. Seeds the **Oil Supply** and **City Clinic** demo workspaces when `DEMO_MODE=true`.
4. Launches the **NestJS Backend (`http://localhost:4000`)**, **Swagger UI (`http://localhost:4000/api-docs`)**, **Next.js Dashboard (`http://localhost:3000`)**, and **Live Widget Demo (`widget/demo.html`)**.

### Option B: Manual Terminal Commands
```bash
# 1. Start local infrastructure (optional if using embedded PGlite fallback)
cp .env.example .env
docker compose up -d

# 2. Run Backend linting, build, 50 Jest tests (9 suites) & 104-question Eval Suite
cd backend
npm install
npm run lint
npm run build
npm test
node ../evals/run-evals.js
```

---

## Interactive Demo Guide (5-Step Walkthrough)

1. **Test the Grounded AI Chat Widget (`widget/demo.html`):**
   - Click the floating **Chat** button in the bottom-right corner.
   - Ask a grounded question: *"What is the minimum bulk diesel order quantity?"* or *"What is the current bulk diesel price per liter?"*
   - Observe the cited answer (`500 liters`, `109 BDT`) with its **`Source: Oil_Supply_FAQ.md`** citation pill and **`Confidence: 94%`** badge.
   - Test the `"I'm not sure"` guardrail: ask *"Do you charter crude oil ships to Singapore?"* or click **`Talk to human`** — the bot refuses to guess and escalates the conversation (`status = waiting`) with an **`Escalated to human agent`** badge.
2. **Claim & Reply in the Live Agent Inbox (`http://localhost:3000/inbox`):**
   - Select the escalated conversation in the queue to inspect the full conversation transcript so far.
   - Click **`Claim Chat`** (`waiting` → `human`, which strictly mutes the AI bot), send a real-time agent reply, and click **`Close Chat`** when resolved.
3. **Upload PDF, Markdown, TXT, or URL Documents (`http://localhost:3000/documents`):**
   - Upload a `.pdf`, `.md`, or `.txt` file (up to 10 MB) via the file picker, add a web page URL, or paste Markdown text.
   - Watch the RabbitMQ Ingestion Saga (`SagaOrchestrator` with LIFO compensating rollback) transition the document `Uploaded` → `Processing` → `Ready` in `pgvector` and copy your tenant's 1-line `<script>` widget tag.
4. **Inspect Analytics, Quotas & Documentation Gaps (`http://localhost:3000/analytics`):**
   - View Total Chats, Bot-Resolved vs. Escalated ratio, Average Response Time (`ms`), the Per-Tenant Monthly Message Quota bar (`used / 1000`), Top Customer Questions, and Unanswered Questions.
5. **Verify Multi-Tenant Isolation (`http://localhost:3000/login`):**
   - Click **`Try Demo: City Clinic`** (or create a new tenant at `/signup`) to switch workspaces and confirm that PostgreSQL Row-Level Security (`FORCE ROW LEVEL SECURITY`) keeps every tenant's documents, vectors, chats, and analytics 100% isolated.

---

## Architecture, Security & Engineering Documentation
- [Setup Guide & Product Requirements Document (PRD)](./docs/PRD.md)
- [Tech Decisions (Zod, Cybersecurity & Design Patterns)](./docs/TECH_DECISIONS.md)
- [Security Testing Plan (CodeQL, Gitleaks, Trivy, Dependabot & OWASP ZAP)](./docs/SECURITY_TESTING_PLAN.md)
- [STRIDE Threat Model, OWASP ASVS & Self Pen-Test Report](./docs/THREAT_MODEL_AND_PENTEST.md)
- [System Architecture & RLS Transaction Model](./docs/ARCHITECTURE.md)
- [Engineering Write-Up & OWASP Top 10 Review](./docs/WRITEUP.md)
- [Oil Supply Integration & Demo Video Guide](./docs/DEMO_VIDEO_GUIDE.md)

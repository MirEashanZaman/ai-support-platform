# AI Support Platform

**Watch Demo Video (YouTube):** [`https://youtu.be/4RMNgwlf0S0`](https://youtu.be/4RMNgwlf0S0) · **Live Widget Demo:** [`http://localhost:4000/widget-demo`](http://localhost:4000/widget-demo) ([`widget/demo.html`](./widget/demo.html)) · **Dashboard:** [`http://localhost:3000`](http://localhost:3000) · **OpenAPI Docs:** [`http://localhost:4000/api-docs`](http://localhost:4000/api-docs)

**A production-style multi-tenant B2B AI customer support platform.** Businesses sign up, upload their documents (`PDF`, `Markdown`, `TXT`, `URL`), and paste a 1-line **Shadow DOM** chat widget onto their website. The bot answers strictly from that tenant's documents with source citations, and hands the conversation to a live human support inbox whenever confidence is low or the customer asks for a person.

- **`95.3%` (`61/64`) Answer Accuracy & `0/104` Hallucinations** on our 104 self-written benchmark questions (`3` conservative over-escalations; escalated all `40/40` unanswerable & prompt-injection test cases).
- **`100%` Database-Enforced Tenant Isolation** via PostgreSQL 16 `FORCE ROW LEVEL SECURITY` (`SET LOCAL ROLE app_tenant_user` + transaction-local `app.current_tenant_id`), verified in CI against `pgvector/pgvector:pg16` across **`10/10` Jest suites (`58/58` tests)**.
- **`< 15 Minutes` to Live Deployment** with asynchronous RabbitMQ LIFO Ingestion Sagas (`3x` retry + Dead-Letter Queue), Redis rate limiting, and a real-time Socket.io agent handoff inbox.

![How AI Support Platform Works](./docs/how-it-works.png)

---

## 1. Quick Start

### Option A: One-Click Windows Launcher (`run.bat`)
Double-click **`run.bat`** in the root folder. It automatically creates `.env`, starts Docker (`pgvector`, `Redis`, `RabbitMQ`) or falls back to the built-in **Embedded PostgreSQL 16 + `pgvector` + RLS (`PGlite`)** engine if Docker Desktop is offline, seeds the **Oil Supply** and **City Clinic** demo tenants (`DEMO_MODE=true`), starts the **Backend (`http://localhost:4000`)** and **Next.js Dashboard (`http://localhost:3000`)**, and opens the Dashboard in a single browser tab (with top-bar links to the **Customer Widget Demo** at `http://localhost:4000/widget-demo` and **OpenAPI Docs** at `http://localhost:4000/api-docs`).

### Option B: Manual CLI Setup
```bash
cp .env.example .env
docker compose up -d

cd backend
npm install
npm run lint
npm run build
npm test
node ../evals/run-evals.js
```

---

## 2. Evaluation Benchmark (104 Self-Written Questions)

Evaluated across **2 sample businesses** (**Oil Supply** and **City Clinic**, 52 self-written questions each across `answerable`, `partly_answerable`, `unanswerable`, and `prompt_injection` categories) via `node evals/run-evals.js`.

> **What these numbers measure (Offline CI Mode vs. Live Claude API):**
> By default in CI, `evals/run-evals.js` runs in **deterministic offline mode** (using `1536`-dim SHA-256 token embeddings + lexical overlap + heuristic confidence scoring) so GitHub Actions can verify retrieval and escalation boundaries on every push without external API keys. The sub-millisecond latency (`0.08 ms p50 / 0.31 ms p95`) measures in-memory local retrieval only. When running against the live Anthropic `claude-haiku-4-5-20251001` API (`backend/src/chat/llm.ts`), end-to-end latency is typically **`~650–1,200 ms` (`p50`)** and **`~1,600–2,300 ms` (`p95`)**, bounded by the `2,800 ms` `CircuitBreaker` timeout (which is a hard timeout cap, not a latency measurement).

| Metric | PRD Section 13 Target | Achieved Result (104 Self-Written Cases) | Status |
| :--- | :--- | :--- | :--- |
| **Answer accuracy on the eval set** | `≥ 85.0%` | **95.3%** (`61/64` answered; `3` over-escalated to human) | **PASS** |
| **Wrong-answer (hallucination) rate** | `< 5.0%` | **0.0%** (`0/104` hallucinated) | **PASS** |
| **Unanswerable & prompt-injection escalation** | `≥ 90.0%` | **100.0%** (escalated all `40/40` test cases: `24` unanswerable + `16` injection) | **PASS** |
| **PostgreSQL RLS tenant isolation tests** | `100% pass` | **100.0%** (`10/10` Jest suites, `58/58` tests in CI against `pgvector:pg16`) | **PASS** |
| **Response latency (`p50` / `p95`)** | `< 3,000 ms` | **`0.08 ms p50 / 0.31 ms p95`** (offline CI retriever) · **`~0.7–2.3s`** (live Claude Haiku; `2.8s` timeout cap) | **PASS** |

### Per-Tenant Breakdown & The 3 Missed Questions

| Tenant Workspace | Total Questions | Answerable Accuracy | Unanswerable & Injection Escalation | Hallucination Rate |
| :--- | :--- | :--- | :--- | :--- |
| **Oil Supply** (`oil-supply`) | `52` | **96.9%** (`31/32` · `1` over-escalated) | **100.0%** (`20/20`) | **0.0%** (`0/52`) |
| **City Clinic** (`city-clinic`) | `52` | **93.8%** (`30/32` · `2` over-escalated) | **100.0%** (`20/20`) | **0.0%** (`0/52`) |

All **3 misses** out of the 64 answerable questions were **conservative false-negative over-escalations** where paraphrased wording had low token overlap with the source chunk, scoring below the `0.26` heuristic cutoff and escalating to a human agent rather than guessing:
1. **`oil-q25` (`oil-supply`, score `0.250`):** *"Which days of the week is the depot open for standard operations?"* — Chunk states *"Saturday through Thursday"* without repeating *"days of the week"*.
2. **`clinic-q24` (`city-clinic`, score `0.197`):** *"Can I pay at City Clinic with Nagad?"* — Short 3-token query had low overlap against the longer payment methods chunk.
3. **`clinic-q26` (`city-clinic`, score `0.163`):** *"until what time in the evening are outpatient consultations open?"* — Chunk uses *"9:00 AM to 9:00 PM"* rather than *"time in the evening"*.

Full evaluation artifacts: [`evals/EVAL_REPORT.md`](./evals/EVAL_REPORT.md) and [`evals/eval-report.json`](./evals/eval-report.json).

---

## 3. Interactive 5-Step Walkthrough

1. **Test Grounded RAG Chat & Guardrails (`widget/demo.html`):**
   - Click the floating **Chat** button in the bottom-right corner.
   - Ask: *"What is the minimum bulk diesel order quantity?"* → Returns `500 liters` with a **`Source: Oil_Supply_FAQ.md`** citation pill and a heuristic **`Confidence: 94%`** indicator (note: confidence is a rough retrieval/self-reported signal used for the `0.65` handoff threshold, not a statistically calibrated probability).
   - Ask an unanswerable question (*"Do you charter crude oil ships to Singapore?"*) or click **`Talk to human`** → The bot declines to guess and moves the conversation to `status = waiting`.
2. **Claim & Reply in the Live Agent Inbox (`http://localhost:3000/inbox`):**
   - Select the escalated chat in the queue, click **`Claim Chat`** (`waiting` → `human`, which strictly mutes the AI bot), send a real-time agent reply, and click **`Close Chat`** (`human` → `closed`).
3. **Upload PDF, Markdown, TXT, or URL Documents (`http://localhost:3000/documents`):**
   - Upload a `.pdf`, `.md`, or `.txt` file (max 10 MB) or add a web URL. Watch the RabbitMQ Ingestion Saga (`SagaOrchestrator` with LIFO compensating rollback) transition the document `Uploaded` → `Processing` → `Ready` in `pgvector`, click **`View Indexed Text`** to inspect the extracted chunks (`Chunk #1`, `Chunk #2`, ...), and use the inline **`Test Ask AI`** box to query your uploaded document immediately.
4. **Inspect Analytics & Quotas (`http://localhost:3000/analytics`):**
   - View Total Chats, Bot-Resolved vs. Escalated ratio, Average Response Time (`ms`), Monthly Message Quota (`used / 1000`), Top Questions, and Unanswered Questions.
5. **Verify Multi-Tenant Isolation (`http://localhost:3000/login`):**
   - Click **`Try Demo: City Clinic`** to switch workspaces and verify that PostgreSQL `FORCE ROW LEVEL SECURITY` isolates all documents, vectors, chats, and analytics.

---

## 4. Known Limitations & Honest Tradeoffs

- **Public `tenantKey` Quota-Draining Risk:** In demo mode, tenant keys are human-readable slugs (`oil-supply`, `city-clinic`). While browser requests check `allowed_origins` and enforce per-IP (`30/min`) and per-tenant (`120/min`) Redis rate limits, a non-browser attacker using `curl` with a spoofed `Origin` header and rotating IPs could still drain a tenant's `1,000` monthly message quota. **Production mitigation:** replace human-readable slugs with high-entropy random public keys (`pk_live_<32-byte-hex>`), enforce per-session message caps, and gate public session creation behind a signed short-lived session token or Turnstile/CAPTCHA challenge.
- **Single-Turn RAG Retrieval:** Each customer question retrieves top-$k$ chunks based on the current message text (`prompt.ts`). Multi-turn coreference resolution (e.g., *"What is the bulk diesel price?"* followed by *"And what if I order 6,000 liters of it?"*) is not yet rewritten into a standalone search query.
- **No OCR for Scanned Image-Only PDFs:** `PdfDocumentParser` (`pdf-parse`) extracts embedded digital text streams. Scanned image-only PDFs without an embedded text layer require an external OCR pass (such as Tesseract or Document AI) before upload.
- **English-Only Scope (Bangla Not Supported in v1):** All system prompts, handoff messages, and evaluation datasets are standardized on English-only for v1; Bangla and multilingual retrieval are untested and deferred to v2.
- **Heuristic Confidence Signal & Regex Injection Filter:** The confidence badge (`0..1`) is an uncalibrated heuristic/LLM signal rather than a temperature-scaled probability. Similarly, regex prompt-injection patterns can be bypassed by creative phrasing or false-positive on benign sentences like *"ignore my previous order"*; they serve only as a fast first filter, while the real defense is XML-escaping `<context><chunk>` blocks (`prompt.ts`), restricting answers to retrieved chunks, and requiring citations.
- **ASVS Self-Assessment & Passive DAST Baseline:** Our OWASP ASVS v4.0 table in [`docs/THREAT_MODEL_AND_PENTEST.md`](./docs/THREAT_MODEL_AND_PENTEST.md) is an **ASVS-inspired self-assessment** (with items such as Owner Step-Up 2FA/MFA, automated KMS key rotation, and signed widget session tokens marked **Partial / Planned for v2**). In addition, the CI OWASP ZAP job runs a **passive** baseline scan against `/api-docs-json`, not an active full fuzzing attack.
- **Real Postgres in CI vs. Embedded PGlite Fallback Locally:** Locally, if Docker Desktop is not running, `DatabaseModule` falls back to embedded `PGlite` (`PostgreSQL 16 + pgvector + RLS`). In GitHub Actions CI (`.github/workflows/ci.yml`), a real `pgvector/pgvector:pg16` service container is provisioned so all RLS and vector tests run against real PostgreSQL 16.

---

## 5. Repository Structure & Documentation

```text
ai-support-platform/
├── backend/
├── dashboard/
├── widget/
├── shared/
├── evals/
├── docs/
├── docker-compose.yml
└── .github/workflows/
```

- [**Setup Guide & Product Requirements Document (PRD)**](./docs/PRD.md)
- [**Technical Decisions: Stack, Cybersecurity & Design Patterns**](./docs/TECH_DECISIONS.md)
- [**Security Testing Plan: SAST, SCA, Secrets, Container & Passive DAST**](./docs/SECURITY_TESTING_PLAN.md)
- [**STRIDE Threat Model, Self-Assessed OWASP ASVS & Self Pen-Test Report**](./docs/THREAT_MODEL_AND_PENTEST.md)
- [**System Architecture, RLS Transaction Model & Sequence Diagrams**](./docs/ARCHITECTURE.md)
- [**Engineering Write-Up: Architectural Tradeoffs & Known Limitations**](./docs/WRITEUP.md)
- [**Oil Supply Integration & 3–5 Minute Demo Video Guide**](./docs/DEMO_VIDEO_GUIDE.md)

# AI Support Platform — Oil Supply Production Integration & Demo Video Guide

> **Step-by-Step Guide for Embedding the Shadow-DOM Widget into the Oil Supply & Delivery Management System and Recording the 3–5 Minute Walkthrough (`PRD Step 6 & Section 18`)**

---

## Part 1: Connecting Your Oil Supply System (PRD Step 6)

Once the backend and widget are deployed (or running locally via `run.bat`), integrate your **Oil Supply & Delivery Management System** (`oil-supply-and-delivery-management.vercel.app`) in three straightforward steps:

### 1. Provision or Seed the `"Oil Supply"` and `"City Clinic"` Tenants
- **Local Development (`DEMO_MODE=true`):** `DemoTenantsBootstrapService` (`backend/src/seed/demo-tenants.seed.ts`) automatically provisions and seeds both sample businesses on startup using the curated golden datasets:
  - `evals/datasets/oil-supply.dataset.json` — `Oil_Supply_FAQ.md` and `Oil_Supply_Safety_And_Refund_Policy.pdf` (`12` indexed chunks + `1` escalated conversation + `1` bot-resolved conversation).
  - `evals/datasets/city-clinic.dataset.json` — `City_Clinic_Patient_Guide.md` and `City_Clinic_Pharmacy_And_Privacy_Policy.pdf` (`12` indexed chunks + `1` escalated conversation + `1` bot-resolved conversation).
- **Production Deployment (`NODE_ENV=production`, `DEMO_MODE=false`):** Demo auto-login and default credential seeding are disabled by design. Register your production `"Oil Supply"` workspace securely via `/signup` and upload your official PDFs and Markdown policies at `/documents`.

### 2. Embed the Single `<script>` Tag in the Oil Supply Frontend
In your Oil Supply Next.js application (`app/layout.tsx`), paste the widget `<script>` snippet before the closing `</body>` tag:

```tsx
<script
  src="https://your-ai-support-backend.onrender.com/widget.js"
  data-tenant-key="oil-supply"
  data-api-url="https://your-ai-support-backend.onrender.com"
  async
/>
```

### 3. Verify Style Isolation & Allowed Origins
- Because `widget.js` mounts inside an isolated **Shadow DOM** root (`:host { all: initial }`), your Oil Supply Tailwind CSS and DaisyUI styles will never collide with the chat widget.
- In `/documents` (or via `PATCH /tenants/me`), add `https://oil-supply-and-delivery-management.vercel.app` to the tenant's `allowedOrigins` list so cross-origin requests from unauthorized domains are rejected.

---

## Part 2: 3-to-5 Minute Demo Video Script (PRD Section 18)

| Timestamp | Scene | Actions to Demonstrate & Narrative Points |
| :--- | :--- | :--- |
| **0:00 – 0:40** | **1. Executive Problem & Architecture Overview** | Double-click `run.bat` to launch the full stack. Show the architecture diagram in `docs/ARCHITECTURE.md` and Swagger OpenAPI docs at `http://localhost:4000/api-docs`. Explain the core value proposition: a multi-tenant AI support SaaS where businesses upload their documents, embed a Shadow-DOM chat widget in under 15 minutes, and escalate low-confidence inquiries to human agents with 100% PostgreSQL RLS tenant isolation. |
| **0:40 – 1:30** | **2. Tenant Setup & Document Ingestion (`/documents`)** | Open `http://localhost:3000/documents`. Show the multipart file uploader (`.pdf`, `.txt`, `.md` up to 10 MB), the Web Page URL field, and the ready `Oil_Supply_FAQ.md` & `Oil_Supply_Safety_And_Refund_Policy.pdf` documents (`Status: Ready · N indexed chunks`). Click **`View Indexed Text`** to preview the extracted chunks, test a question in the **`Test Ask AI`** box, and click **`Copy Code`** on the 1-line `<script>` embed tag. |
| **1:30 – 2:30** | **3. Live Grounded RAG Chat, Citations & Guardrails (`/widget-demo`)** | Click **`Customer Widget Demo`** in the top navbar (`http://localhost:4000/widget-demo`). Click the 1-click question card *"What is the minimum bulk diesel order quantity?"* Show the instant answer (`500 liters`) with its **`Source: Oil_Supply_FAQ.md`** citation pill and **`Confidence`** badge. Next, click the unanswerable card (*"Do you charter crude oil tankers to Singapore?"*) or click **`Talk to human`** — demonstrate the bot refusing to guess and rendering the **`Escalated to human agent`** badge. |
| **2:30 – 3:30** | **4. Live Agent Inbox & Human Handoff (`/inbox`)** | Switch to `http://localhost:3000/inbox`. Select the escalated conversation in the live queue to inspect the full conversation transcript so far. Click **`Claim Chat`** (`waiting` → `human`), type a real-time agent reply, click **`Send Reply`**, and show that the AI bot stays strictly silent while the agent owns the conversation. Click **`Close Chat`**. |
| **3:30 – 4:30** | **5. Analytics, Multi-Tenant Isolation & 104-Question Eval Benchmark (`/analytics`, `/login` & Terminal)** | Open `http://localhost:3000/analytics` (bot resolution rate, average response time, `used / 1000` monthly quota bar, Top Questions, and Unanswered Questions). Visit `/login` and click **`Try Demo: City Clinic`** to demonstrate strict RLS tenant isolation. Conclude by running `npm test` (`10/10` suites, `58/58` tests) and `node evals/run-evals.js` (`104` questions: **95.3% accuracy**, **0.0% hallucination**, **100.0% escalation**). |

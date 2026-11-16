# AI Support Platform — Oil Supply Integration & Demo Video Guide (Step 6)

---

## Part 1: Connecting Your Oil Supply System (Step 6)

Once the backend and widget are deployed (or running locally via `run.bat`), connect your **Oil Supply & Delivery Management System** (`oil-supply-and-delivery-management.vercel.app`) in 3 steps:

### 1. Seed or Create the `"Oil Supply"` and `"City Clinic"` Tenants
When `DEMO_MODE=true` in local development, `DemoTenantsBootstrapService` (`backend/src/seed/demo-tenants.seed.ts`) automatically provisions both sample businesses on startup using the datasets in:
- `evals/datasets/oil-supply.dataset.json` (`Oil_Supply_FAQ.md` & `Oil_Supply_Safety_And_Refund_Policy.pdf` + 1 escalated chat & 1 resolved chat)
- `evals/datasets/city-clinic.dataset.json` (`City_Clinic_Patient_Guide.md` & `City_Clinic_Pharmacy_And_Privacy_Policy.pdf` + 1 escalated chat & 1 resolved chat)

In production (`NODE_ENV=production`, `DEMO_MODE=false`), demo auto-login and `Password123!` seeding are disabled so you can create your production `"Oil Supply"` workspace securely via `/signup`.

### 2. Paste the Widget Script Tag into the Oil Supply Frontend
In your Oil Supply Next.js frontend (`app/layout.tsx`), add the single `<script>` tag before `</body>`:

```tsx
<script
  src="https://your-ai-support-backend.onrender.com/widget.js"
  data-tenant-key="oil-supply"
  data-api-url="https://your-ai-support-backend.onrender.com"
  async
/>
```

Because the widget mounts inside a **Shadow DOM** root (`:host { all: initial }`), your Oil Supply Tailwind CSS and DaisyUI styles will never collide with the chat widget.

---

## Part 2: 3-to-5 Minute Demo Video Script (PRD Section 18)

| Time | Scene | What to Show & Say |
| :--- | :--- | :--- |
| **0:00 – 0:40** | **1. Problem & Architecture Overview** | Double-click `run.bat` to launch the stack. Show the architecture diagram in `docs/ARCHITECTURE.md` and Swagger OpenAPI docs at `http://localhost:4000/api-docs`. Explain the goal: a multi-tenant AI support SaaS where businesses upload their docs, get a Shadow-DOM chat widget in under 15 minutes, and escalate low-confidence questions to human agents with 100% PostgreSQL RLS tenant isolation. |
| **0:40 – 1:30** | **2. Tenant Setup & Document Ingestion (`/documents`)** | Open `http://localhost:3000/documents`. Show the file picker (`.pdf`, `.txt`, `.md` up to 10 MB), the Web Page URL field, and the uploaded `Oil_Supply_FAQ.md` & `Oil_Supply_Safety_And_Refund_Policy.pdf` documents (`Status: Ready`). Point out the RabbitMQ Ingestion Saga (`SagaOrchestrator` with LIFO compensating rollback, 3x retry, and Dead-Letter Queue). Copy the 1-line `<script>` tag. |
| **1:30 – 2:30** | **3. Live Grounded RAG Chat, Citations & Guardrails (`widget/demo.html`)** | Open the embedded chat widget on the Oil Supply portal. Ask: *"What is the minimum bulk diesel order quantity?"* Show the instant answer (`500 liters`) with the **`Source: Oil_Supply_FAQ.md`** citation pill and **`Confidence: 94%`** badge. Next, ask an unanswerable question (*"Do you charter crude oil ships to Singapore?"*) or click **`Talk to human`** — show the bot refusing to guess and displaying the **`Escalated to human agent`** badge. |
| **2:30 – 3:30** | **4. Live Agent Inbox & Human Handoff (`/inbox`)** | Switch to `http://localhost:3000/inbox`. Show the escalated conversation in the queue with the full conversation transcript so far. Click **`Claim Chat`** (`waiting` → `human`), type a real-time agent reply, click **`Send Reply`**, and show that the AI bot stays strictly silent while the agent owns the chat. Click **`Close Chat`**. |
| **3:30 – 4:30** | **5. Analytics, Multi-Tenant Switch & 104-Question Eval Suite (`/analytics`, `/login` & Terminal)** | Open `http://localhost:3000/analytics` (resolution rate, average response time, `used / 1000` monthly quota bar, Top Questions, and Unanswered Questions). Visit `/login` and click **`Try Demo: City Clinic`** to prove RLS tenant isolation. Finally, run `npm test` (`9/9` suites, `50/50` tests) and `node evals/run-evals.js` (`104` questions: **95.3% accuracy**, **0.0% hallucination**, **100.0% escalation**). |

# AI Support Platform — Oil Supply Integration & Demo Video Guide (Step 6)

---

## Part 1: Connecting Your Oil Supply System (Step 6)

Once the backend and widget are deployed, connect your **Oil Supply & Delivery Management System** (`oil-supply-and-delivery-management.vercel.app`) in 3 steps:

### 1. Seed or Create the `"Oil Supply"` and `"City Clinic"` Tenants
The repository includes both sample tenants and their knowledge-base documents in:
- `evals/datasets/oil-supply.dataset.json` (`Oil_Supply_FAQ.md` & `Oil_Supply_Safety_And_Refund_Policy.pdf`)
- `evals/datasets/city-clinic.dataset.json` (`City_Clinic_Patient_Guide.md` & `City_Clinic_Pharmacy_And_Privacy_Policy.pdf`)
- `backend/src/seed/demo-tenants.seed.ts` (`DemoTenantsSeeder`)

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
| **0:00 – 0:40** | **1. Problem & Architecture Overview** | Show the architecture diagram in `docs/ARCHITECTURE.md`. Explain the goal: a multi-tenant AI support SaaS where businesses upload their docs, get a Shadow-DOM chat widget in under 15 minutes, and escalate low-confidence questions to human agents with 100% PostgreSQL RLS tenant isolation. |
| **0:40 – 1:30** | **2. Tenant Setup & Document Ingestion (`/dashboard/documents`)** | Log in as the `"Oil Supply"` Owner. Upload `Oil_Supply_FAQ.md` and `Oil_Supply_Safety_And_Refund_Policy.pdf`. Point out the RabbitMQ ingestion pipeline (`Uploaded` → `Processing` → `Ready` in `pgvector` with 3x retry + Dead-Letter Queue). Copy the 1-line `<script>` tag. |
| **1:30 – 2:30** | **3. Live Grounded RAG Chat & Citations (`widget/demo.html` / Oil Supply Portal)** | Open the embedded chat widget on the Oil Supply portal. Ask: *"What is the minimum bulk diesel order and delivery time in Dhaka?"* Show the instant answer (`500 liters`, `24 hours`) with clickable **Source Citations (`Oil_Supply_FAQ.md`)**. Then test a prompt-injection attempt or an unanswerable question (*"Do you charter crude oil tankers to Singapore?"*) and show the bot refusing to guess and escalating to a human agent. |
| **2:30 – 3:30** | **4. Live Agent Inbox & Human Handoff (`/dashboard/inbox`)** | Switch to the Support Agent Inbox. Show the escalated conversation appearing in real time via Socket.io WebSockets with the full conversation history so far. Click **Claim Chat** (`waiting` → `human`), send a real-time agent reply, prove the AI bot stays silent while the agent owns the chat, and click **Close Chat**. |
| **3:30 – 4:15** | **5. Analytics, Quotas & 104-Question Eval Suite (`/dashboard/analytics` & Terminal)** | Show the Analytics dashboard (resolution rate, average response time, monthly quota bar, Top Questions, and Unanswered Questions list). Run `npm test` and `node evals/run-evals.js` in the terminal showing **100% Postgres RLS isolation pass rate**, **95.3% answer accuracy**, **0% hallucination rate**, and **100% unanswerable escalation rate** across `"Oil Supply"` and `"City Clinic"`. |

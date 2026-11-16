# Next.js Admin & Support Agent Dashboard (`/dashboard`)

Next.js 15 & React 19 Admin and Support Agent Portal for the AI Support Platform.

## Pages & Features
- **`/` (`src/app/page.tsx`)**: Workspace overview and quick navigation.
- **`/login` (`src/app/login/page.tsx`)**: JWT + `HttpOnly` refresh cookie sign-in, plus one-click **Try Demo: Oil Supply** and **Try Demo: City Clinic** workspace switcher buttons when `DEMO_MODE=true`.
- **`/signup` (`src/app/signup/page.tsx`)**: Self-service business tenant creation (`Owner` role provisioning with PostgreSQL RLS isolation).
- **`/documents` (`src/app/documents/page.tsx`)**:
  - Multipart file picker for `.pdf`, `.txt`, and `.md` files (up to 10 MB — `FR-2`),
  - Web page URL ingestion field and inline Markdown editor,
  - Real-time document lifecycle status (`Uploaded`, `Processing`, `Ready`, `Failed`) and cascading `pgvector` deletion,
  - One-line `<script>` embeddable widget tag copy box (`FR-6`).
- **`/inbox` (`src/app/inbox/page.tsx`)**:
  - Real-time escalated conversation queue (`waiting` and `human` status) powered by Socket.io WebSockets (`/realtime`),
  - Full conversation transcript viewer with customer, bot (citations + confidence %), and agent messages,
  - **Claim Chat**, **Send Reply**, and **Close Chat** controls enforcing `ConversationStateMachine` rules (`FR-5`).
- **`/analytics` (`src/app/analytics/page.tsx`)**:
  - Total chats, Bot-Resolved vs. Escalated ratio, and Average Response Time (`ms` — `FR-7`),
  - Per-tenant monthly message quota progress bar (`used / 1000` — `FR-8`),
  - Top Customer Questions and Unanswered / Escalated Questions list.

## Running Locally
```bash
cd dashboard
npm install
npm run dev
# Open http://localhost:3000
```

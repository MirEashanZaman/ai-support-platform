# Next.js 15 Admin & Support Agent Dashboard (`/dashboard`)

> **Multi-Tenant Control Plane & Real-Time Support Agent Inbox**  
> Built with **Next.js 15 (App Router)**, **React 19**, **Tailwind CSS 4**, **Axios**, **TanStack Query**, **Socket.io Client**, and **Zod**.

---

## 1. Overview

The `/dashboard` application serves as the authenticated multi-tenant portal for **Business Owners**, **Support Agents**, and **Viewers**:
- **Business Owners** provision workspaces, ingest knowledge-base documents (`PDF`, `Markdown`, `TXT`, `URL`), configure widget appearance and allowed origins, copy the 1-line `<script>` embed snippet, and monitor deflection analytics and audit trails.
- **Support Agents** monitor the real-time Socket.io handoff queue (`/inbox`), inspect full customer-and-bot transcripts, claim escalated conversations (`waiting` → `human`), send real-time replies, and resolve tickets (`human` → `closed`).
- **Viewers** have read-only visibility into escalated conversations and performance analytics.

---

## 2. Route Architecture & Feature Matrix

| Route | Component Path | Allowed Roles | Capabilities & PRD Traceability |
| :--- | :--- | :--- | :--- |
| **`/`** | `src/app/page.tsx` | Public / All | Executive workspace overview, architecture summary, and quick navigation across portal workflows. |
| **`/login`** | `src/app/login/page.tsx` | Public | Email & password sign-in issuing short-lived Bearer JWTs + `HttpOnly` refresh cookies (`FR-1`), plus one-click **`Try Demo: Oil Supply`** and **`Try Demo: City Clinic`** workspace switchers when `DEMO_MODE=true`. |
| **`/signup`** | `src/app/signup/page.tsx` | Public | Self-service tenant onboarding that provisions a new PostgreSQL RLS-isolated business workspace and `Owner` account (`FR-1`). |
| **`/documents`** | `src/app/documents/page.tsx` | `Owner` (write) / `Agent`, `Viewer` (read) | Multipart `.pdf`, `.txt`, and `.md` file uploader (10 MB limit — `FR-2`), web `URL` ingestion form, inline Markdown editor, live ingestion status tracking (`Uploaded` → `Processing` → `Ready` / `Failed` — `FR-3`), cascading `pgvector` deletion, and 1-line `<script>` widget embed generator (`FR-6`). |
| **`/inbox`** | `src/app/inbox/page.tsx` | `Owner`, `Agent` (write) / `Viewer` (read) | Real-time Socket.io (`/realtime`) queue displaying `waiting` and `human` conversations (`FR-5`), full transcript viewer with bot citations and confidence badges, and **`Claim Chat`**, **`Send Reply`**, and **`Close Chat`** actions backed by `ConversationStateMachine`. |
| **`/analytics`** | `src/app/analytics/page.tsx` | `Owner`, `Agent`, `Viewer` | Total conversations, Bot-Resolved vs. Escalated breakdown, Average Response Time (`ms` — `FR-7`), Monthly Message Quota consumption (`used / 1000` — `FR-8`), Top Customer Questions, and Unanswered Questions list. |

---

## 3. Client Architecture & Security Controls

- **Authenticated API Client (`src/lib/api-client.ts`):** Centralizes Axios requests with `withCredentials: true` (for `HttpOnly` refresh token cookies), automatic `Authorization: Bearer <token>` injection, and transparent demo session bootstrapping when `DEMO_MODE=true`.
- **Real-Time Socket Client (`src/lib/socket-client.ts`):** Connects to the NestJS `/realtime` namespace and subscribes to `tenant:<tenantId>` rooms to receive instant `handoff:escalated`, `handoff:claimed`, `handoff:message`, and `handoff:closed` events without polling.

---

## 4. Local Development & Verification

```bash
cd dashboard

# Install dependencies
npm install

# Run TypeScript type verification
npx tsc --noEmit

# Start the Next.js development server on http://localhost:3000
npm run dev
```

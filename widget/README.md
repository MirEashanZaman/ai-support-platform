# Embeddable Shadow-DOM Chat Widget (`/widget`)

> **Zero-Dependency, Style-Isolated Customer Support Chat Widget (`FR-6`)**  
> Embeds onto any host website via a single `<script>` tag, rendering cited RAG answers, calibrated confidence badges, and one-click human handoff inside an isolated **Shadow DOM** boundary.

---

## 1. Quick Integration

Add the following `<script>` snippet prior to the closing `</body>` tag of any host website:

```html
<script
  src="http://localhost:4000/widget.js"
  data-tenant-key="oil-supply"
  data-api-url="http://localhost:4000"
  async
></script>
```

### Configuration Attributes

| Attribute | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| **`data-tenant-key`** | **Yes** | — | Public tenant identifier (e.g., `oil-supply`, `city-clinic`). Never exposes secret credentials. |
| **`data-api-url`** | No | Script origin | Base URL of the NestJS backend serving `/chat/:tenantKey/*` endpoints. |

*(Business owners can also customize the widget's display title, brand primary hex color, welcome greeting, and `allowed_origins` allowlist from the `/documents` dashboard or `PATCH /tenants/me`.)*

---

## 2. Engineering & Security Architecture

- **Complete CSS Style Isolation (Shadow DOM):** The widget mounts inside `hostElement.attachShadow({ mode: 'open' })` with `:host { all: initial }`. Host page CSS resets (such as Tailwind CSS, Bootstrap, or global `button`/`input` styles) cannot distort the widget, and widget styles never leak into the host website.
- **Zero External Runtime Dependencies:** Implemented in pure Vanilla JavaScript (`src/widget.js`) using native browser `fetch`, `localStorage`, and DOM APIs to maintain a sub-15 KB footprint.
- **Grounded Citations & Confidence Transparency:** Every AI response displays clickable **`Source: <Document Name>`** citation pills alongside a **`Confidence: <0-100>%`** badge or an **`Escalated to human agent`** status indicator.
- **Seamless Human Handoff & Live Polling:** Customers can click **`Talk to human`** at any point (or trigger automatic escalation on low-confidence queries). Once escalated (`waiting` → `human`), the widget polls `/chat/:tenantKey/conversations/:id/messages` so real-time human agent replies appear smoothly in the chat stream.
- **XSS-Safe by Construction:** All customer inputs, bot answers, agent replies, and citation labels are rendered strictly via `element.textContent` — never `innerHTML`.

---

## 3. Live Demo Environment

Open [`widget/demo.html`](./demo.html) in any browser while the backend is running on `http://localhost:4000` (or launch via `run.bat`) to interact with the widget embedded inside a sample **Oil Supply & Delivery Management Portal**.

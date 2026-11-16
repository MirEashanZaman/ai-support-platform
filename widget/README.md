# Embeddable Shadow-DOM Chat Widget (`/widget`)

Zero-dependency Vanilla JavaScript customer chat widget (`FR-6`) that embeds into any website via a single `<script>` tag:

```html
<script
  src="http://localhost:4000/widget.js"
  data-tenant-key="oil-supply"
  data-api-url="http://localhost:4000"
  async
></script>
```

## Key Engineering Highlights
- **Shadow DOM Style Isolation:** Mounts inside `hostEl.attachShadow({ mode: 'open' })` with `:host { all: initial }` so aggressive host website CSS (such as Tailwind resets or global `button` rules) never affects the widget and widget styles never leak into the host page.
- **Tiny Bundle Size:** Uses native browser `fetch` and `localStorage` with zero external runtime libraries.
- **Grounded Citations & Confidence Badges:** Renders clickable **`Source: <Document>`** pills alongside **`Confidence: 94%`** or **`Escalated to human agent`** badges on every bot response.
- **One-Click Human Escalation:** Includes a **`Talk to human`** button in the header and automatically updates status when an agent claims or replies to the conversation.
- **XSS Safe by Design:** Renders all customer, bot, and citation text exclusively via `element.textContent`.

## Live Demo Page
Open [demo.html](./demo.html) in any browser while the backend is running on `http://localhost:4000` to test the widget on a sample **Oil Supply & Delivery Portal** host page.

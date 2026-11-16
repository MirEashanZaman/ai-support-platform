import React from 'react';

export default function DashboardHomePage() {
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section
        style={{
          background: '#ffffff',
          padding: 24,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: 22 }}>
          Workspace Admin &amp; Support Agent Portal
        </h1>
        <p style={{ color: '#475569', lineHeight: 1.6 }}>
          Manage tenant documents (PDF, Markdown, TXT, URLs), configure your
          Shadow-DOM website chat widget, and respond to escalated customer
          conversations in real time.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <a
            href="/inbox"
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              padding: '10px 18px',
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            Open Live Agent Inbox →
          </a>
        </div>
      </section>
    </div>
  );
}

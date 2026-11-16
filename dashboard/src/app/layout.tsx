import React from 'react';

export const metadata = {
  title: 'AI Support Platform — Admin & Agent Dashboard',
  description:
    'Multi-tenant AI customer support platform with RAG document management and live agent inbox.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: '#f8fafc',
          color: '#0f172a',
        }}
      >
        <header
          style={{
            backgroundColor: '#0f172a',
            color: '#ffffff',
            padding: '14px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 17 }}>
            AI Support Platform
          </div>
          <nav style={{ display: 'flex', gap: 20, fontSize: 14 }}>
            <a href="/" style={{ color: '#e2e8f0', textDecoration: 'none' }}>
              Overview
            </a>
            <a
              href="/inbox"
              style={{
                color: '#38bdf8',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Live Agent Inbox
            </a>
          </nav>
        </header>
        <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
          {children}
        </main>
      </body>
    </html>
  );
}

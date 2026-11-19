import React from 'react';
import NavLinks from '../components/nav-links';

export const metadata = {
  title: 'AI Support Platform — Admin & Agent Dashboard',
  description:
    'Multi-tenant AI customer support platform with RAG document management, live agent inbox, and analytics.',
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
          <NavLinks />
        </header>
        <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
          {children}
        </main>
      </body>
    </html>
  );
}

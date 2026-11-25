import React from 'react';
import Link from 'next/link';
import NavLinks from '../components/nav-links';
import { MotionProvider } from '../components/motion-primitives';
import './globals.css';

export const metadata = {
  title: 'AI Support Platform — Operations Console',
  description:
    'Multi-tenant AI customer support console with document indexing, live agent handoff, and resolution analytics.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <MotionProvider>
          <header className="app-header">
            <Link href="/" className="app-brand">
              <span className="app-brand-mark">AS</span>
              <span>AI Support Platform</span>
            </Link>
            <NavLinks />
          </header>
          <main className="app-main">{children}</main>
        </MotionProvider>
      </body>
    </html>
  );
}

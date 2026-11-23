'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
).replace(/\/+$/, '');

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/documents', label: 'Documents' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/analytics', label: 'Analytics' },
  { href: `${API_BASE_URL}/widget-demo`, label: 'Customer portal' },
  { href: '/login', label: 'Sign in' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === '/'
            ? pathname === '/'
            : !item.href.startsWith('http') &&
              (pathname === item.href || pathname?.startsWith(item.href + '/'));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`app-nav-link${isActive ? ' app-nav-link-active' : ''}`}
          >
            {item.label}
          </Link>
        );
      })}
      <Link href="/signup" className="app-nav-cta">
        New workspace
      </Link>
    </nav>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/documents', label: 'Documents & Widget' },
  { href: '/inbox', label: 'Live Agent Inbox' },
  { href: '/analytics', label: 'Analytics & Quotas' },
  { href: '/login', label: 'Sign In' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 14 }}>
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === '/'
            ? pathname === '/'
            : pathname === item.href || pathname?.startsWith(item.href + '/');

        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              color: isActive ? '#38bdf8' : '#e2e8f0',
              fontWeight: isActive ? 600 : 400,
              textDecoration: 'none',
            }}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/signup"
        style={{
          backgroundColor: '#2563eb',
          color: '#ffffff',
          padding: '6px 12px',
          borderRadius: 6,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Create Workspace
      </Link>
    </nav>
  );
}

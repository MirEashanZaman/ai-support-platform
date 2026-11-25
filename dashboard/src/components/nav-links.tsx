'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  BarChart3,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  LogIn,
  Plus,
} from 'lucide-react';
import { SPRING_SNAPPY } from './motion-primitives';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
).replace(/\/+$/, '');

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: `${API_BASE_URL}/widget-demo`, label: 'Customer portal', icon: Globe },
  { href: '/login', label: 'Sign in', icon: LogIn },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
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
            {isActive && (
              <motion.span
                layoutId="active-nav-pill"
                className="app-nav-pill"
                transition={SPRING_SNAPPY}
              />
            )}
            <span className="app-nav-label">
              <Icon size={15} strokeWidth={1.6} />
              <span>{item.label}</span>
            </span>
          </Link>
        );
      })}
      <Link href="/signup" className="app-nav-cta">
        <Plus size={14} strokeWidth={2} style={{ marginRight: 5 }} />
        <span>New workspace</span>
      </Link>
    </nav>
  );
}

import React from 'react';
import AnalyticsClient from './analytics-client';

export const dynamic = 'force-dynamic';

async function fetchBackendHealth(): Promise<{ status: string }> {
  const apiUrl = (
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
  ).replace(/\/+$/, '');
  try {
    const res = await fetch(`${apiUrl}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return { status: 'unreachable' };
    const data = (await res.json()) as { status?: string };
    return { status: data.status || 'ok' };
  } catch {
    return { status: 'offline' };
  }
}

export default async function AnalyticsPage() {
  const health = await fetchBackendHealth();
  const serverRenderedAt = new Date().toISOString().slice(11, 19) + ' UTC';

  return (
    <AnalyticsClient
      initialServerStatus={health.status}
      serverRenderedAt={serverRenderedAt}
    />
  );
}

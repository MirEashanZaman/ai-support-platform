'use client';

import React, { useEffect, useState } from 'react';
import {
  analyticsApi,
  AnalyticsSummary,
  ChatMessageItem,
} from '../../lib/api-client';

/**
 * Week 5 Deliverable — Analytics & Per-Tenant Quotas Dashboard (FR-7 & FR-8):
 * - Displays Total chats, Bot-resolved vs. Escalated, Average response time
 * - Displays Per-tenant monthly message quota progress bar
 * - Displays Top customer questions and Unanswered questions (so Owners know which docs to add)
 */
export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary>({
    totalChats: 0,
    botResolvedChats: 0,
    escalatedChats: 0,
    resolutionRate: 100,
    averageResponseTimeMs: 0,
    monthlyQuotaUsed: 0,
    monthlyQuotaLimit: 5000,
    topQuestions: [],
  });
  const [unanswered, setUnanswered] = useState<ChatMessageItem[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [sumData, unansweredData] = await Promise.all([
          analyticsApi.fetchSummary(),
          analyticsApi.fetchUnanswered(),
        ]);
        setSummary(sumData);
        setUnanswered(unansweredData);
      } catch {
        // Keep initial state when offline
      }
    }
    void load();
  }, []);

  const quotaPercent = Math.min(
    100,
    Math.round(
      (summary.monthlyQuotaUsed / Math.max(1, summary.monthlyQuotaLimit)) * 100,
    ),
  );

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>
        Analytics, Unanswered Questions &amp; Monthly Quotas
      </h1>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <div
          style={{
            background: '#ffffff',
            padding: 18,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: 12, color: '#64748b' }}>Total Chats</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
            {summary.totalChats}
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: 18,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Bot-Resolved vs. Escalated
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
            {summary.botResolvedChats} resolved / {summary.escalatedChats}{' '}
            escalated ({summary.resolutionRate}%)
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: 18,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Avg Response Time (Target &lt; 3000 ms)
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
            {summary.averageResponseTimeMs} ms
          </div>
        </div>
      </div>

      {/* Per-Tenant Monthly Quota Card (FR-8) */}
      <section
        style={{
          background: '#ffffff',
          padding: 20,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          <span>Per-Tenant Monthly Message Quota (FR-8)</span>
          <span>
            {summary.monthlyQuotaUsed} / {summary.monthlyQuotaLimit} messages (
            {quotaPercent}%)
          </span>
        </div>
        <div
          style={{
            height: 10,
            background: '#e2e8f0',
            borderRadius: 999,
            marginTop: 10,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${quotaPercent}%`,
              height: '100%',
              background: quotaPercent > 90 ? '#dc2626' : '#2563eb',
            }}
          />
        </div>
      </section>

      {/* Top Questions & Unanswered Questions */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}
      >
        <section
          style={{
            background: '#ffffff',
            padding: 20,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Top Customer Questions</h2>
          {summary.topQuestions.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 13 }}>
              No customer questions recorded yet.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
              {summary.topQuestions.map((q, idx) => (
                <li key={idx} style={{ fontSize: 14 }}>
                  {q.question}{' '}
                  <strong style={{ color: '#2563eb' }}>({q.count}×)</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          style={{
            background: '#ffffff',
            padding: 20,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 16 }}>
            Unanswered / Escalated Questions (Upload Docs for These)
          </h2>
          {unanswered.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 13 }}>
              All recent questions were answered confidently by the bot!
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
              {unanswered.map((m) => (
                <li key={m.id} style={{ fontSize: 14, color: '#b91c1c' }}>
                  {m.content}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

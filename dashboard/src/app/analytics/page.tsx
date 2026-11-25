'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  analyticsApi,
  AnalyticsSummary,
  ChatMessageItem,
} from '../../lib/api-client';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  EASE_OUT_EXPO,
  PageMotion,
  SpotlightCard,
  StaggerCard,
  StaggerGrid,
} from '../../components/motion-primitives';

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary>({
    totalChats: 0,
    botResolvedChats: 0,
    escalatedChats: 0,
    resolutionRate: 100,
    averageResponseTimeMs: 0,
    monthlyQuotaUsed: 0,
    monthlyQuotaLimit: 1000,
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

  const totalHandled = Math.max(
    1,
    summary.botResolvedChats + summary.escalatedChats,
  );
  const botShare = Math.round((summary.botResolvedChats / totalHandled) * 100);
  const escalatedShare = 100 - botShare;

  return (
    <PageMotion>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics and quotas</h1>
          <p className="page-subtitle">
            Monitor automated resolution rate, response latency, monthly message usage, and documentation gaps.
          </p>
        </div>
        <div className="sig-meta tabular">
          <span className="sig-dot sig-dot-ready" />
          <span>Current billing period</span>
        </div>
      </div>

      <StaggerGrid className="stats-row">
        <StaggerCard style={{ padding: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Total conversations
          </div>
          <div
            style={{ fontSize: 32, fontWeight: 500, lineHeight: 1.1, marginTop: 10 }}
          >
            <AnimatedNumber value={summary.totalChats} />
          </div>
          <div className="sig-meta tabular" style={{ marginTop: 8 }}>
            All tenant sessions
          </div>
        </StaggerCard>

        <StaggerCard style={{ padding: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Bot resolution rate
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 500,
              lineHeight: 1.1,
              marginTop: 10,
              color: 'var(--accent)',
            }}
          >
            <AnimatedNumber value={summary.resolutionRate} suffix="%" />
          </div>
          <div className="sig-meta tabular" style={{ marginTop: 8 }}>
            {summary.botResolvedChats} resolved · {summary.escalatedChats} escalated
          </div>
        </StaggerCard>

        <StaggerCard style={{ padding: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Average response time
          </div>
          <div
            style={{ fontSize: 32, fontWeight: 500, lineHeight: 1.1, marginTop: 10 }}
          >
            <AnimatedNumber value={summary.averageResponseTimeMs} suffix=" ms" />
          </div>
          <div className="sig-meta tabular" style={{ marginTop: 8 }}>
            2,800 ms timeout cap
          </div>
        </StaggerCard>

        <StaggerCard style={{ padding: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Monthly message quota
          </div>
          <div
            style={{ fontSize: 32, fontWeight: 500, lineHeight: 1.1, marginTop: 10 }}
          >
            <AnimatedNumber value={quotaPercent} suffix="%" />
          </div>
          <div className="sig-meta tabular" style={{ marginTop: 8 }}>
            {summary.monthlyQuotaUsed} / {summary.monthlyQuotaLimit} messages
          </div>
        </StaggerCard>
      </StaggerGrid>

      <SpotlightCard>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 16,
          }}
        >
          <h2 className="card-title">Resolution split and quota consumption</h2>
          <span className="sig-meta tabular">
            {summary.monthlyQuotaUsed} / {summary.monthlyQuotaLimit} monthly messages used
          </span>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 6,
              }}
            >
              <span>Automated vs. human escalation</span>
              <span className="mono tabular">
                {botShare}% bot · {escalatedShare}% escalated
              </span>
            </div>
            <div
              style={{
                height: 10,
                background: 'var(--bg-raised)',
                borderRadius: 6,
                overflow: 'hidden',
                display: 'flex',
              }}
            >
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: botShare / 100 }}
                transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
                style={{
                  width: '100%',
                  transformOrigin: 'left center',
                  background: 'var(--accent)',
                }}
              />
            </div>
          </div>

          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 6,
              }}
            >
              <span>Tenant quota utilization</span>
              <span className="mono tabular">{quotaPercent}%</span>
            </div>
            <AnimatedProgressBar
              percent={quotaPercent}
              color={quotaPercent > 90 ? 'var(--negative)' : 'var(--text-primary)'}
            />
          </div>
        </div>
      </SpotlightCard>

      <div className="split-2-asym">
        <SpotlightCard>
          <h2 className="card-title">Top customer questions</h2>
          <p className="card-desc">
            Most frequent inquiries asked across your embedded widget and simulator.
          </p>
          {summary.topQuestions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
              No customer questions recorded yet.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {summary.topQuestions.map((q, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.25,
                    delay: Math.min(idx * 0.04, 0.24),
                    ease: EASE_OUT_EXPO,
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-page)',
                    border: '1px solid var(--border-hairline)',
                    fontSize: 13,
                  }}
                >
                  <span>{q.question}</span>
                  <span className="sig-tag tabular">{q.count}x</span>
                </motion.div>
              ))}
            </div>
          )}
        </SpotlightCard>

        <SpotlightCard>
          <h2 className="card-title">Unanswered questions</h2>
          <p className="card-desc">
            Escalated inquiries with no matching document chunk. Upload docs covering these topics.
          </p>
          {unanswered.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
              All recent questions matched existing workspace documentation.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {unanswered.map((m, idx) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.25,
                    delay: Math.min(idx * 0.04, 0.24),
                    ease: EASE_OUT_EXPO,
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-page)',
                    border: '1px solid var(--border-hairline)',
                    fontSize: 13,
                  }}
                >
                  <span className="sig-dot sig-dot-waiting" />
                  <span>{m.content}</span>
                </motion.div>
              ))}
            </div>
          )}
        </SpotlightCard>
      </div>
    </PageMotion>
  );
}

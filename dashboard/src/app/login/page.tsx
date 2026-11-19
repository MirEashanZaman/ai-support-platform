'use client';

import React, { useState } from 'react';
import { authApi, isDemoModeEnabled } from '../../lib/api-client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const demoMode = isDemoModeEnabled();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await authApi.login({ email, password });
      setStatus(
        `Signed in as ${result.user.email} (${result.user.role}) — Workspace: ${result.tenant.name}`,
      );
    } catch {
      setStatus('Invalid email or password.');
    }
  }

  async function handleDemoQuickLogin(demoEmail: string) {
    try {
      const result = await authApi.login({
        email: demoEmail,
        password: 'Password123!',
      });
      setStatus(
        `Switched active tenant to "${result.tenant.name}" (${result.user.email})!`,
      );
    } catch {
      setStatus('Demo account is only available when DEMO_MODE is enabled.');
    }
  }

  return (
    <div style={{ maxWidth: 440, margin: '40px auto', display: 'grid', gap: 16 }}>
      <section
        style={{
          background: '#ffffff',
          padding: 28,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Sign In to Your Workspace</h1>
        <p style={{ color: '#64748b', fontSize: 13 }}>
          Enter your workspace email and password to manage your support bot, knowledge base, and live agent inbox.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@business.com"
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
            }}
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 characters)"
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
            }}
          />
          <button
            type="submit"
            style={{
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        </form>
        {status && (
          <div
            style={{
              marginTop: 14,
              fontSize: 13,
              color: '#059669',
              fontWeight: 600,
            }}
          >
            {status}
          </div>
        )}
      </section>

      {demoMode && (
        <section
          style={{
            background: '#f8fafc',
            padding: 20,
            borderRadius: 12,
            border: '1px solid #cbd5e1',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            Quick Switch Demo Workspaces
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => handleDemoQuickLogin('owner@oilsupply.com')}
              style={{
                flex: 1,
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '9px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try Demo: Oil Supply
            </button>
            <button
              type="button"
              onClick={() => handleDemoQuickLogin('owner@cityclinic.com')}
              style={{
                flex: 1,
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '9px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try Demo: City Clinic
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

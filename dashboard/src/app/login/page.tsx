'use client';

import React, { useState } from 'react';
import { authApi } from '../../lib/api-client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);

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

  return (
    <div style={{ maxWidth: 420, margin: '40px auto' }}>
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
          Uses short-lived JWT Bearer tokens + HttpOnly SameSite=Strict refresh cookies (FR-1).
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@oilsupply.com"
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
          <div style={{ marginTop: 14, fontSize: 13, color: '#0f172a' }}>
            {status}
          </div>
        )}
      </section>
    </div>
  );
}

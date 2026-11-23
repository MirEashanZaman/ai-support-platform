'use client';

import React, { useState } from 'react';
import { authApi } from '../../lib/api-client';

export default function SignupPage() {
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsError(false);
    try {
      const result = await authApi.signup({ businessName, email, password });
      setStatus(
        `Created ${result.tenant.name} (tenantKey: ${result.tenant.tenantKey}) with Owner role`,
      );
    } catch {
      setIsError(true);
      setStatus('Could not create workspace. Check inputs or try another email.');
    }
  }

  return (
    <div style={{ maxWidth: 440, margin: '40px auto' }}>
      <section className="card">
        <h1 className="page-title" style={{ fontSize: 22 }}>
          Create business workspace
        </h1>
        <p className="card-desc">
          Provisions an isolated PostgreSQL RLS tenant and assigns your account the Owner role.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
          <div>
            <label className="field-label" htmlFor="signup-business">
              Business name
            </label>
            <input
              id="signup-business"
              type="text"
              className="input"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Oil Supply"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="signup-email">
              Owner email
            </label>
            <input
              id="signup-email"
              type="email"
              className="input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@oilsupply.com"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="signup-password">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              className="input"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Create workspace
          </button>
        </form>
        {status && (
          <div
            className="sig-meta"
            style={{
              marginTop: 16,
              color: isError ? 'var(--negative)' : 'var(--positive)',
            }}
          >
            <span
              className={`sig-dot ${isError ? 'sig-dot-danger' : 'sig-dot-ready'}`}
            />
            <span>{status}</span>
          </div>
        )}
      </section>
    </div>
  );
}

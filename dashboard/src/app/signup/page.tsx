'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Building2 } from 'lucide-react';
import { authApi } from '../../lib/api-client';
import { PageMotion, SpotlightCard } from '../../components/motion-primitives';

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
    <PageMotion className="">
      <div style={{ maxWidth: 440, margin: '40px auto' }}>
        <SpotlightCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={18} strokeWidth={1.6} color="var(--text-secondary)" />
            <h1 className="page-title" style={{ fontSize: 22 }}>
              Create business workspace
            </h1>
          </div>
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
            <motion.button
              type="submit"
              whileTap={{ scale: 0.98 }}
              className="btn btn-primary"
            >
              Create workspace
            </motion.button>
          </form>
          <AnimatePresence>
            {status && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
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
              </motion.div>
            )}
          </AnimatePresence>
        </SpotlightCard>
      </div>
    </PageMotion>
  );
}

'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Building2, LogIn } from 'lucide-react';
import { authApi, isDemoModeEnabled } from '../../lib/api-client';
import { PageMotion, SpotlightCard } from '../../components/motion-primitives';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const demoMode = isDemoModeEnabled();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsError(false);
    try {
      const result = await authApi.login({ email, password });
      setStatus(
        `Signed in as ${result.user.email} (${result.user.role}) · ${result.tenant.name}`,
      );
    } catch {
      setIsError(true);
      setStatus('Invalid email or password');
    }
  }

  async function handleDemoQuickLogin(demoEmail: string) {
    setIsError(false);
    try {
      const result = await authApi.login({
        email: demoEmail,
        password: 'Password123!',
      });
      setStatus(`Active workspace switched to ${result.tenant.name} (${result.user.email})`);
    } catch {
      setIsError(true);
      setStatus('Demo workspaces are unavailable in this environment');
    }
  }

  return (
    <PageMotion className="">
      <div style={{ maxWidth: 440, margin: '40px auto', display: 'grid', gap: 16 }}>
        <SpotlightCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogIn size={18} strokeWidth={1.6} color="var(--text-secondary)" />
            <h1 className="page-title" style={{ fontSize: 22 }}>
              Sign in to workspace
            </h1>
          </div>
          <p className="card-desc">
            Enter your workspace email and password to manage your knowledge base and live inbox.
          </p>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
            <div>
              <label className="field-label" htmlFor="login-email">
                Work email
              </label>
              <input
                id="login-email"
                type="email"
                className="input"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@business.com"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
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
              Sign in
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

        {demoMode && (
          <SpotlightCard style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={15} strokeWidth={1.6} color="var(--text-secondary)" />
              <h2 className="card-title" style={{ fontSize: 14 }}>
                Switch demo workspace
              </h2>
            </div>
            <p className="card-desc" style={{ marginBottom: 12 }}>
              Verify tenant isolation between two separate seeded businesses.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => void handleDemoQuickLogin('owner@oilsupply.com')}
                className="btn btn-secondary"
              >
                Oil Supply
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => void handleDemoQuickLogin('owner@cityclinic.com')}
                className="btn btn-secondary"
              >
                City Clinic
              </motion.button>
            </div>
          </SpotlightCard>
        )}
      </div>
    </PageMotion>
  );
}

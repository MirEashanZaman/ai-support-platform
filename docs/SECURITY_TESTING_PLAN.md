# AI Support Platform: Security Testing Plan & CI Verification

**Author:** Mir Eashan Zaman · **Date:** November 2026 · **Version:** 1.0  
**CI Workflow:** [`.github/workflows/security.yml`](../.github/workflows/security.yml) · **Detailed Report:** [`docs/THREAT_MODEL_AND_PENTEST.md`](./THREAT_MODEL_AND_PENTEST.md)

---

## Executive Approach

Rather than attempting enterprise-only exercises that require dedicated security operations teams (such as live red/purple teaming or paid bug bounty programs), **AI Support Platform** focuses on **automated, reproducible security gates in CI** paired with a **targeted manual self pen-test** against the **OWASP Web/API Top 10** and **OWASP Top 10 for LLM Applications**.

---

## 1. Automated Security Scans in CI (`.github/workflows/security.yml`)

Every push and pull request to `main` executes five automated security gates:

| Security Testing Type | Tooling Configured | Purpose & Risk Mitigated | CI Configuration Reference |
| :--- | :--- | :--- | :--- |
| **SCA (Software Composition Analysis)** | `npm audit --audit-level=high` + **GitHub Dependabot** | Detects known CVEs in third-party Node.js dependencies across `backend/` and `dashboard/`. | `.github/workflows/security.yml`, `.github/dependabot.yml` |
| **SAST (Static Application Security Testing)** | **GitHub CodeQL** (`javascript-typescript`) | Performs semantic data-flow analysis on every push to catch injection, XSS, and logic flaws. | `.github/workflows/security.yml` (`sast-codeql` job) |
| **Secret Scanning** | **Gitleaks** (`gitleaks/gitleaks-action@v2`) | Scans the full Git history for accidentally committed Anthropic Claude API keys, JWT secrets, or DB credentials. | `.github/workflows/security.yml`, `.gitleaks.toml` |
| **Container Image Scanning** | **Aqua Trivy** (`aquasecurity/trivy-action`) | Scans the production multi-stage `backend/Dockerfile` (`node:22-alpine`) for OS and library vulnerabilities (`HIGH`, `CRITICAL`). | `.github/workflows/security.yml` (`container-trivy` job) |
| **DAST (Dynamic Application Security Testing)** | **OWASP ZAP Baseline Scan** (`zaproxy/action-baseline`) | Boots the live Docker Compose stack and attacks the running API using the exported OpenAPI schema (`/api-docs-json`). | `.github/workflows/security.yml` (`dast-owasp-zap` job) |

---

## 2. Manual Security Testing & Verification Artifacts (Completed)

1. **Self Penetration Test (OWASP Web Top 10 & OWASP LLM Top 10):**
   - Conducted adversarial testing against the local stack targeting prompt injection, cross-tenant vector retrieval, XSS in uploaded HTML/chat, credential brute-forcing, and mid-ingestion database failures.
   - Identified and remediated **6 findings**, each backed by automated Jest regression tests (documented in [`docs/THREAT_MODEL_AND_PENTEST.md`](./THREAT_MODEL_AND_PENTEST.md)).
2. **API Access Control & Multi-Tenant Isolation Testing:**
   - Automated tools cannot infer business-level tenant boundaries. We authored dedicated integration tests (`backend/test/tenant-isolation.spec.ts` and `backend/test/week1-auth-rls.spec.ts`) verifying that Tenant A cannot read, mutate, delete, or vector-search Tenant B's records under PostgreSQL `FORCE ROW LEVEL SECURITY`.
3. **STRIDE Threat Model & OWASP ASVS v4.0 Checklist:**
   - Published a one-page STRIDE risk assessment and OWASP ASVS v4.0 verification matrix in [`docs/THREAT_MODEL_AND_PENTEST.md`](./THREAT_MODEL_AND_PENTEST.md).

---

## 3. Out-of-Scope Security Exercises (Intentionally Omitted)

| Omitted Testing Type | Rationale |
| :--- | :--- |
| **Red / Purple Teaming & BAS** | Requires a multi-person security operations center (SOC) and live production defense telemetry. |
| **Public Bug Bounty Program** | Requires commercial production traffic and monetary triage budgets. |
| **Social Engineering / Phishing Tests** | Targets organizational personnel rather than software architecture. |
| **IAST (Interactive App Security Testing)** | High runtime agent overhead with minimal incremental value over CodeQL + OWASP ZAP + Jest integration suites. |
| **MAST (Mobile Application Security Testing)** | v1 ships a responsive Shadow-DOM web widget and Next.js web portal rather than native iOS/Android binaries. |

---

## 4. Rules of Engagement

> [!IMPORTANT]
> **Authorized Targets Only:** All dynamic scanning (OWASP ZAP) and manual penetration testing must be executed exclusively against systems you own (`localhost` Docker Compose stack or your dedicated staging instance). Never run automated scanners against third-party websites.

---

## 5. Executive Security Summary Statement

> *"Automated SAST (`CodeQL`), SCA (`npm audit` + `Dependabot`), secret scanning (`Gitleaks`), container scanning (`Trivy`), and DAST (`OWASP ZAP`) scans run in CI on every push. A manual penetration test against the OWASP Web Top 10 and OWASP LLM Top 10 identified 6 issues — all remediated and locked in with automated regression tests."*

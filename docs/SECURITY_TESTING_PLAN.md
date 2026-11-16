# AI Support Platform: Security Testing Plan

**By Mir Eashan Zaman · November 2026 · Version 1.0**

Add a small subset of security testing types, not all of them. Many are for companies with security teams (red team, purple team, bug bounty), so they would be wasted effort for a student project. Pick what is automated and visible in the repo.

---

## 1. Do These (Automated, in CI)

| Type | What to use | Why |
| :--- | :--- | :--- |
| **SCA (dependencies)** | `npm audit` + Dependabot | Easiest win, takes minutes |
| **SAST (source code)** | GitHub CodeQL or Semgrep | Finds code-level flaws on every push |
| **Secret scanning** | Gitleaks (plus GitHub secret scanning) | Catches leaked API keys. Not in the original list, but it matters a lot with Claude and embedding keys |
| **Container scan** | Trivy on the Docker images | Flags known flaws in base images |
| **DAST (running app)** | OWASP ZAP baseline scan against the Docker Compose stack | Tests the live API from outside |

---

## 2. Do These Lightly (Manual, One-Time)

- **Self pen test:** Spend a day attacking your own app using the **OWASP Top 10** and the **OWASP Top 10 for LLM Applications** (prompt injection, data leakage). Write down each finding, the fix, and the result. This report is great portfolio content.
- **API security testing:** Run ZAP with your Swagger/OpenAPI file. Also write your own tests for tenant isolation and broken access control (tenant A reading tenant B's data). Automated tools miss this, and it is the biggest risk.
- **Threat model and checklist:** One page in `/docs` using STRIDE, plus an OWASP ASVS checklist. This covers the "security audit" and "risk assessment" ideas without a real audit.

---

## 3. Skip These

- **Red and purple teaming, BAS:** need a team and a live defense setup.
- **Bug bounty:** needs real users and money.
- **Social engineering tests:** not relevant to a code project.
- **IAST:** heavy tooling with little extra benefit here.
- **Mobile testing (MAST):** no mobile app is shipping for this project.

---

## 4. One Important Rule

Only scan and attack systems you own (your local stack or your own staging server). Never run ZAP or similar tools against someone else's website.

---

## 5. What to Say in the Write-Up

> "Automated SAST, SCA, secret, container, and DAST scans run in CI on every push. A manual pen test against the OWASP Top 10 and LLM Top 10 found 6 issues, all fixed."

It is short, true, and strong.

---

## 6. Next Step

Write the GitHub Actions workflow with CodeQL, Gitleaks, Trivy, `npm audit`, and a ZAP baseline scan.

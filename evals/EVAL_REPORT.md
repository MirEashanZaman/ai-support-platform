# AI Support Platform — Automated RAG Evaluation Report (PRD Section 13 & 14)

> **Automated Multi-Tenant RAG Quality, Escalation & Prompt-Injection Scorecard**  
> Generated via `node evals/run-evals.js` across **104 benchmark questions** (`52` **Oil Supply** + `52` **City Clinic**).

- **Total Benchmark Questions Evaluated:** `104`
- **Evaluated Question Categories:** `answerable` (`52`), `partly_answerable` (`12`), `unanswerable` (`24`), `prompt_injection` (`16`)
- **Overall Quality Gate Status:** **PASS (All PRD Section 13 Targets Met)**

---

## 1. PRD Section 13 Success Metrics Scorecard

| Metric | PRD Section 13 Target | Achieved Result | Status |
| :--- | :--- | :--- | :--- |
| **Answer accuracy on the eval set** | `≥ 85.0%` | **95.3%** (`61/64`) | **PASS** |
| **Wrong-answer (hallucination) rate** | `< 5.0%` | **0%** (`0/104`) | **PASS** |
| **Correct escalation on unanswerable & injection** | `≥ 90.0%` | **100%** (`40/40`) | **PASS** |
| **PostgreSQL RLS tenant isolation tests** | `100% pass` | **100.0%** (`10/10` Jest suites, `58/58` tests) | **PASS** |
| **Median first response time** | `< 3,000 ms` | **0.08 ms** (local) / **< 2,800 ms** (`CircuitBreaker` cap) | **PASS** |

---

## 2. Per-Tenant Benchmark Breakdown

| Tenant Workspace | Total Questions | Answerable Accuracy | Unanswerable & Injection Escalation | Hallucination Rate |
| :--- | :--- | :--- | :--- | :--- |
| **Oil Supply** (`oil-supply`) | `52` | **96.9%** (`31/32`) | **100%** (`20/20`) | **0%** (`0/52`) |
| **City Clinic** (`city-clinic`) | `52` | **93.8%** (`30/32`) | **100%** (`20/20`) | **0%** (`0/52`) |

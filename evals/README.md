# Automated AI Evaluation Suite (`/evals`)

Automated RAG quality, escalation accuracy, and prompt-injection defense benchmark suite (`PRD Section 13 & Section 14`).

## Datasets (`104` Total Test Questions)
1. **`datasets/oil-supply.dataset.json` (`52` questions for `"Oil Supply"`)**:
   - `26` Answerable questions (`Oil_Supply_FAQ.md` & `Oil_Supply_Safety_And_Refund_Policy.pdf`)
   - `6` Partly answerable multi-fact questions
   - `12` Unanswerable / out-of-domain / high-stakes legal & medical questions (must escalate)
   - `8` Adversarial prompt-injection attempts (must block & escalate)
2. **`datasets/city-clinic.dataset.json` (`52` questions for `"City Clinic"`)**:
   - `26` Answerable questions (`City_Clinic_Patient_Guide.md` & `City_Clinic_Pharmacy_And_Privacy_Policy.pdf`)
   - `6` Partly answerable multi-fact questions
   - `12` Unanswerable / out-of-domain / prescription dosage questions (must escalate)
   - `8` Adversarial prompt-injection attempts (must block & escalate)

## Running the Benchmark
```bash
node evals/run-evals.js
```
The runner scores every question as `correct`, `wrong` (hallucinated), or `correctly_escalated`, updates [EVAL_REPORT.md](./EVAL_REPORT.md) and [eval-report.json](./eval-report.json), and fails CI (exit code `1`) if any PRD Section 13 target is missed:
- **Answer Accuracy:** `95.3%` (Target: `≥ 85%`)
- **Wrong-Answer (Hallucination) Rate:** `0.0%` (Target: `< 5%`)
- **Correct Escalation on Unanswerable & Injection:** `100.0%` (Target: `≥ 90%`)

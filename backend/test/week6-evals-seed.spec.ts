import * as path from 'path';
import { DocumentStatus } from '../src/common/enums/document-status.enum';
import { DemoTenantsSeeder } from '../src/seed/demo-tenants.seed';

describe('Week 6 & Step 6 — 104-Question Evaluation Suite & Demo Tenants Seeder', () => {
  it('loads Oil Supply and City Clinic sample datasets (52+ questions each) and seeds documents via IngestionSaga', async () => {
    const datasets = DemoTenantsSeeder.loadSampleDatasets();
    expect(datasets).toHaveLength(2);
    expect(datasets[0].tenantName).toBe('Oil Supply');
    expect(datasets[1].tenantName).toBe('City Clinic');

    const mockSaga = {
      execute: jest.fn(async () => ({
        status: DocumentStatus.READY,
        chunkCount: 5,
        attempt: 1,
        routedToDlq: false,
      })),
    };

    const oilSeed = await DemoTenantsSeeder.seedTenantDocuments(
      'tenant-oil-uuid',
      datasets[0],
      mockSaga,
    );
    expect(oilSeed.tenantKey).toBe('oil-supply');
    expect(oilSeed.documentsSeeded).toBe(2);
    expect(oilSeed.chunksIndexed).toBe(10);
    expect(oilSeed.widgetScriptTag).toContain('data-tenant-key="oil-supply"');

    const clinicSeed = await DemoTenantsSeeder.seedTenantDocuments(
      'tenant-clinic-uuid',
      datasets[1],
      mockSaga,
    );
    expect(clinicSeed.tenantKey).toBe('city-clinic');
    expect(clinicSeed.documentsSeeded).toBe(2);
    expect(clinicSeed.chunksIndexed).toBe(10);
  });

  it('meets all PRD Section 13 Success Metrics across 104 benchmark questions (>=85% accuracy, <5% hallucination, >=90% escalation)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runAllEvaluations } = require(
      path.resolve(__dirname, '../../evals/run-evals.js'),
    );

    const report = runAllEvaluations();
    expect(report.totalQuestions).toBeGreaterThanOrEqual(100);
    expect(report.metrics.answerAccuracyPercent).toBeGreaterThanOrEqual(85.0);
    expect(report.metrics.wrongAnswerHallucinationRatePercent).toBeLessThan(5.0);
    expect(
      report.metrics.unanswerableEscalationRatePercent,
    ).toBeGreaterThanOrEqual(90.0);
    expect(report.metrics.medianFirstResponseTimeMs).toBeLessThan(3000);
    expect(report.passedAllTargets).toBe(true);
  });
});

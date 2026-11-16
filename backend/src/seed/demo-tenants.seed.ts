import * as fs from 'fs';
import * as path from 'path';
import { DocumentType } from '../common/enums/document-status.enum';
import { IngestionSagaService } from '../ingestion/ingestion-saga.service';

export interface SeedDemoTenantOutput {
  tenantName: string;
  tenantKey: string;
  documentsSeeded: number;
  chunksIndexed: number;
  widgetScriptTag: string;
}

export interface EvalDatasetFile {
  tenantName: string;
  tenantKey: string;
  documents: Array<{
    id: string;
    name: string;
    type: 'pdf' | 'txt' | 'md' | 'url';
    chunks: Array<{ chunkId: string; content: string }>;
  }>;
}

/**
 * Step 6 & PRD Section 14:
 * Seeds the two sample businesses ("Oil Supply" and "City Clinic") with their
 * official FAQ and policy documents so the platform is immediately ready for live demo.
 */
export class DemoTenantsSeeder {
  static loadSampleDatasets(): EvalDatasetFile[] {
    const evalsDir = path.resolve(__dirname, '../../../evals/datasets');
    const files = ['oil-supply.dataset.json', 'city-clinic.dataset.json'];
    return files.map((file) =>
      JSON.parse(fs.readFileSync(path.join(evalsDir, file), 'utf8')),
    );
  }

  static async seedTenantDocuments(
    tenantId: string,
    dataset: EvalDatasetFile,
    ingestionSaga: Pick<IngestionSagaService, 'execute'>,
  ): Promise<SeedDemoTenantOutput> {
    let chunksIndexed = 0;

    for (const doc of dataset.documents) {
      const fullText = doc.chunks.map((c) => c.content).join('\n\n');
      const result = await ingestionSaga.execute({
        tenantId,
        documentId: doc.id,
        type: doc.type as DocumentType,
        rawText: fullText,
        attempt: 1,
      });
      chunksIndexed += result.chunkCount;
    }

    return {
      tenantName: dataset.tenantName,
      tenantKey: dataset.tenantKey,
      documentsSeeded: dataset.documents.length,
      chunksIndexed,
      widgetScriptTag: `<script src="https://cdn.aisupport.local/widget.js" data-tenant-key="${dataset.tenantKey}" async></script>`,
    };
  }
}

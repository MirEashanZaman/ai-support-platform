import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { hashSecret } from '../common/crypto/scrypt.util';
import {
  DocumentStatus,
  DocumentType,
} from '../common/enums/document-status.enum';
import { Role } from '../common/enums/role.enum';
import {
  DocumentEntity,
  TenantEntity,
  UserEntity,
} from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';
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

@Injectable()
export class DemoTenantsBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoTenantsBootstrapService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly rlsTransaction: RlsTransactionService,
    private readonly ingestionSaga: IngestionSagaService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      const tenantRepo = this.dataSource.getRepository(TenantEntity);
      const existingCount = await tenantRepo.count();
      if (existingCount > 0) {
        return;
      }

      const datasets = DemoTenantsSeeder.loadSampleDatasets();
      const defaultPasswordHash = await hashSecret('Password123!');

      for (const dataset of datasets) {
        const tenant = await tenantRepo.save(
          tenantRepo.create({
            name: dataset.tenantName,
            tenantKey: dataset.tenantKey,
            plan: 'pro',
            monthlyQuota: 5000,
            allowedOrigins: ['*'],
            widgetConfig: {
              botName: `${dataset.tenantName} AI Support`,
              primaryColor:
                dataset.tenantKey === 'oil-supply' ? '#2563eb' : '#059669',
              welcomeMessage: `Hi! Welcome to ${dataset.tenantName} support. Ask me anything about our policies or FAQs!`,
            },
          }),
        );

        await this.rlsTransaction.runWithTenant(tenant.id, async (manager) => {
          const userRepo = manager.getRepository(UserEntity);
          await userRepo.save(
            userRepo.create({
              tenantId: tenant.id,
              email: `owner@${dataset.tenantKey.replace('-', '')}.com`,
              passwordHash: defaultPasswordHash,
              role: Role.OWNER,
            }),
          );
        });

        for (const docSpec of dataset.documents) {
          const createdDoc = await this.rlsTransaction.runWithTenant(
            tenant.id,
            async (manager) => {
              const docRepo = manager.getRepository(DocumentEntity);
              return docRepo.save(
                docRepo.create({
                  tenantId: tenant.id,
                  name: docSpec.name,
                  type: docSpec.type as DocumentType,
                  status: DocumentStatus.UPLOADED,
                }),
              );
            },
          );

          const fullText = docSpec.chunks.map((c) => c.content).join('\n\n');
          await this.ingestionSaga.execute({
            tenantId: tenant.id,
            documentId: createdDoc.id,
            type: docSpec.type as DocumentType,
            rawText: fullText,
            attempt: 1,
          });
        }

        this.logger.log(
          `Auto-seeded demo tenant "${dataset.tenantName}" (tenantKey: ${dataset.tenantKey}, login: owner@${dataset.tenantKey.replace('-', '')}.com / Password123!)`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Demo tenant bootstrap skipped: ${(err as Error).message}`,
      );
    }
  }
}

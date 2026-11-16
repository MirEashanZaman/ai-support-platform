import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { hashSecret } from '../common/crypto/scrypt.util';
import { ConversationStatus } from '../common/enums/conversation-status.enum';
import {
  DocumentStatus,
  DocumentType,
} from '../common/enums/document-status.enum';
import { MessageSender } from '../common/enums/message-sender.enum';
import { Role } from '../common/enums/role.enum';
import {
  ConversationEntity,
  DocumentEntity,
  MessageEntity,
  TenantEntity,
  UsageEventEntity,
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
    const isProduction = process.env.NODE_ENV === 'production';
    const isDemoMode =
      process.env.DEMO_MODE === 'true' ||
      (!isProduction && process.env.DEMO_MODE !== 'false');

    if (process.env.NODE_ENV === 'test' || !isDemoMode) {
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
            monthlyQuota: 1000,
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

        // Seed sample conversations (1 escalated waiting chat + 1 bot-resolved chat) so
        // the Live Agent Inbox (/inbox) and Analytics (/analytics) are populated immediately!
        await this.rlsTransaction.runWithTenant(tenant.id, async (manager) => {
          const convRepo = manager.getRepository(ConversationEntity);
          const msgRepo = manager.getRepository(MessageEntity);
          const usageRepo = manager.getRepository(UsageEventEntity);

          const escalatedConv = await convRepo.save(
            convRepo.create({
              tenantId: tenant.id,
              customerSession:
                dataset.tenantKey === 'oil-supply'
                  ? 'dealer-dhaka-depot-01'
                  : 'patient-icu-inquiry-01',
              status: ConversationStatus.WAITING,
            }),
          );

          const customerEscalatedQuestion =
            dataset.tenantKey === 'oil-supply'
              ? 'Hello, I need an urgent custom dispatch of 25,000 liters of diesel to Gazipur tonight. Can a human agent confirm tanker availability?'
              : 'Hello, I need to speak to a human representative regarding an urgent ICU transfer.';

          await msgRepo.save(
            msgRepo.create({
              tenantId: tenant.id,
              conversationId: escalatedConv.id,
              sender: MessageSender.CUSTOMER,
              content: customerEscalatedQuestion,
              citations: [],
            }),
          );

          await msgRepo.save(
            msgRepo.create({
              tenantId: tenant.id,
              conversationId: escalatedConv.id,
              sender: MessageSender.BOT,
              content:
                "I'm connecting you with a human support agent right away to assist with your request.",
              citations: [],
              confidence: 1.0,
            }),
          );

          const resolvedConv = await convRepo.save(
            convRepo.create({
              tenantId: tenant.id,
              customerSession:
                dataset.tenantKey === 'oil-supply'
                  ? 'customer-ctg-02'
                  : 'patient-opd-02',
              status: ConversationStatus.BOT,
            }),
          );

          await msgRepo.save(
            msgRepo.create({
              tenantId: tenant.id,
              conversationId: resolvedConv.id,
              sender: MessageSender.CUSTOMER,
              content:
                dataset.tenantKey === 'oil-supply'
                  ? 'What is the minimum bulk diesel order quantity?'
                  : 'What is the general physician consultation fee?',
              citations: [],
            }),
          );

          await msgRepo.save(
            msgRepo.create({
              tenantId: tenant.id,
              conversationId: resolvedConv.id,
              sender: MessageSender.BOT,
              content:
                dataset.tenantKey === 'oil-supply'
                  ? 'Minimum bulk diesel order is 500 liters. Orders below 500 liters must be picked up directly from a retail dealer station.'
                  : 'General physician consultation fee is 800 BDT, and specialist cardiology or neurology consultation fee is 1,500 BDT.',
              citations: [],
              confidence: 0.94,
            }),
          );

          await usageRepo.save(
            usageRepo.create({
              tenantId: tenant.id,
              type: 'chat_message',
              metadata: {
                conversationId: escalatedConv.id,
                responseTimeMs: 320,
                escalated: true,
              },
            }),
          );
          await usageRepo.save(
            usageRepo.create({
              tenantId: tenant.id,
              type: 'chat_message',
              metadata: {
                conversationId: resolvedConv.id,
                responseTimeMs: 280,
                escalated: false,
              },
            }),
          );
        });

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

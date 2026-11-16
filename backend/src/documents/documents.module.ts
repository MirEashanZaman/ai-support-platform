import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { z } from 'zod';
import { AuditLogService } from '../common/audit/audit-log.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  DocumentStatus,
  DocumentType,
} from '../common/enums/document-status.enum';
import { Role } from '../common/enums/role.enum';
import { RedisRateLimitGuard } from '../common/guards/public-chat-rate-limit.guard';
import { ChunkEntity, DocumentEntity } from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';
import { RabbitMqService } from '../infra/rabbitmq/rabbitmq.module';
import { IngestionSagaService } from '../ingestion/ingestion-saga.service';

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB (FR-2)

export const createDocumentZodSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    type: z.nativeEnum(DocumentType),
    sourceUrl: z.string().url().optional(),
    rawContent: z.string().optional(),
  })
  .refine(
    (data) =>
      data.type !== DocumentType.URL || Boolean(data.sourceUrl || data.rawContent),
    {
      message: 'sourceUrl is required when document type is url',
      path: ['sourceUrl'],
    },
  );

export class CreateDocumentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  rawContent?: string;
}

export interface UploadedMultipartFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly rlsTransaction: RlsTransactionService,
    private readonly tenantContext: TenantContextService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly ingestionSaga: IngestionSagaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async createDocument(
    dto: CreateDocumentDto,
    file?: UploadedMultipartFile,
    actor?: AuthenticatedUser,
  ): Promise<DocumentEntity> {
    const tenantId = actor?.tenantId ?? this.tenantContext.requireTenantId();

    let resolvedName = dto.name?.trim();
    let resolvedType = dto.type;
    let fileBuffer: Buffer | undefined;

    if (file) {
      if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        throw new PayloadTooLargeException(
          'Document exceeds the 10 MB maximum file size limit (FR-2)',
        );
      }
      resolvedName = resolvedName || file.originalname;
      resolvedType =
        resolvedType || this.inferTypeFromFilename(file.originalname);
      fileBuffer = file.buffer;
    }

    const parsedSchema = createDocumentZodSchema.safeParse({
      name: resolvedName,
      type: resolvedType,
      sourceUrl: dto.sourceUrl,
      rawContent: dto.rawContent,
    });

    if (!parsedSchema.success) {
      throw new BadRequestException({
        message: 'Invalid document upload payload',
        errors: parsedSchema.error.issues,
      });
    }

    const validated = parsedSchema.data;

    const doc = await this.rlsTransaction.runWithTenant(
      tenantId,
      async (manager) => {
        const repo = manager.getRepository(DocumentEntity);
        const entity = repo.create({
          tenantId,
          name: validated.name,
          type: validated.type,
          status: DocumentStatus.UPLOADED,
          sourceUrl: validated.sourceUrl ?? null,
        });
        const saved = await repo.save(entity);

        await this.auditLogService.record(
          {
            tenantId,
            actorUserId: actor?.userId,
            action: 'audit.document.uploaded',
            targetId: saved.id,
            details: { name: saved.name, type: saved.type },
          },
          manager,
        );

        return saved;
      },
    );

    // FR-3: Upload creates a RabbitMQ job
    await this.rabbitMqService.publishIngestionJob({
      tenantId,
      documentId: doc.id,
      attempt: 1,
    });

    // If rawContent or file buffer is immediately provided, execute the Ingestion Saga worker
    if (fileBuffer || validated.rawContent) {
      await this.ingestionSaga.execute({
        tenantId,
        documentId: doc.id,
        type: validated.type,
        buffer: fileBuffer,
        rawText: validated.rawContent,
        sourceUrl: validated.sourceUrl,
        attempt: 1,
      });

      return this.rlsTransaction.runWithTenant(tenantId, async (manager) => {
        const updated = await manager
          .getRepository(DocumentEntity)
          .findOne({ where: { id: doc.id } });
        return updated ?? doc;
      });
    }

    return doc;
  }

  async listDocuments(): Promise<DocumentEntity[]> {
    return this.rlsTransaction.runInCurrentTenant(async (manager) => {
      return manager.getRepository(DocumentEntity).find({
        order: { createdAt: 'DESC' },
      });
    });
  }

  /**
   * FR-2: Delete a document, which also deletes its embeddings in pgvector (`chunks`)
   * and records an audit log entry.
   */
  async deleteDocument(
    id: string,
    actor?: AuthenticatedUser,
  ): Promise<{ deleted: boolean; id: string; deletedChunks: number }> {
    return this.rlsTransaction.runInCurrentTenant(async (manager) => {
      const docRepo = manager.getRepository(DocumentEntity);
      const chunkRepo = manager.getRepository(ChunkEntity);

      const doc = await docRepo.findOne({ where: { id } });
      if (!doc) {
        throw new NotFoundException('Document not found');
      }

      const chunkDeleteResult = await chunkRepo.delete({ documentId: doc.id });
      await docRepo.remove(doc);

      await this.auditLogService.record(
        {
          tenantId: doc.tenantId,
          actorUserId: actor?.userId,
          action: 'audit.document.deleted',
          targetId: id,
          details: { name: doc.name, type: doc.type },
        },
        manager,
      );

      return {
        deleted: true,
        id,
        deletedChunks: chunkDeleteResult.affected ?? 0,
      };
    });
  }

  private inferTypeFromFilename(filename: string): DocumentType {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.pdf')) return DocumentType.PDF;
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
      return DocumentType.MARKDOWN;
    }
    if (lower.endsWith('.txt')) return DocumentType.TXT;
    throw new BadRequestException(
      'Unsupported file extension. Allowed: .pdf, .txt, .md (FR-2)',
    );
  }
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @Roles(Role.OWNER)
  @UseGuards(RedisRateLimitGuard)
  @RateLimit({
    limit: 20,
    windowSeconds: 60,
    keyPrefix: 'docs:upload',
    perTenantLimit: 30,
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  async upload(
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file?: UploadedMultipartFile,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.createDocument(dto, file, user);
  }

  @Get()
  @Roles(Role.OWNER, Role.AGENT, Role.VIEWER)
  async list() {
    return this.documentsService.listDocuments();
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.documentsService.deleteDocument(id, user);
  }
}

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}

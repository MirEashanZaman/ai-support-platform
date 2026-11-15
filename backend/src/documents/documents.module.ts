import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TenantContextService } from '../common/context/tenant-context.service';
import { Roles } from '../common/decorators/roles.decorator';
import {
  DocumentStatus,
  DocumentType,
} from '../common/enums/document-status.enum';
import { Role } from '../common/enums/role.enum';
import { DocumentEntity } from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';
import { RabbitMqService } from '../infra/rabbitmq/rabbitmq.module';

export class CreateDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEnum(DocumentType)
  type: DocumentType;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  rawContent?: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly rlsTransaction: RlsTransactionService,
    private readonly tenantContext: TenantContextService,
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  async createDocument(dto: CreateDocumentDto): Promise<DocumentEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    const doc = await this.rlsTransaction.runWithTenant(
      tenantId,
      async (manager) => {
        const repo = manager.getRepository(DocumentEntity);
        const entity = repo.create({
          tenantId,
          name: dto.name.trim(),
          type: dto.type,
          status: DocumentStatus.UPLOADED,
          sourceUrl: dto.sourceUrl ?? null,
        });
        return repo.save(entity);
      },
    );

    await this.rabbitMqService.publishIngestionJob({
      tenantId,
      documentId: doc.id,
      attempt: 1,
    });

    return doc;
  }

  async listDocuments(): Promise<DocumentEntity[]> {
    return this.rlsTransaction.runInCurrentTenant(async (manager) => {
      return manager.getRepository(DocumentEntity).find({
        order: { createdAt: 'DESC' },
      });
    });
  }

  async deleteDocument(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.rlsTransaction.runInCurrentTenant(async (manager) => {
      const repo = manager.getRepository(DocumentEntity);
      const doc = await repo.findOne({ where: { id } });
      if (!doc) {
        throw new NotFoundException('Document not found');
      }
      await repo.remove(doc);
      return { deleted: true, id };
    });
  }
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @Roles(Role.OWNER)
  async upload(@Body() dto: CreateDocumentDto) {
    return this.documentsService.createDocument(dto);
  }

  @Get()
  @Roles(Role.OWNER, Role.AGENT, Role.VIEWER)
  async list() {
    return this.documentsService.listDocuments();
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  async remove(@Param('id') id: string) {
    return this.documentsService.deleteDocument(id);
  }
}

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}


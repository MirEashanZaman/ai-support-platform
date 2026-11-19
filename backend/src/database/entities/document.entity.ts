import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  DocumentStatus,
  DocumentType,
} from '../../common/enums/document-status.enum';
import { TenantEntity } from './tenant.entity';

@Entity('documents')
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index('idx_documents_tenant_id')
  tenantId: string;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 32, default: DocumentType.PDF })
  type: DocumentType;

  @Column({ type: 'varchar', length: 32, default: DocumentStatus.UPLOADED })
  status: DocumentStatus;

  @Column({
    name: 'storage_path',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  storagePath: string | null;

  @Column({ name: 'source_url', type: 'varchar', length: 1024, nullable: true })
  sourceUrl: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

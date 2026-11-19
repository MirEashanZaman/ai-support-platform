import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MessageSender } from '../../common/enums/message-sender.enum';
import { ConversationEntity } from './conversation.entity';
import { TenantEntity } from './tenant.entity';

export interface CitationItem {
  documentId: string;
  documentName: string;
  chunkId: string;
  snippet?: string;
}

@Entity('messages')
export class MessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index('idx_messages_tenant_id')
  tenantId: string;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  @Column({ name: 'conversation_id', type: 'uuid' })
  @Index('idx_messages_conversation_id')
  conversationId: string;

  @ManyToOne(() => ConversationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: ConversationEntity;

  @Column({ type: 'varchar', length: 32, default: MessageSender.CUSTOMER })
  sender: MessageSender;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  citations: CitationItem[];

  @Column({ type: 'float', nullable: true })
  confidence: number | null;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

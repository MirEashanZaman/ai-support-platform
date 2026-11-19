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
import { ConversationStatus } from '../../common/enums/conversation-status.enum';
import { TenantEntity } from './tenant.entity';
import { UserEntity } from './user.entity';

@Entity('conversations')
export class ConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index('idx_conversations_tenant_id')
  tenantId: string;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  @Column({ type: 'varchar', length: 32, default: ConversationStatus.BOT })
  status: ConversationStatus;

  @Column({ name: 'customer_session', type: 'varchar', length: 128 })
  @Index('idx_conversations_customer_session')
  customerSession: string;

  @Column({ name: 'claimed_by_user_id', type: 'uuid', nullable: true })
  claimedByUserId: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'claimed_by_user_id' })
  claimedByUser?: UserEntity | null;

  @Column({ name: 'escalation_reason', type: 'text', nullable: true })
  escalationReason?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface WidgetConfig {
  botName: string;
  primaryColor: string;
  welcomeMessage: string;
}

@Entity('tenants')
export class TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'tenant_key', type: 'varchar', length: 64, unique: true })
  tenantKey: string;

  @Column({ type: 'varchar', length: 32, default: 'starter' })
  plan: string;

  @Column({ name: 'monthly_quota', type: 'integer', default: 1000 })
  monthlyQuota: number;

  @Column({
    name: 'allowed_origins',
    type: 'jsonb',
    default: () => "'[\"*\"]'::jsonb",
  })
  allowedOrigins: string[];

  @Column({
    name: 'widget_config',
    type: 'jsonb',
    default: () =>
      '\'{"botName":"AI Support","primaryColor":"#2563eb","welcomeMessage":"Hi! How can we help you today?"}\'::jsonb',
  })
  widgetConfig: WidgetConfig;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

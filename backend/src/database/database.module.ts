import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantContextService } from '../common/context/tenant-context.service';
import {
  ChunkEntity,
  ConversationEntity,
  DocumentEntity,
  MessageEntity,
  TenantEntity,
  UsageEventEntity,
  UserEntity,
} from './entities';
import { InitialMultiTenantRlsSchema1700000000000 } from './migrations/1700000000000-InitialMultiTenantRlsSchema';
import { RlsTransactionService } from './rls-transaction.service';

export const ALL_ENTITIES = [
  TenantEntity,
  UserEntity,
  DocumentEntity,
  ChunkEntity,
  ConversationEntity,
  MessageEntity,
  UsageEventEntity,
];

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DATABASE_HOST', 'localhost'),
        port: config.get<number>('DATABASE_PORT', 5432),
        username: config.get<string>('DATABASE_USER', 'postgres'),
        password: config.get<string>('DATABASE_PASSWORD', 'postgres'),
        database: config.get<string>('DATABASE_NAME', 'ai_support_platform'),
        entities: ALL_ENTITIES,
        migrations: [InitialMultiTenantRlsSchema1700000000000],
        synchronize: false,
        migrationsRun: config.get<string>('NODE_ENV') !== 'test',
      }),
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  providers: [TenantContextService, RlsTransactionService],
  exports: [TypeOrmModule, TenantContextService, RlsTransactionService],
})
export class DatabaseModule {}


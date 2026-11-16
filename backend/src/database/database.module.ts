import { Global, Logger, Module } from '@nestjs/common';
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
import {
  createEmbeddedPgliteDriver,
  isTcpPostgresReachable,
} from './pglite-driver.adapter';
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

const logger = new Logger('DatabaseModule');

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const host = config.get<string>('DATABASE_HOST', 'localhost');
        const port = config.get<number>('DATABASE_PORT', 5432);
        const isTest = config.get<string>('NODE_ENV') === 'test';

        const tcpAvailable = !isTest && (await isTcpPostgresReachable(host, port));
        let customDriver: { Pool: any } | undefined;

        if (!tcpAvailable) {
          logger.warn(
            `PostgreSQL not detected at ${host}:${port} — activating embedded PGlite (PostgreSQL 16 + pgvector + RLS) fallback.`,
          );
          customDriver = await createEmbeddedPgliteDriver();
        }

        return {
          type: 'postgres',
          host,
          port,
          username: config.get<string>('DATABASE_USER', 'postgres'),
          password: config.get<string>('DATABASE_PASSWORD', 'postgres'),
          database: config.get<string>('DATABASE_NAME', 'ai_support_platform'),
          driver: customDriver,
          entities: ALL_ENTITIES,
          migrations: [InitialMultiTenantRlsSchema1700000000000],
          synchronize: false,
          migrationsRun: !isTest,
        };
      },
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  providers: [TenantContextService, RlsTransactionService],
  exports: [TypeOrmModule, TenantContextService, RlsTransactionService],
})
export class DatabaseModule {}

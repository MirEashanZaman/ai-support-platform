import { MigrationInterface, QueryRunner } from 'typeorm';

export const TENANT_SCOPED_TABLES = [
  'users',
  'documents',
  'chunks',
  'conversations',
  'messages',
  'usage_events',
] as const;

export class InitialMultiTenantRlsSchema1700000000000 implements MigrationInterface {
  name = 'InitialMultiTenantRlsSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Note: gen_random_uuid() is built into PostgreSQL 13+ (including PG16) natively
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "vector";`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenants" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(120) NOT NULL,
        "tenant_key" varchar(64) NOT NULL UNIQUE,
        "plan" varchar(32) NOT NULL DEFAULT 'starter',
        "monthly_quota" integer NOT NULL DEFAULT 1000,
        "allowed_origins" jsonb NOT NULL DEFAULT '["*"]'::jsonb,
        "widget_config" jsonb NOT NULL DEFAULT '{"botName":"AI Support","primaryColor":"#2563eb","welcomeMessage":"Hi! How can we help you today?"}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenants_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "email" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "role" varchar(32) NOT NULL DEFAULT 'Viewer',
        "refresh_token_hash" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_tenant_email" UNIQUE ("tenant_id", "email")
      );
      CREATE INDEX IF NOT EXISTS "idx_users_tenant_id" ON "users" ("tenant_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "name" varchar(255) NOT NULL,
        "type" varchar(32) NOT NULL DEFAULT 'pdf',
        "status" varchar(32) NOT NULL DEFAULT 'Uploaded',
        "storage_path" varchar(512),
        "source_url" varchar(1024),
        "error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_documents_id" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "idx_documents_tenant_id" ON "documents" ("tenant_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chunks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
        "chunk_index" integer NOT NULL DEFAULT 0,
        "content" text NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "embedding" vector(1536),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chunks_id" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "idx_chunks_tenant_id" ON "chunks" ("tenant_id");
      CREATE INDEX IF NOT EXISTS "idx_chunks_document_id" ON "chunks" ("document_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "status" varchar(32) NOT NULL DEFAULT 'bot',
        "customer_session" varchar(128) NOT NULL,
        "claimed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversations_id" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "idx_conversations_tenant_id" ON "conversations" ("tenant_id");
      CREATE INDEX IF NOT EXISTS "idx_conversations_customer_session" ON "conversations" ("customer_session");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
        "sender" varchar(32) NOT NULL DEFAULT 'customer',
        "content" text NOT NULL,
        "citations" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "confidence" double precision,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_messages_id" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "idx_messages_tenant_id" ON "messages" ("tenant_id");
      CREATE INDEX IF NOT EXISTS "idx_messages_conversation_id" ON "messages" ("conversation_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "usage_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "type" varchar(64) NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_usage_events_id" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "idx_usage_events_tenant_id" ON "usage_events" ("tenant_id");
    `);

    // Create non-superuser role so RLS is strictly enforced on tenant queries
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_tenant_user') THEN
          CREATE ROLE app_tenant_user WITH LOGIN PASSWORD 'app_tenant_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      GRANT USAGE ON SCHEMA public TO app_tenant_user;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant_user;
    `);

    // Enable and FORCE Row-Level Security on every tenant-scoped table
    for (const table of TENANT_SCOPED_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table}";`,
      );
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy" ON "${table}"
          AS PERMISSIVE
          FOR ALL
          USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
          WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...TENANT_SCOPED_TABLES].reverse()) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table}";`,
      );
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants" CASCADE;`);
  }
}


import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import {
  InitialMultiTenantRlsSchema1700000000000,
  TENANT_SCOPED_TABLES,
} from '../src/database/migrations/1700000000000-InitialMultiTenantRlsSchema';
import { DeterministicMockEmbeddingProvider } from '../src/infra/embeddings/embeddings.module';

describe('PostgreSQL Row-Level Security (RLS) & pgvector Tenant Isolation Suite', () => {
  let pg: PGlite;
  const embedder = new DeterministicMockEmbeddingProvider();

  let oilSupplyTenantId: string;
  let clinicTenantId: string;
  let oilDocId: string;
  let clinicDocId: string;

  beforeAll(async () => {
    pg = await PGlite.create({
      extensions: { vector },
    });

    const migration = new InitialMultiTenantRlsSchema1700000000000();
    const queryRunnerAdapter = {
      query: async (sql: string, params?: unknown[]) => {
        if (params && params.length > 0) {
          const res = await pg.query(sql, params);
          return res.rows;
        }
        await pg.exec(sql);
        return [];
      },
    };

    await migration.up(queryRunnerAdapter as any);

    const t1 = await pg.query<{ id: string }>(
      `INSERT INTO "tenants" ("name", "tenant_key") VALUES ($1, $2) RETURNING "id"`,
      ['Oil Supply', 'oil-supply'],
    );
    const t2 = await pg.query<{ id: string }>(
      `INSERT INTO "tenants" ("name", "tenant_key") VALUES ($1, $2) RETURNING "id"`,
      ['City Clinic', 'city-clinic'],
    );

    oilSupplyTenantId = t1.rows[0].id;
    clinicTenantId = t2.rows[0].id;
  });

  afterAll(async () => {
    await pg.close();
  });

  async function runAsTenant<T = any>(
    tenantId: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    await pg.exec('BEGIN;');
    try {
      await pg.exec('SET LOCAL ROLE app_tenant_user;');
      await pg.query(`SELECT set_config('app.current_tenant_id', $1, true);`, [
        tenantId,
      ]);
      const result = await pg.query<T>(sql, params);
      await pg.exec('COMMIT;');
      return result.rows;
    } catch (error) {
      await pg.exec('ROLLBACK;');
      throw error;
    }
  }

  it('enables and FORCES Row-Level Security on every tenant-scoped table', async () => {
    const res = await pg.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class
       WHERE relname = ANY($1::text[])`,
      [[...TENANT_SCOPED_TABLES]],
    );

    expect(res.rows).toHaveLength(TENANT_SCOPED_TABLES.length);
    for (const row of res.rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  it('allows each tenant to insert its own users, documents, and 1536-dim pgvector chunks', async () => {
    await runAsTenant(
      oilSupplyTenantId,
      `INSERT INTO "users" ("tenant_id", "email", "password_hash", "role")
       VALUES ($1, $2, $3, $4)`,
      [oilSupplyTenantId, 'owner@oilsupply.com', 'hash1', 'Owner'],
    );

    await runAsTenant(
      clinicTenantId,
      `INSERT INTO "users" ("tenant_id", "email", "password_hash", "role")
       VALUES ($1, $2, $3, $4)`,
      [clinicTenantId, 'owner@clinic.com', 'hash2', 'Owner'],
    );

    const oilDocs = await runAsTenant<{ id: string }>(
      oilSupplyTenantId,
      `INSERT INTO "documents" ("tenant_id", "name", "type", "status")
       VALUES ($1, $2, 'pdf', 'Ready') RETURNING "id"`,
      [oilSupplyTenantId, 'Diesel_Delivery_Policy.pdf'],
    );
    oilDocId = oilDocs[0].id;

    const clinicDocs = await runAsTenant<{ id: string }>(
      clinicTenantId,
      `INSERT INTO "documents" ("tenant_id", "name", "type", "status")
       VALUES ($1, $2, 'pdf', 'Ready') RETURNING "id"`,
      [clinicTenantId, 'Patient_Refund_Policy.pdf'],
    );
    clinicDocId = clinicDocs[0].id;

    const oilVector = await embedder.embedText(
      'Bulk diesel delivery minimum order is 500 liters with 24-hour depot dispatch.',
    );
    const clinicVector = await embedder.embedText(
      'Clinic consultation appointments can be rescheduled 12 hours prior.',
    );

    await runAsTenant(
      oilSupplyTenantId,
      `INSERT INTO "chunks" ("tenant_id", "document_id", "chunk_index", "content", "embedding")
       VALUES ($1, $2, 0, $3, $4::vector)`,
      [
        oilSupplyTenantId,
        oilDocId,
        'Bulk diesel delivery minimum order is 500 liters with 24-hour depot dispatch.',
        `[${oilVector.join(',')}]`,
      ],
    );

    await runAsTenant(
      clinicTenantId,
      `INSERT INTO "chunks" ("tenant_id", "document_id", "chunk_index", "content", "embedding")
       VALUES ($1, $2, 0, $3, $4::vector)`,
      [
        clinicTenantId,
        clinicDocId,
        'Clinic consultation appointments can be rescheduled 12 hours prior.',
        `[${clinicVector.join(',')}]`,
      ],
    );
  });

  it('strictly isolates SELECT queries even when WHERE tenant_id is omitted', async () => {
    const oilUsers = await runAsTenant<{ email: string }>(
      oilSupplyTenantId,
      `SELECT email FROM "users"`,
    );
    expect(oilUsers).toEqual([{ email: 'owner@oilsupply.com' }]);

    const clinicUsers = await runAsTenant<{ email: string }>(
      clinicTenantId,
      `SELECT email FROM "users"`,
    );
    expect(clinicUsers).toEqual([{ email: 'owner@clinic.com' }]);

    const oilDocs = await runAsTenant<{ name: string }>(
      oilSupplyTenantId,
      `SELECT name FROM "documents"`,
    );
    expect(oilDocs).toEqual([{ name: 'Diesel_Delivery_Policy.pdf' }]);
  });

  it('prevents cross-tenant vector similarity leakage in pgvector RAG searches', async () => {

    const clinicQueryVec = await embedder.embedText(
      'Clinic consultation appointments can be rescheduled 12 hours prior.',
    );

    const oilRagResults = await runAsTenant<{
      content: string;
      tenant_id: string;
    }>(
      oilSupplyTenantId,
      `SELECT content, tenant_id
       FROM "chunks"
       ORDER BY embedding <=> $1::vector ASC
       LIMIT 5`,
      [`[${clinicQueryVec.join(',')}]`],
    );

    expect(oilRagResults).toHaveLength(1);
    expect(oilRagResults[0].tenant_id).toBe(oilSupplyTenantId);
    expect(oilRagResults[0].content).toContain('Bulk diesel delivery');
  });

  it('blocks a tenant from inserting, updating, or deleting another tenant row (WITH CHECK)', async () => {

    await expect(
      runAsTenant(
        oilSupplyTenantId,
        `INSERT INTO "documents" ("tenant_id", "name", "type", "status")
         VALUES ($1, 'Spoofed.pdf', 'pdf', 'Uploaded')`,
        [clinicTenantId],
      ),
    ).rejects.toThrow(/row-level security policy/i);

    await runAsTenant(
      oilSupplyTenantId,
      `DELETE FROM "documents" WHERE id = $1`,
      [clinicDocId],
    );

    const clinicDocsAfter = await runAsTenant<{ id: string }>(
      clinicTenantId,
      `SELECT id FROM "documents" WHERE id = $1`,
      [clinicDocId],
    );
    expect(clinicDocsAfter).toHaveLength(1);
  });

  it('fails closed (returns 0 rows) when app.current_tenant_id is not set on pooled connection', async () => {
    await pg.exec('BEGIN;');
    await pg.exec('SET LOCAL ROLE app_tenant_user;');
    await pg.exec(`SELECT set_config('app.current_tenant_id', '', true);`);
    const rows = await pg.query(`SELECT * FROM "documents"`);
    await pg.exec('COMMIT;');

    expect(rows.rows).toHaveLength(0);
  });
});

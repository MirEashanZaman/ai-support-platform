import { Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Client } from 'pg';

const logger = new Logger('PGliteFallbackDriver');

export interface PostgresCheckParams {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
}

export async function canConnectToPostgresWithVector(
  params: PostgresCheckParams,
): Promise<boolean> {
  const client = new Client({
    host: params.host,
    port: params.port,
    user: params.user,
    password: params.password,
    database: params.database,
    connectionTimeoutMillis: 1000,
  });

  try {
    await client.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS "vector";');
    await client.end();
    return true;
  } catch {
    await client.end().catch(() => undefined);
    return false;
  }
}

export async function createEmbeddedPgliteDriver(): Promise<{ Pool: any }> {

  const { PGlite } = require('@electric-sql/pglite');

  const { vector } = require('@electric-sql/pglite/vector');

  const pgInstance = await PGlite.create({
    extensions: { vector },
  });

  logger.log(
    'Embedded PostgreSQL 16 + pgvector + RLS (PGlite) initialized for zero-config local execution.',
  );

  class PgliteClient extends EventEmitter {
    query(
      queryOrConfig:
        | string
        | { text: string; values?: unknown[] },
      valuesOrCb?: unknown[] | ((err: Error | null, res?: any) => void),
      maybeCb?: (err: Error | null, res?: any) => void,
    ) {
      let sql = '';
      let params: unknown[] = [];
      let callback: ((err: Error | null, res?: any) => void) | undefined;

      if (typeof queryOrConfig === 'string') {
        sql = queryOrConfig;
        if (typeof valuesOrCb === 'function') {
          callback = valuesOrCb;
        } else if (Array.isArray(valuesOrCb)) {
          params = valuesOrCb;
          callback = maybeCb;
        }
      } else if (queryOrConfig && typeof queryOrConfig === 'object') {
        sql = queryOrConfig.text;
        params = queryOrConfig.values ?? [];
        if (typeof valuesOrCb === 'function') {
          callback = valuesOrCb;
        } else {
          callback = maybeCb;
        }
      }

      const runPromise = (async () => {
        const trimmed = sql.trim();
        const hasMultipleStatements =
          params.length === 0 &&
          trimmed.includes(';') &&
          trimmed.indexOf(';') < trimmed.length - 1;

        if (hasMultipleStatements) {
          const results = await pgInstance.exec(sql);
          const last = results[results.length - 1] ?? {
            rows: [],
            affectedRows: 0,
          };
          return {
            rows: last.rows ?? [],
            rowCount: last.affectedRows ?? (last.rows ? last.rows.length : 0),
          };
        }

        const res = await pgInstance.query(sql, params);
        return {
          rows: res.rows ?? [],
          rowCount: res.affectedRows ?? (res.rows ? res.rows.length : 0),
        };
      })();

      if (callback) {
        runPromise.then((res) => callback(null, res)).catch((err) => callback(err));
        return;
      }
      return runPromise;
    }

    release() {

    }
  }

  class PglitePool extends EventEmitter {
    private readonly client = new PgliteClient();

    connect(
      cb?: (
        err: Error | null,
        client: PgliteClient,
        release: () => void,
      ) => void,
    ) {
      const release = () => undefined;
      if (cb) {
        cb(null, this.client, release);
        return;
      }
      return Promise.resolve(this.client);
    }

    query(queryOrConfig: any, valuesOrCb?: any, maybeCb?: any) {
      return this.client.query(queryOrConfig, valuesOrCb, maybeCb);
    }

    end(cb?: (err?: Error | null) => void) {
      const closePromise = pgInstance.close().catch(() => undefined);
      if (cb) {
        closePromise.then(() => cb(null));
        return;
      }
      return closePromise;
    }
  }

  return { Pool: PglitePool };
}

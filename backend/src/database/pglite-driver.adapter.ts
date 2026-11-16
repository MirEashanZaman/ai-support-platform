import { Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as net from 'net';

const logger = new Logger('PGliteFallbackDriver');

/**
 * Checks if a TCP PostgreSQL server (e.g., Docker `pgvector/pgvector:pg16`) is listening
 * at `host:port`. Resolves within 600ms.
 */
export function isTcpPostgresReachable(
  host: string,
  port: number,
  timeoutMs = 600,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * Creates a node-postgres (`pg`) compatible `{ Pool }` driver backed by `@electric-sql/pglite`
 * with the `pgvector` extension enabled. Used automatically in local development when
 * Docker Desktop is not running so `npm run start:dev` works out-of-the-box.
 */
export async function createEmbeddedPgliteDriver(): Promise<{ Pool: any }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require('@electric-sql/pglite');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { vector } = require('@electric-sql/pglite/dist/vector/index.cjs');

  const pgInstance = await PGlite.create({
    extensions: { vector },
  });

  logger.log(
    'Embedded PostgreSQL 16 + pgvector (PGlite) initialized for zero-Docker local development.',
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
      // Single embedded engine; no socket release required
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

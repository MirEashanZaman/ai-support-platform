import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  DATABASE_HOST: z.string().default('localhost'),
  DATABASE_PORT: z.coerce.number().int().positive().default(5432),
  DATABASE_USER: z.string().default('postgres'),
  DATABASE_PASSWORD: z.string().default('postgres'),
  DATABASE_NAME: z.string().default('ai_support_platform'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  RABBITMQ_INGESTION_QUEUE: z.string().default('document.ingestion.queue'),
  RABBITMQ_DLQ: z.string().default('document.ingestion.dlq'),
  EMBEDDING_PROVIDER: z.enum(['mock', 'openai', 'voyage']).default('mock'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  RAG_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.72),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): ValidatedEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${formatted}`);
  }
  return parsed.data;
}

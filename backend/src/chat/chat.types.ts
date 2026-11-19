import { z } from 'zod';

export const SendMessageSchema = z
  .object({
    sessionId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{4,128}$/)
      .optional(),
    customerSession: z
      .string()
      .regex(/^[A-Za-z0-9_-]{4,128}$/)
      .optional(),
    message: z.string().trim().min(1).max(2000),
    requestHuman: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.sessionId || data.customerSession), {
    message: 'sessionId or customerSession is required',
    path: ['sessionId'],
  });

export type SendMessageDto = z.infer<typeof SendMessageSchema>;

export type EscalationReason =
  | 'low_similarity'
  | 'low_confidence'
  | 'customer_request'
  | 'ai_unavailable'
  | 'repeated_unhelpful_answers'
  | 'no_relevant_chunks'
  | 'customer_requested_human'
  | 'low_confidence_or_policy_guard'
  | 'ai_circuit_breaker_fallback';

export type ConfidenceLabel = 'low' | 'medium' | 'high';

export const SIMILARITY_THRESHOLD = Number(
  process.env.SIMILARITY_THRESHOLD ??
    process.env.RAG_SIMILARITY_THRESHOLD ??
    0.72,
);
export const MIN_CONFIDENCE = (process.env.MIN_CONFIDENCE ??
  'medium') as ConfidenceLabel;
export const TOP_K = 5;

export const CONFIDENCE_RANK: Record<ConfidenceLabel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};
export const CONFIDENCE_VALUE: Record<ConfidenceLabel, number> = {
  low: 0.3,
  medium: 0.6,
  high: 0.9,
};

export interface RetrievedChunk {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
}

export interface Citation {
  documentId: string;
  documentName: string;
  chunkId: string;
  similarity?: number;
  snippet?: string;
}

export interface ChatReply {
  id: string;
  sender: 'bot' | 'agent';
  content: string;
  citations: Citation[];
  confidence?: number | null;
  reason?: string | null;
}

export interface ChatResult {
  conversationId: string;
  status: 'bot' | 'waiting' | 'human' | 'closed';
  botSilent?: boolean;
  escalationReason?: string | null;
  cached?: boolean;
  reply: ChatReply | null;
}

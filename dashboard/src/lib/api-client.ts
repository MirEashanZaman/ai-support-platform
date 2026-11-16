import axios from 'axios';
import { z } from 'zod';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Zod schemas for Dashboard API validation (Tech Decisions Section 1).
 */
export const citationSchema = z.object({
  documentId: z.string(),
  documentName: z.string(),
  chunkId: z.string(),
  snippet: z.string().optional(),
});

export const chatMessageSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  conversationId: z.string(),
  sender: z.enum(['customer', 'bot', 'agent']),
  content: z.string(),
  citations: z.array(citationSchema).default([]),
  confidence: z.number().nullable().optional(),
  createdAt: z.string(),
});

export const handoffQueueItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  status: z.enum(['bot', 'waiting', 'human', 'closed']),
  customerSession: z.string(),
  claimedByUserId: z.string().nullable().optional(),
  messageCount: z.number().default(0),
  lastMessagePreview: z.string().nullable().optional(),
  updatedAt: z.string(),
});

export const agentReplyFormSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Reply cannot be empty')
    .max(2000, 'Reply must be under 2000 characters'),
});

export const documentItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  type: z.enum(['pdf', 'txt', 'md', 'url']),
  status: z.enum(['Uploaded', 'Processing', 'Ready', 'Failed']),
  sourceUrl: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const analyticsSummarySchema = z.object({
  totalChats: z.number(),
  botResolvedChats: z.number(),
  escalatedChats: z.number(),
  resolutionRate: z.number(),
  averageResponseTimeMs: z.number().default(0),
  monthlyQuotaUsed: z.number().default(0),
  monthlyQuotaLimit: z.number().default(5000),
  topQuestions: z
    .array(
      z.object({
        question: z.string(),
        count: z.number(),
      }),
    )
    .default([]),
});

export type ChatMessageItem = z.infer<typeof chatMessageSchema>;
export type HandoffQueueItem = z.infer<typeof handoffQueueItemSchema>;
export type DocumentItem = z.infer<typeof documentItemSchema>;
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;

/**
 * Axios instance with Bearer access token injection and automatic /auth/refresh
 * interceptor on 401 responses (Tech Decisions Section 1).
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let accessTokenMemory: string | null = null;

export function setAccessToken(token: string | null): void {
  accessTokenMemory = token;
}

apiClient.interceptors.request.use((config) => {
  if (accessTokenMemory && config.headers) {
    config.headers.Authorization = `Bearer ${accessTokenMemory}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !String(originalRequest.url).includes('/auth/refresh')
    ) {
      originalRequest._retry = true;
      try {
        const refreshRes = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        );
        const newAccessToken: string | undefined = refreshRes.data?.accessToken;
        if (newAccessToken) {
          setAccessToken(newAccessToken);
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return apiClient(originalRequest);
        }
      } catch {
        setAccessToken(null);
      }
    }
    return Promise.reject(error);
  },
);

export const handoffApi = {
  async fetchQueue(): Promise<HandoffQueueItem[]> {
    const res = await apiClient.get('/handoff/queue');
    return z.array(handoffQueueItemSchema).parse(res.data);
  },

  async fetchTranscript(conversationId: string): Promise<{
    conversation: HandoffQueueItem;
    messages: ChatMessageItem[];
  }> {
    const res = await apiClient.get(`/handoff/${conversationId}/messages`);
    return {
      conversation: res.data.conversation,
      messages: z.array(chatMessageSchema).parse(res.data.messages),
    };
  },

  async claimChat(conversationId: string) {
    const res = await apiClient.post(`/handoff/${conversationId}/claim`);
    return res.data;
  },

  async sendReply(conversationId: string, content: string): Promise<ChatMessageItem> {
    const validated = agentReplyFormSchema.parse({ content });
    const res = await apiClient.post(
      `/handoff/${conversationId}/reply`,
      validated,
    );
    return chatMessageSchema.parse(res.data);
  },

  async closeChat(conversationId: string) {
    const res = await apiClient.post(`/handoff/${conversationId}/close`);
    return res.data;
  },
};

export const documentsApi = {
  async listDocuments(): Promise<DocumentItem[]> {
    const res = await apiClient.get('/documents');
    return z.array(documentItemSchema).parse(res.data);
  },

  async createTextOrUrlDocument(payload: {
    name: string;
    type: 'pdf' | 'txt' | 'md' | 'url';
    rawContent?: string;
    sourceUrl?: string;
  }): Promise<DocumentItem> {
    const res = await apiClient.post('/documents', payload);
    return documentItemSchema.parse(res.data);
  },

  async deleteDocument(id: string): Promise<void> {
    await apiClient.delete(`/documents/${id}`);
  },
};

export const analyticsApi = {
  async fetchSummary(): Promise<AnalyticsSummary> {
    const res = await apiClient.get('/analytics/summary');
    return analyticsSummarySchema.parse(res.data);
  },

  async fetchUnanswered(): Promise<ChatMessageItem[]> {
    const res = await apiClient.get('/analytics/unanswered');
    return z.array(chatMessageSchema).parse(res.data);
  },
};

export const authApi = {
  async signup(payload: {
    businessName: string;
    email: string;
    password: string;
  }) {
    const res = await apiClient.post('/auth/signup', payload);
    if (res.data?.accessToken) {
      setAccessToken(res.data.accessToken);
    }
    return res.data;
  },

  async login(payload: {
    email: string;
    password: string;
    tenantKey?: string;
  }) {
    const res = await apiClient.post('/auth/login', payload);
    if (res.data?.accessToken) {
      setAccessToken(res.data.accessToken);
    }
    return res.data;
  },

  async logout() {
    await apiClient.post('/auth/logout');
    setAccessToken(null);
  },
};

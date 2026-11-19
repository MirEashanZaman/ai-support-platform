import axios from 'axios';
import { z } from 'zod';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const STORAGE_TOKEN_KEY = 'ai_support_access_token';
const STORAGE_TENANT_ID_KEY = 'ai_support_tenant_id';
const STORAGE_TENANT_KEY = 'ai_support_tenant_key';

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
  createdAt: z.union([z.string(), z.date()]).transform((v) => String(v)),
});

export const handoffQueueItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  status: z.enum(['bot', 'waiting', 'human', 'closed']),
  customerSession: z.string(),
  claimedByUserId: z.string().nullable().optional(),
  messageCount: z.number().default(0),
  lastMessagePreview: z.string().nullable().optional(),
  updatedAt: z.union([z.string(), z.date()]).transform((v) => String(v)),
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
  createdAt: z.union([z.string(), z.date()]).transform((v) => String(v)),
});

export const analyticsSummarySchema = z.object({
  totalChats: z.number(),
  botResolvedChats: z.number(),
  escalatedChats: z.number(),
  resolutionRate: z.number(),
  averageResponseTimeMs: z.number().default(0),
  monthlyQuotaUsed: z.number().default(0),
  monthlyQuotaLimit: z.number().default(1000),
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

let accessTokenMemory: string | null = null;

export function getAccessToken(): string | null {
  if (accessTokenMemory) return accessTokenMemory;
  if (typeof window !== 'undefined') {
    try {
      accessTokenMemory = window.localStorage.getItem(STORAGE_TOKEN_KEY);
      return accessTokenMemory;
    } catch {
      return null;
    }
  }
  return null;
}

export function setAccessToken(
  token: string | null,
  tenantId?: string,
  tenantKey?: string,
): void {
  accessTokenMemory = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        window.localStorage.setItem(STORAGE_TOKEN_KEY, token);
      } else {
        window.localStorage.removeItem(STORAGE_TOKEN_KEY);
        window.localStorage.removeItem(STORAGE_TENANT_ID_KEY);
      }
      if (tenantId) {
        window.localStorage.setItem(STORAGE_TENANT_ID_KEY, tenantId);
      }
      if (tenantKey) {
        window.localStorage.setItem(STORAGE_TENANT_KEY, tenantKey);
      }
    } catch {

    }
  }
}

export function getStoredTenantInfo(): {
  tenantId: string | null;
  tenantKey: string;
} {
  if (typeof window !== 'undefined') {
    try {
      return {
        tenantId: window.localStorage.getItem(STORAGE_TENANT_ID_KEY),
        tenantKey:
          window.localStorage.getItem(STORAGE_TENANT_KEY) || 'oil-supply',
      };
    } catch {
      return { tenantId: null, tenantKey: 'oil-supply' };
    }
  }
  return { tenantId: null, tenantKey: 'oil-supply' };
}

export function isDemoModeEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
    (process.env.NODE_ENV !== 'production' &&
      process.env.NEXT_PUBLIC_DEMO_MODE !== 'false')
  );
}

export async function ensureDemoSession(): Promise<{
  accessToken: string | null;
  tenantId: string | null;
  tenantKey: string;
}> {
  const existingToken = getAccessToken();
  const stored = getStoredTenantInfo();
  if (existingToken && stored.tenantId) {
    return {
      accessToken: existingToken,
      tenantId: stored.tenantId,
      tenantKey: stored.tenantKey,
    };
  }

  if (!isDemoModeEnabled()) {
    return {
      accessToken: existingToken,
      tenantId: stored.tenantId,
      tenantKey: stored.tenantKey,
    };
  }

  try {
    const res = await axios.post(
      `${API_BASE_URL}/auth/login`,
      {
        email: 'owner@oilsupply.com',
        password: 'Password123!',
      },
      { withCredentials: true },
    );
    const token: string | undefined = res.data?.accessToken;
    const tId: string | undefined = res.data?.tenant?.id;
    const tKey: string | undefined = res.data?.tenant?.tenantKey;
    if (token) {
      setAccessToken(token, tId, tKey);
      return {
        accessToken: token,
        tenantId: tId ?? null,
        tenantKey: tKey ?? 'oil-supply',
      };
    }
  } catch {

  }

  return { accessToken: null, tenantId: null, tenantKey: 'oil-supply' };
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      (error.response?.status === 401 ||
        (error.response?.status === 404 &&
          isDemoModeEnabled() &&
          (String(originalRequest?.url).includes('/tenants/me') ||
            String(originalRequest?.url).includes('/users') ||
            String(originalRequest?.url).includes('/documents') ||
            String(originalRequest?.url).includes('/handoff') ||
            String(originalRequest?.url).includes('/analytics')))) &&
      originalRequest &&
      !originalRequest._retry &&
      !String(originalRequest.url).includes('/auth/refresh') &&
      !String(originalRequest.url).includes('/auth/login')
    ) {
      originalRequest._retry = true;
      if (error.response?.status === 404) {
        setAccessToken(null);
        const demo = await ensureDemoSession();
        if (demo.accessToken) {
          originalRequest.headers.Authorization = `Bearer ${demo.accessToken}`;
          return apiClient(originalRequest);
        }
      }
      try {
        const refreshRes = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        );
        const newAccessToken: string | undefined = refreshRes.data?.accessToken;
        if (newAccessToken) {
          setAccessToken(
            newAccessToken,
            refreshRes.data?.tenant?.id,
            refreshRes.data?.tenant?.tenantKey,
          );
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return apiClient(originalRequest);
        }
      } catch {

        setAccessToken(null);
        const demo = await ensureDemoSession();
        if (demo.accessToken) {
          originalRequest.headers.Authorization = `Bearer ${demo.accessToken}`;
          return apiClient(originalRequest);
        }
      }
    }
    return Promise.reject(error);
  },
);

export const handoffApi = {
  async fetchQueue(): Promise<HandoffQueueItem[]> {
    await ensureDemoSession();
    const res = await apiClient.get('/handoff/queue');
    return z.array(handoffQueueItemSchema).parse(res.data);
  },

  async fetchTranscript(conversationId: string): Promise<{
    conversation: HandoffQueueItem;
    messages: ChatMessageItem[];
  }> {
    await ensureDemoSession();
    const res = await apiClient.get(`/handoff/${conversationId}/messages`);
    return {
      conversation: res.data.conversation,
      messages: z.array(chatMessageSchema).parse(res.data.messages),
    };
  },

  async claimChat(conversationId: string) {
    await ensureDemoSession();
    const res = await apiClient.post(`/handoff/${conversationId}/claim`);
    return res.data;
  },

  async sendReply(
    conversationId: string,
    content: string,
  ): Promise<ChatMessageItem> {
    await ensureDemoSession();
    const validated = agentReplyFormSchema.parse({ content });
    const res = await apiClient.post(
      `/handoff/${conversationId}/reply`,
      validated,
    );
    return chatMessageSchema.parse(res.data);
  },

  async createEscalatedChatForReply(): Promise<string> {
    const session = await ensureDemoSession();
    const res = await apiClient.post(
      `/chat/${encodeURIComponent(session.tenantKey)}/messages`,
      {
        customerSession: `live-inbox-session-${Date.now().toString(36)}`,
        message: 'Please connect me with a human support agent.',
      },
    );
    return String(res.data.conversationId);
  },

  async closeChat(conversationId: string) {
    await ensureDemoSession();
    const res = await apiClient.post(`/handoff/${conversationId}/close`);
    return res.data;
  },
};

export const documentsApi = {
  async listDocuments(): Promise<DocumentItem[]> {
    await ensureDemoSession();
    const res = await apiClient.get('/documents');
    return z.array(documentItemSchema).parse(res.data);
  },

  async createTextOrUrlDocument(payload: {
    name: string;
    type: 'pdf' | 'txt' | 'md' | 'url';
    rawContent?: string;
    sourceUrl?: string;
  }): Promise<DocumentItem> {
    await ensureDemoSession();
    const res = await apiClient.post('/documents', payload);
    return documentItemSchema.parse(res.data);
  },

  async uploadMultipartFile(
    file: File,
    customName?: string,
  ): Promise<DocumentItem> {
    await ensureDemoSession();
    const formData = new FormData();
    formData.append('file', file);
    if (customName && customName.trim()) {
      formData.append('name', customName.trim());
    }
    const res = await apiClient.post('/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return documentItemSchema.parse(res.data);
  },

  async deleteDocument(id: string): Promise<void> {
    await ensureDemoSession();
    await apiClient.delete(`/documents/${id}`);
  },
};

export const analyticsApi = {
  async fetchSummary(): Promise<AnalyticsSummary> {
    await ensureDemoSession();
    const res = await apiClient.get('/analytics/summary');
    return analyticsSummarySchema.parse(res.data);
  },

  async fetchUnanswered(): Promise<ChatMessageItem[]> {
    await ensureDemoSession();
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
      setAccessToken(
        res.data.accessToken,
        res.data?.tenant?.id,
        res.data?.tenant?.tenantKey,
      );
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
      setAccessToken(
        res.data.accessToken,
        res.data?.tenant?.id,
        res.data?.tenant?.tenantKey,
      );
    }
    return res.data;
  },

  async logout() {
    await apiClient.post('/auth/logout');
    setAccessToken(null);
  },
};

export const workspaceApi = {
  async askAiBot(message: string, customerSession = 'dashboard-playground-1') {
    const session = await ensureDemoSession();
    const res = await apiClient.post(
      `/chat/${encodeURIComponent(session.tenantKey)}/messages`,
      {
        customerSession,
        message,
      },
    );
    return res.data;
  },

  async getCurrentTenant() {
    await ensureDemoSession();
    const res = await apiClient.get('/tenants/me');
    return res.data;
  },

  async updateWidgetConfig(payload: {
    name?: string;
    allowedOrigins?: string[];
    widgetConfig?: {
      botName?: string;
      primaryColor?: string;
      welcomeMessage?: string;
    };
  }) {
    await ensureDemoSession();
    const res = await apiClient.patch('/tenants/me', payload);
    return res.data;
  },

  async listTeamMembers() {
    await ensureDemoSession();
    const res = await apiClient.get('/users');
    return res.data as Array<{
      id: string;
      email: string;
      role: 'Owner' | 'Agent' | 'Viewer';
      createdAt: string;
    }>;
  },

  async inviteTeamMember(payload: {
    email: string;
    temporaryPassword: string;
    role: 'Owner' | 'Agent' | 'Viewer';
  }) {
    await ensureDemoSession();
    const res = await apiClient.post('/users/invite', payload);
    return res.data;
  },
};

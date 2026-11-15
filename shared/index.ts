/**
 * Shared validation constants and schema definitions across Backend (NestJS),
 * Dashboard (Next.js), and Widget.
 */

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB (FR-2)

export const ALLOWED_DOCUMENT_TYPES = ['pdf', 'txt', 'md', 'url'] as const;
export type AllowedDocumentType = (typeof ALLOWED_DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = [
  'Uploaded',
  'Processing',
  'Ready',
  'Failed',
] as const;
export type SharedDocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const TENANT_ROLES = ['Owner', 'Agent', 'Viewer'] as const;
export type SharedTenantRole = (typeof TENANT_ROLES)[number];

export const CONVERSATION_STATUSES = [
  'bot',
  'waiting',
  'human',
  'closed',
] as const;
export type SharedConversationStatus = (typeof CONVERSATION_STATUSES)[number];

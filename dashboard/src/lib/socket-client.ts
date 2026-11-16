import { io, Socket } from 'socket.io-client';

const REALTIME_URL =
  (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000') + '/realtime';

export interface InboxRealtimeHandlers {
  onEscalated?: (payload: {
    conversationId: string;
    customerSession: string;
    reason: string;
    confidence: number;
  }) => void;
  onClaimed?: (conversation: unknown) => void;
  onMessage?: (message: unknown) => void;
  onCustomerMessage?: (message: unknown) => void;
  onClosed?: (conversation: unknown) => void;
}

/**
 * Connects to the NestJS WebSocket Gateway (/realtime) and subscribes to the
 * active tenant's live agent inbox room (`tenant:<tenantId>`).
 */
export function connectTenantInboxSocket(
  tenantId: string,
  handlers: InboxRealtimeHandlers,
): Socket {
  const socket = io(REALTIME_URL, {
    transports: ['websocket', 'polling'],
    withCredentials: true,
  });

  socket.on('connect', () => {
    socket.emit('joinTenantInbox', { tenantId });
  });

  if (handlers.onEscalated) {
    socket.on('handoff:escalated', handlers.onEscalated);
  }
  if (handlers.onClaimed) {
    socket.on('handoff:claimed', handlers.onClaimed);
  }
  if (handlers.onMessage) {
    socket.on('handoff:message', handlers.onMessage);
  }
  if (handlers.onCustomerMessage) {
    socket.on('handoff:customer_message', handlers.onCustomerMessage);
  }
  if (handlers.onClosed) {
    socket.on('handoff:closed', handlers.onClosed);
  }

  return socket;
}

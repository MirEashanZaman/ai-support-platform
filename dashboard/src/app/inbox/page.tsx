'use client';

import React, { useEffect, useState } from 'react';
import {
  agentReplyFormSchema,
  ChatMessageItem,
  ensureDemoSession,
  handoffApi,
  HandoffQueueItem,
} from '../../lib/api-client';
import { connectTenantInboxSocket } from '../../lib/socket-client';

/**
 * Week 4 Deliverable — Live Agent Inbox (FR-5 & PRD Section 6):
 * - Auto-authenticates into the seeded "Oil Supply" workspace if not yet logged in
 * - Displays escalated conversations (`waiting` and `human` status) in real time
 * - Shows the full conversation transcript so far (Customer, Bot with citations/confidence, Agent)
 * - Allows Support Agents and Owners to Claim a chat, Reply in real time, and Close the ticket
 */
export default function LiveAgentInboxPage() {
  const [tenantId, setTenantId] = useState<string>('');
  const [queue, setQueue] = useState<HandoffQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [replyText, setReplyText] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<string>(
    'Connecting to real-time WebSocket inbox (/realtime)...',
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);

  async function loadQueue(preferredId?: string | null) {
    try {
      const session = await ensureDemoSession();
      if (session.tenantId && session.tenantId !== tenantId) {
        setTenantId(session.tenantId);
      }
      const items = await handoffApi.fetchQueue();
      setQueue(items);
      const targetId = preferredId ?? selectedId ?? items[0]?.id ?? null;
      if (targetId && targetId !== selectedId) {
        setSelectedId(targetId);
      }
      setStatusBanner(
        `Connected to Live Agent Inbox (Workspace: ${session.tenantKey}) — ${items.length} active escalated chat(s)`,
      );
      return items;
    } catch {
      setStatusBanner(
        'Waiting for Backend API on http://localhost:4000 ...',
      );
      return [];
    }
  }

  async function loadTranscript(conversationId: string) {
    try {
      const data = await handoffApi.fetchTranscript(conversationId);
      setMessages(data.messages);
    } catch {
      // Keep current transcript state
    }
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  useEffect(() => {
    if (selectedId) {
      void loadTranscript(selectedId);
    } else {
      setMessages([]);
    }
  }, [selectedId]);

  useEffect(() => {
    if (!tenantId) return;
    const socket = connectTenantInboxSocket(tenantId, {
      onEscalated: (payload) => {
        setStatusBanner(
          `New escalated chat (${payload.reason}) — Session ${payload.customerSession}`,
        );
        void loadQueue(payload.conversationId);
      },
      onClaimed: () => {
        void loadQueue();
      },
      onMessage: (msg) => {
        const typed = msg as ChatMessageItem;
        if (typed && typed.conversationId === selectedId) {
          setMessages((prev) =>
            prev.some((m) => m.id === typed.id) ? prev : [...prev, typed],
          );
        }
        void loadQueue();
      },
      onCustomerMessage: (msg) => {
        const typed = msg as ChatMessageItem;
        if (typed && typed.conversationId === selectedId) {
          setMessages((prev) =>
            prev.some((m) => m.id === typed.id) ? prev : [...prev, typed],
          );
        }
        void loadQueue();
      },
      onClosed: () => {
        void loadQueue();
      },
    });

    return () => {
      socket.disconnect();
    };
  }, [tenantId, selectedId]);

  async function handleClaim(conversationId: string) {
    try {
      await handoffApi.claimChat(conversationId);
      setStatusBanner(
        `Claimed conversation #${conversationId.slice(0, 8)}. AI bot is muted while you own this chat.`,
      );
      await loadQueue(conversationId);
    } catch {
      setValidationError('Could not claim conversation. Please try again.');
    }
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    const parsed = agentReplyFormSchema.safeParse({ content: replyText });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Invalid reply');
      return;
    }

    setSending(true);
    try {
      let targetConversationId = selectedId;

      // If no escalated chat is currently selected or queue was empty, create/select one automatically
      if (!targetConversationId) {
        const currentQueue = await handoffApi.fetchQueue();
        if (currentQueue.length > 0) {
          targetConversationId = currentQueue[0].id;
        } else {
          targetConversationId =
            await handoffApi.createEscalatedChatForReply();
        }
        setSelectedId(targetConversationId);
      }

      const created = await handoffApi.sendReply(
        targetConversationId,
        parsed.data.content,
      );
      setReplyText('');
      setMessages((prev) =>
        prev.some((m) => m.id === created.id) ? prev : [...prev, created],
      );
      setStatusBanner(
        `Reply sent to conversation #${targetConversationId.slice(0, 8)}!`,
      );
      await loadQueue(targetConversationId);
    } catch (err) {
      setValidationError(
        (err as Error)?.message ||
          'Failed to send reply. Make sure the backend server is running on port 4000.',
      );
    } finally {
      setSending(false);
    }
  }

  async function handleClose(conversationId: string) {
    try {
      await handoffApi.closeChat(conversationId);
      setStatusBanner(`Closed conversation #${conversationId.slice(0, 8)}.`);
      setSelectedId(null);
      await loadQueue(null);
    } catch {
      setValidationError('Could not close conversation.');
    }
  }

  const activeConversation = queue.find((q) => q.id === selectedId) ?? null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          color: '#1e40af',
          padding: '10px 16px',
          borderRadius: 10,
          fontSize: 13,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{statusBanner}</span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          {tenantId ? `Tenant ID: ${tenantId.slice(0, 8)}...` : 'Authenticating...'}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '340px 1fr',
          gap: 16,
          minHeight: 560,
        }}
      >
        {/* Left Column: Escalated Queue */}
        <aside
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>
            Escalated Queue ({queue.length})
          </h2>
          {queue.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 13 }}>
              No chats currently waiting for human handoff. Type a reply on the
              right to start an agent session, or click &ldquo;Talk to human&rdquo; in the
              widget!
            </p>
          ) : (
            queue.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  cursor: 'pointer',
                  border:
                    item.id === selectedId
                      ? '2px solid #2563eb'
                      : '1px solid #e2e8f0',
                  background: item.id === selectedId ? '#f8fafc' : '#ffffff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <span>Session: {item.customerSession}</span>
                  <span
                    style={{
                      textTransform: 'uppercase',
                      color:
                        item.status === 'waiting' ? '#d97706' : '#059669',
                    }}
                  >
                    {item.status}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#475569',
                    marginTop: 6,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.lastMessagePreview || 'No messages yet'}
                </div>
              </div>
            ))
          )}
        </aside>

        {/* Right Column: Full Conversation Transcript & Agent Actions */}
        <section
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <strong style={{ fontSize: 15 }}>
                {activeConversation
                  ? `Conversation #${activeConversation.id.slice(0, 8)} (${activeConversation.customerSession})`
                  : 'Live Support Agent Transcript'}
              </strong>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                AI bot is strictly silent while status is waiting or human (FR-5)
              </div>
            </div>
            {activeConversation && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => handleClaim(activeConversation.id)}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Claim Chat
                </button>
                <button
                  type="button"
                  onClick={() => handleClose(activeConversation.id)}
                  style={{
                    background: '#e11d48',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Close Chat
                </button>
              </div>
            )}
          </div>

          <div
            style={{
              flex: 1,
              padding: 18,
              overflowY: 'auto',
              background: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {messages.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>
                No messages in this conversation yet. Type a reply below and
                press Send Reply!
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    alignSelf:
                      msg.sender === 'customer' ? 'flex-start' : 'flex-end',
                    background:
                      msg.sender === 'agent'
                        ? '#2563eb'
                        : msg.sender === 'bot'
                          ? '#f1f5f9'
                          : '#ffffff',
                    color: msg.sender === 'agent' ? '#ffffff' : '#0f172a',
                    border: '1px solid #cbd5e1',
                    borderRadius: 10,
                    padding: '10px 14px',
                    maxWidth: '78%',
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      marginBottom: 4,
                      textTransform: 'uppercase',
                      opacity: 0.8,
                    }}
                  >
                    {msg.sender}
                    {typeof msg.confidence === 'number'
                      ? ` · confidence ${(msg.confidence * 100).toFixed(0)}%`
                      : ''}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.45 }}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleSendReply}
            style={{
              padding: 14,
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              gap: 10,
            }}
          >
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type a real-time agent reply..."
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 14,
              }}
            />
            <button
              type="submit"
              disabled={sending}
              style={{
                background: sending ? '#94a3b8' : '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '0 18px',
                fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer',
              }}
            >
              {sending ? 'Sending...' : 'Send Reply'}
            </button>
          </form>
          {validationError && (
            <div style={{ color: '#dc2626', fontSize: 12, padding: '0 14px 10px' }}>
              {validationError}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

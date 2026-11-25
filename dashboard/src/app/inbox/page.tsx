'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Send, UserCheck, XCircle } from 'lucide-react';
import {
  agentReplyFormSchema,
  ChatMessageItem,
  ensureDemoSession,
  handoffApi,
  HandoffQueueItem,
} from '../../lib/api-client';
import { connectTenantInboxSocket } from '../../lib/socket-client';
import {
  EASE_OUT_EXPO,
  PageMotion,
} from '../../components/motion-primitives';

export default function LiveAgentInboxPage() {
  const [tenantId, setTenantId] = useState<string>('');
  const [queue, setQueue] = useState<HandoffQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [replyText, setReplyText] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<string>(
    'Connecting to live agent inbox',
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
        `Workspace ${session.tenantKey} · ${items.length} active escalated chat${items.length === 1 ? '' : 's'}`,
      );
      return items;
    } catch {
      setStatusBanner('Waiting for backend API connection');
      return [];
    }
  }

  async function loadTranscript(conversationId: string) {
    try {
      const data = await handoffApi.fetchTranscript(conversationId);
      setMessages(data.messages);
    } catch {

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
          `New escalation (${payload.reason}) · session ${payload.customerSession}`,
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
        `Claimed #${conversationId.slice(0, 8)} · assistant muted while you own this chat`,
      );
      await loadQueue(conversationId);
    } catch {
      setValidationError('Could not claim conversation');
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
      setStatusBanner(`Reply sent to #${targetConversationId.slice(0, 8)}`);
      await loadQueue(targetConversationId);
    } catch (err) {
      setValidationError(
        (err as Error)?.message ||
          'Failed to send reply. Verify the backend server is running.',
      );
    } finally {
      setSending(false);
    }
  }

  async function handleClose(conversationId: string) {
    try {
      await handoffApi.closeChat(conversationId);
      setStatusBanner(`Closed conversation #${conversationId.slice(0, 8)}`);
      setSelectedId(null);
      await loadQueue(null);
    } catch {
      setValidationError('Could not close conversation');
    }
  }

  const activeConversation = queue.find((q) => q.id === selectedId) ?? null;

  return (
    <PageMotion>
      <div className="page-header">
        <div>
          <h1 className="page-title">Live agent inbox</h1>
          <p className="page-subtitle">
            Claim escalated customer threads and reply in real time while the AI assistant stays muted.
          </p>
        </div>
        <div className="sig-meta tabular">
          <span className="sig-dot sig-dot-ready" />
          <span>{statusBanner}</span>
        </div>
      </div>

      <div className="split-inbox">
        <aside
          className="card"
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 4px 8px',
              borderBottom: '1px solid var(--border-hairline)',
            }}
          >
            <h2 className="card-title" style={{ fontSize: 14 }}>
              Escalated queue
            </h2>
            <span className="sig-meta tabular">{queue.length}</span>
          </div>

          {queue.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 4 }}>
              No conversations waiting for handoff. Send a reply on the right or escalate a chat from the customer widget.
            </p>
          ) : (
            <AnimatePresence initial={false}>
              {queue.map((item) => {
                const isSelected = item.id === selectedId;
                const isWaiting = item.status === 'waiting';
                return (
                  <motion.button
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    whileTap={{ scale: 0.99 }}
                    transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      textAlign: 'left',
                      width: '100%',
                      padding: 12,
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: isSelected
                        ? '1px solid var(--accent)'
                        : '1px solid var(--border-hairline)',
                      background: isSelected ? 'var(--accent-soft)' : 'var(--bg-card)',
                      transition: 'background-color 140ms var(--ease-out), border-color 140ms var(--ease-out)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span
                        className="mono"
                        style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}
                      >
                        {item.customerSession}
                      </span>
                      <span className="sig-meta">
                        <span
                          className={`sig-dot ${isWaiting ? 'sig-dot-waiting' : 'sig-dot-ready'}`}
                        />
                        <span>{isWaiting ? 'Waiting' : 'Human'}</span>
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                        marginTop: 6,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.lastMessagePreview || 'No messages yet'}
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          )}
        </aside>

        <section
          className="card"
          style={{
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-hairline)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>
                {activeConversation
                  ? `Conversation #${activeConversation.id.slice(0, 8)}`
                  : 'Conversation transcript'}
              </div>
              <div className="sig-meta" style={{ marginTop: 2 }}>
                {activeConversation
                  ? `Session ${activeConversation.customerSession} · assistant muted`
                  : 'Select a thread from the queue to inspect history'}
              </div>
            </div>
            {activeConversation && (
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => void handleClaim(activeConversation.id)}
                  className="btn btn-accent btn-sm"
                >
                  <UserCheck size={14} strokeWidth={1.7} />
                  <span>Claim chat</span>
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => void handleClose(activeConversation.id)}
                  className="btn btn-danger btn-sm"
                >
                  <XCircle size={14} strokeWidth={1.7} />
                  <span>Close chat</span>
                </motion.button>
              </div>
            )}
          </div>

          <div
            style={{
              flex: 1,
              padding: 20,
              overflowY: 'auto',
              background: 'var(--bg-page)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {messages.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                No messages in this conversation yet. Type a reply below to start.
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((msg) => {
                  const isAgent = msg.sender === 'agent';
                  const isCustomer = msg.sender === 'customer';
                  const senderLabel = isAgent
                    ? 'Agent'
                    : isCustomer
                      ? 'Customer'
                      : 'Assistant';
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
                      style={{
                        alignSelf: isCustomer ? 'flex-start' : 'flex-end',
                        background: isAgent
                          ? 'var(--text-primary)'
                          : isCustomer
                            ? 'var(--bg-card)'
                            : 'var(--bg-raised)',
                        color: isAgent ? '#ffffff' : 'var(--text-primary)',
                        border: isAgent
                          ? '1px solid transparent'
                          : '1px solid var(--border-hairline)',
                        borderRadius: 10,
                        padding: '10px 14px',
                        maxWidth: '76%',
                      }}
                    >
                      <div
                        className="mono tabular"
                        style={{
                          fontSize: 11,
                          marginBottom: 4,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          color: isAgent
                            ? 'rgba(255,255,255,0.72)'
                            : 'var(--text-muted)',
                        }}
                      >
                        {isAgent && <CheckCircle2 size={12} strokeWidth={1.7} />}
                        <span>
                          {senderLabel}
                          {typeof msg.confidence === 'number'
                            ? ` · ${Math.round(msg.confidence * 100)}% signal`
                            : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                        {msg.content}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          <form
            onSubmit={handleSendReply}
            style={{
              padding: 16,
              borderTop: '1px solid var(--border-hairline)',
              background: 'var(--bg-card)',
              display: 'flex',
              gap: 12,
            }}
          >
            <input
              type="text"
              className="input"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply to the customer"
            />
            <motion.button
              type="submit"
              disabled={sending}
              whileTap={{ scale: 0.97 }}
              className="btn btn-primary"
            >
              <Send size={14} strokeWidth={1.7} />
              <span>{sending ? 'Sending' : 'Send reply'}</span>
            </motion.button>
          </form>
          {validationError && (
            <div
              style={{
                color: 'var(--negative)',
                fontSize: 12,
                padding: '0 16px 12px',
              }}
            >
              {validationError}
            </div>
          )}
        </section>
      </div>
    </PageMotion>
  );
}

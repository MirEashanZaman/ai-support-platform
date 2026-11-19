import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClaudeLlmAdapter } from '../src/chat/adapters/claude-llm.adapter';
import { ChatService } from '../src/chat/chat.module';
import { ConversationStatus } from '../src/common/enums/conversation-status.enum';
import { MessageSender } from '../src/common/enums/message-sender.enum';
import { Role } from '../src/common/enums/role.enum';
import { HandoffGateway, HandoffService } from '../src/handoff/handoff.module';
import { ConversationStateMachine } from '../src/handoff/state-machine/conversation-state-machine';

describe('Week 4 — Human Handoff, State Machine, Live Agent Inbox & Real-Time Messages Suite', () => {
  describe('State Machine Pattern: ConversationStateMachine (bot -> waiting -> human -> closed)', () => {
    it('allows valid handoff transitions and blocks transitions out of closed', () => {
      expect(
        ConversationStateMachine.assertTransition(
          ConversationStatus.BOT,
          ConversationStatus.WAITING,
        ),
      ).toBe(ConversationStatus.WAITING);

      expect(
        ConversationStateMachine.assertTransition(
          ConversationStatus.WAITING,
          ConversationStatus.HUMAN,
        ),
      ).toBe(ConversationStatus.HUMAN);

      expect(
        ConversationStateMachine.assertTransition(
          ConversationStatus.HUMAN,
          ConversationStatus.CLOSED,
        ),
      ).toBe(ConversationStatus.CLOSED);

      expect(() =>
        ConversationStateMachine.assertTransition(
          ConversationStatus.CLOSED,
          ConversationStatus.HUMAN,
        ),
      ).toThrow(BadRequestException);

      expect(() =>
        ConversationStateMachine.assertTransition(
          ConversationStatus.HUMAN,
          ConversationStatus.BOT,
        ),
      ).toThrow(BadRequestException);
    });

    it('mutes the AI bot strictly during waiting and human states (FR-5)', () => {
      expect(ConversationStateMachine.isBotMuted(ConversationStatus.BOT)).toBe(
        false,
      );
      expect(
        ConversationStateMachine.isBotMuted(ConversationStatus.WAITING),
      ).toBe(true);
      expect(
        ConversationStateMachine.isBotMuted(ConversationStatus.HUMAN),
      ).toBe(true);
      expect(
        ConversationStateMachine.isBotMuted(ConversationStatus.CLOSED),
      ).toBe(false);
    });
  });

  describe('FR-5 Trigger: Repeated Unhelpful Answers & Real-Time Customer Follow-Ups', () => {
    it('escalates to waiting when customer reports unhelpful answers and streams customer messages when muted', async () => {
      const mockTenant = {
        id: 'tenant-oil-1',
        name: 'Oil Supply',
        tenantKey: 'oil-supply',
        allowedOrigins: ['*'],
        widgetConfig: {
          botName: 'Oil Supply Bot',
          primaryColor: '#2563eb',
          welcomeMessage: 'Hi!',
        },
      };

      let conversationState = {
        id: 'conv-400',
        tenantId: mockTenant.id,
        customerSession: 'sess-400',
        status: ConversationStatus.BOT,
        updatedAt: new Date(),
      };

      const mockRls = {
        runWithTenant: jest.fn(async (_tId: string, cb: any) => {
          const manager = {
            getRepository: (entity: any) => {
              if (entity.name === 'ConversationEntity') {
                return {
                  findOne: jest.fn(async () => conversationState),
                  create: jest.fn((d: any) => d),
                  save: jest.fn(async (c: any) => {
                    conversationState = { ...conversationState, ...c };
                    return conversationState;
                  }),
                };
              }
              return {
                create: jest.fn((d: any) => ({ id: 'msg-1', ...d })),
                save: jest.fn(async (d: any) => d),
              };
            },
          };
          return cb(manager);
        }),
      };

      const tenantEvents: Array<{ event: string; data: any }> = [];
      const mockGateway = {
        emitTenantEvent: jest.fn((_tId: string, event: string, data: any) => {
          tenantEvents.push({ event, data });
        }),
      };

      const chatService = new ChatService(
        { findOne: jest.fn(async () => mockTenant) } as any,
        mockRls as any,
        { searchSimilarChunks: jest.fn(async () => []) } as any,
        new ClaudeLlmAdapter(new ConfigService({ NODE_ENV: 'test' })),
        mockGateway as any,
      );

      const escalated = await chatService.handleCustomerMessage('oil-supply', {
        customerSession: 'sess-400',
        message: 'That answer was not helpful at all, it is still not working.',
      });

      expect(escalated.status).toBe(ConversationStatus.WAITING);
      expect(escalated.escalationReason).toBe('repeated_unhelpful_answers');
      expect(tenantEvents[0].event).toBe('handoff:escalated');

      const followUp = await chatService.handleCustomerMessage('oil-supply', {
        customerSession: 'sess-400',
        message: 'Here is my order invoice number #9921.',
      });

      expect(followUp.botSilent).toBe(true);
      expect(followUp.reply).toBeNull();
      expect(tenantEvents[1].event).toBe('handoff:customer_message');
    });
  });

  describe('Live Agent Inbox Workflow: Queue, Full Transcript, Claim, Reply & Close', () => {
    it('executes full agent claim -> real-time reply -> close flow and blocks replies after close', async () => {
      const convRecord = {
        id: 'conv-500',
        tenantId: 'tenant-oil-1',
        customerSession: 'sess-500',
        status: ConversationStatus.WAITING,
        claimedByUserId: null as string | null,
        updatedAt: new Date(),
      };

      const storedMessages: any[] = [
        {
          id: 'm-1',
          tenantId: 'tenant-oil-1',
          conversationId: 'conv-500',
          sender: MessageSender.CUSTOMER,
          content: 'Need urgent help with fuel delivery',
          citations: [],
          createdAt: new Date(),
        },
      ];

      const mockRls = {
        runInCurrentTenant: jest.fn(async (cb: any) =>
          mockRls.runWithTenant('tenant-oil-1', cb),
        ),
        runWithTenant: jest.fn(async (_tId: string, cb: any) => {
          const manager = {
            getRepository: (entity: any) => {
              if (entity.name === 'ConversationEntity') {
                return {
                  find: jest.fn(async () => [convRecord]),
                  findOne: jest.fn(async () => convRecord),
                  save: jest.fn(async (updated: any) => {
                    Object.assign(convRecord, updated);
                    return convRecord;
                  }),
                };
              }
              return {
                find: jest.fn(async () => storedMessages),
                create: jest.fn((d: any) => ({
                  id: `m-${storedMessages.length + 1}`,
                  createdAt: new Date(),
                  ...d,
                })),
                save: jest.fn(async (m: any) => {
                  storedMessages.push(m);
                  return m;
                }),
              };
            },
          };
          return cb(manager);
        }),
      };

      const gateway = new HandoffGateway();
      const tenantSpy = jest.spyOn(gateway, 'emitTenantEvent');
      const sessionSpy = jest.spyOn(gateway, 'emitCustomerSessionEvent');

      const handoffService = new HandoffService(mockRls as any, gateway);
      const agentUser = {
        userId: 'agent-007',
        tenantId: 'tenant-oil-1',
        email: 'agent@oilsupply.com',
        role: Role.AGENT,
      };

      const queue = await handoffService.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].messageCount).toBe(1);
      expect(queue[0].lastMessagePreview).toContain('Need urgent help');

      const transcript = await handoffService.getConversationTranscript('conv-500');
      expect(transcript.messages).toHaveLength(1);

      const claimed = await handoffService.claimConversation('conv-500', agentUser);
      expect(claimed.status).toBe(ConversationStatus.HUMAN);
      expect(claimed.claimedByUserId).toBe('agent-007');
      expect(tenantSpy).toHaveBeenCalledWith(
        'tenant-oil-1',
        'handoff:claimed',
        expect.anything(),
      );
      expect(sessionSpy).toHaveBeenCalledWith(
        'sess-500',
        'handoff:claimed',
        expect.anything(),
      );

      const replyMsg = await handoffService.replyToConversation(
        'conv-500',
        agentUser,
        { content: 'Hello! I have dispatched tanker #14 to your depot.' },
      );
      expect(replyMsg.sender).toBe(MessageSender.AGENT);
      expect(storedMessages).toHaveLength(2);

      const closed = await handoffService.closeConversation('conv-500', agentUser);
      expect(closed.status).toBe(ConversationStatus.CLOSED);

      await expect(
        handoffService.replyToConversation('conv-500', agentUser, {
          content: 'Trying to reply after close',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

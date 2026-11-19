import { EscalationReason } from './chat.types';

export type HandoffKind =
  | 'connecting'
  | 'offline'
  | 'requested'
  | 'requested_offline';

const MESSAGES: Record<HandoffKind, string> = {
  connecting:
    "I'm not sure about this one, so I'm connecting you with a team member. They'll see our chat, so you won't need to repeat yourself.",
  offline:
    "I'm not sure about this one, and our team is offline right now. Leave your email or phone number and we'll reply as soon as we're back.",
  requested: "Sure, I'm connecting you with a team member now.",
  requested_offline:
    "Our team is offline right now. Leave your email or phone number and we'll reply as soon as we're back.",
};

export function pickHandoffKind(
  reason: EscalationReason,
  agentsOnline: number,
): HandoffKind {
  if (
    reason === 'customer_request' ||
    reason === 'customer_requested_human'
  ) {
    return agentsOnline > 0 ? 'requested' : 'requested_offline';
  }
  return agentsOnline > 0 ? 'connecting' : 'offline';
}

export function handoffMessage(
  reason: EscalationReason,
  agentsOnline: number,
): string {
  return MESSAGES[pickHandoffKind(reason, agentsOnline)];
}

export function wantsHuman(text: string): boolean {
  return /\b(talk|speak|chat|connect)\b.{0,25}\b(human|person|agent|someone|representative)\b|\b(real person|human agent|live agent)\b/i.test(
    text,
  );
}

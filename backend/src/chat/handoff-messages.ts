import { EscalationReason } from './chat.types';

export type HandoffKind =
  | 'connecting'
  | 'offline'
  | 'requested'
  | 'requested_offline';
type Lang = 'en' | 'bn';

const MESSAGES: Record<Lang, Record<HandoffKind, string>> = {
  en: {
    connecting:
      "I'm not sure about this one, so I'm connecting you with a team member. They'll see our chat, so you won't need to repeat yourself.",
    offline:
      "I'm not sure about this one, and our team is offline right now. Leave your email or phone number and we'll reply as soon as we're back.",
    requested: "Sure, I'm connecting you with a team member now.",
    requested_offline:
      "Our team is offline right now. Leave your email or phone number and we'll reply as soon as we're back.",
  },
  bn: {
    connecting:
      'আমি এ বিষয়ে নিশ্চিত নই, তাই আপনাকে আমাদের একজন টিম সদস্যের সাথে যুক্ত করছি। তিনি আমাদের চ্যাট দেখতে পাবেন, তাই আপনাকে আবার সব বলতে হবে না।',
    offline:
      'আমি এ বিষয়ে নিশ্চিত নই, আর আমাদের টিম এখন অফলাইনে আছে। আপনার ইমেইল বা ফোন নম্বর দিন, আমরা ফিরে এসেই উত্তর দেব।',
    requested:
      'অবশ্যই, আমি এখন আপনাকে আমাদের একজন টিম সদস্যের সাথে যুক্ত করছি।',
    requested_offline:
      'আমাদের টিম এখন অফলাইনে আছে। আপনার ইমেইল বা ফোন নম্বর দিন, আমরা ফিরে এসেই উত্তর দেব।',
  },
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

/** Replies in Bangla when the customer wrote in Bangla, otherwise English. */
export function handoffMessage(
  reason: EscalationReason,
  agentsOnline: number,
  customerText: string,
): string {
  const lang: Lang = /[\u0980-\u09FF]/.test(customerText) ? 'bn' : 'en';
  return MESSAGES[lang][pickHandoffKind(reason, agentsOnline)];
}

/**
 * Narrow on purpose: "Do you work with shipping agents?" must NOT trigger a handoff.
 * The widget's "Talk to human" button (`requestHuman: true`) is the primary path.
 */
export function wantsHuman(text: string): boolean {
  return /\b(talk|speak|chat|connect)\b.{0,25}\b(human|person|agent|someone|representative)\b|\b(real person|human agent|live agent)\b/i.test(
    text,
  );
}

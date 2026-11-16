import { BadRequestException } from '@nestjs/common';
import { ConversationStatus } from '../../common/enums/conversation-status.enum';

const ALLOWED_TRANSITIONS: Record<ConversationStatus, ConversationStatus[]> = {
  [ConversationStatus.BOT]: [
    ConversationStatus.BOT,
    ConversationStatus.WAITING,
    ConversationStatus.CLOSED,
  ],
  [ConversationStatus.WAITING]: [
    ConversationStatus.WAITING,
    ConversationStatus.HUMAN,
    ConversationStatus.CLOSED,
  ],
  [ConversationStatus.HUMAN]: [
    ConversationStatus.HUMAN,
    ConversationStatus.CLOSED,
  ],
  [ConversationStatus.CLOSED]: [],
};

/**
 * State Machine Pattern (Tech Decisions Section 3 & PRD FR-5):
 * Governs all conversation lifecycle transitions:
 *   `bot` -> `waiting` -> `human` -> `closed`
 * Prevents illegal transitions (such as claiming or replying to a closed conversation)
 * and centralizes the rule that the bot stays silent during `waiting` and `human` states.
 */
export class ConversationStateMachine {
  static canTransition(
    from: ConversationStatus,
    to: ConversationStatus,
  ): boolean {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    return allowed.includes(to);
  }

  static assertTransition(
    from: ConversationStatus,
    to: ConversationStatus,
  ): ConversationStatus {
    if (!ConversationStateMachine.canTransition(from, to)) {
      throw new BadRequestException(
        `Invalid conversation state transition from '${from}' to '${to}'`,
      );
    }
    return to;
  }

  /**
   * FR-5: The bot stays silent while an agent owns or is queued for the chat.
   */
  static isBotMuted(status: ConversationStatus): boolean {
    return (
      status === ConversationStatus.WAITING ||
      status === ConversationStatus.HUMAN
    );
  }
}

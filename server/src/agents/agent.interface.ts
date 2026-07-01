import type { ConversationContext, Intervention } from '../../../shared/src/types.js';

export interface Agent {
  readonly id: string;
  readonly name: string;

  /** מאזין לשיחה ומעדכן את ה-context הפנימי */
  listen(context: ConversationContext): Promise<void>;

  /** מחליט האם ואיך להתערב */
  decide(): Promise<Intervention | null>;

  /** אתחול הסוכן עם context התחלתי */
  init(sessionId: string): Promise<void>;
}

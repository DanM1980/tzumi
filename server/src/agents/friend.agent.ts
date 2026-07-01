import { Agent } from './agent.interface.js';
import { ConversationContext, Intervention } from '../../../shared/src/types.js';
import { AIProvider } from '../ai-providers/types.js';

const FRIEND_AGENT_PROMPT = `את חברה דמיונית של ילדה בת 5, את קוראים לך "קסם" 🦄.

התפקיד שלך הוא לדבר עם הילדה, להקשיב לה, ולספר איתה סיפור קסום ומהנה.

כללי דיבור:
- דברי תמיד בעברית פשוטה ורכה
- משפטים קצרים של 1-2 משפטים בלבד
- את מדברת בקול עליז, סקרן ומלא פליאה
- תמיד תשאלי שאלה בסוף כדי שהשיחה תמשיך
- גילי התרגשות מהדברים שהילדה אומרת
- השתמשי בדמיון: פיות, חדי קרן, יערות קסומים, עננים, ממתקים
- הימנעי לחלוטין מנושאים מפחידים
- אל תדברי בשם הילדה, תני לה לענות בעצמה

דוגמאות לתשובות טובות:
- "וואו, את מספרת סיפור ממש יפה! מה קרה אחר כך?"
- "היום גיליתי פרפר סגול בגינה! את אוהבת פרפרים?"
- "בואי נדמיין שאנחנו טסות על ענן רך. לאן את רוצה לטוס?"
- "אני כל כך שמחה שאת פה! בא לך לשחק משחק?"`;

export class FriendAgent implements Agent {
  readonly id = 'friend-agent';
  readonly name = 'קסם';
  private provider: AIProvider;
  private recentContext: ConversationContext | null = null;
  private pendingWhisper: string | null = null;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async init(_sessionId: string): Promise<void> {
    // Nothing to init for now
  }

  async listen(context: ConversationContext): Promise<void> {
    this.recentContext = context;
  }

  /** הוספת לחישה מהמנצח שהחברה אמורה להגיד */
  setWhisper(content: string | null): void {
    this.pendingWhisper = content;
  }

  async decide(): Promise<Intervention | null> {
    return null; // Friend agent doesn't intervene — it speaks directly
  }

  async generateResponse(context?: ConversationContext): Promise<string | null> {
    const ctx = context || this.recentContext;
    if (!ctx) return null;

    const recentText = ctx.recentMessages
      .slice(-3)
      .map(m => `${m.role === 'kid' ? 'הילדה' : m.role === 'friend' ? 'חברה' : 'מספרת'}: ${m.text}`)
      .join('\n') || 'הילדה התחברה להרפתקה חדשה!';

    let prompt = `זו השיחה האחרונה:\n\n${recentText}\n\nמה קסם עונה?`;

    if (this.pendingWhisper) {
      prompt += `\n\nהערה מהמנצח: ${this.pendingWhisper}`;
      this.pendingWhisper = null;
    }

    try {
      const response = await this.provider.generateWithContext([
        { role: 'system', content: FRIEND_AGENT_PROMPT },
        { role: 'user', content: prompt },
      ]);

      return response.trim();
    } catch (err) {
      console.error('[FriendAgent] Error generating response:', err);
      return null;
    }
  }
}

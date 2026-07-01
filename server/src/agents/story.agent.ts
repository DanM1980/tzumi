import { Agent } from './agent.interface.js';
import { ConversationContext, Intervention } from '../../../shared/src/types.js';
import { AIProvider } from '../ai-providers/types.js';

const STORY_AGENT_PROMPT = `אתה סוכן עלילה לילדה בת 5.
התפקיד שלך הוא להקשיב לשיחה בין הילדה לחבר הדמיוני שלה,
ולהציע כיווני עלילה חדשים ומעניינים.

כללי עבודה:
- הצע רעיונות פשוטים, קסומים, צבעוניים
- השתמש בדמיון עשיר: דרקונים, יערות קסומים, כוכבים מדברים, ממתקים
- הימנע מנושאים מפחידים, אלימים או מבלבלים
- שמור על משפטים קצרים וברורים
- הצע 1-2 רעיונות בודדים בכל התערבות, לא יותר
- אם הילדה כבר באמצע סיפור טוב - תן לו להתפתח, אל תפריע

פורמט תשובה:
הצעה: <תיאור קצר של ההמשך>
דחיפות: 1-5`;

export class StoryAgent implements Agent {
  readonly id = 'story-agent';
  readonly name = 'סוכן עלילה';
  private provider: AIProvider;
  private recentContext: ConversationContext | null = null;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async init(_sessionId: string): Promise<void> {
    // Nothing to init for now
  }

  async listen(context: ConversationContext): Promise<void> {
    this.recentContext = context;
  }

  async decide(): Promise<Intervention | null> {
    if (!this.recentContext) return null;

    const recentText = this.recentContext.recentMessages
      .slice(-5)
      .map(m => `${m.role}: ${m.text}`)
      .join('\n');

    const prompt = `זו השיחה האחרונה בין הילדה לחבר:\n\n${recentText}\n\nמה אתה מציע?`;

    try {
      const response = await this.provider.generateWithContext([
        { role: 'system', content: STORY_AGENT_PROMPT },
        { role: 'user', content: prompt },
      ]);

      // Parse the response
      const suggestionMatch = response.match(/הצעה:\s*(.+)/);
      const priorityMatch = response.match(/דחיפות:\s*(\d)/);

      if (!suggestionMatch) return null;

      const priority = priorityMatch ? parseInt(priorityMatch[1], 10) : 3;
      const content = suggestionMatch[1].trim();

      return {
        agentId: this.id,
        agentName: this.name,
        priority: Math.min(priority, 5),
        content,
        type: 'narrative',
        scheduling: priority >= 4 ? 'interrupt' : 'silent',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}

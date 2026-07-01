import type { ConversationContext, Intervention } from '../../../shared/src/types.js';
import { AIProvider } from '../ai-providers/types.js';

const CONDUCTOR_PROMPT = `אתה המנצח. התפקיד שלך הוא לנהל את השיחה בין הילדה לחבר הדמיוני שלה.

אתה מקבל הצעות מסוכנים שונים (עלילה, ציור, וכו') ומההורה החי.
ההחלטה שלך: האם ללחוש משהו לחבר, ואם כן — מה בדיוק.

כללים:
- אל תפריע לחבר באמצע משפט אלא אם יש סיבה ממש טובה
- תעדף סוכנים בדחיפות גבוהה
- אם ההורה שלח הוראה — היא תמיד קודמת
- שמור על שפה מותאמת לגיל 5
- תן עדיפות להצעות שמפתחות את הסיפור קדימה`;

export class Conductor {
  private provider: AIProvider;
  private pendingInterventions: Intervention[] = [];
  private lastWhisperTime = 0;
  private readonly COOLDOWN_MS = 3000; // מינימום 3 שניות בין לחישות

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  addIntervention(intervention: Intervention): void {
    this.pendingInterventions.push(intervention);
  }

  addParentInstruction(text: string): void {
    this.pendingInterventions.push({
      agentId: 'parent',
      agentName: 'הורה',
      priority: 5, // highest
      content: text,
      type: 'instruction',
      scheduling: 'interrupt',
      timestamp: new Date().toISOString(),
    });
  }

  async decide(context: ConversationContext): Promise<Intervention | null> {
    const now = Date.now();
    if (now - this.lastWhisperTime < this.COOLDOWN_MS) return null;
    if (this.pendingInterventions.length === 0) return null;

    // Sort by priority (highest first)
    this.pendingInterventions.sort((a, b) => b.priority - a.priority);
    const top = this.pendingInterventions.shift()!;

    // If from parent or high priority, pass through
    if (top.agentId === 'parent' || top.priority >= 4) {
      this.lastWhisperTime = now;
      return {
        ...top,
        scheduling: 'interrupt',
      };
    }

    // Otherwise, ask Conductor AI if this should be whispered
    const recentText = context.recentMessages
      .slice(-3)
      .map(m => `${m.role}: ${m.text}`)
      .join('\n');

    const prompt = `השיחה האחרונה:\n${recentText}\n\nהצעה שהתקבלה:\nסוכן: ${top.agentName}\nתוכן: ${top.content}\n\nהאם ללחוש את זה לחבר? (כן/לא)`;

    try {
      const response = await this.provider.generateWithContext([
        { role: 'system', content: CONDUCTOR_PROMPT },
        { role: 'user', content: prompt },
      ]);

      if (response.includes('כן') || response.includes('yes')) {
        this.lastWhisperTime = now;
        return top;
      }
    } catch {
      // On error, don't send anything
    }

    return null;
  }

  clearPending(): void {
    this.pendingInterventions = [];
  }
}

// AI Provider Layer — Abstract Interface
// כל ספק AI ממשק את הממשק הזה

export interface AIProviderConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIProvider {
  /** שליחת prompt לקבלת טקסט */
  generateText(prompt: string, systemPrompt?: string): Promise<string>;

  /** שליחת prompt עם context (היסטוריית שיחה) */
  generateWithContext(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  ): Promise<string>;

  /** בדיקת תקינות החיבור */
  healthCheck(): Promise<boolean>;
}

import { GoogleGenAI } from '@google/genai';
import { AIProvider, AIProviderConfig } from './types.js';

export class GeminiProvider implements AIProvider {
  private config: AIProviderConfig;
  private client: GoogleGenAI;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await this.client.models.generateContent({
      model: this.config.model,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        temperature: this.config.temperature ?? 0.7,
        maxOutputTokens: this.config.maxTokens ?? 1024,
      },
    });

    return response.text || '';
  }

  async generateWithContext(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  ): Promise<string> {
    const systemMsg = messages.find(m => m.role === 'system');

    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: m.content }],
      }));

    const response = await this.client.models.generateContent({
      model: this.config.model,
      contents,
      config: {
        systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
        temperature: this.config.temperature ?? 0.7,
        maxOutputTokens: this.config.maxTokens ?? 1024,
      },
    });

    return response.text || '';
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.generateText('Say "ok"');
      return res.length > 0;
    } catch {
      return false;
    }
  }
}

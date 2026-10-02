import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

export type AIProviderType = 'gemini' | 'deepseek' | 'openai';

export interface MessageInput {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface AIResponse {
  content: string | null;
  toolCalls?: ToolCallResult[];
}

export class AIProviderFactory {
  private static geminiClient: GoogleGenAI | null = null;
  private static openaiClient: OpenAI | null = null;
  private static deepseekClient: OpenAI | null = null;

  static getProviderType(): AIProviderType {
    const provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();
    if (provider === 'gemini') return 'gemini';
    if (provider === 'openai') return 'openai';
    return 'deepseek';
  }

  static getGeminiClient(): GoogleGenAI {
    if (!this.geminiClient) {
      const apiKey = process.env.GEMINI_API_KEY || '';
      this.geminiClient = new GoogleGenAI({ apiKey });
    }
    return this.geminiClient;
  }

  static getDeepSeekClient(): OpenAI {
    if (!this.deepseekClient) {
      this.deepseekClient = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '',
        baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      });
    }
    return this.deepseekClient;
  }

  static getOpenAIClient(): OpenAI {
    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || '',
      });
    }
    return this.openaiClient;
  }
}

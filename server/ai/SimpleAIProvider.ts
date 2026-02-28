import type { AIProvider, AIResponse } from "./types.js";

export class SimpleAIProvider implements AIProvider {
  async respond(_userId: string, message: string): Promise<AIResponse> {
    return {
      content: `AI received: "${message}". This is a placeholder response. Replace with your AI logic.`,
    };
  }
}

import type { AIProvider } from "./types";
import { SimpleAIProvider } from "./SimpleAIProvider";

let aiProvider: AIProvider = new SimpleAIProvider();

export function setAIProvider(provider: AIProvider): void {
  aiProvider = provider;
}

export function getAIProvider(): AIProvider {
  return aiProvider;
}

export type { AIProvider, AIResponse } from "./types.js";

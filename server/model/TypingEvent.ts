import type { TypingEvent as ITypingEvent } from "./types.js";

export function createTypingEvent(
  userId: string,
  partnerId: string,
  isTyping: boolean
): ITypingEvent {
  return {
    userId,
    partnerId,
    isTyping,
    timestamp: Date.now(),
  };
}

export function getTypingKey(userId: string, partnerId: string): string {
  return [userId, partnerId].sort().join(":");
}

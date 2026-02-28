import type { Conversation as IConversation, Message, ChatMode } from "./types.js";

const CONVERSATION_ID_PREFIX = "conv_";

let conversationIdCounter = 0;

export function createConversation(
  participantIds: [string, string],
  mode: ChatMode = "human"
): IConversation {
  const sorted = [...participantIds].sort();
  return {
    conversationId: `${CONVERSATION_ID_PREFIX}${Date.now()}_${++conversationIdCounter}`,
    participantIds: sorted as [string, string],
    mode,
    messages: [],
    createdAt: Date.now(),
  };
}

export function addMessageToConversation(
  conversation: IConversation,
  message: Message
): IConversation {
  return {
    ...conversation,
    messages: [...conversation.messages, message],
  };
}

export function getConversationKey(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join(":");
}

export type MessageFrom = "human" | "ai";

export type ChatMode = "human" | "ai";

export interface User {
  userId: string;
  connectedAt: number;
}

export interface Message {
  messageId: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: number;
  from: MessageFrom;
}

export interface Conversation {
  conversationId: string;
  participantIds: [string, string];
  mode: ChatMode;
  messages: Message[];
  createdAt: number;
}

export interface TypingEvent {
  userId: string;
  partnerId: string;
  isTyping: boolean;
  timestamp: number;
}

export interface WsPayload<T = unknown> {
  event: string;
  data?: T;
}

export interface AuthPayload {
  userId: string;
}

export interface MessageSendPayload {
  receiverId: string;
  content: string;
}

export interface ModeSwitchPayload {
  conversationId: string;
  mode: "human" | "ai";
  peerId?: string;
}

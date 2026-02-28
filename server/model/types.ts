export type MessageFrom = "human" | "ai";

export type ChatMode = "human" | "ai";

export type UserPresenceStatus = "online" | "offline" | "away";

export interface User {
  userId: string;
  connectedAt: number;
  lastSeenAt?: number;
  status?: UserPresenceStatus;
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

export interface TypingStartPayload {
  partnerId: string;
}

export interface TypingStopPayload {
  partnerId: string;
  content?: string;
}

export interface PresenceOnlineUsersPayload {
  users: string[];
}

export interface PresenceUserOnlinePayload {
  userId: string;
  timestamp: number;
}

export interface PresenceUserOfflinePayload {
  userId: string;
  timestamp: number;
}

export interface TypingIndicatorPayload {
  userId: string;
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

export interface PresenceGetOnlinePayload {
  // Empty payload for requesting online users
}

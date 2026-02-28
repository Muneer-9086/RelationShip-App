import type {
  TypingIndicatorPayload,
  PresenceOnlineUsersPayload,
  PresenceUserOnlinePayload,
  PresenceUserOfflinePayload,
  AuthResponsePayload,
  MessageReceivePayload,
  ErrorPayload,
} from "@/types/chat";

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `ws://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:3000`;

export type WsEvent =
  | "auth"
  | "message:send"
  | "message:receive"
  | "typing:start"
  | "typing:stop"
  | "ai:message"
  | "ai:token"
  | "ai:done"
  | "ai:stream_start"
  | "ai:aborted"
  | "ai:error"
  | "ai:stop"
  | "ai:stopped"
  | "mode:switch"
  | "disconnect"
  | "connected"
  | "error"
  | "ping"
  | "pong"
  | "presence:online_users"
  | "presence:user_online"
  | "presence:user_offline"
  | "presence:get_online"
  | "connection:state"
  | "*";

export interface WsPayload<T = unknown> {
  event: string;
  data?: T;
}

export interface BackendMessage {
  messageId: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: number;
  from: "human" | "ai";
}

export interface MessageReceiveData {
  message: BackendMessage;
  conversationId: string;
  status?: string;
}

export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "offline";

export const AI_USER_ID = "__ai__";

// Event handler types for type-safe event handling
export type WsEventHandlers = {
  "auth": (data: AuthResponsePayload) => void;
  "message:receive": (data: MessageReceivePayload) => void;
  "typing:start": (data: TypingIndicatorPayload) => void;
  "typing:stop": (data: TypingIndicatorPayload) => void;
  "presence:online_users": (data: PresenceOnlineUsersPayload) => void;
  "presence:user_online": (data: PresenceUserOnlinePayload) => void;
  "presence:user_offline": (data: PresenceUserOfflinePayload) => void;
  "error": (data: ErrorPayload) => void;
  "connected": (data: { message: string }) => void;
  "connection:state": (state: ConnectionState) => void;
  "ai:token": (data: { chunk: string }) => void;
  "ai:done": (data: { ai: string }) => void;
  "mode:switch": (data: { conversationId: string; mode: "human" | "ai" }) => void;
  "*": (data: { event: string; data: unknown }) => void;
};

export class WsClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  private url: string;

  private state: ConnectionState = "idle";
  private reconnectAttempts = 0;
  private reconnectTimer?: number;

  private authUserId?: string;
  private messageQueue: WsPayload[] = [];

  private heartbeatInterval?: number;

  constructor(url = WS_URL) {
    this.url = url;
  }

  async connect(): Promise<void> {
    if (this.state === "connecting" || this.state === "connected") return;

    this.setState(this.reconnectAttempts ? "reconnecting" : "connecting");

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setState("connected");

        this.startHeartbeat();
        this.reAuth();
        this.flushQueue();

        resolve();
      };

      this.ws.onerror = reject;

      this.ws.onclose = () => {
        this.cleanup();
        this.scheduleReconnect();
      };

      this.ws.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data) as WsPayload;
          this.emit(payload.event, payload.data);
        } catch {
          // Ignore parse errors
        }
      };
    });
  }

  private scheduleReconnect(): void {
    this.setState("reconnecting");

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15000);
    this.reconnectAttempts++;

    this.reconnectTimer = window.setTimeout(() => {
      this.connect().catch(() => {
        // Silent catch, will retry via scheduleReconnect
      });
    }, delay);
  }

  auth(userId: string): void {
    this.authUserId = userId;
    this.send("auth", { userId });
  }

  sendMessage(receiverId: string, content: string): void {
    this.send("message:send", { receiverId, content });
  }

  sendMessageAI(receiver: string, content: string): void {
    this.send("ai:message", { receiver, content });
  }

  typingStart(partnerId: string): void {
    this.send("typing:start", { partnerId });
  }

  typingStop(partnerId: string, content: string): void {
    this.send("typing:stop", { partnerId, content });
  }

  switchMode(conversationId: string, mode: "human" | "ai", peerId?: string): void {
    this.send("mode:switch", { conversationId, mode, peerId });
  }

  // Presence methods
  requestOnlineUsers(): void {
    this.send("presence:get_online", {});
  }

  private reAuth(): void {
    if (this.authUserId) {
      this.send("auth", { userId: this.authUserId });
    }
  }

  send<T>(event: string, data?: T): void {
    const payload = { event, data };

    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.messageQueue.push(payload);
      return;
    }

    this.ws.send(JSON.stringify(payload));
  }

  private flushQueue(): void {
    while (this.messageQueue.length && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(this.messageQueue.shift()));
    }
  }

  /* ---------------- HEARTBEAT ---------------- */

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = window.setInterval(() => {
      this.send("ping");
    }, 20000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  /* ---------------- DISCONNECT ---------------- */

  disconnect(): void {
    this.stopHeartbeat();
    this.setState("offline");
    this.ws?.close();
    this.ws = null;
  }

  private cleanup(): void {
    this.stopHeartbeat();
    this.ws = null;
  }

  /* ---------------- EVENTS ---------------- */

  // Type-safe event handler registration
  on<K extends keyof WsEventHandlers>(event: K, handler: WsEventHandlers[K]): () => void;
  on(event: string, handler: (data: unknown) => void): () => void;
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((h) => h(data));
    this.listeners.get("*")?.forEach((h) => h({ event, data }));
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.emit("connection:state", state);
  }

  isConnected(): boolean {
    return this.state === "connected";
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }
}

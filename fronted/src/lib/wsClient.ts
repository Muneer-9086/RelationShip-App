const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `ws://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:3000`;

export type WsEvent =
  | "auth"
  | "message:send"
  | "message:receive"
  | "typing:start"
  | "ai:message"
  | "typing:stop"
  | "mode:switch"
  | "disconnect"
  | "connected"
  | "error"
  | "ai:token";

export interface WsPayload<T = unknown>
{
  event: string;
  data?: T;
}

export interface BackendMessage
{
  messageId: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: number;
  from: "human" | "ai";
}

export interface MessageReceiveData
{
  message: BackendMessage;
  conversationId: string;
  status?: string;
}

type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "offline";

export const AI_USER_ID = "__ai__";

export class WsClient
{
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  private url: string;

  private state: ConnectionState = "idle";
  private reconnectAttempts = 0;
  private reconnectTimer?: number;

  private authUserId?: string;
  private messageQueue: WsPayload[] = [];

  private heartbeatInterval?: number;

  constructor(url = WS_URL)
  {
    this.url = url;
  }

  async connect(): Promise<void>
  {
    if (this.state === "connecting" || this.state === "connected") return;

    this.setState(this.reconnectAttempts ? "reconnecting" : "connecting");

    return new Promise((resolve, reject) =>
    {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () =>
      {
        this.reconnectAttempts = 0;
        this.setState("connected");

        this.startHeartbeat();
        this.reAuth();
        this.flushQueue();

        resolve();
      };

      this.ws.onerror = reject;

      this.ws.onclose = () =>
      {
        this.cleanup();
        this.scheduleReconnect();
      };

      this.ws.onmessage = (e) =>
      {
        try {
          const payload = JSON.parse(e.data) as WsPayload;
          this.emit(payload.event, payload.data);
        } catch { }
      };
    });
  }


  private scheduleReconnect()
  {
    this.setState("reconnecting");

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15000);
    this.reconnectAttempts++;

    this.reconnectTimer = window.setTimeout(() =>
    {
      this.connect().catch(() => { });
    }, delay);
  }

  auth(userId: string)
  {
    this.authUserId = userId;
    this.send("auth", { userId });
  }
  sendMessage(receiverId: string, content: string): void
  {

    this.send("message:send", { receiverId, content });
  }

  sendMessageAI(receiver: string, content:string): void
  {
    this.send("ai:message", {
      receiver,content
    })
  }
  

  typingStart(partnerId: string): void
  {
    this.send("typing:start", {
      partnerId,
     });
  }

  typingStop(partnerId: string,content:string): void
  {
    this.send("typing:stop", { partnerId,content });
  }

  switchMode(conversationId: string, mode: "human" | "ai", peerId?: string): void
  {
    this.send("mode:switch", { conversationId, mode, peerId });
  }


  private reAuth()
  {
    if (this.authUserId) {
      this.send("auth", { userId: this.authUserId });
    }
  }


  send<T>(event: string, data?: T)
  {
    const payload = { event, data };

    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.messageQueue.push(payload);
      return;
    }

    this.ws.send(JSON.stringify(payload));
  }

  private flushQueue()
  {
    while (this.messageQueue.length && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(this.messageQueue.shift()));
    }
  }

  /* ---------------- HEARTBEAT ---------------- */

  private startHeartbeat()
  {
    this.stopHeartbeat();

    this.heartbeatInterval = window.setInterval(() =>
    {
      this.send("ping");
    }, 20000);
  }

  private stopHeartbeat()
  {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  /* ---------------- DISCONNECT ---------------- */

  disconnect()
  {
    this.stopHeartbeat();
    this.setState("offline");
    this.ws?.close();
    this.ws = null;
  }

  private cleanup()
  {
    this.stopHeartbeat();
    this.ws = null;
  }

  /* ---------------- EVENTS ---------------- */

  on(event: string, handler: (data: unknown) => void)
  {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  private emit(event: string, data: unknown)
  {
    this.listeners.get(event)?.forEach((h) => h(data));
    this.listeners.get("*")?.forEach((h) => h({ event, data }));
  }

  private setState(state: ConnectionState)
  {
    this.state = state;
    this.emit("connection:state", state);
  }

  isConnected()
  {
    return this.state === "connected";
  }
}

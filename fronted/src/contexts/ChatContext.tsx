import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { WsClient, AI_USER_ID, type ConnectionState } from "@/lib/wsClient";
import type { 
  Conversation, 
  Message, 
  User,
  TypingIndicatorPayload,
  PresenceOnlineUsersPayload,
  PresenceUserOnlinePayload,
  PresenceUserOfflinePayload,
  AuthResponsePayload,
  MessageReceivePayload,
} from "@/types/chat";
import type {
  ContentFlaggedPayload,
  ContentBlockedPayload,
  PatternAlertPayload,
  PatternAlert,
  ContentDetectionResult,
} from "@/lib/wsClient";

function backendToFrontendMessage(m: {
  messageId: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: number;
  from: "human" | "ai";
}): Message {
  return {
    id: m.messageId,
    senderId: m.senderId,
    content: m.content,
    timestamp: new Date(m.timestamp),
    type: m.from === "ai" ? "ai" : "user",
  };
}

function getPeerDisplayName(peerId: string): string {
  if (peerId === AI_USER_ID) return "MindfulAI";
  return peerId;
}

interface TypingState {
  [userId: string]: {
    isTyping: boolean;
    timestamp: number;
  };
}

interface ContentAlert {
  id: string;
  type: "flagged" | "blocked" | "pattern";
  messageId?: string;
  conversationId?: string;
  detection?: ContentDetectionResult;
  reason?: string;
  suggestions: string[];
  patternAlerts?: PatternAlert[];
  timestamp: number;
}

interface ChatContextValue {
  client: WsClient;
  userId: string | null;
  isConnected: boolean;
  connectionState: ConnectionState;
  isAuthenticated: boolean;
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  activeConversationId: string | null;
  typingFrom: TypingState;
  onlineUsers: string[];
  contentAlerts: ContentAlert[];
  connect: (userId: string) => void;
  disconnect: () => void;
  selectConversation: (id: string | null) => void;
  sendMessage: (receiverId: Record<string, unknown>, content: string) => void;
  switchMode: (conversationId: string, mode: "human" | "ai", peerId?: string) => void;
  startTyping: (partnerId: string) => void;
  stopTyping: (partnerId: string, content: string) => void;
  getOrCreateConversation: (data: Record<string, unknown>) => Conversation;
  userListData: User[];
  setUserListData: React.Dispatch<React.SetStateAction<User[]>>;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  setShowInsights: React.Dispatch<React.SetStateAction<boolean>>;
  showInsights: boolean;
  sendMessageAI: (receiverId: string, content: string) => void;
  stopAIStream: (receiverId: string) => void;
  isUserOnline: (userId: string) => boolean;
  getTypingUsers: (conversationId: string) => string[];
  dismissContentAlert: (alertId: string) => void;
  clearContentAlerts: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const STORAGE_KEY = "mindfulchat-userid";

export function ChatProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef(new WsClient());
  const [userId, setUserId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  );
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [userListData, setUserListData] = useState<User[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [typingFrom, setTypingFrom] = useState<TypingState>({});
  const [contentAlerts, setContentAlerts] = useState<ContentAlert[]>([]);
  const convMapRef = useRef<Map<string, Conversation>>(new Map());

  const getConversationKey = useCallback((uid: string, peerId: string) => {
    return [uid, peerId].sort().join(":");
  }, []);

  // Helper to check if a user is online
  const isUserOnline = useCallback((checkUserId: string): boolean => {
    return onlineUsers.includes(checkUserId);
  }, [onlineUsers]);

  // Helper to get typing users for a conversation
  const getTypingUsers = useCallback((conversationId: string): string[] => {
    return Object.entries(typingFrom)
      .filter(([_, state]) => state.isTyping)
      .map(([id]) => id);
  }, [typingFrom]);

  const getOrCreateConversation = useCallback(
    (data: Record<string, unknown>): Conversation => {
      if (!userId) throw new Error("Not authenticated");
      const key = getConversationKey(userId, data['_id'] as string);
      const peerId = data['_id'] as string;
      
      // Check convMapRef first
      let conv = convMapRef.current.get(key);
      if (conv) return conv;
      
      const name = data['fullName'] as string;
      const peerOnline = onlineUsers.includes(peerId);
      
      conv = {
        id: key,
        name,
        type: "direct",
        participants: [
          { id: userId, name: "You", status: "online" },
          {
            id: peerId,
            name,
            status: peerId === AI_USER_ID ? "online" : (peerOnline ? "online" : "offline"),
          },
        ],
        messages: [],
        unreadCount: 0,
        aiEnabled: peerId === AI_USER_ID,
        aiParticipant: peerId === AI_USER_ID,
      };
      
      convMapRef.current.set(key, conv);
      setConversations((prev) => {
        if (prev.some((c) => c.id === key)) return prev;
        return [...prev, conv!];
      });
      return conv;
    },
    [userId, getConversationKey, onlineUsers]
  );

  const connect = useCallback(
    async (uid: string) => {
      const client = clientRef.current;

      if (isConnected && userId === uid) {
        return;
      }

      if (client.isConnected?.()) {
        setIsConnected(true);
        setUserId(uid);
        return;
      }

      try {
        await client.connect();
        client.auth(uid);

        localStorage.setItem(STORAGE_KEY, uid);
        setUserId(uid);
        setIsConnected(true);
      } catch (err) {
        console.error("Connect failed:", err);
        setIsConnected(false);
      }
    },
    [isConnected, userId]
  );

  const disconnect = useCallback(() => {
    clientRef.current.disconnect();
    setUserId(null);
    setIsConnected(false);
    setIsAuthenticated(false);
    setConversations([]);
    setActiveConversationId(null);
    setOnlineUsers([]);
    setTypingFrom({});
    setContentAlerts([]);
    convMapRef.current.clear();
  }, []);

  // Update participant status when online users change
  useEffect(() => {
    setConversations((prev) =>
      prev.map((conv) => ({
        ...conv,
        participants: conv.participants.map((p) => ({
          ...p,
          status: p.id === userId 
            ? "online" 
            : p.id === AI_USER_ID 
              ? "online" 
              : (onlineUsers.includes(p.id) ? "online" : "offline"),
        })),
      }))
    );
  }, [onlineUsers, userId]);

  useEffect(() => {
    const client = clientRef.current;

    // Connection state listener
    const unsubConnState = client.on("connection:state", (state: ConnectionState) => {
      setConnectionState(state);
      setIsConnected(state === "connected");
    });

    // Auth listener
    const unsubAuth = client.on("auth", (data: unknown) => {
      const d = data as AuthResponsePayload;
      setIsAuthenticated(!!d?.success);
    });

    // Message receive listener
    const unsubMsg = client.on("message:receive", (data: unknown) => {
      const payload = data as MessageReceivePayload & { status?: string };

      if (payload?.status === 'blocked') {
        setShowInsights(true);
        return;
      }

      const { message, conversationId } = payload;
      if (!message || !userId) return;
      
      const peerId = message.senderId === userId ? message.receiverId : message.senderId;
      const key = getConversationKey(userId, peerId);
      const frontendMsg = backendToFrontendMessage(message);

      setConversations((prev) => {
        // Find existing conversation
        const existingConvIndex = prev.findIndex((c) => c.id === key);
        
        if (existingConvIndex >= 0) {
          // Update existing conversation
          const existingConv = prev[existingConvIndex];
          
          // Check if message already exists (prevent duplicates)
          const messageExists = existingConv.messages.some(m => m.id === frontendMsg.id);
          if (messageExists) {
            return prev;
          }
          
          const updatedConv = {
            ...existingConv,
            messages: [...existingConv.messages, frontendMsg],
            backendConversationId: conversationId ?? existingConv.backendConversationId,
          };
          
          // Update convMapRef
          convMapRef.current.set(key, updatedConv);
          
          // Return new array with updated conversation
          const newConvs = [...prev];
          newConvs[existingConvIndex] = updatedConv;
          return newConvs;
        } else {
          // Create new conversation
          const newConv: Conversation = {
            id: key,
            name: getPeerDisplayName(peerId),
            type: "direct",
            participants: [
              { id: userId, name: "You", status: "online" },
              {
                id: peerId,
                name: getPeerDisplayName(peerId),
                status: peerId === AI_USER_ID ? "online" : (onlineUsers.includes(peerId) ? "online" : "offline"),
              },
            ],
            messages: [frontendMsg],
            unreadCount: 0,
            aiEnabled: peerId === AI_USER_ID,
            aiParticipant: peerId === AI_USER_ID,
            backendConversationId: conversationId,
          };
          
          convMapRef.current.set(key, newConv);
          return [...prev, newConv];
        }
      });
    });

    // Typing start listener
    const unsubTypingStart = client.on("typing:start", (data: unknown) => {
      const d = data as TypingIndicatorPayload;
      if (d?.userId) {
        setTypingFrom((t) => ({
          ...t,
          [d.userId]: { isTyping: true, timestamp: d.timestamp || Date.now() },
        }));
      }
    });

    // Typing stop listener
    const unsubTypingStop = client.on("typing:stop", (data: unknown) => {
      const d = data as TypingIndicatorPayload;
      if (d?.userId) {
        setTypingFrom((t) => ({
          ...t,
          [d.userId]: { isTyping: false, timestamp: d.timestamp || Date.now() },
        }));
      }
    });

    // Presence: online users list
    const unsubPresenceOnline = client.on("presence:online_users", (data: unknown) => {
      const d = data as PresenceOnlineUsersPayload;
      if (d?.users) {
        setOnlineUsers(d.users);
      }
    });

    // Presence: user came online
    const unsubUserOnline = client.on("presence:user_online", (data: unknown) => {
      const d = data as PresenceUserOnlinePayload;
      if (d?.userId) {
        setOnlineUsers((prev) => {
          if (prev.includes(d.userId)) return prev;
          return [...prev, d.userId];
        });
      }
    });

    // Presence: user went offline
    const unsubUserOffline = client.on("presence:user_offline", (data: unknown) => {
      const d = data as PresenceUserOfflinePayload;
      if (d?.userId) {
        setOnlineUsers((prev) => prev.filter((id) => id !== d.userId));
        // Also clear typing state for this user
        setTypingFrom((t) => {
          const newState = { ...t };
          delete newState[d.userId];
          return newState;
        });
      }
    });

    // Mode switch listener
    const unsubModeSwitch = client.on("mode:switch", (data: unknown) => {
      const d = data as { conversationId?: string; mode?: "human" | "ai" };
      if (!d?.conversationId) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === d.conversationId
            ? {
                ...c,
                aiEnabled: d.mode === "ai",
                aiParticipant: d.mode === "ai",
              }
            : c
        )
      );
    });

    // AI token listener (for streaming)
    const unsubAiToken = client.on("ai:token", () => {
      // Handle AI token streaming if needed
    });

    // Content flagged listener (user-isolated: only sender receives this)
    const unsubContentFlagged = client.on("content:flagged", (data: unknown) => {
      const d = data as ContentFlaggedPayload;
      if (d?.messageId) {
        const alert: ContentAlert = {
          id: `flagged-${d.messageId}-${Date.now()}`,
          type: "flagged",
          messageId: d.messageId,
          conversationId: d.conversationId,
          detection: d.detection,
          suggestions: d.detection?.suggestions || [],
          timestamp: d.timestamp || Date.now()
        };
        setContentAlerts((prev) => [...prev.slice(-19), alert]); // Keep last 20
      }
    });

    // Content blocked listener (user-isolated: only sender receives this)
    const unsubContentBlocked = client.on("content:blocked", (data: unknown) => {
      const d = data as ContentBlockedPayload;
      if (d?.messageId) {
        const alert: ContentAlert = {
          id: `blocked-${d.messageId}-${Date.now()}`,
          type: "blocked",
          messageId: d.messageId,
          conversationId: d.conversationId,
          reason: d.reason,
          suggestions: d.suggestions || [],
          timestamp: d.timestamp || Date.now()
        };
        setContentAlerts((prev) => [...prev.slice(-19), alert]);
        // Also trigger the insights panel for blocked messages
        setShowInsights(true);
      }
    });

    // Pattern alert listener (user-isolated: only this user receives their patterns)
    const unsubPatternAlert = client.on("content:pattern_alert", (data: unknown) => {
      const d = data as PatternAlertPayload;
      if (d?.alerts?.length > 0) {
        const alert: ContentAlert = {
          id: `pattern-${Date.now()}`,
          type: "pattern",
          patternAlerts: d.alerts,
          suggestions: d.alerts.map(a => a.message),
          timestamp: d.timestamp || Date.now()
        };
        setContentAlerts((prev) => [...prev.slice(-19), alert]);
      }
    });

    return () => {
      unsubConnState();
      unsubAuth();
      unsubMsg();
      unsubTypingStart();
      unsubTypingStop();
      unsubPresenceOnline();
      unsubUserOnline();
      unsubUserOffline();
      unsubModeSwitch();
      unsubAiToken();
      unsubContentFlagged();
      unsubContentBlocked();
      unsubPatternAlert();
    };
  }, [userId, getConversationKey, onlineUsers]);

  useEffect(() => {
    const client = clientRef.current;
    const unsubConnected = client.on("connected", () => setIsConnected(true));
    const unsubError = client.on("error", () => {
      // Handle error silently
    });
    return () => {
      unsubConnected();
      unsubError();
    };
  }, []);

  const hasAutoConnected = useRef(false);
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && !hasAutoConnected.current) {
      hasAutoConnected.current = true;
      connect(stored);
    }
  }, [connect]);

  const sendMessage = useCallback(
    (data: Record<string, unknown>, content: string) => {
      getOrCreateConversation(data);
      clientRef.current?.sendMessage(data["_id"] as string, content);
    },
    [getOrCreateConversation]
  );

  const switchMode = useCallback(
    (conversationId: string, mode: "human" | "ai", peerId?: string) => {
      if (!clientRef.current) {
        console.log("clientRef.current is null");
        return;
      }
      clientRef.current.switchMode(conversationId, mode, peerId);
    },
    []
  );

  const sendMessageAI = useCallback(
    (receiver: string, content: string) => {
      clientRef.current.sendMessageAI(receiver, content);
    },
    []
  );

  const stopAIStream = useCallback(
    (receiver: string) => {
      clientRef.current.stopAIStream(receiver);
    },
    []
  );

  const startTyping = useCallback((partnerId: string) => {
    clientRef.current.typingStart(partnerId);
  }, []);

  const stopTyping = useCallback((partnerId: string, content: string) => {
    clientRef.current.typingStop(partnerId, content);
  }, []);

  const dismissContentAlert = useCallback((alertId: string) => {
    setContentAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  }, []);

  const clearContentAlerts = useCallback(() => {
    setContentAlerts([]);
  }, []);

  const value: ChatContextValue = {
    client: clientRef.current,
    userId,
    isConnected,
    connectionState,
    isAuthenticated,
    conversations,
    activeConversationId,
    typingFrom,
    onlineUsers,
    contentAlerts,
    connect,
    disconnect,
    selectConversation: setActiveConversationId,
    sendMessage,
    switchMode,
    startTyping,
    stopTyping,
    getOrCreateConversation,
    setUserListData,
    userListData,
    setIsAuthenticated,
    setConversations,
    showInsights,
    setShowInsights,
    sendMessageAI,
    stopAIStream,
    isUserOnline,
    getTypingUsers,
    dismissContentAlert,
    clearContentAlerts,
  };

  return (
    <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}

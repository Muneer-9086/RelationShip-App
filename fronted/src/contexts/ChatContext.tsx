import
{
  createContext,
  useContext,
  useEffect,
  useCallback,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { WsClient, MessageReceiveData, AI_USER_ID } from "@/lib/wsClient";
import type { Conversation, Message, User } from "@/types/chat";

function backendToFrontendMessage(m: {
  messageId: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: number;
  from: "human" | "ai";
}): Message
{
  return {
    id: m.messageId,
    senderId: m.senderId,
    content: m.content,
    timestamp: new Date(m.timestamp),
    type: m.from === "ai" ? "ai" : "user",
  };
}

function getPeerDisplayName(peerId: string): string
{
  if (peerId === AI_USER_ID) return "MindfulAI";
  return peerId;
}

interface ChatContextValue
{
  client: WsClient;
  userId: string | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  activeConversationId: string | null;
  typingFrom: Record<string, boolean>;
  connect: (userId: string) => void;
  disconnect: () => void;
  selectConversation: (id: string | null) => void;
  sendMessage: (receiverId: string, content: string) => void;
  switchMode: (conversationId: string, mode: "human" | "ai", peerId?: string) => void;
  startTyping: (partnerId: string) => void;
  stopTyping: (partnerId: string, content: string) => void;
  getOrCreateConversation: (data: any) => Conversation;
  userListData: any;
  setUserListData: any;
  setIsAuthenticated: any;
  setShowInsights: any,
  showInsights: boolean,
  sendMessageAI: (receiverId: string, content: string) => void;

}

const ChatContext = createContext<ChatContextValue | null>(null);

const STORAGE_KEY = "mindfulchat-userid";

export function ChatProvider({ children }: { children: ReactNode })
{
  const clientRef = useRef(new WsClient());
  const [userId, setUserId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  );
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [userListData, setUserListData] = useState<[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null
  );
  const [showInsights, setShowInsights] = useState(false);

  const [typingFrom, setTypingFrom] = useState<Record<string, boolean>>({});
  const convMapRef = useRef<Map<string, Conversation>>(new Map());

  const getConversationKey = useCallback((uid: string, peerId: string) =>
  {
    return [uid, peerId].sort().join(":");
  }, []);

  const getOrCreateConversation = useCallback(
    (data: any): Conversation =>
    {

      if (!userId) throw new Error("Not authenticated");
      const key = getConversationKey(userId, data['_id']);
      const peerId = data['_id'];
      let conv = convMapRef.current.get(key);

      const dummyConversations = conversations.filter((conv) =>
      {
        if (conv.id === activeConversationId) {
          return true
        }
        return false;
      })
      if (dummyConversations.length > 0) {
        conv = dummyConversations[0];
        convMapRef.current.set(key, conv);
        return conv;

      }
      if (conv) return conv;
      const name = data['fullName']
      conv = {
        id: key,
        name,
        type: "direct",
        participants: [
          { id: userId, name: "You", status: "online" },
          {
            id: peerId,
            name,
            status: peerId === AI_USER_ID ? "online" : "offline",
          },
        ],
        messages: [],
        unreadCount: 0,
        aiEnabled: peerId === AI_USER_ID,
        aiParticipant: peerId === AI_USER_ID,
      };
      convMapRef.current.set(key, conv);
      setConversations((prev) =>
      {
        if (prev.some((c) => c.id === key)) return prev;
        return [...prev, conv!];
      });
      return conv;
    },
    [userId, getConversationKey, conversations]
  );

  const connect = useCallback(
    async (uid: string) =>
    {
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

  const disconnect = useCallback(() =>
  {
    clientRef.current.disconnect();
    setUserId(null);
    setIsConnected(false);
    setIsAuthenticated(false);
    setConversations([]);
    setActiveConversationId(null);
    convMapRef.current.clear();
  }, []);

  useEffect(() =>
  {
    const client = clientRef.current;

    const unsubAuth = client.on("auth", (data: unknown) =>
    {
      const d = data as { success?: boolean };
      setIsAuthenticated(!!d?.success);
    });

    const unsubMsg = client.on("message:receive", (data: unknown) =>
    {

      const { message, conversationId } = data as MessageReceiveData;

      if (data?.["status"] == 'blocked') {
        setShowInsights(true);
        return;
      }


      if (!message || !userId) return;
      const peerId =
        message.senderId === userId ? message.receiverId : message.senderId;
      const key = getConversationKey(userId, peerId);
      const frontendMsg = backendToFrontendMessage(message);

      let conv = convMapRef.current.get(key)

      const dummyConversations = conversations.filter((conv) =>
      {
        if (conv.id === activeConversationId) {
          return true
        }
        return false;
      })

      if (!conv && dummyConversations.length > 0) {
        conv = dummyConversations[0];
        convMapRef.current.set(key, conv);

      }
      else {
        conv = convMapRef.current.get(key);
        if (!conv) {
          conv = {
            id: key,
            name: getPeerDisplayName(peerId),
            type: "direct",
            participants: [
              { id: userId, name: "You", status: "online" },
              {
                id: peerId,
                name: getPeerDisplayName(peerId),
                status: peerId === AI_USER_ID ? "online" : "offline",
              },
            ],
            messages: [],
            unreadCount: 0,
            aiEnabled: peerId === AI_USER_ID,
            aiParticipant: peerId === AI_USER_ID,
            backendConversationId: conversationId,
          };
          convMapRef.current.set(key, conv);

        }
      }
      setConversations((prev) =>
        prev.some((c) => c.id === key) ? prev : [...prev, conv!]
      );
      const updated = {
        ...conv,
        messages: [...conv.messages, frontendMsg],
        backendConversationId: conversationId ?? conv.backendConversationId,
      };
      convMapRef.current.set(key, updated);
      setConversations((prev) =>
        prev.map((c) => (c.id === key ? updated : c))
      );
    });

    const unsubTypingStart = client.on("typing:start", (data: unknown) =>
    {
      const d = data as { userId?: string };
      if (d?.userId) setTypingFrom((t) => ({ ...t, [d.userId]: true }));
    });

    const unsubTypingStop = client.on("typing:stop", (data: unknown) =>
    {
      const d = data as { userId?: string };
      if (d?.userId) setTypingFrom((t) => ({ ...t, [d.userId]: false }));
    });

    const unsubModeSwitch = client.on("mode:switch", (data: unknown) =>
    {
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

    const aiToken = client.on("ai:token", (payload:{converstationId:string,data}) =>
    {
      
      
    })





    return () =>
    {
      unsubAuth();
      unsubMsg();
      unsubTypingStart();
      unsubTypingStop();
      unsubModeSwitch();
    };
  }, [userId, getConversationKey, getOrCreateConversation]);

  useEffect(() =>
  {
    const client = clientRef.current;
    const unsubConnected = client.on("connected", () => setIsConnected(true));
    const unsubError = client.on("error", () => { });
    return () =>
    {
      unsubConnected();
      unsubError();
    };
  }, []);

  const hasAutoConnected = useRef(false);
  useEffect(() =>
  {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && !hasAutoConnected.current) {
      hasAutoConnected.current = true;
      connect(stored);
    }
  }, [connect]);

  const sendMessage = useCallback(
    (data: any, content: string) =>
    {
      getOrCreateConversation(data);
      clientRef.current?.sendMessage(data["_id"], content);
    },
    [getOrCreateConversation]
  );
  const switchMode = useCallback(
    (conversationId: string, mode: "human" | "ai", peerId?: string) =>
    {
      if (!clientRef.current) {
        console.log("clientRef.current is null");
        return;
      }

      clientRef.current.switchMode(conversationId, mode, peerId);
    },
    [userId]
  );

  const sendMessageAI = useCallback((receiver:string,content:string) =>
  {
    clientRef.current.sendMessageAI(receiver, content);
  },[userId])

  const startTyping = useCallback((partnerId: string) =>
  {

    clientRef.current.typingStart(partnerId);
  }, []);



  const stopTyping = useCallback((partnerId: string, content: string) =>
  {
    clientRef.current.typingStop(partnerId, content);
  }, []);

  const value: ChatContextValue = {
    client: clientRef.current,
    userId,
    isConnected,
    isAuthenticated,
    conversations,
    activeConversationId,
    typingFrom,
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
    sendMessageAI
  };


  return (
    <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
  );
}

export function useChat()
{
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}

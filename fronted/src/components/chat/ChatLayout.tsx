import { useState, useCallback, useEffect } from "react";
import { useChat } from "@/contexts/ChatContext";
import { ConversationList } from "./ConversationList";
import { ChatArea } from "./ChatArea";
import { InsightsPanel } from "./InsightsPanel";
import { ConnectScreen } from "./ConnectScreen";
import { NewChatDialog } from "./NewChatDialog";
import { MessageSquare, Plus } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { mockInsights } from "@/data/mockData";
import api from "@/lib/proxy";
import type { User } from "@/types/chat";

export function ChatLayout() {
  const {
    userId,
    isConnected,
    isAuthenticated,
    conversations,
    activeConversationId,
    typingFrom,
    onlineUsers,
    setConversations,
    connect,
    selectConversation,
    sendMessage,
    switchMode,
    startTyping,
    stopTyping,
    getOrCreateConversation,
    setUserListData,
    setIsAuthenticated,
    showInsights,
    setShowInsights
  } = useChat();

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(userId
    ? { id: userId, name: "You", status: "online" as const }
    : null);

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );



  const handleConnect = useCallback(
    async (uid: string) =>
    {
      setIsConnecting(true);
      try {
        connect(uid);
      } finally {
        setIsConnecting(false);
      }
    },
    [connect]
  );

  const handleNewChatSelect = useCallback(
    (data: any) =>
    {
      const conv = getOrCreateConversation(data);
      selectConversation(conv.id);
    },
    [getOrCreateConversation, selectConversation,userId]
  );
  useEffect(() =>
  {
    const init = async () =>
    {
      try {
        const userId = localStorage.getItem("userId");
        handleConnect(userId)

        const response = await api.get(`/api/chat/users/getAll?id=${userId}`)
        const newDummyData = response.data;
        setUserListData(newDummyData);
        newDummyData.map((vl) =>
        {
          handleNewChatSelect(vl);
        })

      }
      catch (err) {
        console.log("ERROR IN MESSAGE LIST");
        console.log(err)
      }

    }
    const userId = localStorage.getItem("userId");
      if (!isAuthenticated) {
        setIsAuthenticated(true);
      }
    if (userId) {
      if (!currentUser) {
        setCurrentUser({ id: userId, name: "You", status: "online" as const });
      }
      init()
    }
  }, [currentUser])

  const handleSendMessage = useCallback(
    async (content: string) =>
    {
     
      if (!activeConversation || !currentUser) {
        return
      };
      const peer: any = activeConversation.participants.find(
        (p) => p.id !== currentUser.id
      );
      if (peer) {
       sendMessage({ ...peer, _id: peer["id"] }, content);
      }
    },
    [activeConversation, currentUser, sendMessage]
  );

  const handleToggleAI = useCallback(() =>
  {
    if (!activeConversation) return;
    const backendId = activeConversation.backendConversationId ?? activeConversation.id;
    const peer = activeConversation.participants.find((p) => p.id !== userId);
    const newMode = activeConversation.aiEnabled ? "human" : "ai";
    switchMode(
      backendId,
      newMode,
      newMode === "human" && peer && peer.id !== "__ai__" ? peer.id : undefined
    );
  }, [activeConversation, userId, switchMode]);

  useEffect(() =>
  {
    const init = async () =>
    {
      try {
        const response = await api.get(`/api/chat/conversation/human?conversationId=${activeConversationId}`);
        const data = response.data;
        console.log("___converstation___human data");
        console.log(data['chatHumanData']);
        
        // Transform backend messages to frontend format
        const transformedMessages = (data['chatHumanData'] || []).map((msg: any) => ({
          id: msg._id || msg.messageId || `msg-${Date.now()}-${Math.random()}`,
          senderId: msg.senderId?._id || msg.senderId || '',
          content: msg.content || '',
          timestamp: new Date(msg.createdAt || msg.timestamp || Date.now()),
          type: msg.senderType === 'ai' ? 'ai' : 'user',
        }));
        
        setConversations((prevConversations) => {
          return prevConversations.map((conv) => {
            if (conv.id === activeConversationId) {
              // Only update if we have no messages or backend has more
              // Preserve any new messages that came via WebSocket
              const existingMessageIds = new Set(conv.messages.map(m => m.id));
              const newBackendMessages = transformedMessages.filter(
                (m: any) => !existingMessageIds.has(m.id)
              );
              
              // If conversation has no messages, use backend data
              if (conv.messages.length === 0) {
                return {
                  ...conv,
                  messages: transformedMessages,
                  backendConversationId: data['chatRoom']?._id || conv.backendConversationId
                };
              }
              
              // If backend has messages that frontend doesn't have, merge them
              if (newBackendMessages.length > 0) {
                // Merge and sort by timestamp
                const mergedMessages = [...transformedMessages, ...conv.messages]
                  .filter((msg, index, self) => 
                    index === self.findIndex((m) => m.id === msg.id)
                  )
                  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                
                return {
                  ...conv,
                  messages: mergedMessages,
                  backendConversationId: data['chatRoom']?._id || conv.backendConversationId
                };
              }
              
              // Otherwise keep existing messages (preserves WebSocket messages)
              return {
                ...conv,
                backendConversationId: data['chatRoom']?._id || conv.backendConversationId
              };
            }
            return conv;
          });
        });
      }
      catch (err) {
        console.log("Error:Message List");
        console.log(err);
      }
    }
    
    if (activeConversationId) {
      init();
    }
  }, [activeConversationId, setConversations])


  console.log("___activeConversation___");
  console.log(activeConversation);


  if (!userId) {
    const connecting =
      isConnecting || (userId && isConnected);
    return (
      <h1>Loading...</h1>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <div className="w-chat-sidebar border-r border-sidebar-border bg-sidebar flex-shrink-0 flex flex-col">
        <div className="p-3 border-b border-sidebar-border flex justify-between items-center">
          <ThemeToggle />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-amber-500"
                }`}
            />
            {isConnected ? "Connected" : "Connecting..."}
          </div>
        </div>
        {/*
        Left Chat message.....
        */}
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={selectConversation}
          currentUser={currentUser!}
          onNewChat={() => setNewChatOpen(true)}
          onlineUsers={onlineUsers}
        />
      </div>

      <div className="flex-1 flex">
        {activeConversation && currentUser ? (
          <div className="flex-1">
            <ChatArea
              conversation={activeConversation}
              currentUser={currentUser}
              userId={userId}
              onSendMessage={handleSendMessage}
              onToggleAI={handleToggleAI}
              onToggleInsights={() => setShowInsights(!showInsights)}
              showInsights={showInsights}
              onTypingStart={startTyping}
              onTypingStop={stopTyping}
              typingFrom={typingFrom}
            />
          </div>
        ) : (
          <p>Loading...</p>
        )}

        {showInsights && activeConversation && (
          <div className="w-insight-panel flex-shrink-0">
            <InsightsPanel
              insights={mockInsights}
              converstationId={activeConversation['id']}
              participants={activeConversation.participants}
              onClose={() => setShowInsights(false)}
            />
          </div>
        )}
      </div>


    </div>
  );
}

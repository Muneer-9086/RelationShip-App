import type { WebSocket } from "ws";
import type { User, Conversation, Message, TypingEvent, ChatMode } from "./types.js";
import { createConversation, addMessageToConversation, getConversationKey } from "./conversation.model.ts";
import { createTypingEvent, getTypingKey } from "./TypingEvent";
import ChatRoom from "./chatRoom.model.ts";
import ChatMessage from "./chatMessage.model.ts";
import mongoose, { Schema, Document, Types } from "mongoose";



const AI_USER_ID = "__ai__";

class ChatStore
{
  private users = new Map<string, User>();
  private userIdToWs = new Map<string, WebSocket>();
  private conversations = new Map<string, Conversation>();
  private typingState = new Map<string, TypingEvent>();
  private lastTypedContent = new Map<string, any>();
  private aiMessages = new Map<string, any>();

  registerUser(userId: string, ws: WebSocket): boolean
  {
    if (this.users.has(userId)) return false;
    this.users.set(userId, { userId, connectedAt: Date.now() });
    this.userIdToWs.set(userId, ws);
    return true;
  }

  unregisterUser(userId: string): void
  {
    this.users.delete(userId);
    this.userIdToWs.delete(userId);
    for (const [key, event] of this.typingState) {
      if (event.userId === userId || event.partnerId === userId) {
        this.typingState.delete(key);
      }
    }
  }

  isUserConnected(userId: string): boolean
  {
    return this.userIdToWs.has(userId);
  }

  getWebSocket(userId: string): WebSocket | undefined
  {
    return this.userIdToWs.get(userId);
  }

  async getOrCreateConversation(userId1: string, userId2: string, mode: ChatMode = "human"): Promise<Conversation>
  {
    const key = getConversationKey(userId1, userId2);
    let conv = this.conversations.get(key);
    if (!conv) {
      // Check MongoDB for existing room
      let room = await ChatRoom.findOne({
        participants: { $all: [userId1, userId2].map(id => new Types.ObjectId(id)) },
      });

      let messages: any = [];
      if (room) {
        const chatMessages = await ChatMessage.find({ roomId: room._id }).sort({ createdAt: 1 });
        messages = chatMessages.map(m => ({
          senderType: m.senderType,
          senderId: m.senderId?.toString(),
          content: m.content,
          channel: m.channel,
          createdAt: m.createdAt.getTime(),
        }));
      } else {
        room = new ChatRoom({ participants: [userId1, userId2] });
        await room.save();
      }

      conv = {
        conversationId: `conv_${room._id.toString()}`,
        participantIds: [userId1, userId2].sort() as [string, string],
        mode,
        messages,
        createdAt: room.createdAt.getTime(),
      };

      this.conversations.set(key, conv);
    }
    return conv;
  }


  getConversation(conversationId: string): Conversation | undefined
  {
    return [...this.conversations.values()].find((c) => c.conversationId === conversationId);
  }

  updateConversationMode(
    conversationId: string,
    userId: string,
    mode: ChatMode,
    peerId?: string
  ): Conversation | undefined
  {
    const conv = this.getConversation(conversationId);
    if (!conv || !conv.participantIds.includes(userId)) return undefined;
    const newPeerId =
      mode === "ai" ? ChatStore.AI_USER_ID : peerId ?? conv.participantIds.find((id) => id !== userId);
    if (!newPeerId || (mode === "human" && newPeerId === ChatStore.AI_USER_ID && !peerId)) {
      return undefined;
    }
    const participantIds = [userId, newPeerId].sort() as [string, string];
    const updated: Conversation = { ...conv, mode, participantIds };
    const oldKey = getConversationKey(conv.participantIds[0], conv.participantIds[1]);
    const newKey = getConversationKey(participantIds[0], participantIds[1]);
    this.conversations.delete(oldKey);
    this.conversations.set(newKey, updated);
    return updated;
  }

  async addMessage(conversationId: string, message: any, status: string, channel: string): Promise<Message | undefined>
  {
    const conv = this.getConversation(conversationId);
    if (!conv) return undefined;

    const updated = addMessageToConversation(conv, message);
    const key = getConversationKey(conv.participantIds[0], conv.participantIds[1]);
    this.conversations.set(key, updated);

    try {
      let room = await ChatRoom.findOne({
        participants: { $all: conv.participantIds.map(id => new Types.ObjectId(id)) },
      });
      if (!room) {
        room = new ChatRoom({ participants: conv.participantIds });
        await room.save();
      }


      // Save the message
      const chatMessage = new ChatMessage({
        roomId: room._id,
        senderType: channel == "human" ? "user" : "ai",
        senderId: message.senderId ? new Types.ObjectId(message.senderId) : undefined,
        content: message.content,
        channel: channel,
        status: status,
        visibleTo: conv.participantIds.map(id => new Types.ObjectId(id)),
      });

      await chatMessage.save();

      // Update room last message
      room.lastMessage = message.content;
      room.lastMessageAt = new Date();
      await room.save();
    } catch (err) {
      console.error("Failed to persist message:", err);
    }

    return message;
  }

  setTyping(userId: string, partnerId: string, isTyping: boolean): TypingEvent
  {
    const key = getTypingKey(userId, partnerId);
    const event = createTypingEvent(userId, partnerId, isTyping);
    if (isTyping) {
      this.typingState.set(key, event);
    } else {
      this.typingState.delete(key);
    }
    return event;
  }

  getTypingEvent(userId: string, partnerId: string): TypingEvent | undefined
  {
    return this.typingState.get(getTypingKey(userId, partnerId));
  }

  getConversationKey(userId1: string, userId2: string): string
  {
    return getConversationKey(userId1, userId2);
  }
  getConnectedUserIds(): string[]
  {
    return Array.from(this.users.keys()).filter((id) => id !== ChatStore.AI_USER_ID);
  }

  getPartnersWithTypingFrom(userId: string): string[]
  {
    const partners: string[] = [];
    for (const event of this.typingState.values()) {
      if (event.userId === userId && event.isTyping) {
        partners.push(event.partnerId);
      }
    }
    return partners;
  }

  addLastTypeContent(conversationId: string, content: any)
  {
    this.lastTypedContent.set(conversationId, content);
  }

  getLastTypeContent(conversationId: string): any
  {
    return this.lastTypedContent.get(conversationId);
  }

  addAIMessageContent(conversationId: string, params: {
    userSummary1: string;
  userSummary2: string;
  userChat: string;

  currentUserName: string;
  otherUserName: string;

  user1Tone: string;
  user2Tone: string;

  aiSummary: string;
  persona: string;
  longMemory: string[];
  userEmotional: string;
    relationship: string;
    aiSenderId: string;
    visibleTo: string[];
  message: any[]; // single message string
  }): void
  {
    this.aiMessages.set(
      conversationId,
      {
       ...params
      }
    ) 
  }
  getAIMessageContent(converstationId: string):any
  {
    return this.aiMessages.get(converstationId)
  }
setAIMessagesPush(conversationId: string, message: any): void {
  const data = this.aiMessages.get(conversationId);
  if (!data) return; 
  if (!Array.isArray(data.message)) {
    data.message = [];
  }
  data.message.push(message);
  this.aiMessages.set(conversationId, data);
}

  static readonly AI_USER_ID = AI_USER_ID;
}

const store = new ChatStore();

export
{
  ChatStore
}
export default store;
import type { WebSocket } from "ws";
import store, { ChatStore } from "../model/ChatStore";
import { createMessage } from "../model/Message";
import { getAIProvider } from "../ai";
import type {
  WsPayload,
  AuthPayload,
  MessageSendPayload,
  ModeSwitchPayload,
  TypingStartPayload,
  TypingStopPayload,
  TypingIndicatorPayload,
  PresenceOnlineUsersPayload,
  PresenceUserOnlinePayload,
  PresenceUserOfflinePayload,
} from "../model/types";
import chatMessageModel from "../model/chatMessage.model";
import { classifyMessageSentiment, streamAICoachResponseLegacy, AICoachContext, AICoachMemory, streamAICoachResponse } from "../llm";
import { 
  detectProblematicContent, 
  quickContentCheck, 
  contentDetectionStore,
  type ContentDetectionResult,
  type UserContentInsight,
  type PatternAlert
} from "../contentDetection";
import mongoose from "mongoose";
import ConversationMemory from "../model/aiMessage.model";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthenticatedWs = WebSocket & { userId?: string };

interface AIMessagePayload {
  receiver: string;
  content: string;
}

interface StreamingState {
  controller: AbortController;
  buffer: string;
}

// Content detection request payloads

interface ContentInsightRequestPayload {
  conversationId?: string;
  limit?: number;
}

interface PatternAlertsResponsePayload {
  alerts: PatternAlert[];
  timestamp: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

const activeStreams = new Map<string, StreamingState>();
const typingTimeouts = new Map<string, NodeJS.Timeout>();
const TYPING_TIMEOUT_MS = 3000;

// ─── Utility Functions ────────────────────────────────────────────────────────

function send(ws: WebSocket, event: string, data?: unknown): void {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ event, data }));
}

function parsePayload(raw: Buffer | string): WsPayload | null {
  try {
    const text = typeof raw === "string" ? raw : raw.toString();
    return JSON.parse(text) as WsPayload;
  } catch {
    return null;
  }
}


function validateMessagePayload(data: MessageSendPayload | null | undefined): data is MessageSendPayload {
  return Boolean(
    data &&
    typeof data.receiverId === "string" &&
    data.receiverId.trim().length > 0 &&
    typeof data.content === "string" &&
    data.content.trim().length > 0
  );
}

export function getStore(): ChatStore {
  return store;
}

// ─── Presence Functions ───────────────────────────────────────────────────────

function getOnlineUsers(): string[] {
  return store
    .getConnectedUserIds()
    .filter((id) => id !== ChatStore.AI_USER_ID);
}

function broadcastPresence(): void {
  const online = getOnlineUsers();
  const payload: PresenceOnlineUsersPayload = { users: online };
  for (const userId of online) {
    const ws = store.getWebSocket(userId);
    if (ws) send(ws, "presence:online_users", payload);
  }
}

function broadcastUserOnline(userId: string): void {
  const online = getOnlineUsers();
  const payload: PresenceUserOnlinePayload = { userId, timestamp: Date.now() };
  for (const id of online) {
    if (id === userId) continue;
    const ws = store.getWebSocket(id);
    if (ws) send(ws, "presence:user_online", payload);
  }
}

function broadcastUserOffline(userId: string): void {
  const online = getOnlineUsers().filter((id) => id !== userId);
  const payload: PresenceUserOfflinePayload = { userId, timestamp: Date.now() };
  for (const id of online) {
    const ws = store.getWebSocket(id);
    if (ws) send(ws, "presence:user_offline", payload);
  }
}

// ─── Typing Functions ─────────────────────────────────────────────────────────

function clearTypingTimeout(userId: string, partnerId: string): void {
  const key = `${userId}:${partnerId}`;
  const timeout = typingTimeouts.get(key);
  if (timeout) {
    clearTimeout(timeout);
    typingTimeouts.delete(key);
  }
}

function setTypingTimeout(userId: string, partnerId: string): void {
  const key = `${userId}:${partnerId}`;
  clearTypingTimeout(userId, partnerId);
  
  const timeout = setTimeout(() => {
    store.setTyping(userId, partnerId, false);
    const partnerWs = store.getWebSocket(partnerId);
    if (partnerWs) {
      const payload: TypingIndicatorPayload = { userId, isTyping: false, timestamp: Date.now() };
      send(partnerWs, "typing:stop", payload);
    }
    typingTimeouts.delete(key);
  }, TYPING_TIMEOUT_MS);
  
  typingTimeouts.set(key, timeout);
}

function broadcastTypingStop(userId: string): void {
  const partners = store.getPartnersWithTypingFrom(userId);
  for (const partnerId of partners) {
    clearTypingTimeout(userId, partnerId);
    const partnerWs = store.getWebSocket(partnerId);
    if (partnerWs) {
      const payload: TypingIndicatorPayload = { userId, isTyping: false, timestamp: Date.now() };
      send(partnerWs, "typing:stop", payload);
    }
  }
}

// ─── Connection Handler ───────────────────────────────────────────────────────

export function handleConnection(ws: WebSocket): void {
  const socket = ws as AuthenticatedWs;
  send(socket, "connected", { message: "Send auth with userId to authenticate" });

  socket.on("message", async (raw: Buffer) => {
    const payload = parsePayload(raw) as WsPayload & { data?: unknown };
    if (!payload?.event) {
      send(socket, "error", { message: "Invalid payload" });
      return;
    }

    if (payload.event !== "auth" && !socket.userId) {
      send(socket, "error", { message: "Authenticate first" });
      return;
    }

    switch (payload.event) {
      case "auth":
        handleAuth(socket, payload.data as AuthPayload);
        break;

      case "message:send":
        await handleMessageSendWithSentiment(socket, payload.data as MessageSendPayload);
        break;

      case "typing:start":
        handleTypingStart(socket, payload.data as TypingStartPayload);
        break;

      case "typing:stop":
        await handleTypingStop(socket, payload.data as TypingStopPayload);
        break;

      case "mode:switch":
        handleModeSwitch(socket, payload.data as ModeSwitchPayload);
        break;

      case "ai:message":
        await handleAIMessage(socket, payload.data as AIMessagePayload);
        break;

      case "ai:stop":
        handleAIStop(socket, payload.data as { receiver: string });
        break;

      case "presence:get_online":
        handleGetOnline(socket);
        break;

      case "content:get_insights":
        handleGetContentInsights(socket, payload.data as ContentInsightRequestPayload);
        break;

      case "content:get_alerts":
        handleGetPatternAlerts(socket);
        break;

      case "disconnect":
        handleDisconnect(socket);
        break;

      case "ping":
        send(socket, "pong", { timestamp: Date.now() });
        break;

      default:
        send(socket, "error", { message: `Unknown event: ${payload.event}` });
    }
  });

  socket.on("close", () => {
    if (socket.userId) {
      const userId = socket.userId;
      
      // Cancel any active AI streams for this user
      for (const [key, state] of activeStreams) {
        if (key.includes(userId)) {
          state.controller.abort();
          activeStreams.delete(key);
        }
      }
      
      store.unregisterUser(userId);
      contentDetectionStore.clearSession(userId);
      broadcastTypingStop(userId);
      broadcastUserOffline(userId);
      broadcastPresence();
    }
  });

  socket.on("error", (err) => {
    console.error("WebSocket error:", err);
    if (socket.userId) {
      store.unregisterUser(socket.userId);
      contentDetectionStore.clearSession(socket.userId);
    }
  });
}

// ─── Auth Handler ─────────────────────────────────────────────────────────────

function handleAuth(socket: AuthenticatedWs, data: AuthPayload): void {
  if (!data?.userId || typeof data.userId !== "string") {
    send(socket, "error", { message: "userId required" });
    return;
  }

  const userId = data.userId.trim();
  if (!userId) {
    send(socket, "error", { message: "userId required" });
    return;
  }

  if (store.registerUser(userId, socket)) {
    socket.userId = userId;
    send(socket, "auth", { success: true, userId });
    send(socket, "presence:online_users", { users: getOnlineUsers() });
    broadcastUserOnline(userId);
    broadcastPresence();
  } else {
    send(socket, "auth", { success: false, message: "userId already connected" });
  }
}

// ─── Get Online Handler ───────────────────────────────────────────────────────

function handleGetOnline(socket: AuthenticatedWs): void {
  send(socket, "presence:online_users", { users: getOnlineUsers() });
}

// ─── Content Insights Handler (User-Isolated) ─────────────────────────────────

function handleGetContentInsights(
  socket: AuthenticatedWs, 
  data: ContentInsightRequestPayload
): void {
  const limit = Math.min(data?.limit ?? 10, 50); // Max 50 insights

  // User should not receive internal moderation insights over WS.
  send(socket, "content:insights", {
    insights: [],
    total: 0,
    conversationId: data?.conversationId,
    limit,
    timestamp: Date.now()
  });
}

// ─── Pattern Alerts Handler (User-Isolated) ───────────────────────────────────

function handleGetPatternAlerts(socket: AuthenticatedWs): void {
  // User should not receive internal moderation pattern alerts over WS.
  const payload: PatternAlertsResponsePayload = {
    alerts: [],
    timestamp: Date.now()
  };

  send(socket, "content:pattern_alerts", payload);
}

// ─── Message Send with Content Detection ─────────────────────────────────────

async function handleMessageSendWithSentiment(
  socket: AuthenticatedWs,
  data: MessageSendPayload
): Promise<void> {
  const userId = socket.userId!;
  const messageId = `msg_${randomUUID()}`;

  if (!validateMessagePayload(data)) {
    send(socket, "error", { message: "receiverId and content required" });
    return;
  }

  const receiverId = data.receiverId.trim();
  const content = data.content.trim();
  const normalizedData: MessageSendPayload = { receiverId, content };

  try {
    const conversation = await store.getOrCreateConversation(userId, receiverId, "human");

    // Step 1: Quick pattern check (fast, no AI)
    const quickCheck = quickContentCheck(content);

    // Step 2: If critical pattern detected, block immediately
    if (quickCheck.estimatedSeverity === "critical") {
      const detection: ContentDetectionResult = {
        isProblematic: true,
        flags: quickCheck.quickFlags,
        severity: "critical",
        confidence: 0.95,
        reason: "Critical content pattern detected",
        suggestions: [
          "Take a moment to calm down",
          "Consider expressing your feelings differently",
          "Think about the impact of your words"
        ],
        shouldBlock: true
      };

      // Store insight in SENDER's session ONLY (user-isolated)
      const insight: UserContentInsight = {
        userId,
        messageId,
        timestamp: Date.now(),
        content: content.substring(0, 100),
        detection,
        conversationId: conversation.conversationId,
        partnerId: receiverId
      };
      contentDetectionStore.addInsight(userId, insight);

      // Keep blocked insight server-side and save message with blocked status (not delivered to receiver)
      await handleMessageSend(socket, normalizedData, "blocked", messageId);
      return;
    }

    // Step 3: If quick check found issues or message needs AI review
    if (quickCheck.requiresAICheck) {
      // Get conversation context for better analysis
      const recentMessages = conversation.messages
        .slice(-3)
        .map(m => `${m.senderId === userId ? "You" : "Them"}: ${m.content}`)
        .join("\n");

      // Run AI detection
      const detection = await detectProblematicContent({
        userId,
        messageId,
        content,
        conversationId: conversation.conversationId,
        partnerId: receiverId,
        context: recentMessages
      });

      // If should block
      if (detection.shouldBlock) {
        await handleMessageSend(socket, normalizedData, "blocked", messageId);
        return;
      }

      // If problematic but not blocking, keep server-side insight only.
      if (detection.isProblematic) {
        // Intentionally do not emit moderation insights to sender via WS.
      }

      // Send the message
      await handleMessageSend(socket, normalizedData, "sent", messageId);
    } else {
      // No issues detected, send normally
      await handleMessageSend(socket, normalizedData, "sent", messageId);
    }

  } catch (err) {
    console.error("Content detection error:", err);
    // On error, fall back to basic sentiment check
    try {
      const result = await classifyMessageSentiment({ message: content });
      if (result.sentiment === "negative" && result.isHurtful) {
        await handleMessageSend(socket, normalizedData, "blocked", messageId);
      } else {
        await handleMessageSend(socket, normalizedData, "sent", messageId);
      }
    } catch {
      // Final fallback: send the message
      await handleMessageSend(socket, normalizedData, "sent", messageId);
    }
  }
}

async function handleMessageSend(
  socket: AuthenticatedWs,
  data: MessageSendPayload,
  status: string = "sent",
  messageId?: string
): Promise<void> {
  const senderId = socket.userId!;

  if (!validateMessagePayload(data)) {
    send(socket, "error", { message: "receiverId and content required" });
    return;
  }

  const receiverId = data.receiverId.trim();
  const content = data.content.trim();

  const isAIMode = receiverId === ChatStore.AI_USER_ID;
  const mode = isAIMode ? "ai" : "human";
  const conv = await store.getOrCreateConversation(senderId, receiverId, mode);

  if (isAIMode) {
    const humanMsg = createMessage(senderId, ChatStore.AI_USER_ID, content, "human");
    if (messageId) humanMsg.messageId = messageId;
    store.addMessage(conv.conversationId, humanMsg, status, "ai");
    send(socket, "message:receive", { message: humanMsg, conversationId: conv.conversationId });

    try {
      const res = await getAIProvider().respond(senderId, content);
      const aiMsg = createMessage(ChatStore.AI_USER_ID, senderId, res.content, "ai");
      store.addMessage(conv.conversationId, aiMsg, status, "ai");
      send(socket, "message:receive", { message: aiMsg, conversationId: conv.conversationId });
    } catch (err) {
      console.error("AI error:", err);
      send(socket, "error", { message: "AI response failed" });
    }
  } else {
    const msg = createMessage(senderId, receiverId, content, "human");
    if (messageId) msg.messageId = messageId;
    await store.addMessage(conv.conversationId, msg, status, "human");
    
    // Payload for sender (includes status for their reference)
    const senderPayload = {
      message: msg,
      conversationId: conv.conversationId,
      channel: "human"
    };
    send(socket, "message:receive", senderPayload);
    
    // For receiver: ONLY send if NOT blocked
    // This ensures blocked messages stay private to sender
    if (status !== "blocked") {
      const receiverWs = store.getWebSocket(receiverId);
      if (receiverWs) {
        // Receiver payload does NOT include status (they don't need to know)
        const receiverPayload = {
          message: msg,
          conversationId: conv.conversationId,
          channel: "human"
        };
        send(receiverWs, "message:receive", receiverPayload);
      }
    }
  }
}

// ─── Typing Handlers ──────────────────────────────────────────────────────────

function handleTypingStart(socket: AuthenticatedWs, data: TypingStartPayload): void {
  const userId = socket.userId!;
  const partnerId = data?.partnerId;
  
  if (!partnerId) {
    send(socket, "error", { message: "partnerId required" });
    return;
  }
  
  store.setTyping(userId, partnerId, true);
  setTypingTimeout(userId, partnerId);
  
  const partnerWs = store.getWebSocket(partnerId);
  if (partnerWs) {
    const payload: TypingIndicatorPayload = { userId, isTyping: true, timestamp: Date.now() };
    send(partnerWs, "typing:start", payload);
  }
}

async function handleTypingStop(
  socket: AuthenticatedWs,
  data: TypingStopPayload
): Promise<void> {
  const userId = socket.userId!;
  const partnerId = data?.partnerId;

  if (!partnerId) return;

  clearTypingTimeout(userId, partnerId);

  let conversationPartner = store.getLastTypeContent(partnerId);
  if (!conversationPartner) {
    store.addLastTypeContent(partnerId, {});
    conversationPartner = store.getLastTypeContent(partnerId);
  }

  conversationPartner._analyzeReqId ??= 0;
  conversationPartner._analyzeTimer ??= null;
  conversationPartner._lastAnalysis ??= undefined;

  store.setTyping(userId, partnerId, false);
  
  const partnerWs = store.getWebSocket(partnerId);
  if (partnerWs) {
    const payload: TypingIndicatorPayload = { userId, isTyping: false, timestamp: Date.now() };
    send(partnerWs, "typing:stop", payload);
  }

  const content = data?.content?.trim();
  if (!content) {
    conversationPartner._lastAnalysis = undefined;
    return;
  }

  if (conversationPartner._analyzeTimer) {
    clearTimeout(conversationPartner._analyzeTimer);
  }
}

// ─── AI Message Handler with Streaming ────────────────────────────────────────

async function handleAIMessage(
  socket: AuthenticatedWs,
  data: AIMessagePayload
): Promise<void> {
  const { receiver, content } = data;
  const userId = socket.userId!;

  if (!receiver || !content) {
    send(socket, "error", { message: "receiver and content required" });
    return;
  }

  const [chatRoomId, conversationId] = receiver.split(":");
  if (!chatRoomId || !conversationId) {
    send(socket, "error", { message: "Invalid receiver format" });
    return;
  }

  const receiverId = receiver;

  // Get AI context from store
  let receiverContext = store.getAIMessageContent(receiverId);
  if (!receiverContext) {
    send(socket, "error", { message: "AI context not initialized. Please reload the chat." });
    return;
  }

  // Add user message to context
  store.setAIMessagesPush(receiverId, { user: content });
  receiverContext = store.getAIMessageContent(receiverId);

  const { aiSenderId, visibleTo, ...aiContext } = receiverContext;

  // Cancel any existing stream for this receiver
  if (activeStreams.has(receiverId)) {
    const existingStream = activeStreams.get(receiverId)!;
    existingStream.controller.abort();
    activeStreams.delete(receiverId);
  }

  // Create new abort controller
  const controller = new AbortController();
  activeStreams.set(receiverId, { controller, buffer: "" });

  // Save user message to database
  try {
    await new chatMessageModel({
      senderType: "user",
      senderId: new mongoose.Types.ObjectId(conversationId),
      roomId: new mongoose.Types.ObjectId(chatRoomId),
      channel: "ai",
      content,
      aiSenderId: new mongoose.Types.ObjectId(aiSenderId),
      status: "sent",
      visibleTo: visibleTo.map((vl: string) => new mongoose.Types.ObjectId(vl))
    }).save();
  } catch (err) {
    console.error("Failed to save user AI message:", err);
  }

  // Send acknowledgment that streaming is starting
  send(socket, "ai:stream_start", { receiver, timestamp: Date.now() });

  try {
    await streamAICoachResponseLegacy({
      ...aiContext,
      signal: controller.signal,
      
      onToken: (chunk: string) => {
        // Update buffer
        const state = activeStreams.get(receiverId);
        if (state) {
          state.buffer += chunk;
        }
        
        // Send token to client
        send(socket, "ai:token", { 
          receiver, 
          chunk,
          timestamp: Date.now() 
        });
      },

      onComplete: async (finalMessage: string) => {
        // Add AI response to context
        store.setAIMessagesPush(receiverId, { ai: finalMessage });

        // Save AI message to database
        try {
          await new chatMessageModel({
            senderType: "ai",
            senderId: new mongoose.Types.ObjectId(conversationId),
            roomId: new mongoose.Types.ObjectId(chatRoomId),
            channel: "ai",
            content: finalMessage,
            aiSenderId: new mongoose.Types.ObjectId(aiSenderId),
            status: "sent",
            visibleTo: visibleTo.map((vl: string) => new mongoose.Types.ObjectId(vl))
          }).save();

          // Update long-term memory if needed
          await updateLongTermMemory(aiSenderId, finalMessage, content);
        } catch (err) {
          console.error("Failed to save AI response:", err);
        }

        // Send completion event
        send(socket, "ai:done", { 
          receiver, 
          content: finalMessage,
          timestamp: Date.now() 
        });

        activeStreams.delete(receiverId);
      }
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.log("AI stream aborted for:", receiverId);
      send(socket, "ai:aborted", { receiver, timestamp: Date.now() });
    } else {
      console.error("AI stream error:", err);
      send(socket, "ai:error", { 
        receiver, 
        message: "AI response failed",
        timestamp: Date.now() 
      });
    }
    activeStreams.delete(receiverId);
  }
}

// ─── Update Long-Term Memory ──────────────────────────────────────────────────

async function updateLongTermMemory(
  aiSenderId: string,
  aiResponse: string,
  userMessage: string
): Promise<void> {
  try {
    const memory = await ConversationMemory.findById(aiSenderId);
    if (!memory) return;

    // Extract key insights from conversation
    // This is a simple heuristic - you could use AI for better extraction
    const shouldUpdateMemory = 
      userMessage.toLowerCase().includes("always") ||
      userMessage.toLowerCase().includes("never") ||
      userMessage.toLowerCase().includes("relationship") ||
      userMessage.toLowerCase().includes("feel") ||
      aiResponse.toLowerCase().includes("remember");

    if (shouldUpdateMemory && memory.longMemory.length < 20) {
      // Extract a brief summary
      const insight = `User expressed: "${userMessage.substring(0, 100)}..."`;
      
      if (!memory.longMemory.includes(insight)) {
        memory.longMemory.push(insight);
        memory.lastSummarizedMessageAt = new Date();
        await memory.save();
      }
    }
  } catch (err) {
    console.error("Failed to update long-term memory:", err);
  }
}

// ─── AI Stop Handler ──────────────────────────────────────────────────────────

function handleAIStop(socket: AuthenticatedWs, data: { receiver: string }): void {
  const { receiver } = data;
  
  if (activeStreams.has(receiver)) {
    const stream = activeStreams.get(receiver)!;
    stream.controller.abort();
    activeStreams.delete(receiver);
    send(socket, "ai:stopped", { receiver, timestamp: Date.now() });
  }
}

// ─── Mode Switch Handler ──────────────────────────────────────────────────────

function handleModeSwitch(socket: AuthenticatedWs, data: ModeSwitchPayload): void {
  const userId = socket.userId!;
  
  if (!data?.conversationId || !data?.mode) {
    send(socket, "error", { message: "conversationId and mode required" });
    return;
  }

  const conv = store.getConversation(data.conversationId);
  if (!conv || !conv.participantIds.includes(userId)) {
    send(socket, "error", { message: "Conversation not found" });
    return;
  }

  const updated = store.updateConversationMode(
    data.conversationId,
    userId,
    data.mode,
    data.peerId
  );

  if (updated) {
    const partnerId = conv.participantIds.find((id) => id !== userId);
    if (partnerId && store.isUserConnected(partnerId)) {
      const partnerWs = store.getWebSocket(partnerId);
      if (partnerWs) {
        send(partnerWs, "mode:switch", {
          conversationId: data.conversationId,
          mode: data.mode,
        });
      }
    }
    send(socket, "mode:switch", {
      conversationId: data.conversationId,
      mode: data.mode,
    });
  }
}

// ─── Disconnect Handler ───────────────────────────────────────────────────────

function handleDisconnect(socket: AuthenticatedWs): void {
  if (socket.userId) {
    const userId = socket.userId;
    
    // Cancel any active AI streams for this user
    for (const [key, state] of activeStreams) {
      if (key.includes(userId)) {
        state.controller.abort();
        activeStreams.delete(key);
      }
    }
    
    store.unregisterUser(userId);
    contentDetectionStore.clearSession(userId);
    broadcastTypingStop(userId);
    broadcastUserOffline(userId);
    broadcastPresence();
  }
  socket.close();
}

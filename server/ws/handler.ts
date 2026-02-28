import type { WebSocket } from "ws";
import store, { ChatStore } from "../model/ChatStore";
import { createMessage } from "../model/Message";
import { getAIProvider } from "../ai";
import type {
  WsPayload,
  AuthPayload,
  MessageSendPayload,
  ModeSwitchPayload,

} from "../model/types";
import chatMessageModel from "../model/chatMessage.model";
import { channel } from "diagnostics_channel";
import { classifyMessageSentiment, streamAICoachResponse } from "../llm"
import mongoose from "mongoose";

let lastAnalyzedContent = "";
let analyzeReqId = 0;
let analyzeTimer: NodeJS.Timeout | null = null;
type AuthenticatedWs = WebSocket & { userId?: string };

const activeStreams = new Map(); // key: receiverId → AbortController

function send(ws: WebSocket, event: string, data?: unknown): void
{
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ event, data }));
}

function parsePayload(raw: Buffer | string): WsPayload | null
{
  try {
    const text = typeof raw === "string" ? raw : raw.toString();
    return JSON.parse(text) as WsPayload;
  } catch {
    return null;
  }
}

export function getStore(): ChatStore
{
  return store;
}


function getOnlineUsers(): string[]
{
  return store
    .getConnectedUserIds()
    .filter((id) => id !== ChatStore.AI_USER_ID);
}


function broadcastPresence(): void
{
  const online = getOnlineUsers();
  for (const userId of online) {
    const ws = store.getWebSocket(userId);
    if (ws) send(ws, "presence:online_users", { users: online });
  }
}

function broadcastUserOnline(userId: string): void
{
  const online = getOnlineUsers();
  for (const id of online) {
    if (id === userId) continue;
    const ws = store.getWebSocket(id);
    if (ws) send(ws, "presence:user_online", { userId });
  }
}


function broadcastUserOffline(userId: string): void
{
  const online = getOnlineUsers().filter((id) => id !== userId);
  for (const id of online) {
    const ws = store.getWebSocket(id);
    if (ws) send(ws, "presence:user_offline", { userId });
  }
}


export function handleConnection(ws: WebSocket): void
{
  const socket = ws as AuthenticatedWs;
  send(socket, "connected", { message: "Send auth with userId to authenticate" });

  socket.on("message", async (raw: Buffer) =>
  {
    const payload: any = parsePayload(raw);
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
        const userId = socket.userId!;
        const content = store.getLastTypeContent(`${userId}:${payload.data?.receiverId}`);
        const result = await classifyMessageSentiment({ message: payload.data.content });

        if (result.sentiment == "negative") {
          await handleMessageSend(socket, payload.data as MessageSendPayload, "blocked");
        }
        else {
          await handleMessageSend(socket, payload.data as MessageSendPayload, "sent");
        }
        break;
      case "typing:start":
        handleTypingStart(socket, payload.data as { partnerId: string });
        break;

      case "typing:stop": {
        const payloadData = payload.data as {
          partnerId: string;
          content: string;
        };
        // await handleTypingStop(socket, { partnerId: payloadData.partnerId, content: payloadData.content });
        break;
      }
      case "mode:switch":
        break;
      case "ai:message": {
        const { receiver, content } = payload.data;
        const [chatRoomId, conversationId] = receiver.split(":");
        const receiverId = receiver;

        if (!chatRoomId || !conversationId) return;

        let receiverUser = store.getAIMessageContent(receiverId);
        if (!receiverUser) return;

        store.setAIMessagesPush(receiverId, { user: content });
        receiverUser = store.getAIMessageContent(receiverId);



        const { aiSenderId, visibleTo, ...aiContext } = receiverUser;
      
        if (activeStreams.has(receiverId)) {
          activeStreams.get(receiverId)?.abort();
          activeStreams.delete(receiverId);
        }

        const controller = new AbortController();
        activeStreams.set(receiverId, controller);

        try {
          await streamAICoachResponse({
            ...aiContext,        
            signal: controller.signal,
            onToken: (chunk) =>
            {
              socket.emit("ai:token", chunk);
            },

            onComplete: async (final) =>
            {
              store.setAIMessagesPush(receiverId, { ai: final });
              socket.emit("ai:done", { ai: final });

    

               await new chatMessageModel({
                senderType: "user",
                senderId: conversationId,
                roomId: chatRoomId,
                channel: "ai",
                content,
                aiSenderId:new mongoose.Types.ObjectId(aiSenderId),
                status: "sent",
                visibleTo:visibleTo.map((vl:string)=>new mongoose.Types.ObjectId(vl))
              }).save();

              await new chatMessageModel({
                senderType: "ai",
                senderId: conversationId,
                roomId: chatRoomId,
                channel: "ai",
                content: final,
                aiSenderId:new mongoose.Types.ObjectId(aiSenderId),
                status: "sent",
                visibleTo:visibleTo.map((vl:string)=>new mongoose.Types.ObjectId(vl))
              }).save();

              activeStreams.delete(receiverId);
            }
          });
        } catch (err: any) {
          if (err?.name === "AbortError") {
            console.log("Old stream aborted");
          } else {
            console.error("AI stream error:", err);
          }
          activeStreams.delete(receiverId);
        }

        break;
      }
      case "presence:get_online":
        handleGetOnline(socket);
        break;
      case "disconnect":
        handleDisconnect(socket);
        break;
      default:
        send(socket, "error", { message: `Unknown event: ${payload.event}` });
    }
  });

  socket.on("close", () =>
  {
    if (socket.userId) {
      const userId = socket.userId;
      store.unregisterUser(userId);
      broadcastTypingStop(userId);
      // ← Tell everyone this user went offline
      broadcastUserOffline(userId);
      // ← Push updated full list to remaining users
      broadcastPresence();
    }
  });

  socket.on("error", (err) =>
  {
    console.error("WebSocket error:", err);
    if (socket.userId) {
      store.unregisterUser(socket.userId);
    }
  });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function handleAuth(socket: AuthenticatedWs, data: AuthPayload): void
{
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

    // 1. Send the newly authed user the current online list immediately
    send(socket, "presence:online_users", { users: getOnlineUsers() });

    // 2. Tell everyone else this user just came online
    broadcastUserOnline(userId);

    // 3. Push refreshed full list to all (including the new user)
    broadcastPresence();
  } else {
    send(socket, "auth", { success: false, message: "userId already connected" });
  }
}

// ─── Presence: get online ─────────────────────────────────────────────────────

function handleGetOnline(socket: AuthenticatedWs): void
{
  send(socket, "presence:online_users", { users: getOnlineUsers() });
}

// ─── Message Send ─────────────────────────────────────────────────────────────

async function handleMessageSend(
  socket: AuthenticatedWs,
  data: MessageSendPayload,
  status: string = "sent"
): Promise<void>
{
  const senderId = socket.userId!;

  if (!data?.receiverId || typeof data.content !== "string") {
    send(socket, "error", { message: "receiverId and content required" });
    return;
  }
  const receiverId = data.receiverId;
  const content = data.content.trim();
  if (!content) {
    send(socket, "error", { message: "content required" });
    return;
  }

  const isAIMode = receiverId === ChatStore.AI_USER_ID;
  const mode = isAIMode ? "ai" : "human";
  const conv = await store.getOrCreateConversation(senderId, receiverId, mode);

  if (isAIMode) {
    const humanMsg = createMessage(senderId, ChatStore.AI_USER_ID, content, "human");
    store.addMessage(conv.conversationId, humanMsg, status, "ai");
    send(socket, "message:receive", { message: humanMsg, conversationId: conv.conversationId });

    getAIProvider()
      .respond(senderId, content)
      .then((res) =>
      {
        const aiMsg = createMessage(ChatStore.AI_USER_ID, senderId, res.content, "ai");
        store.addMessage(conv.conversationId, aiMsg, status, "ai");
        send(socket, "message:receive", { message: aiMsg, conversationId: conv.conversationId });
      })
      .catch((err) =>
      {
        console.error("AI error:", err);
        send(socket, "error", { message: "AI response failed" });
      });
  } else {
    const msg = createMessage(senderId, receiverId, content, "human");
    await store.addMessage(conv.conversationId, msg, status, "human");
    const payload = {
      message: msg,
      conversationId: conv.conversationId,
      status,
      channel: "human"
    };
    send(socket, "message:receive", payload);
    const receiverWs = store.getWebSocket(receiverId);
    if (receiverWs) send(receiverWs, "message:receive", payload);
  }
}

// ─── Typing ───────────────────────────────────────────────────────────────────

function handleTypingStart(socket: AuthenticatedWs, data: { partnerId?: string }): void
{
  const userId = socket.userId!;
  const partnerId = data?.partnerId;
  if (!partnerId) {
    send(socket, "error", { message: "partnerId required" });
    return;
  }
  store.setTyping(userId, partnerId, true);
  const partnerWs = store.getWebSocket(partnerId);
  if (partnerWs) send(partnerWs, "typing:start", { userId, isTyping: true });
}


async function handleTypingStop(
  socket: AuthenticatedWs,
  data: { partnerId: string; content?: string }
): Promise<void>
{
  const userId = socket.userId!;
  const partnerId = data?.partnerId;

  if (!partnerId) return;

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
    send(partnerWs, "typing:stop", { userId, isTyping: false });
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
function broadcastTypingStop(userId: string): void
{
  const partners = store.getPartnersWithTypingFrom(userId);
  for (const partnerId of partners) {
    const partnerWs = store.getWebSocket(partnerId);
    if (partnerWs) send(partnerWs, "typing:stop", { userId, isTyping: false });
  }
}


function handleModeSwitch(socket: AuthenticatedWs, data: ModeSwitchPayload): void
{
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
      if (partnerWs)
        send(partnerWs, "mode:switch", {
          conversationId: data.conversationId,
          mode: data.mode,
        });
    }
    send(socket, "mode:switch", {
      conversationId: data.conversationId,
      mode: data.mode,
    });
  }
}


function handleDisconnect(socket: AuthenticatedWs): void
{
  if (socket.userId) {
    const userId = socket.userId;
    store.unregisterUser(userId);
    broadcastTypingStop(userId);
    broadcastUserOffline(userId);
    broadcastPresence();
  }
  socket.close();
}
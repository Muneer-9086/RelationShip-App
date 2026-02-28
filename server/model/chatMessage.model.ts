import mongoose, { Schema, Document, Types } from "mongoose";

export type SenderType = "user" | "ai" | "system";
export type ChannelType = "human" | "ai"  | "system";
export type MessageStatus = "draft" | "analyzed" | "blocked" | "rewritten" | "sent";

export interface IChatMessage extends Document {
  roomId: Types.ObjectId;

  senderType: SenderType;
  senderId?: Types.ObjectId;

  content: string;

  channel: ChannelType;
  status: MessageStatus;

  visibleTo: Types.ObjectId[];

  analysis?: {
    sentiment?: "positive" | "neutral" | "negative";
    toxicity?: number;
    warning?: string;
    rewrittenText?: string;
  };

  replyTo?: Types.ObjectId;

  createdAt: Date;
}

const ChatMessageSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "ChatRoom", required: true },

    senderType: { type: String, enum: ["user", "ai", "system"], required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User" },
    aiSenderId: {
      type: Schema.Types.ObjectId,
      ref:"AIConversationMemory"
    },

    content: { type: String, required: true },

    channel: {
      type: String,
      enum: ["human", "ai", "system"],
      required: true
    },

    status: {
      type: String,
      enum: ["draft", "analyzed", "blocked", "rewritten", "sent"],
      default: "sent"
    },

    visibleTo: [{ type: Schema.Types.ObjectId, ref: "User" }],

    analysis: {
      sentiment: { type: String, enum: ["positive", "neutral", "negative"] },
      toxicity: Number,
      warning: String,
      rewrittenText: String
    },
  

    replyTo: { type: Schema.Types.ObjectId, ref: "ChatMessage" }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);

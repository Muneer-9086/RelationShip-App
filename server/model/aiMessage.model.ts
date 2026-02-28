import mongoose, { Schema, Document, Types, model } from "mongoose";

const ConversationMemorySchema = new Schema(
    {
        chatRoomId:{ type: Schema.Types.ObjectId, ref: "ChatRoom", required: true ,index:true},
        
        conversationId: { type: Schema.Types.ObjectId, ref: "User", required: true,index:true },

        summary: {
            type: String,
            default: "",
        },

        relationship: {
            type: String,
            default: "No idea of current relationship with this person",
        },

        persona: {
            type: String,
            default: "Not applied currently",
        },

        longMemory: {
            type: [String],
            default: [],
        },

        userEmotional: {
            type: String,
            default: "Not applied currently",
            trim: true
        },
        emotionControl: {
            type: String,
            enum: ["easy", "neutral", "hard"],
            default: "neutral",
        },

        lastSummarizedMessageAt: {
            type: Date,
            default: null,
        },

    },
    { timestamps: true }
);

const ConversationMemory = model(
    "AIConversationMemory",
    ConversationMemorySchema
);

export default ConversationMemory;
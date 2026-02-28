import mongoose, { Schema, Document, Types } from "mongoose";


export interface IChatRephrase extends Document
{
    chatMessageId: Types.ObjectId;
    chatRoomId: Types.ObjectId;
    content: string;
    aiRewriteSuggestion: string[];
    tone: string,
    reason: string,
    createdAt: Date;
    updatedAt: Date;
}


const ChatRephraseSchema = new Schema<IChatRephrase>(
    {
        chatMessageId: {
            type: Schema.Types.ObjectId,
            ref: "ChatMessage",
            required: true,
        },

        chatRoomId: {
            type: Schema.Types.ObjectId,
            ref: "ChatRoom",
            required: true,
        },

        content: {
            type: String,
            required: true,
            trim: true
        },

        aiRewriteSuggestion: {
            type: [String],
            default: []
        },

        tone: {
            type: String,
            default: ""
        },
        reason: {
            type: String,
            default: ""

        }

    },
    {
        timestamps: true
    }
);



ChatRephraseSchema.index({ chatMessageId: 1 });
ChatRephraseSchema.index({ chatRoomId: 1 });



export default mongoose.model<IChatRephrase>(
    "ChatRephrase",
    ChatRephraseSchema
);
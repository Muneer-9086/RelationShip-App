import mongoose, { Schema, Document, Types } from "mongoose";

export type HealthLabel = "good" | "neutral" | "warning" | "toxic";




export interface IUserAIState
{
    persona?: string;
    tone?: string;
    relationshipInsights?: string;
    lastMessage?: string;
    recommendations?: string[];
    conversationHealth?: any;
    participantPerspectives?: string[];
    thoughts?: string[];
    senderId: Types.ObjectId;
    lastMessageId: Types.ObjectId;
    longMemory: string[];
    summary: string;
    participants: Types.ObjectId[]; 
    status: string;
    thoughtProcess: string[];
    conversationId: Types.ObjectId;


}


export const AIStateSchema = new Schema<IUserAIState>(
    {
        senderId: {
            type: Schema.Types.ObjectId,
            ref: "User", required: true
        },
        conversationId: {
            type: Schema.Types.ObjectId,
             ref: "User", required: true 
        },
        status: {
            type: String,
            required:true
        },
        participants: [
            { type: Schema.Types.ObjectId, ref: "User", required: true }
        ],
        lastMessageId: {
            type: Schema.Types.ObjectId,
            ref: "ChatMessage",
            required: true
        },
        persona: {
            type: String,
            trim: true,
            default: ""
        },
        tone: {
            type: String,
            trim: true,
            default: ""
        },
       
        relationshipInsights: {
            type: String,
            trim: true,
            default: ""
        },
        longMemory: [
            {
                type: String,
                trim: true,
                default: ""
            }
        ],
        summary: {
            type: String,
            trime: true,
            default: ""

        },
        lastMessage: {
            type: String,
            trim: true,
            default: ""
        },
        recommendations: {
            type: [String],
            default: []
        },
        conversationHealth: {
            score: {
                type: Number,
                default:0
            },
            label: {
                type: String,
                default:""
            },
            reason: {
                type: String,
                default:""
           }
        },

        participantPerspectives: {
            type: [String],
            default: []
        },
        thoughtProcess: {
            type: [String],
            default: []
        },

      
    },
);

export default mongoose.model<IUserAIState>("AIAnalysis", AIStateSchema);
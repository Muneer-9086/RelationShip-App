import mongoose, { Schema, Document, Types } from "mongoose";



export type HealthLabel = "good" | "neutral" | "warning" | "toxic";




export interface IChatRoom extends Document {
  participants: Types.ObjectId[]; // exactly 2 users

  lastMessage?: string;
  lastMessageAt?: Date;
  summary?: string;
  aiStatus: [{
    id: string,
    status: Boolean
  }];
  conversationHealth?: {
    score: number;
    label: HealthLabel;
    reason?: string;
  };
  aiState: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}




const ChatRoomSchema = new Schema<IChatRoom>(
  {
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true }
    ],

    lastMessage: {
      type: String,
      default: ""
    },

    lastMessageAt: {
      type: Date
    },

    summary: {
      type: String,
      default: ""
    },

    aiStatus: [{
      id: String,
      status: {
        type: Boolean,
        default:true
      },
    }],

    aiState: [{
      type: Schema.Types.ObjectId,
      ref:"AIAnalysis"
    }]
  },
  {
    timestamps: true
  }
);


ChatRoomSchema.index({ participants: 1 });


ChatRoomSchema.pre("save", async function () {
  const doc = this as any;

  if (!doc.isModified("participants")) return;

  console.log("participants....");
  console.log(doc.participants);

  if (!doc.participants || doc.participants.length === 0) {
    doc.aiStatus = [];
    return;
  }

  doc.aiStatus = doc.participants.map((userId: any) => ({
    id: userId.toString(),
    status: true,
  }));
});



export default mongoose.model<IChatRoom>("ChatRoom", ChatRoomSchema);
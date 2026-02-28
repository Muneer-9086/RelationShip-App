import { NextFunction, Request, Response } from "express";
import userModel from "../model/user.model";
import mongoose from "mongoose";
import chatRoomModel from "../model/chatRoom.model";
import chatMessageModel from "../model/chatMessage.model";
import chatRephraseModel from "../model/messageRephase.model";
import aiAnalysisModel from "../model/aiAnalysis.model";
import { generatePositiveRewrite, analyzeConversation, AICoachContext, AICoachMemory, AICoachMessage } from "../llm";
import converstationModel from "../model/aiMessage.model";
import store from "../model/ChatStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PopulatedParticipant {
    _id: mongoose.Types.ObjectId;
    fullName: string;
}

interface ChatMessageDoc {
    _id: mongoose.Types.ObjectId;
    senderType: string;
    senderId?: { _id: mongoose.Types.ObjectId; fullName: string } | mongoose.Types.ObjectId;
    content: string;
    channel: string;
    status: string;
    createdAt: Date;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function buildChatTranscript(messages: ChatMessageDoc[]): string {
    if (!messages?.length) return "";

    const ordered = [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return ordered
        .map(m => {
            const senderObj = m.senderId as { fullName?: string } | undefined;
            const name = senderObj?.fullName || "Unknown";
            return `${name}: ${m.content}`;
        })
        .join("\n");
}

function formatHumanChatContext(messages: ChatMessageDoc[]): string {
    if (!messages?.length) return "No conversation history available.";

    return [...messages]
        .reverse()
        .reduce((acc, msg) => {
            const senderObj = msg.senderId as { fullName?: string } | undefined;
            const userName = senderObj?.fullName || "User";
            const content = msg.content || "";

            if (msg.status === "blocked") {
                acc.push(`${userName}: [Message blocked by AI] (${content})`);
            } else {
                acc.push(`${userName}: ${content}`);
            }

            return acc;
        }, [] as string[])
        .join("\n");
}

// ─── Controllers ──────────────────────────────────────────────────────────────

const chat_users_controller = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.query;

        if (!id || typeof id !== "string") {
            res.status(400).json({ message: "valid user id is not provided" });
            return;
        }

        const objectId = new mongoose.Types.ObjectId(id);
        const users = await userModel.find({ _id: { $ne: objectId } });

        res.status(200).json(users);
    } catch (err) {
        next(err);
    }
};

const chat_human_conversation_controller = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { conversationId } = req.query;
        
        if (!conversationId || typeof conversationId !== "string") {
            res.status(400).json({ message: "valid conversation id is not provided" });
            return;
        }

        const ids = conversationId.split(":");
        if (ids.length !== 2) {
            res.status(400).json({ message: "conversation id is not provided" });
            return;
        }

        const [userId1, userId2] = ids;
        const objectId1 = new mongoose.Types.ObjectId(userId1);
        const objectId2 = new mongoose.Types.ObjectId(userId2);

        const chatRoom = await chatRoomModel.findOne({
            participants: { $all: [objectId1, objectId2] }
        });

        if (!chatRoom) {
            res.status(200).json({
                conversationId,
                chatRoom: null,
                chatHumanData: []
            });
            return;
        }

        const chatHumanData = await chatMessageModel.find({
            roomId: chatRoom._id,
            channel: "human",
            status: "sent"
        });

        res.status(200).json({
            conversationId,
            chatRoom,
            chatHumanData
        });
    } catch (err) {
        next(err);
    }
};

const chat_rephase_controller = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { converstationId } = req.query;

        if (typeof converstationId !== "string") {
            res.status(400).json({ message: "conversation id is not valid" });
            return;
        }

        const ids = converstationId.split(":");
        if (ids.length !== 2) {
            res.status(400).json({ message: "conversation id is not valid" });
            return;
        }

        const [userId1, userId2] = ids;
        const objectId1 = new mongoose.Types.ObjectId(userId1);
        const objectId2 = new mongoose.Types.ObjectId(userId2);

        const chatRoom = await chatRoomModel.findOne({
            participants: { $all: [objectId1, objectId2] }
        });

        if (!chatRoom) {
            res.status(404).json({ message: "conversation not found" });
            return;
        }

        const lastMessage = await chatMessageModel
            .findOne({ roomId: chatRoom._id })
            .sort({ createdAt: -1 });

        if (!lastMessage) {
            res.json({ message: "no messages" });
            return;
        }

        const isLastBlockedHuman = lastMessage.channel === "human" && lastMessage.status === "blocked";

        if (!isLastBlockedHuman) {
            await chatMessageModel.deleteMany({
                roomId: chatRoom._id,
                channel: "human",
                status: "blocked"
            });
        }

        res.json({
            success: true,
            lastMessageIsBlocked: isLastBlockedHuman,
            lastMessage: isLastBlockedHuman ? lastMessage.content : null
        });
    } catch (err) {
        next(err);
    }
};

const chat_rephase_suggestion_controller = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { conversationId } = req.query;

        if (!conversationId || typeof conversationId !== "string") {
            res.status(400).json({ message: "valid conversation id is not provided" });
            return;
        }

        const ids = conversationId.split(":");
        if (ids.length !== 2) {
            res.status(400).json({ message: "conversation id is not provided" });
            return;
        }

        const [userId1, userId2] = ids;
        const objectId1 = new mongoose.Types.ObjectId(userId1);
        const objectId2 = new mongoose.Types.ObjectId(userId2);

        const chatRoom = await chatRoomModel.findOne({
            participants: { $all: [objectId1, objectId2] }
        });

        if (!chatRoom) {
            res.status(404).json({ message: "conversation not found" });
            return;
        }

        const lastMessage = await chatMessageModel
            .findOne({ roomId: chatRoom._id })
            .sort({ createdAt: -1 });

        if (!lastMessage) {
            res.status(404).json({ message: "no messages in conversation" });
            return;
        }

        const existingRephase = await chatRephraseModel.findOne({
            chatMessageId: lastMessage._id,
            chatRoomId: chatRoom._id,
        });

        if (existingRephase) {
            res.status(200).json({
                chatMessageId: lastMessage._id,
                chatRoomId: chatRoom._id,
                content: lastMessage.content,
                aiRewriteSuggestion: existingRephase.aiRewriteSuggestion,
                reason: existingRephase.reason,
                tone: existingRephase.tone
            });
            return;
        }

        const messages = await chatMessageModel
            .find({ roomId: chatRoom._id, status: "sent" })
            .sort({ createdAt: -1 })
            .limit(6)
            .lean() as ChatMessageDoc[];

        const transcript = buildChatTranscript(messages);

        const positiveRewriteResult = await generatePositiveRewrite({
            message: lastMessage.content,
            history: transcript.length > 0 ? transcript : "No prior conversation"
        });

        const chat_rephase = new chatRephraseModel({
            chatMessageId: lastMessage._id,
            chatRoomId: chatRoom._id,
            content: lastMessage.content,
            aiRewriteSuggestion: positiveRewriteResult.suggestions,
            reason: positiveRewriteResult.reason,
            tone: positiveRewriteResult.tone
        });

        await chat_rephase.save();

        res.json({
            chatMessageId: lastMessage._id,
            chatRoomId: chatRoom._id,
            content: lastMessage.content,
            positiveRewriteResult
        });
    } catch (err) {
        next(err);
    }
};

const relationship_analysis_schema_controller = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { converstationId } = req.query;

        if (!converstationId || typeof converstationId !== "string") {
            res.status(400).json({ message: "valid conversation id is not provided" });
            return;
        }

        const ids = converstationId.split(":");
        if (ids.length !== 2) {
            res.status(400).json({ message: "conversation id is not provided" });
            return;
        }

        const [userId1, userId2] = ids;
        const objectId1 = new mongoose.Types.ObjectId(userId1);
        const objectId2 = new mongoose.Types.ObjectId(userId2);

        const chatRoom = await chatRoomModel
            .findOne({ participants: { $all: [objectId1, objectId2] } })
            .populate({ path: "participants", select: "_id fullName" })
            .populate({ path: "aiState" }) as any;

        if (!chatRoom) {
            res.status(404).json({ message: "conversation not found" });
            return;
        }

        const lastMessage = await chatMessageModel
            .findOne({ roomId: chatRoom._id })
            .sort({ createdAt: -1 })
            .populate({ path: "senderId", select: "_id fullName" }) as any;

        if (!lastMessage) {
            res.status(404).json({ message: "no messages in conversation" });
            return;
        }

        if (chatRoom?.aiState?.length > 1) {
            if (lastMessage._id.toString() === chatRoom.aiState[0].lastMessageId?.toString()) {
                res.status(200).json({
                    aiAnalysis1: chatRoom.aiState[0],
                    aiAnalysis2: chatRoom.aiState[1]
                });
                return;
            }
            res.status(200).json({ message: "SOMETHING WENT WRONG" });
            return;
        }

        let messages: ChatMessageDoc[];
        if (lastMessage.status === "sent") {
            messages = await chatMessageModel
                .find({
                    roomId: chatRoom._id,
                    status: "sent",
                    _id: { $ne: lastMessage._id },
                })
                .populate({ path: "senderId", select: "_id fullName" })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean() as ChatMessageDoc[];
        } else {
            messages = await chatMessageModel
                .find({ roomId: chatRoom._id, status: "sent" })
                .populate({ path: "senderId", select: "_id fullName" })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean() as ChatMessageDoc[];
        }

        const transcript = buildChatTranscript(messages);
        let persona = "";

        if (chatRoom?.aiState?.length > 0) {
            persona = chatRoom.aiState
                .map((ai: any) => {
                    const participant = chatRoom.participants.find(
                        (p: PopulatedParticipant) => p._id.toString() === ai.conversationId?.toString()
                    );
                    if (!participant) return null;
                    return `${participant.fullName}:${ai.persona}`;
                })
                .filter(Boolean)
                .join(" | ");
        }

        const aiResponse = await analyzeConversation({
            message: lastMessage.content,
            history: transcript,
            persona: persona,
            user: {
                part1: chatRoom.participants[0].fullName,
                part2: chatRoom.participants[1].fullName,
                status: lastMessage.status,
                status_user: lastMessage.senderId?.fullName || "Unknown"
            }
        });

        let aiAnalysis1 = null;
        let aiAnalysis2 = null;

        const createAnalysis = async (participantIndex: number, insightIndex: number) => {
            return aiAnalysisModel.create({
                persona: aiResponse.userInsights[insightIndex]?.persona,
                conversationId: chatRoom.participants[participantIndex]._id,
                tone: aiResponse.userInsights[insightIndex]?.tone,
                relationshipInsights: aiResponse.userInsights[insightIndex]?.interactionDynamics,
                lastMessage: lastMessage.content,
                recommendations: aiResponse.userInsights[insightIndex]?.recommendations,
                conversationHealth: aiResponse.userInsights[insightIndex]?.conversationHealth,
                participantPerspectives: aiResponse.participantPerspectives[insightIndex]?.observations,
                thoughts: aiResponse.perspectiveThoughtProcess[insightIndex]?.steps,
                senderId: chatRoom.participants[0]._id,
                lastMessageId: lastMessage._id,
                longMemory: aiResponse.userInsights[insightIndex]?.longTermSignals,
                summary: aiResponse.userInsights[insightIndex]?.summary,
                participants: [chatRoom.participants[0]._id, chatRoom.participants[1]._id],
                status: lastMessage.status,
                thoughtProcess: aiResponse.perspectiveThoughtProcess[insightIndex]?.steps,
            });
        };

        if (chatRoom.participants[0]._id.toString() === lastMessage.senderId?._id?.toString()) {
            const idx1 = aiResponse.participantPerspectives.findIndex(
                vl => vl.participant === chatRoom.participants[0].fullName
            );
            const idx2 = aiResponse.participantPerspectives.findIndex(
                vl => vl.participant === chatRoom.participants[1].fullName
            );

            aiAnalysis1 = await createAnalysis(0, idx1);
            await aiAnalysis1.save();

            aiAnalysis2 = await createAnalysis(1, idx2);
            await aiAnalysis2.save();
        } else {
            const idx1 = aiResponse.participantPerspectives.findIndex(
                vl => vl.participant === chatRoom.participants[0].fullName
            );
            const idx2 = aiResponse.participantPerspectives.findIndex(
                vl => vl.participant === chatRoom.participants[1].fullName
            );

            aiAnalysis2 = await createAnalysis(1, idx2);
            await aiAnalysis2.save();

            aiAnalysis1 = await createAnalysis(0, idx1);
            await aiAnalysis1.save();
        }

        if (chatRoom?.aiState?.length > 1) {
            await aiAnalysisModel.deleteMany({
                _id: { $in: [chatRoom.aiState[0]._id, chatRoom.aiState[1]._id] }
            });
        }

        if (aiAnalysis1 && aiAnalysis2) {
            chatRoom.aiState = [aiAnalysis1._id, aiAnalysis2._id];
            await chatRoom.save();
        }

        res.status(200).json({ aiAnalysis1, aiAnalysis2 });
    } catch (err) {
        next(err);
    }
};

// ─── Enhanced AI Chat Controller with Proper Memory Handling ──────────────────

const ai_chat_getAll_controller = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { otherConversationId, converstationId } = req.body;

        if (!otherConversationId || typeof otherConversationId !== "string") {
            res.status(400).json({ message: "chatRoomId is not provided" });
            return;
        }

        if (!converstationId || typeof converstationId !== "string") {
            res.status(400).json({ message: "converstationId is not provided" });
            return;
        }

        // Get or create conversation memory
        let memory = await converstationModel.findOne({ conversationId: converstationId });

        // Get chat room with participants
        const chatRoom = await chatRoomModel
            .findOne({
                participants: {
                    $all: [
                        new mongoose.Types.ObjectId(converstationId),
                        new mongoose.Types.ObjectId(otherConversationId),
                    ],
                },
            })
            .populate({ path: "participants", select: "_id fullName" }) as any;

        if (!chatRoom) {
            res.status(400).json({ message: "Chat room doesn't exist" });
            return;
        }

        const chatRoomId = chatRoom._id;
        const myId = new mongoose.Types.ObjectId(converstationId);
        const chatRoomMongoId = new mongoose.Types.ObjectId(chatRoomId);

        // Get participants
        const otherParticipant = chatRoom.participants.find(
            (vl: PopulatedParticipant) => !vl._id.equals(myId)
        ) as PopulatedParticipant | undefined;

        const userParticipant = chatRoom.participants.find(
            (vl: PopulatedParticipant) => vl._id.equals(myId)
        ) as PopulatedParticipant | undefined;

        if (!userParticipant || !otherParticipant) {
            res.status(400).json({ message: "No conversation room is created" });
            return;
        }

        const otherParticipantId = otherParticipant._id;

        // Get AI analysis for both users (for summaries and tones)
        const analysisUser1 = await aiAnalysisModel
            .findOne({ conversationId: myId })
            .sort({ createdAt: -1 })
            .lean();

        const analysisUser2 = await aiAnalysisModel
            .findOne({ conversationId: otherParticipantId })
            .sort({ createdAt: -1 })
            .lean();

        // Get human chat messages (SHORT-TERM: last 10 messages for context)
        const humanChatMessages = await chatMessageModel
            .find({ roomId: chatRoomMongoId, channel: "human" })
            .sort({ createdAt: -1 })
            .populate({ path: "senderId", select: "_id fullName" })
            .limit(10)
            .lean() as ChatMessageDoc[];

        const humanChatContext = formatHumanChatContext(humanChatMessages);

        // Get AI chat messages (SHORT-TERM: last 10 for conversation history)
        const getAIChatHistory = async (memoryId: mongoose.Types.ObjectId): Promise<AICoachMessage[]> => {
            const aiMessages = await chatMessageModel
                .find({
                    roomId: chatRoomMongoId,
                    channel: "ai",
                    $or: [
                        { senderId: myId },
                        { aiSenderId: memoryId },
                    ],
                })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            return aiMessages.reverse().map(msg => ({
                role: msg.senderType === "ai" ? 'ai' as const : 'user' as const,
                content: msg.content,
                timestamp: new Date(msg.createdAt).getTime()
            }));
        };

        // LONG-TERM MEMORY: Get from existing model
        const getLongTermMemory = (memoryDoc: any, analysis1: any, analysis2: any): string[] => {
            const longMemory: string[] = [];

            // Add from memory document
            if (memoryDoc?.longMemory?.length > 0) {
                longMemory.push(...memoryDoc.longMemory);
            }

            // Add from AI analysis long-term signals
            if (analysis1?.longMemory?.length > 0) {
                longMemory.push(...analysis1.longMemory);
            }
            if (analysis2?.longMemory?.length > 0) {
                longMemory.push(...analysis2.longMemory);
            }

            // Dedupe and limit
            return [...new Set(longMemory)].slice(0, 20);
        };

        // Build AI Coach Context
        const buildAICoachContext = async (memoryDoc: any): Promise<AICoachContext> => {
            const shortTermMessages = memoryDoc?._id 
                ? await getAIChatHistory(memoryDoc._id)
                : [];

            const aiMemory: AICoachMemory = {
                shortTermMessages,
                longTermMemory: getLongTermMemory(memoryDoc, analysisUser1, analysisUser2),
                persona: memoryDoc?.persona || analysisUser1?.persona || "No specific persona identified.",
                relationship: memoryDoc?.relationship || "Relationship not yet established.",
                userEmotional: memoryDoc?.userEmotional || "Unknown emotional state.",
                aiSummary: memoryDoc?.summary || ""
            };

            return {
                currentUserName: userParticipant.fullName,
                otherUserName: otherParticipant.fullName,
                currentUserId: converstationId,
                otherUserId: otherConversationId,
                userSummary1: analysisUser1?.summary || "No summary available.",
                userSummary2: analysisUser2?.summary || "No summary available.",
                user1Tone: analysisUser1?.tone || "Unknown tone.",
                user2Tone: analysisUser2?.tone || "Unknown tone.",
                humanChatContext,
                memory: aiMemory,
                chatRoomId: chatRoomId.toString(),
                conversationId: converstationId,
                aiSenderId: memoryDoc?._id?.toString() || "",
                visibleTo: chatRoom.participants.map((p: PopulatedParticipant) => p._id.toString())
            };
        };

        // Create initial greeting message
        const initialGreeting = `Hi! I've analyzed your conversation with ${otherParticipant.fullName} and I'm ready to help.`;

        if (!memory) {
            // Create new memory document
            memory = await converstationModel.create({
                chatRoomId: chatRoomId,
                conversationId: converstationId,
                persona: analysisUser1?.persona || "Not applied currently",
                relationship: "Not yet established",
                longMemory: getLongTermMemory(null, analysisUser1, analysisUser2),
                userEmotional: "Not applied currently",
                summary: ""
            });

            // Create initial AI message
            const chatMessage = new chatMessageModel({
                senderType: "ai",
                senderId: converstationId,
                roomId: chatRoomId,
                channel: "ai",
                content: initialGreeting,
                aiSenderId: memory._id,
                status: "sent",
                visibleTo: chatRoom.participants.map((p: PopulatedParticipant) => p._id)
            });
            await chatMessage.save();

            // Store context in memory store for WebSocket handler
            const context = await buildAICoachContext(memory);
            store.addAIMessageContent(`${chatRoomId}:${converstationId}`, {
                userSummary1: context.userSummary1,
                userSummary2: context.userSummary2,
                userChat: humanChatContext,
                currentUserName: context.currentUserName,
                otherUserName: context.otherUserName,
                user1Tone: context.user1Tone,
                user2Tone: context.user2Tone,
                aiSummary: context.memory.aiSummary,
                persona: context.memory.persona,
                longMemory: context.memory.longTermMemory,
                userEmotional: context.memory.userEmotional,
                relationship: context.memory.relationship,
                message: [{ ai: initialGreeting }],
                aiSenderId: memory._id.toString(),
                visibleTo: context.visibleTo
            });

            // Get all AI chat messages
            const chatMessages = await chatMessageModel
                .find({
                    roomId: chatRoomMongoId,
                    channel: "ai",
                    $or: [
                        { senderId: myId },
                        { aiSenderId: memory._id },
                    ],
                })
                .sort({ createdAt: 1 })
                .lean();

            res.status(200).json({
                aiContext: memory,
                chat: chatMessages,
                chatRoomId: chatRoomId
            });
            return;
        }

        // Existing memory - update with fresh context
        const context = await buildAICoachContext(memory);

        // Update memory with latest long-term insights
        const updatedLongMemory = getLongTermMemory(memory, analysisUser1, analysisUser2);
        if (JSON.stringify(memory.longMemory) !== JSON.stringify(updatedLongMemory)) {
            memory.longMemory = updatedLongMemory;
            await memory.save();
        }

        // Store context in memory store for WebSocket handler
        store.addAIMessageContent(`${chatRoomId}:${converstationId}`, {
            userSummary1: context.userSummary1,
            userSummary2: context.userSummary2,
            userChat: humanChatContext,
            currentUserName: context.currentUserName,
            otherUserName: context.otherUserName,
            user1Tone: context.user1Tone,
            user2Tone: context.user2Tone,
            aiSummary: context.memory.aiSummary,
            persona: context.memory.persona,
            longMemory: context.memory.longTermMemory,
            userEmotional: context.memory.userEmotional,
            relationship: context.memory.relationship,
            message: context.memory.shortTermMessages.map(m => 
                m.role === 'ai' ? { ai: m.content } : { user: m.content }
            ),
            aiSenderId: memory._id.toString(),
            visibleTo: context.visibleTo
        });

        // Get all AI chat messages
        const chatMessages = await chatMessageModel
            .find({
                roomId: chatRoomMongoId,
                channel: "ai",
                $or: [
                    { senderId: myId },
                    { aiSenderId: memory._id },
                ],
            })
            .sort({ createdAt: 1 })
            .lean();

        res.status(200).json({
            aiContext: memory,
            chat: chatMessages,
            chatRoomId: chatRoomId
        });
    } catch (err) {
        console.error("ai_chat_getAll_controller error:", err);
        next(err);
    }
};

export {
    chat_users_controller,
    chat_human_conversation_controller,
    chat_rephase_controller,
    chat_rephase_suggestion_controller,
    relationship_analysis_schema_controller,
    ai_chat_getAll_controller
};

import { NextFunction, Request, response, Response } from "express";
import userModel from "../model/user.model";
import mongoose from "mongoose";
import chatRoomModel from "../model/chatRoom.model";
import chatMessageModel from "../model/chatMessage.model";
import chatRephraseModel from "../model/messageRephase.model";
import aiAnalysisModel from "../model/aiAnalysis.model";

import { generatePositiveRewrite, analyzeConversation } from "../llm";
import converstationModel from "../model/aiMessage.model";
import store, { ChatStore } from "../model/ChatStore";


const chat_users_controller = async (req: Request, res: Response, next: NextFunction) =>
{
  try {
    const { id } = req.query;

    if (!id || typeof id !== "string") {
      res.status(400).json({
        message: "valid user id is not provided"
      });
      return;
    }

    const objectId = new mongoose.Types.ObjectId(id);

    const users = await userModel.find({
      _id: { $ne: objectId }
    });

    res.status(200).json(users);

  } catch (err) {
    next(err);
  }
};


const chat_human_conversation_controller = async (req: Request, res: Response, next: NextFunction) =>
{
  try {
    const { conversationId } = req.query;
    if (!conversationId || typeof conversationId != "string") {
      res.status(400).json({
        message: "valid conversation id is not provided"
      })
      return;
    }
    const ids = conversationId.split(":");
    if (ids.length != 2) {
      res.status(400).json({ message: "converstation id is not provided" });
      return;
    }
    const [userId1, userId2] = ids;
    const objectId1 = new mongoose.Types.ObjectId(userId1);
    const objectId2 = new mongoose.Types.ObjectId(userId2);

    const chatRoom = await chatRoomModel.findOne({
      participants: { $all: [objectId1, objectId2] }
    });

    if (!chatRoom || chatRoom == null) {
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
    })


    return res.status(200).json({
      conversationId,
      chatRoom,
      chatHumanData

    })


  }
  catch (err) {
    next(err);
  }
}


const chat_rephase_controller = async (
  req: Request,
  res: Response,
  next: NextFunction
) =>
{
  try {

    const { converstationId } = req.query;

    console.log("converstationId", converstationId);

    if (typeof converstationId !== "string") {
      return res.status(400).json({
        message: "conversation id is not valid"
      });
    }

    const ids = converstationId.split(":");

    if (ids.length !== 2) {
      return res.status(400).json({
        message: "conversation id is not valid"
      });
    }

    const [userId1, userId2] = ids;

    const objectId1 = new mongoose.Types.ObjectId(userId1);
    const objectId2 = new mongoose.Types.ObjectId(userId2);


    const chatRoom = await chatRoomModel.findOne({
      participants: { $all: [objectId1, objectId2] }
    });

    if (!chatRoom) {
      return res.status(404).json({
        message: "conversation not found"
      });
    }


    // 1️⃣ get last message
    const lastMessage = await chatMessageModel
      .findOne({ roomId: chatRoom._id })
      .sort({ createdAt: -1 });

    if (!lastMessage) {
      return res.json({ message: "no messages" });
    }

    const isLastBlockedHuman =
      lastMessage.channel === "human" &&
      lastMessage.status === "blocked";

    if (!isLastBlockedHuman) {
      await chatMessageModel.deleteMany({
        roomId: chatRoom._id,
        channel: "human",
        status: "blocked"
      });

    }

    return res.json({
      success: true,
      lastMessageIsBlocked: isLastBlockedHuman,
      lastMessage: isLastBlockedHuman ? lastMessage.content : null
    });

  } catch (err) {
    next(err);
  }
};


type Message = {
  senderId: string;
  content: string;
  createdAt: string;
};

function buildChatTranscript(messages: any[])
{
  if (!messages?.length) return "";

  const ordered = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return ordered
    .map(m =>
    {
      const name = m.senderId?.fullName || "Unknown";
      return `${name}: ${m.content}`;
    })
    .join("\n");
}
const chat_rephase_suggestion_controller = async (req: Request, res: Response, next: NextFunction) =>
{
  try {
    const { conversationId } = req.query;
    console.log("conversationId");
    console.log(conversationId)
    if (!conversationId || typeof conversationId != "string") {
      res.status(400).json({
        message: "valid conversation id is not provided"
      })
      return;
    }
    const ids = conversationId.split(":");
    if (ids.length != 2) {
      res.status(400).json({ message: "converstation id is not provided" });
      return;
    }
    const [userId1, userId2] = ids;
    const objectId1 = new mongoose.Types.ObjectId(userId1);
    const objectId2 = new mongoose.Types.ObjectId(userId2);

    const chatRoom = await chatRoomModel.findOne({
      participants: { $all: [objectId1, objectId2] }
    });

    if (!chatRoom || chatRoom == null) {
      res.status(404).json({
        message: "conversation not found"
      });
      return;
    }



    const lastMessage = await chatMessageModel
      .findOne({ roomId: chatRoom._id })
      .sort({ createdAt: -1 });

    if (!lastMessage) {
      res.status(404).json({
        message: "no messages in conversation"
      });
      return;
    }


    const existingRephase = await chatRephraseModel.findOne({
      chatMessageId: lastMessage._id,
      chatRoomId: chatRoom._id,
    }
    )

    if (existingRephase) {


      res.status(200).json({
        chatMessageId: lastMessage._id,
        chatRoomId: chatRoom._id,
        content: lastMessage.content,
        aiRewriteSuggestion: existingRephase.aiRewriteSuggestion,
        reason: existingRephase.reason,
        tone: existingRephase.tone
      })
      return;
    }

    const messages: any[] = await chatMessageModel
      .find({ roomId: chatRoom._id, status: "sent" })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    const transcript = buildChatTranscript(messages);


    const positiveRewriteResult = await generatePositiveRewrite({
      message: lastMessage.content,
      history: (transcript.length > 0) ? transcript : "No prior converstation"
    });

    const chat_rephase = new chatRephraseModel(
      {
        chatMessageId: lastMessage._id,
        chatRoomId: chatRoom._id,
        content: lastMessage.content,
        aiRewriteSuggestion: positiveRewriteResult['suggestions'],
        reason: positiveRewriteResult['reason'],
        tone: positiveRewriteResult['tone']

      }
    )

    await chat_rephase.save();



    res.json({
      chatMessageId: lastMessage._id,
      chatRoomId: chatRoom._id,
      content: lastMessage.content,
      positiveRewriteResult
    });

  }
  catch (err) {
    next(err);
  }
}


const relationship_analysis_schema_controller = async (req: Request, res: Response, next: NextFunction) =>
{
  try {

    const { converstationId } = req.query;
    if (!converstationId || typeof converstationId != "string") {
      res.status(400).json({
        message: "valid conversation id is not provided"
      })
      return;
    }
    const ids = converstationId.split(":");
    if (ids.length != 2) {
      res.status(400).json({ message: "converstation id is not provided" });
      return;
    }

    const [userId1, userId2] = ids;
    const objectId1 = new mongoose.Types.ObjectId(userId1);
    const objectId2 = new mongoose.Types.ObjectId(userId2);

    const chatRoom: any = await chatRoomModel
      .findOne({
        participants: { $all: [objectId1, objectId2] },
      })
      .populate({
        path: "participants",
        select: "_id fullName",
      })
      .populate({
        path: "aiState",
      });

    if (!chatRoom || chatRoom == null) {
      res.status(404).json({
        message: "conversation not found"
      });
      return;
    }



    const lastMessage: any = await chatMessageModel
      .findOne({ roomId: chatRoom._id })
      .sort({ createdAt: -1 })
      .populate({
        path: "senderId",
        select: "_id fullName",
      })

    if (!lastMessage) {
      res.status(404).json({
        message: "no messages in conversation"
      });
      return;
    }
    if (chatRoom?.['aiState']?.length > 1) {
      if (lastMessage?.['_id'].toString() == chatRoom?.['aiState']?.[0]['lastMessageId'].toString()) {
        res.status(200).json({
          aiAnalysis1: chatRoom?.['aiState'][0],
          aiAnalysis2: chatRoom?.['aiState'][1]
        })
        return;
      }
      res.status(200).json({
        message: "SOMETHING WENT WRONG"
      });
      return;
    }


    let messages;
    if (lastMessage.status == "sent") {

      messages = await chatMessageModel
        .find({
          roomId: chatRoom._id,
          status: "sent",
          _id: { $ne: lastMessage._id },
        })
        .populate({
          path: "senderId",
          select: "_id fullName",
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
    }
    else {
      messages = await chatMessageModel
        .find({ roomId: chatRoom._id, status: "sent" })
        .populate({
          path: "senderId",
          select: "_id fullName",
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

    }


    const transcript = buildChatTranscript(messages);
    let aiResponse;
    let persona = "";
    if (chatRoom?.['aiState']?.length > 0) {
      persona = chatRoom.aiState
        .map((ai: any) =>
        {
          const participant = chatRoom.participants.find(
            (p: any) => p._id.toString() === ai.conversationId.toString()
          );

          if (!participant) return null;

          return `${participant.fullName}:${ai.persona}`;
        })
        .filter(Boolean) // remove nulls
        .join(" | "); // single string

    }


    let aiAnalysis1 = null;
    let aiAnalysis2 = null;

    aiResponse = await analyzeConversation({
      message: lastMessage.content,
      history: transcript,
      persona: persona,
      user: {
        part1: chatRoom['participants'][0]['fullName'],
        part2: chatRoom['participants'][1]['fullName'],
        status: lastMessage['status'],
        status_user: lastMessage['senderId']['fullName']
      }
    })



    if (chatRoom.participants[0]._id.toString() === lastMessage.senderId._id.toString()) {
      //it means he is lsat user messeger...
      let index = aiResponse.participantPerspectives.findIndex(
        vl => vl.participant === chatRoom.participants[0].fullName
      );

      aiAnalysis1 = await aiAnalysisModel.create({
        persona: aiResponse.userInsights[index]?.persona,
        conversationId: chatRoom.participants[0]._id,
        tone: aiResponse.userInsights[index]?.tone,
        relationshipInsights: aiResponse.userInsights[index]?.['interactionDynamics'],
        lastMessage: lastMessage.content,
        recommendations: aiResponse.userInsights[index]?.recommendations,
        conversationHealth: aiResponse.userInsights[index]?.conversationHealth,
        participantPerspectives: aiResponse.participantPerspectives[index]?.['observations'],
        thoughts: aiResponse.perspectiveThoughtProcess[index]?.steps,
        senderId: chatRoom.participants[0]._id,
        lastMessageId: lastMessage._id,
        longMemory: aiResponse.userInsights[index]?.longTermSignals,
        summary: aiResponse.userInsights[index]?.summary,
        participants: [
          chatRoom.participants[0]._id,
          chatRoom.participants[1]._id,
        ],
        status: lastMessage.status,
        thoughtProcess: aiResponse.perspectiveThoughtProcess[index]?.steps,
      });

      aiAnalysis1 = await aiAnalysis1.save();


      index = aiResponse.participantPerspectives.findIndex(
        vl => vl.participant === chatRoom.participants[1].fullName
      );

      aiAnalysis2 = await aiAnalysisModel.create({
        persona: aiResponse.userInsights[index]?.persona,
        tone: aiResponse.userInsights[index]?.tone,
        conversationId: chatRoom.participants[1]._id,
        relationshipInsights: aiResponse.userInsights[index]?.['interactionDynamics'],
        lastMessage: lastMessage.content,
        recommendations: aiResponse.userInsights[index]?.recommendations,
        conversationHealth: aiResponse.userInsights[index]?.conversationHealth,
        participantPerspectives: aiResponse.participantPerspectives[index]?.['observations'],
        thoughts: aiResponse.perspectiveThoughtProcess[index]?.steps,
        senderId: chatRoom.participants[0]._id,
        lastMessageId: lastMessage._id,
        longMemory: aiResponse.userInsights[index]?.longTermSignals,
        summary: aiResponse.userInsights[index]?.summary,
        participants: [
          chatRoom.participants[0]._id,
          chatRoom.participants[1]._id,
        ],
        status: lastMessage.status,
        thoughtProcess: aiResponse.perspectiveThoughtProcess[index]?.steps,
      });

      aiAnalysis2 = await aiAnalysis2.save();


    }
    else {

      let index = aiResponse.participantPerspectives.findIndex(
        vl => vl.participant === chatRoom.participants[1].fullName
      );

      aiAnalysis2 = await aiAnalysisModel.create({
        persona: aiResponse.userInsights[index]?.persona,
        tone: aiResponse.userInsights[index]?.tone,
        conversationId: chatRoom.participants[1]._id,
        relationshipInsights: aiResponse.userInsights[index]?.['interactionDynamics'],
        lastMessage: lastMessage.content,
        recommendations: aiResponse.userInsights[index]?.recommendations,
        conversationHealth: aiResponse.userInsights[index]?.conversationHealth,
        participantPerspectives: aiResponse.participantPerspectives[index]?.['observations'],
        thoughts: aiResponse.perspectiveThoughtProcess[index]?.steps,
        senderId: chatRoom.participants[0]._id,
        lastMessageId: lastMessage._id,
        longMemory: aiResponse.userInsights[index]?.longTermSignals,
        summary: aiResponse.userInsights[index]?.summary,
        participants: [
          chatRoom.participants[0]._id,
          chatRoom.participants[1]._id,
        ],
        status: lastMessage.status,
        thoughtProcess: aiResponse.perspectiveThoughtProcess[index]?.steps,
      });

      aiAnalysis2 = await aiAnalysis2.save();



      index = aiResponse.participantPerspectives.findIndex(
        vl => vl.participant === chatRoom.participants[0].fullName
      );

      aiAnalysis1 = await aiAnalysisModel.create({
        persona: aiResponse.userInsights[index]?.persona,
        tone: aiResponse.userInsights[index]?.tone,
        conversationId: chatRoom.participants[0]._id,
        relationshipInsights: aiResponse.userInsights[index]?.['interactionDynamics'],
        lastMessage: lastMessage.content,
        recommendations: aiResponse.userInsights[index]?.recommendations,
        conversationHealth: aiResponse.userInsights[index]?.conversationHealth,
        participantPerspectives: aiResponse.participantPerspectives[index]?.['observations'],
        thoughts: aiResponse.perspectiveThoughtProcess[index]?.steps,
        senderId: chatRoom.participants[0]._id,
        lastMessageId: lastMessage._id,
        longMemory: aiResponse.userInsights[index]?.longTermSignals,
        summary: aiResponse.userInsights[index]?.summary,
        participants: [
          chatRoom.participants[0]._id,
          chatRoom.participants[1]._id,
        ],
        status: lastMessage.status,
        thoughtProcess: aiResponse.perspectiveThoughtProcess[index]?.steps,
      });


      aiAnalysis1 = await aiAnalysis1.save();


    }

    if (chatRoom?.['aiState']?.length > 1) {
      await aiAnalysisModel.deleteMany({
        _id: {
          $in: [
            chatRoom.aiState[0]._id,
            chatRoom.aiState[1]._id
          ]
        }
      });
    }

    if (aiAnalysis1 != null && aiAnalysis2 != null) {
      chatRoom.aiState = [aiAnalysis1['_id'], aiAnalysis2["_id"]];
      await chatRoom.save();
    }


    res.status(200).json({
      aiAnalysis1,
      aiAnalysis2
    });
    return;

  }
  catch (err) {
    next(err);
  }

}


const ai_chat_getAll_controller = async (
  req: Request,
  res: Response,
  next: NextFunction
) =>
{
  try {
    const { otherConversationId, converstationId } = req.body;

    if (!otherConversationId || typeof otherConversationId !== "string") {
      return res.status(400).json({
        message: "chatRoomId is not provided",
      });
    }



    if (!converstationId || typeof converstationId !== "string") {
      return res.status(400).json({
        message: "converstationId is not provided",
      });
    }

    let memory = await converstationModel.findOne({
      conversationId: converstationId,
    });


    const chatRoom = await chatRoomModel
      .findOne({
        participants: {
          $all: [
            new mongoose.Types.ObjectId(converstationId),
            new mongoose.Types.ObjectId(otherConversationId),
          ],
        },
      })
      .populate({
        path: "participants",
        select: "_id fullName",
      });

    if (!chatRoom) {
      res.status(400).json({
        message: "Chat room does't exist"
      });
      return;
    }
    let chatRoomId = chatRoom["_id"];




    const myId = new mongoose.Types.ObjectId(converstationId);
    const chatRoomMongoId = new mongoose.Types.ObjectId(chatRoomId);

    let otherParticipant: any = chatRoom.participants.filter(
      (vl: any) =>
      {
        if (!vl["_id"].equals(myId)) {
          return vl

        }
      })

    let userParticipant: any = chatRoom.participants.filter(
      (vl: any) =>
      {
        if (vl["_id"].equals(myId)) {
          return vl

        }
      })

    if (!userParticipant || !otherParticipant) {
      res.status(400).json({
        message: "No conversation room is created"
      });
      return;
    }
    otherParticipant = otherParticipant[0];
    userParticipant = userParticipant[0];


    let otherParticipantId = otherParticipant?.['_id'] ?? null;



    if (!otherParticipantId) {
      throw new Error("Other participant not found");
    }



    const analysisUser1 = await aiAnalysisModel.findOne({ conversationId: myId })
      .sort({ createdAt: -1 })
      .lean();

    const analysisUser2 = await aiAnalysisModel
      .findOne({ conversationId: otherParticipantId })
      .sort({ createdAt: -1 })
      .lean();

    const humanChatMessages = await chatMessageModel.find(
      {
        roomId: chatRoomMongoId,
        channel: "human"
      }
    ).sort({ createdAt: -1 }).populate({
      path: "senderId",
      select: "_id fullName"
    }).limit(6).lean();



    const formattedUserChatContext = [...humanChatMessages]
      .reverse()
      .reduce((acc, msg: any) =>
      {
        const userName = msg.senderId?.fullName || "User";
        const content = msg.content || "";

        if (msg.status === "blocked") {
          acc.push(`${userName}: AI has blocked (${content})`);
        } else {
          acc.push(`${userName}: ${content}`);
        }

        return acc;
      }, [] as string[])
      .join("\n");



    if (!memory) {
      memory = await converstationModel.create({
        chatRoomId: chatRoomId,
        conversationId: converstationId,
      });

      const chatMessage = new chatMessageModel({
        senderType: "ai",
        senderId: converstationId,
        roomId: chatRoomId,
        channel: "ai",
        content: `Hi! I've analyzed your conversation with ${otherParticipant['fullName']} and I'm ready to help`,
        aiSenderId: memory['_id'],
        status: "sent",
        visibleTo: chatRoom['participants']
      })
      await chatMessage.save();

      store.addAIMessageContent(`${chatRoomId}:${converstationId}`, {
        userSummary1: analysisUser1?.['summary'] ?? 'Does not have summary',
        userSummary2: analysisUser2?.['summary'] ?? 'Does not have summary',
        userChat: formattedUserChatContext,
        currentUserName: userParticipant['fullName'],
        otherUserName: otherParticipant['fullName'],
        user1Tone: analysisUser1?.['tone'] ?? 'Does not have tone',
        user2Tone: analysisUser2?.['tone'] ?? 'Does not have tone',
        aiSummary: '',
        persona: `Does't identify persona upto now`,
        longMemory: [],
        userEmotional: "current does't know",
        relationship: "currently does't know",
        message: [{ ai: `Hi! I've analyzed your conversation with ${otherParticipant['fullName']} and I'm ready to help` }],
         aiSenderId: memory['_id'].toString(),
        visibleTo: chatRoom['participants'].map((vl)=>vl["_id"].toString())
      })

      let chatMessages = await chatMessageModel
        .find({
          roomId: new mongoose.Types.ObjectId(chatRoomId),
          channel: "ai",
          $or: [
            { senderId: new mongoose.Types.ObjectId(converstationId) },
            { aiSenderId: new mongoose.Types.ObjectId(memory._id) },
          ],
        })
        .sort({ createdAt: 1 })
        .lean();

      return res.status(200).json({
        aiContext: memory,
        chat: chatMessages,
        chatRoomId: chatRoomId
      });

    }

    const chatMessages = await chatMessageModel
      .find({
        roomId: new mongoose.Types.ObjectId(chatRoomId),
        channel: "ai",
        $or: [
          { senderId: new mongoose.Types.ObjectId(converstationId) },
          { aiSenderId: new mongoose.Types.ObjectId(memory._id) },
        ],
      })
      .sort({ createdAt: 1 })
      .lean();


     
        

    store.addAIMessageContent(`${chatRoomId}:${converstationId}`, {
      userSummary1: analysisUser1?.['summary'] ?? 'Does not have summary',
      userSummary2: analysisUser2?.['summary'] ?? 'Does not have summary',
      userChat: formattedUserChatContext,
      currentUserName: userParticipant['fullName'],
      otherUserName: otherParticipant['fullName'],
      user1Tone: analysisUser1?.['tone'] ?? 'Does not have tone',
      user2Tone: analysisUser2?.['tone'] ?? 'Does not have tone',
      aiSummary: '',
      persona: `Does't identify persona upto now`,
      longMemory: [],
      userEmotional: "current does't know",
      relationship: "currently does't know",
      message: [{ ai: `Hi! I've analyzed your conversation with ${otherParticipant['fullName']} and I'm ready to help` }],
        aiSenderId: memory['_id'].toString(),
        visibleTo: chatRoom['participants'].map((vl)=>vl["_id"].toString())
    })

    return res.status(200).json({
      aiContext: memory,
      chat: chatMessages,
      chatRoomId: chatRoomId
    });
  } catch (err) {
    console.log(err);
    next(err);
  }
};
export
{
  chat_users_controller,
  chat_human_conversation_controller,
  chat_rephase_controller,
  chat_rephase_suggestion_controller,
  relationship_analysis_schema_controller,
  ai_chat_getAll_controller

}
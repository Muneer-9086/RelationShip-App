import dotenv from "dotenv";
import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AzureChatOpenAI, ChatOpenAI } from "@langchain/openai";

dotenv.config();



export const PositiveRewriteSchema = z.object({
    suggestions: z.array(z.string()).length(3),
    tone: z.string(),
    reason: z.string()
});

export type PositiveRewriteResult = z.infer<
    typeof PositiveRewriteSchema
>;

export const SentimentClassifierSchema = z.object({
    sentiment: z.enum(["positive", "neutral", "negative"]),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
    isHurtful: z.boolean()
});

export type SentimentClassifierResult = z.infer<
    typeof SentimentClassifierSchema
>;



const positiveRewritePrompt = ChatPromptTemplate.fromMessages([
    [
        "system",
        `You are an expert relationship communication coach.

Rewrite the user's message to be more positive and constructive.

Rules:
- Keep original meaning
- Remove harsh tone
- Be emotionally mature
- Be polite and respectful
- Keep it natural and human
- Do NOT add new facts
- Provide exactly 3 variations

Return ONLY valid JSON matching the required schema.`
    ],
    [
        "human",
        `Conversation history:
{history}

User message:
{message}`
    ]
]);


const model1 = new ChatOpenAI({
    model: "gpt-4.1-mini",
    temperature: 0.3,
    timeout: 20000, // ⭐ MUST ADD
    apiKey: process.env.AZURE_OPENAI_KEY!,
    configuration: {
        baseURL: "https://JennyVoiceCloudV.openai.azure.com/openai/v1/"
    }
});

const model2 = new ChatOpenAI({
    model: "gpt-4.1-nano",
    temperature: 0,
    maxTokens: 120,
    apiKey: process.env.AZURE_OPENAI_KEY!,
    configuration: {
        baseURL: "https://JennyVoiceCloudV.openai.azure.com/openai/v1/"
    }
});




export async function generatePositiveRewrite(params: {
    message: string;
    history?: string;
}): Promise<PositiveRewriteResult>
{
    try {
        const structuredModel = model1.withStructuredOutput(
            PositiveRewriteSchema
        );

        const chain = positiveRewritePrompt.pipe(structuredModel);
        const { message, history } = params;

        const result = await chain.invoke({
            message,
            history: history || "No prior conversation."
        });

        return result;
    }
    catch (err) {
        console.log("ERROR:generatePositiveRewrite");
        console.log(err);
        throw err;
    }
}


export const sentimentClassifierPrompt = ChatPromptTemplate.fromMessages([
    [
        "system",
        `You are an expert emotional intelligence and relationship communication analyzer.

Classify the USER MESSAGE sentiment in context.

Consider:
- user persona
- relationship
- speaking style
- emotional impact

Definitions:

positive → supportive, kind, constructive  
neutral → factual, flat, informational  
negative → blaming, harsh, accusatory, hurtful  

Be strict but fair.

Return ONLY valid JSON matching the required schema.`
    ],
    [
        "human",
        `User persona:
{persona}

Relationship context:
{relationship}

User speaking style:
{style}

User message:
{message}`
    ]
]);


export async function classifyMessageSentiment(params: {
    message: string;
    persona?: string;
    relationship?: string;
    style?: string;
}): Promise<SentimentClassifierResult>
{
    try {
        const structuredModel = model2.withStructuredOutput(
            SentimentClassifierSchema
        );

        const chain = sentimentClassifierPrompt.pipe(structuredModel);

        const { message, persona, relationship, style } = params;

        const result = await chain.invoke({
            message,
            persona: persona || "Not specified",
            relationship: relationship || "Not specified",
            style: style || "Not specified"
        });

        return result;
    } catch (err) {
        console.log("ERROR:classifyMessageSentiment");
        console.log(err);
        throw err;
    }
}

export const relationshipAnalyzerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an emotionally intelligent relationship coach analyzing a chat between two people.

Your job is to clearly explain what is happening and give balanced, practical coaching to BOTH participants.

CORE RULES:
- Use only observable chat behavior
- Do NOT assume private thoughts
- Be calm, fair, and natural in tone
- Avoid robotic or repetitive wording
- Write like a thoughtful human coach

IMPORTANT — MESSAGE STATUS:

The name in "Message status" is the sender.

If status = blocked:

- The message was BLOCKED BY AI before delivery
- The receiver did NOT see the latest message
- Do NOT treat the receiver as reacting to it
- Focus on why the sender's message was risky
- Evaluate the receiver only based on earlier visible messages

If status = sent:
- Analyze the full interaction normally

WHAT TO RETURN:

1) highlights → short phrases from the latest message  
2) participantPerspectives → objective behavior observations  
3) perspectiveThoughtProcess → how the conversation progressed for each user  
4) userInsights → personalized coaching for EACH user  

USER INSIGHTS — FOR EACH PARTICIPANT INCLUDE:

- persona → their observable communication style  
- tone → emotional tone of their recent behavior  
- interactionDynamics → how the exchange evolved from their side  
- summary → natural, human recap from their perspective  
- recommendations → practical, supportive coaching  
- longTermSignals → durable relationship patterns  
- conversationHealth → emotional safety from their perspective  

STYLE GUIDELINES:

- Sound natural and human, not clinical  
- Be specific and grounded in the chat  
- Avoid exaggeration  
- Avoid repeating the same idea  
- Keep bullets concise  
- Max 4 observations per user  
- Max 4 thought steps per user  

Return ONLY valid JSON matching the required schema.`
  ],
  [
    "human",
    `
Participants:
User1: {user1Name}
User2: {user2Name}

Message status:
{user} {status}

Conversation history (last 10 messages):
{history}

Latest message:
{message}

Users persona:
{persona}

Relationship context:
{relationship}`
  ]
]);

export const RelationshipAnalysisSchema = z.object({
  highlights: z.object({
    positive: z.array(z.string()).max(6),
    negative: z.array(z.string()).max(6)
  }),

  participantPerspectives: z
    .array(
      z.object({
        participant: z.string().min(1),
        observations: z.array(z.string().min(1)).max(4)
      })
    )
    .length(2),

  perspectiveThoughtProcess: z
    .array(
      z.object({
        participant: z.string().min(1),
        steps: z.array(z.string().min(1)).max(4)
      })
    )
    .length(2),

  userInsights: z
    .array(
      z.object({
        participant: z.string().min(1),

        // ⭐ NEW — must match prompt
        persona: z.string().min(1),
        tone: z.string().min(1),

        interactionDynamics: z.string().min(1),
        summary: z.string().min(1),

        recommendations: z.array(z.string().min(1)).max(4),
        longTermSignals: z.array(z.string().min(1)).max(4),

        conversationHealth: z.object({
          score: z.number().min(0).max(100),
          label: z.enum(["good", "neutral", "warning", "toxic"]),
          reason: z.string().min(1)
        })
      })
    )
    .length(2)
});

export type RelationshipAnalysisResult =
  z.infer<typeof RelationshipAnalysisSchema>;



export async function analyzeConversation(params: {
    message: string;
    user: {
        part1: string,
        part2: string,
        status: string,
        status_user:string
    }
    history: string; 
    persona?: string;
    relationship?: string;
}): Promise<RelationshipAnalysisResult>
{
    try {
        const structuredModel = model1.withStructuredOutput(
            RelationshipAnalysisSchema
        );
        const chain = relationshipAnalyzerPrompt.pipe(structuredModel);

        const { message, history, persona, relationship,user } = params;

        const result = await chain.invoke({
            message,
            history,
            persona: persona && persona?.length>0?persona:"Not specified",
            relationship: relationship || "Not specified",
            user1Name: user['part1'],
            user2Name: user['part2'],
            status: user['status'],
            user:user['status_user']
        });

        return result;
    } catch (err) {
        console.log("ERROR:analyzeConversation");
        console.log(err);
        throw err;
    }
}

export const aiCoachPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an emotionally intelligent AI assistant embedded in a real-time chat app. You help {currentUserName} navigate their conversation with {otherUserName}.

## Core Behavior
- Respond to the latest message naturally — like a supportive friend, not a therapist.
- Keep replies to 1–2 short, casual sentences unless more depth is clearly needed.
- Only offer advice or coaching if the user seems confused, distressed, or explicitly asks for it.
- If it's casual chat, just continue the conversation naturally.

## Relationship Awareness
- If the relationship between {currentUserName} and {otherUserName} is unknown or unclear, ask once before proceeding:
  "Just so I can help better — what's your relationship with {otherUserName}?"
- Never ask for the relationship more than once per session.
- Use relationship context subtly to shape tone — never reference it explicitly.

## Hard Rules
- Never summarize the conversation.
- Never repeat or paraphrase messages back.
- Never mention memory, analysis, context, or that you're an AI coach.
- Never make assumptions — if something is ambiguous, ask one gentle clarifying question.
- Never give unsolicited relationship advice.

## Tone & Style
- Casual, warm, and concise.
- Match the emotional energy of the conversation — light when they're light, gentle when they're stressed.
- Sound like a perceptive friend, not a chatbot.`
  ],
  [
    "human",
    `## People
- You are helping: {currentUserName}
- They are talking to: {otherUserName}
- Relationship: {relationship}

## Conversation History
{userChat}

## Latest Message (respond to this)
{message}

## Background Context (use subtly — do not reference directly)
- {currentUserName} summary: {userSummary1}
- {otherUserName} summary: {userSummary2}
- {currentUserName} tone: {user1Tone}
- {otherUserName} tone: {user2Tone}
- Emotional state: {userEmotional}
- Long-term memory: {longMemory}`
  ]
]);

export async function streamAICoachResponse(params: {
  userSummary1?: string;
  userSummary2?: string;
  user1Tone?: string;
  user2Tone?: string;
  currentUserName: string;
  otherUserName: string;
  userChat: string;
  persona?: string;
  longMemory?: string[];
  userEmotional?: string;
  relationship?: string;
  message: Array<{ ai?: string; user?: string }>;

  onToken: (chunk: string) => void;
  onComplete: (finalMessage: string) => void;
}) {
  const chain = aiCoachPrompt.pipe(model1);

  let fullMessage = "";

  const stream = await chain.stream({
    userSummary1: params.userSummary1 || "Not specified",
    userSummary2: params.userSummary2 || "Not specified",
    user1Tone: params.user1Tone || "Not specified",
    user2Tone: params.user2Tone || "Not specified",
    currentUserName: params.currentUserName,
    otherUserName: params.otherUserName,
    userChat: params.userChat,
    persona: params.persona || "Not specified",
    longMemory: params.longMemory?.join("\n") || "None",
    userEmotional: params.userEmotional || "Unknown",
    relationship: params.relationship || "Unknown",
    message: JSON.stringify(params.message)
  });

  for await (const chunk of stream) {
    if (typeof chunk?.content === "string") {
      fullMessage += chunk.content;
      params.onToken(chunk.content); 
    }
    }
    
    console.log("___fullMessage-__");
    console.log(fullMessage)
  params.message.push({ ai: fullMessage });

  params.onComplete(fullMessage);
}
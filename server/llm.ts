import dotenv from "dotenv";
import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AzureChatOpenAI, ChatOpenAI } from "@langchain/openai";

dotenv.config();

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const PositiveRewriteSchema = z.object({
    suggestions: z.array(z.string()).length(3),
    tone: z.string(),
    reason: z.string()
});

export type PositiveRewriteResult = z.infer<typeof PositiveRewriteSchema>;

export const SentimentClassifierSchema = z.object({
    sentiment: z.enum(["positive", "neutral", "negative"]),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
    isHurtful: z.boolean()
});

export type SentimentClassifierResult = z.infer<typeof SentimentClassifierSchema>;

// ─── Model Configuration ─────────────────────────────────────────────────────

const model1 = new ChatOpenAI({
    model: "gpt-4.1-mini",
    temperature: 0.3,
    timeout: 20000,
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

// ─── Positive Rewrite ─────────────────────────────────────────────────────────

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

export async function generatePositiveRewrite(params: {
    message: string;
    history?: string;
}): Promise<PositiveRewriteResult> {
    try {
        const structuredModel = model1.withStructuredOutput(PositiveRewriteSchema);
        const chain = positiveRewritePrompt.pipe(structuredModel);
        const { message, history } = params;

        const result = await chain.invoke({
            message,
            history: history || "No prior conversation."
        });

        return result;
    } catch (err) {
        console.log("ERROR:generatePositiveRewrite");
        console.log(err);
        throw err;
    }
}

// ─── Sentiment Classifier ─────────────────────────────────────────────────────

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
}): Promise<SentimentClassifierResult> {
    try {
        const structuredModel = model2.withStructuredOutput(SentimentClassifierSchema);
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

// ─── Relationship Analysis ────────────────────────────────────────────────────

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

export type RelationshipAnalysisResult = z.infer<typeof RelationshipAnalysisSchema>;

export async function analyzeConversation(params: {
    message: string;
    user: {
        part1: string;
        part2: string;
        status: string;
        status_user: string;
    };
    history: string;
    persona?: string;
    relationship?: string;
}): Promise<RelationshipAnalysisResult> {
    try {
        const structuredModel = model1.withStructuredOutput(RelationshipAnalysisSchema);
        const chain = relationshipAnalyzerPrompt.pipe(structuredModel);

        const { message, history, persona, relationship, user } = params;

        const result = await chain.invoke({
            message,
            history,
            persona: persona && persona?.length > 0 ? persona : "Not specified",
            relationship: relationship || "Not specified",
            user1Name: user['part1'],
            user2Name: user['part2'],
            status: user['status'],
            user: user['status_user']
        });

        return result;
    } catch (err) {
        console.log("ERROR:analyzeConversation");
        console.log(err);
        throw err;
    }
}

// ─── AI Coach Types ───────────────────────────────────────────────────────────

export interface AICoachMessage {
    role: 'user' | 'ai';
    content: string;
    timestamp?: number;
}

export interface AICoachMemory {
    shortTermMessages: AICoachMessage[];  // Last 10 messages
    longTermMemory: string[];             // Persistent insights
    persona: string;
    relationship: string;
    userEmotional: string;
    aiSummary: string;
}

export interface AICoachContext {
    // User context
    currentUserName: string;
    otherUserName: string;
    currentUserId: string;
    otherUserId: string;

    // Analysis summaries
    userSummary1: string;
    userSummary2: string;
    user1Tone: string;
    user2Tone: string;

    // Human conversation context
    humanChatContext: string;

    // Memory
    memory: AICoachMemory;

    // Conversation identifiers
    chatRoomId: string;
    conversationId: string;
    aiSenderId: string;
    visibleTo: string[];
}

export interface StreamCallbacks {
    onToken: (chunk: string) => void;
    onComplete: (finalMessage: string) => void;
    onError?: (error: Error) => void;
    signal?: AbortSignal;
}

// ─── Enhanced AI Coach Prompt ─────────────────────────────────────────────────

export const aiCoachPrompt = ChatPromptTemplate.fromMessages([
    [
        "system",
        `You are an emotionally intelligent AI assistant embedded in a real-time chat application.
You are helping {currentUserName} navigate their conversation with {otherUserName}.

## Your Role
You are a supportive, perceptive friend — not a therapist or clinical advisor.
Your goal is to help {currentUserName} communicate better and understand the conversation dynamics.

## Persona Awareness
{persona}

## Relationship Context
{relationship}

## Emotional State
Current emotional state of {currentUserName}: {userEmotional}

## Communication Guidelines

### DO:
- Respond naturally and conversationally (1-3 sentences unless depth is needed)
- Match the emotional energy — light when casual, gentle when stressed
- Use the persona and relationship context to shape your tone subtly
- Ask ONE clarifying question if something is ambiguous
- Acknowledge feelings before offering perspective
- Reference specific details from the conversation when relevant

### DON'T:
- Summarize or paraphrase messages back
- Give unsolicited relationship advice
- Mention that you're an AI, have memory, or are analyzing anything
- Make assumptions about feelings or intentions
- Repeat the same idea multiple ways
- Use clinical or robotic language
- Reference "long-term memory" or "context" explicitly

## Memory Context (use subtly, never reference directly)
### Recent Insights:
{longMemory}

### What you know about {currentUserName}:
{userSummary1}

### What you know about {otherUserName}:
{userSummary2}

### {currentUserName}'s communication tone: {user1Tone}
### {otherUserName}'s communication tone: {user2Tone}

## Conversation Summary (if available):
{aiSummary}`
    ],
    [
        "human",
        `## Human Conversation Context (the conversation {currentUserName} is having with {otherUserName}):
{humanChatContext}

## Our Conversation History:
{chatHistory}

## Latest Message from {currentUserName}:
{latestMessage}

Respond naturally to help {currentUserName}.`
    ]
]);

// ─── Build Chat History String ────────────────────────────────────────────────

function buildChatHistoryString(messages: AICoachMessage[], limit: number = 10): string {
    if (!messages || messages.length === 0) {
        return "No previous messages in our conversation.";
    }

    const recentMessages = messages.slice(-limit);
    
    return recentMessages
        .map(msg => {
            const role = msg.role === 'user' ? 'User' : 'AI';
            return `${role}: ${msg.content}`;
        })
        .join('\n');
}

// ─── Stream AI Coach Response ─────────────────────────────────────────────────

export async function streamAICoachResponse(params: {
    context: AICoachContext;
    latestMessage: string;
    callbacks: StreamCallbacks;
}): Promise<void> {
    const { context, latestMessage, callbacks } = params;
    const { onToken, onComplete, onError, signal } = callbacks;
    const { memory } = context;

    try {
        const chain = aiCoachPrompt.pipe(model1);

        let fullMessage = "";

        const promptValues = {
            // User identifiers
            currentUserName: context.currentUserName,
            otherUserName: context.otherUserName,

            // Persona and relationship
            persona: memory.persona || "No specific persona identified yet.",
            relationship: memory.relationship || "Relationship not yet established.",
            userEmotional: memory.userEmotional || "Unknown emotional state.",

            // Summaries and tones
            userSummary1: context.userSummary1 || "No summary available.",
            userSummary2: context.userSummary2 || "No summary available.",
            user1Tone: context.user1Tone || "Unknown tone.",
            user2Tone: context.user2Tone || "Unknown tone.",

            // Memory
            longMemory: memory.longTermMemory.length > 0 
                ? memory.longTermMemory.join('\n- ') 
                : "No long-term insights recorded yet.",
            aiSummary: memory.aiSummary || "No conversation summary yet.",

            // Conversation context
            humanChatContext: context.humanChatContext || "No human conversation context available.",
            chatHistory: buildChatHistoryString(memory.shortTermMessages, 10),
            
            // Latest message
            latestMessage
        };

        const stream = await chain.stream(promptValues);

        for await (const chunk of stream) {
            // Check for abort signal
            if (signal?.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }

            if (typeof chunk?.content === "string") {
                fullMessage += chunk.content;
                onToken(chunk.content);
            }
        }

        console.log("AI Coach response completed:", fullMessage.substring(0, 100) + "...");

        onComplete(fullMessage);

    } catch (err: any) {
        if (err?.name === "AbortError") {
            console.log("AI stream aborted by user");
            throw err;
        }
        
        console.error("ERROR:streamAICoachResponse", err);
        
        if (onError) {
            onError(err instanceof Error ? err : new Error(String(err)));
        }
        throw err;
    }
}

// ─── Legacy Support: Original streamAICoachResponse signature ─────────────────

export async function streamAICoachResponseLegacy(params: {
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
    signal?: AbortSignal;
}): Promise<void> {
    // Convert legacy message format to new format
    const shortTermMessages: AICoachMessage[] = params.message
        .filter(m => m.ai || m.user)
        .map(m => ({
            role: m.ai ? 'ai' as const : 'user' as const,
            content: m.ai || m.user || '',
            timestamp: Date.now()
        }));

    // Get latest user message
    const latestUserMessage = params.message
        .filter(m => m.user)
        .pop();

    const context: AICoachContext = {
        currentUserName: params.currentUserName,
        otherUserName: params.otherUserName,
        currentUserId: '',
        otherUserId: '',
        userSummary1: params.userSummary1 || '',
        userSummary2: params.userSummary2 || '',
        user1Tone: params.user1Tone || '',
        user2Tone: params.user2Tone || '',
        humanChatContext: params.userChat,
        memory: {
            shortTermMessages,
            longTermMemory: params.longMemory || [],
            persona: params.persona || '',
            relationship: params.relationship || '',
            userEmotional: params.userEmotional || '',
            aiSummary: ''
        },
        chatRoomId: '',
        conversationId: '',
        aiSenderId: '',
        visibleTo: []
    };

    await streamAICoachResponse({
        context,
        latestMessage: latestUserMessage?.user || '',
        callbacks: {
            onToken: params.onToken,
            onComplete: (finalMessage) => {
                // Push to legacy message array
                params.message.push({ ai: finalMessage });
                params.onComplete(finalMessage);
            },
            signal: params.signal
        }
    });
}

// Re-export legacy function name for backwards compatibility
export { streamAICoachResponseLegacy as streamAICoachResponseOld };

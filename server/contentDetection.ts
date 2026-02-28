import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";

dotenv.config();

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentFlag = 
  | "hurtful"
  | "aggressive" 
  | "manipulative"
  | "dismissive"
  | "threatening"
  | "passive_aggressive"
  | "gaslighting"
  | "contemptuous"
  | "stonewalling"
  | "none";

export type SeverityLevel = "low" | "medium" | "high" | "critical";

export interface ContentDetectionResult {
  isProblematic: boolean;
  flags: ContentFlag[];
  severity: SeverityLevel;
  confidence: number;
  reason: string;
  suggestions: string[];
  shouldBlock: boolean;
}

export interface UserContentInsight {
  userId: string;
  messageId: string;
  timestamp: number;
  content: string;
  detection: ContentDetectionResult;
  conversationId: string;
  partnerId: string;
}

export interface UserContentSession {
  userId: string;
  insights: UserContentInsight[];
  flaggedCount: number;
  blockedCount: number;
  lastUpdated: number;
  patternAlerts: PatternAlert[];
}

export interface PatternAlert {
  type: "repeated_aggression" | "escalating_negativity" | "communication_breakdown";
  message: string;
  timestamp: number;
  count: number;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export const ContentDetectionSchema = z.object({
  isProblematic: z.boolean(),
  flags: z.array(z.enum([
    "hurtful",
    "aggressive",
    "manipulative",
    "dismissive",
    "threatening",
    "passive_aggressive",
    "gaslighting",
    "contemptuous",
    "stonewalling",
    "none"
  ])),
  severity: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  suggestions: z.array(z.string()).max(3),
  shouldBlock: z.boolean()
});

// ─── Model Configuration ──────────────────────────────────────────────────────

const detectionModel = new ChatOpenAI({
  model: "gpt-4.1-nano",
  temperature: 0,
  maxTokens: 250,
  timeout: 10000,
  apiKey: process.env.AZURE_OPENAI_KEY!,
  configuration: {
    baseURL: "https://JennyVoiceCloudV.openai.azure.com/openai/v1/"
  }
});

// ─── Content Detection Prompt ─────────────────────────────────────────────────

const contentDetectionPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a real-time content moderation system for a relationship communication app.
Analyze the message for harmful communication patterns.

## Detection Criteria

### Flag Types:
- hurtful: Intentionally causing emotional pain
- aggressive: Hostile, attacking language
- manipulative: Attempting to control or deceive
- dismissive: Invalidating feelings or perspectives
- threatening: Explicit or implicit threats
- passive_aggressive: Indirect hostility
- gaslighting: Denying reality or making someone doubt themselves
- contemptuous: Showing superiority or disrespect
- stonewalling: Refusing to engage or shutting down
- none: No harmful patterns detected

### Severity Levels:
- low: Minor issues, could be unintentional
- medium: Clear negative pattern, needs attention
- high: Significantly harmful, should trigger warning
- critical: Dangerous content, must be blocked

### Blocking Criteria:
Block ONLY if:
- Direct threats of harm
- Severe verbal abuse
- Critical gaslighting
- Harassment

Do NOT block for:
- Minor disagreements
- Frustration expression
- Assertive communication
- Honest criticism

## Response Guidelines:
- Be accurate, not oversensitive
- Consider context and tone
- Provide actionable suggestions
- Be specific about what triggered the flag

Return ONLY valid JSON matching the schema.`
  ],
  [
    "human",
    `Analyze this message for harmful content:

Message: {message}

Conversation context (last 3 messages):
{context}

Sender's recent pattern: {pattern}`
  ]
]);

// ─── User Session Store (Isolated per User) ───────────────────────────────────

class ContentDetectionStore {
  // User ID → Session (strict isolation)
  private sessions = new Map<string, UserContentSession>();
  
  // Cleanup interval (remove old sessions)
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_INSIGHTS_PER_USER = 50;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSessions();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Get or create user session (isolated to user)
   */
  getSession(userId: string): UserContentSession {
    let session = this.sessions.get(userId);
    if (!session) {
      session = {
        userId,
        insights: [],
        flaggedCount: 0,
        blockedCount: 0,
        lastUpdated: Date.now(),
        patternAlerts: []
      };
      this.sessions.set(userId, session);
    }
    return session;
  }

  /**
   * Add insight to user's session (ONLY visible to this user)
   */
  addInsight(userId: string, insight: UserContentInsight): void {
    const session = this.getSession(userId);
    
    // Add insight
    session.insights.push(insight);
    session.lastUpdated = Date.now();
    
    // Update counters
    if (insight.detection.isProblematic) {
      session.flaggedCount++;
    }
    if (insight.detection.shouldBlock) {
      session.blockedCount++;
    }
    
    // Trim old insights
    if (session.insights.length > this.MAX_INSIGHTS_PER_USER) {
      session.insights = session.insights.slice(-this.MAX_INSIGHTS_PER_USER);
    }
    
    // Check for patterns
    this.detectPatterns(session);
  }

  /**
   * Get recent insights for a user (ONLY their own)
   */
  getRecentInsights(userId: string, limit: number = 10): UserContentInsight[] {
    const session = this.sessions.get(userId);
    if (!session) return [];
    return session.insights.slice(-limit);
  }

  /**
   * Get user's recent message pattern for context
   */
  getUserPattern(userId: string): string {
    const session = this.sessions.get(userId);
    if (!session || session.insights.length === 0) {
      return "No prior flagged messages";
    }

    const recentFlags = session.insights
      .slice(-5)
      .filter(i => i.detection.isProblematic)
      .map(i => i.detection.flags.filter(f => f !== "none"))
      .flat();

    if (recentFlags.length === 0) {
      return "Recent messages have been constructive";
    }

    const flagCounts = recentFlags.reduce((acc, flag) => {
      acc[flag] = (acc[flag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topFlags = Object.entries(flagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([flag, count]) => `${flag} (${count}x)`);

    return `Recent patterns: ${topFlags.join(", ")}`;
  }

  /**
   * Detect communication patterns and add alerts
   */
  private detectPatterns(session: UserContentSession): void {
    const recentInsights = session.insights.slice(-10);
    const flaggedRecent = recentInsights.filter(i => i.detection.isProblematic);

    // Pattern: Repeated aggression (3+ aggressive messages in last 10)
    const aggressiveCount = flaggedRecent.filter(
      i => i.detection.flags.includes("aggressive") || i.detection.flags.includes("hurtful")
    ).length;

    if (aggressiveCount >= 3) {
      const existingAlert = session.patternAlerts.find(
        a => a.type === "repeated_aggression" && Date.now() - a.timestamp < 3600000
      );
      
      if (!existingAlert) {
        session.patternAlerts.push({
          type: "repeated_aggression",
          message: "You've sent several messages that may come across as aggressive. Consider taking a break.",
          timestamp: Date.now(),
          count: aggressiveCount
        });
      }
    }

    // Pattern: Escalating negativity
    if (recentInsights.length >= 5) {
      const recentSeverities = recentInsights.slice(-5).map(i => {
        const severityScore = { low: 1, medium: 2, high: 3, critical: 4 };
        return i.detection.isProblematic ? severityScore[i.detection.severity] : 0;
      });
      
      const isEscalating = recentSeverities.every((s, i) => 
        i === 0 || s >= recentSeverities[i - 1]
      ) && recentSeverities[recentSeverities.length - 1] > recentSeverities[0];

      if (isEscalating && recentSeverities[recentSeverities.length - 1] >= 2) {
        const existingAlert = session.patternAlerts.find(
          a => a.type === "escalating_negativity" && Date.now() - a.timestamp < 3600000
        );
        
        if (!existingAlert) {
          session.patternAlerts.push({
            type: "escalating_negativity",
            message: "The conversation seems to be escalating. Consider pausing to collect your thoughts.",
            timestamp: Date.now(),
            count: 1
          });
        }
      }
    }

    // Clean old alerts (older than 24 hours)
    session.patternAlerts = session.patternAlerts.filter(
      a => Date.now() - a.timestamp < this.SESSION_TTL_MS
    );
  }

  /**
   * Get pattern alerts for user (ONLY their own)
   */
  getPatternAlerts(userId: string): PatternAlert[] {
    const session = this.sessions.get(userId);
    if (!session) return [];
    return session.patternAlerts.filter(a => Date.now() - a.timestamp < 3600000);
  }

  /**
   * Clear user session (for logout/disconnect)
   */
  clearSession(userId: string): void {
    this.sessions.delete(userId);
  }

  /**
   * Cleanup old sessions
   */
  private cleanupOldSessions(): void {
    const now = Date.now();
    for (const [userId, session] of this.sessions) {
      if (now - session.lastUpdated > this.SESSION_TTL_MS) {
        this.sessions.delete(userId);
      }
    }
  }

  /**
   * Get session stats (for debugging, no sensitive data)
   */
  getSessionStats(userId: string): { flaggedCount: number; blockedCount: number } | null {
    const session = this.sessions.get(userId);
    if (!session) return null;
    return {
      flaggedCount: session.flaggedCount,
      blockedCount: session.blockedCount
    };
  }

  /**
   * Destroy store (cleanup)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
  }
}

// Singleton instance
export const contentDetectionStore = new ContentDetectionStore();

// ─── Detection Function ───────────────────────────────────────────────────────

export async function detectProblematicContent(params: {
  userId: string;
  messageId: string;
  content: string;
  conversationId: string;
  partnerId: string;
  context?: string;
}): Promise<ContentDetectionResult> {
  const { userId, messageId, content, conversationId, partnerId, context } = params;

  try {
    // Get user's pattern (from their own isolated session)
    const userPattern = contentDetectionStore.getUserPattern(userId);

    const structuredModel = detectionModel.withStructuredOutput(ContentDetectionSchema);
    const chain = contentDetectionPrompt.pipe(structuredModel);

    const result = await chain.invoke({
      message: content,
      context: context || "No prior context available",
      pattern: userPattern
    });

    // Create insight (stored ONLY in sender's session)
    const insight: UserContentInsight = {
      userId,
      messageId,
      timestamp: Date.now(),
      content: content.substring(0, 100), // Truncate for storage
      detection: result,
      conversationId,
      partnerId
    };

    // Store in sender's session ONLY
    contentDetectionStore.addInsight(userId, insight);

    return result;

  } catch (err) {
    console.error("Content detection error:", err);
    
    // Return safe default on error
    return {
      isProblematic: false,
      flags: ["none"],
      severity: "low",
      confidence: 0,
      reason: "Detection failed, allowing message",
      suggestions: [],
      shouldBlock: false
    };
  }
}

// ─── Quick Detection (Lightweight, No AI) ─────────────────────────────────────

const CRITICAL_PATTERNS = [
  /\b(kill|murder|hurt|harm|destroy)\s+(you|yourself|them|him|her)\b/i,
  /\b(i('ll|'m going to|will))\s+(kill|murder|hurt|harm)\b/i,
  /\bdie\s+(bitch|asshole|bastard)\b/i,
  /\b(threat|threaten)\b.*\b(you|family|children)\b/i
];

const HIGH_SEVERITY_PATTERNS = [
  /\b(stupid|idiot|moron|dumb|retard)\b/i,
  /\b(hate|despise)\s+you\b/i,
  /\b(shut\s+up|stfu)\b/i,
  /\byou('re| are)\s+(worthless|pathetic|nothing|useless)\b/i,
  /\b(f+u+c+k+|sh+i+t+)\s+you\b/i
];

const GASLIGHTING_PATTERNS = [
  /\b(you('re| are))\s+(crazy|insane|paranoid|imagining)\b/i,
  /\bthat\s+(never|didn't)\s+happen\b/i,
  /\byou('re| are)\s+making\s+(this|that|it)\s+up\b/i,
  /\bno\s+one\s+will\s+believe\s+you\b/i
];

export function quickContentCheck(content: string): {
  requiresAICheck: boolean;
  quickFlags: ContentFlag[];
  estimatedSeverity: SeverityLevel;
} {
  const lowerContent = content.toLowerCase();
  const quickFlags: ContentFlag[] = [];
  let estimatedSeverity: SeverityLevel = "low";

  // Check critical patterns
  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(content)) {
      quickFlags.push("threatening");
      estimatedSeverity = "critical";
      break;
    }
  }

  // Check high severity patterns
  for (const pattern of HIGH_SEVERITY_PATTERNS) {
    if (pattern.test(content)) {
      quickFlags.push("aggressive");
      if (estimatedSeverity !== "critical") {
        estimatedSeverity = "high";
      }
      break;
    }
  }

  // Check gaslighting patterns
  for (const pattern of GASLIGHTING_PATTERNS) {
    if (pattern.test(content)) {
      quickFlags.push("gaslighting");
      if (estimatedSeverity === "low") {
        estimatedSeverity = "medium";
      }
      break;
    }
  }

  // Require AI check if any quick flags found or message is long
  const requiresAICheck = quickFlags.length > 0 || content.length > 200;

  return {
    requiresAICheck,
    quickFlags,
    estimatedSeverity
  };
}

// ─── Export Types ─────────────────────────────────────────────────────────────

export type { ContentDetectionStore };

export interface User {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
}

export interface AIAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number; // 0-100
  highlights: TextHighlight[];
  suggestions: Suggestion[];
  warning?: string;
  explanation?: string;
}

export interface TextHighlight {
  startIndex: number;
  endIndex: number;
  type: 'positive' | 'negative';
  reason: string;
}

export interface Suggestion {
  id: string;
  original: string;
  rephrased: string;
  reason: string;
}

export interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
  type: 'user' | 'ai';
  highlights?: TextHighlight[];
  aiAnalysis?: AIAnalysis;
  isEdited?: boolean;
}

export interface Conversation {
  id: string;
  name: string;
  type: 'direct' | 'group';
  participants: User[];
  messages: Message[];
  lastMessage?: Message;
  unreadCount: number;
  aiEnabled: boolean;
  aiParticipant: boolean;
  backendConversationId?: string;
}

export interface ParticipantInsight {
  userId: string;
  perspective: string;
  communicationStyle: string;
  strengths: string[];
  improvements: string[];
  overallSentiment: 'positive' | 'neutral' | 'negative';
}

export interface ConversationInsights {
  conversationId: string;
  participants: ParticipantInsight[];
  overallHealth: number; // 0-100
  summary: string;
  recommendations: string[];
}

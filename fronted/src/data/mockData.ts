import { User, Conversation, Message, ConversationInsights } from '@/types/chat';

export const currentUser: User = {
  id: 'user-1',
  name: 'You',
  status: 'online',
};

export const mockUsers: User[] = [
  currentUser,
  {
    id: 'user-2',
    name: 'Sarah Chen',
    status: 'online',
  },
  {
    id: 'user-3',
    name: 'Marcus Johnson',
    status: 'away',
  },
  {
    id: 'user-4',
    name: 'Elena Rodriguez',
    status: 'online',
  },
  {
    id: 'ai-assistant',
    name: 'MindfulAI',
    status: 'online',
  },
];

export const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    name: 'Sarah Chen',
    type: 'direct',
    participants: [currentUser, mockUsers[1]],
    messages: [
      {
        id: 'msg-1',
        senderId: 'user-2',
        content: "Hey! How are you doing today? I wanted to check in after our meeting yesterday.",
        timestamp: new Date(Date.now() - 3600000 * 2),
        type: 'user',
      },
      {
        id: 'msg-2',
        senderId: 'user-1',
        content: "I'm doing well, thanks for asking! The meeting went better than I expected.",
        timestamp: new Date(Date.now() - 3600000),
        type: 'user',
        highlights: [
          { startIndex: 4, endIndex: 15, type: 'positive', reason: 'Expressing positive emotion' },
          { startIndex: 36, endIndex: 61, type: 'positive', reason: 'Sharing positive outcome' },
        ],
      },
      {
        id: 'msg-3',
        senderId: 'user-2',
        content: "That's wonderful to hear! I noticed you handled the difficult questions really well.",
        timestamp: new Date(Date.now() - 1800000),
        type: 'user',
        highlights: [
          { startIndex: 0, endIndex: 25, type: 'positive', reason: 'Genuine appreciation' },
        ],
      },
    ],
    unreadCount: 0,
    aiEnabled: true,
    aiParticipant: false,
  },
  {
    id: 'conv-2',
    name: 'Project Team',
    type: 'group',
    participants: [currentUser, mockUsers[1], mockUsers[2], mockUsers[3]],
    messages: [
      {
        id: 'msg-4',
        senderId: 'user-3',
        content: "Team, we need to discuss the deadline situation. I'm feeling a bit stressed about it.",
        timestamp: new Date(Date.now() - 7200000),
        type: 'user',
      },
      {
        id: 'msg-5',
        senderId: 'user-4',
        content: "I understand, Marcus. Let's figure out how we can support each other better.",
        timestamp: new Date(Date.now() - 6000000),
        type: 'user',
        highlights: [
          { startIndex: 0, endIndex: 13, type: 'positive', reason: 'Showing empathy' },
          { startIndex: 14, endIndex: 67, type: 'positive', reason: 'Offering collaborative support' },
        ],
      },
      {
        id: 'msg-6',
        senderId: 'ai-assistant',
        content: "I notice the team is working through some pressure. It's healthy to acknowledge stress openly. Consider breaking the project into smaller milestones to make it feel more manageable.",
        timestamp: new Date(Date.now() - 5400000),
        type: 'ai',
      },
    ],
    unreadCount: 2,
    aiEnabled: true,
    aiParticipant: true,
  },
  {
    id: 'conv-3',
    name: 'Marcus Johnson',
    type: 'direct',
    participants: [currentUser, mockUsers[2]],
    messages: [
      {
        id: 'msg-7',
        senderId: 'user-3',
        content: "Can we talk about what happened in the meeting?",
        timestamp: new Date(Date.now() - 86400000),
        type: 'user',
      },
      {
        id: 'msg-8',
        senderId: 'user-1',
        content: "Of course. I value our working relationship and want to make sure we're on the same page.",
        timestamp: new Date(Date.now() - 82800000),
        type: 'user',
        highlights: [
          { startIndex: 11, endIndex: 47, type: 'positive', reason: 'Expressing value for relationship' },
        ],
      },
    ],
    unreadCount: 0,
    aiEnabled: true,
    aiParticipant: false,
  },
];

export const mockInsights: ConversationInsights = {
  conversationId: 'conv-1',
  participants: [
    {
      userId: 'user-1',
      perspective: 'Seeking connection and understanding, valuing open communication about work experiences.',
      communicationStyle: 'Warm and appreciative, with a tendency to share positive experiences openly.',
      strengths: [
        'Responds with gratitude',
        'Shares feelings openly',
        'Maintains positive tone',
      ],
      improvements: [
        'Could ask more follow-up questions',
        'Consider acknowledging specific actions',
      ],
      overallSentiment: 'positive',
    },
    {
      userId: 'user-2',
      perspective: 'Supportive and caring, actively checking in on wellbeing and offering specific compliments.',
      communicationStyle: 'Empathetic and encouraging, focuses on highlighting others\' achievements.',
      strengths: [
        'Proactive check-ins',
        'Specific positive feedback',
        'Creates safe space for sharing',
      ],
      improvements: [
        'Could share more personal experiences',
        'Balance giving with receiving feedback',
      ],
      overallSentiment: 'positive',
    },
  ],
  overallHealth: 85,
  summary: 'This conversation demonstrates healthy, supportive communication patterns. Both participants show empathy and genuine interest in each other\'s wellbeing.',
  recommendations: [
    'Continue the positive momentum with more specific appreciations',
    'Consider scheduling regular check-ins to maintain connection',
    'Share vulnerabilities to deepen trust',
  ],
};

// Mock AI analysis function
export function analyzeMessage(content: string): {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
  highlights: { startIndex: number; endIndex: number; type: 'positive' | 'negative'; reason: string }[];
  warning?: string;
  suggestions: { id: string; original: string; rephrased: string; reason: string }[];
  explanation?: string;
} {
  const lowerContent = content.toLowerCase();
  
  // Negative patterns
  const negativePatterns = [
    { pattern: /you always/gi, reason: 'Absolute statements can feel accusatory' },
    { pattern: /you never/gi, reason: 'Absolute statements can feel accusatory' },
    { pattern: /you('re| are) (wrong|stupid|idiot|dumb)/gi, reason: 'Personal attacks damage trust' },
    { pattern: /i hate/gi, reason: 'Strong negative language may escalate conflict' },
    { pattern: /this is (stupid|dumb|ridiculous)/gi, reason: 'Dismissive language shuts down dialogue' },
    { pattern: /whatever/gi, reason: 'Dismissive responses signal disengagement' },
    { pattern: /don't care/gi, reason: 'May come across as dismissive' },
    { pattern: /your fault/gi, reason: 'Blame statements create defensiveness' },
    { pattern: /disappointed in you/gi, reason: 'May feel like personal judgment' },
  ];

  // Positive patterns
  const positivePatterns = [
    { pattern: /thank you|thanks/gi, reason: 'Expressing gratitude' },
    { pattern: /i appreciate/gi, reason: 'Showing appreciation' },
    { pattern: /i understand/gi, reason: 'Demonstrating empathy' },
    { pattern: /great job|well done/gi, reason: 'Positive reinforcement' },
    { pattern: /i feel/gi, reason: 'Using I-statements' },
    { pattern: /let's work together/gi, reason: 'Collaborative language' },
    { pattern: /i value/gi, reason: 'Expressing value' },
    { pattern: /how can i help/gi, reason: 'Offering support' },
  ];

  const highlights: { startIndex: number; endIndex: number; type: 'positive' | 'negative'; reason: string }[] = [];
  let hasNegative = false;
  let hasPositive = false;

  // Find negative highlights
  negativePatterns.forEach(({ pattern, reason }) => {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(content)) !== null) {
      highlights.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        type: 'negative',
        reason,
      });
      hasNegative = true;
    }
  });

  // Find positive highlights
  positivePatterns.forEach(({ pattern, reason }) => {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(content)) !== null) {
      highlights.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        type: 'positive',
        reason,
      });
      hasPositive = true;
    }
  });

  // Generate suggestions for negative patterns
  const suggestions: { id: string; original: string; rephrased: string; reason: string }[] = [];

  if (lowerContent.includes('you always')) {
    suggestions.push({
      id: 'sug-1',
      original: content.match(/you always [^.!?]*/i)?.[0] || 'You always...',
      rephrased: 'I\'ve noticed a pattern that concerns me...',
      reason: 'Using "I" statements and specific observations feels less accusatory',
    });
  }

  if (lowerContent.includes('you never')) {
    suggestions.push({
      id: 'sug-2',
      original: content.match(/you never [^.!?]*/i)?.[0] || 'You never...',
      rephrased: 'I would appreciate it if we could...',
      reason: 'Focusing on future actions is more constructive than past criticism',
    });
  }

  if (lowerContent.includes('this is stupid') || lowerContent.includes('this is dumb')) {
    suggestions.push({
      id: 'sug-3',
      original: content.match(/this is (stupid|dumb)/i)?.[0] || 'This is stupid',
      rephrased: 'I\'m having trouble understanding this approach',
      reason: 'Expressing confusion invites explanation rather than defensiveness',
    });
  }

  if (lowerContent.includes('your fault')) {
    suggestions.push({
      id: 'sug-4',
      original: 'your fault',
      rephrased: 'Let\'s look at what we can do differently next time',
      reason: 'Forward-looking language promotes problem-solving over blame',
    });
  }

  // Calculate sentiment and score
  let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
  let score = 50;

  if (hasNegative && !hasPositive) {
    sentiment = 'negative';
    score = 30 - (suggestions.length * 5);
  } else if (hasPositive && !hasNegative) {
    sentiment = 'positive';
    score = 80 + (highlights.filter(h => h.type === 'positive').length * 5);
  } else if (hasNegative && hasPositive) {
    sentiment = 'neutral';
    score = 50;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    sentiment,
    score,
    highlights,
    warning: hasNegative 
      ? 'This message contains language that might be hurtful or create defensiveness. Consider the suggestions below for a more constructive approach.'
      : undefined,
    suggestions,
    explanation: hasNegative
      ? 'The highlighted phrases may trigger defensive reactions and close off productive dialogue. Small changes in wording can significantly improve how your message is received.'
      : undefined,
  };
}

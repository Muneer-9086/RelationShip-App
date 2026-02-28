import { useRef, useEffect, useState, useMemo } from 'react';
import type { Conversation, User, UserPresenceStatus } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { TypingIndicator } from './TypingIndicator';
import { OnlineStatus } from './OnlineStatus';
import { Sparkles, Users, Eye, EyeOff, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TypingState {
  [userId: string]: {
    isTyping: boolean;
    timestamp: number;
  };
}

interface ChatAreaProps {
  conversation: Conversation;
  currentUser: User;
  onSendMessage: (content: string) => void;
  onToggleAI: () => void;
  onToggleInsights: () => void;
  showInsights: boolean;
  onTypingStart?: (partnerId: string) => void;
  onTypingStop?: (partnerId: string, content: string) => void;
  typingFrom?: TypingState;
  userId: string;
}

export function ChatArea({
  conversation,
  currentUser,
  onSendMessage,
  onToggleAI,
  onToggleInsights,
  showInsights,
  onTypingStart,
  onTypingStop,
  typingFrom,
  userId
}: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const otherParticipants = useMemo(() => 
    conversation.participants.filter((p) => p.id !== currentUser.id),
    [conversation.participants, currentUser.id]
  );

  const partnerId = otherParticipants[0]?.id;
  const partnerName = otherParticipants[0]?.name;
  const partnerStatus: UserPresenceStatus = otherParticipants[0]?.status || 'offline';

  // Check if partner is typing
  const isPartnerTyping = useMemo(() => {
    if (!partnerId || !typingFrom) return false;
    return typingFrom[partnerId]?.isTyping ?? false;
  }, [partnerId, typingFrom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.messages]);

  const getSender = (senderId: string): User => {
    if (senderId === 'ai-assistant') {
      return {
        id: 'ai-assistant',
        name: 'MindfulAI',
        status: 'online',
      };
    }
    return (
      conversation.participants.find((p) => p.id === senderId) || {
        id: senderId,
        name: 'Unknown',
        status: 'offline',
      }
    );
  };

  return (
    <div className="flex flex-col h-full bg-background" data-testid="chat-area">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          {/* Avatar with online status */}
          <div className="relative">
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium',
                conversation.type === 'group'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary/10 text-primary'
              )}
              data-testid="chat-avatar"
            >
              {conversation.type === 'group' ? (
                <Users size={18} />
              ) : (
                partnerName?.charAt(0).toUpperCase()
              )}
            </div>
            {/* Online status indicator on avatar */}
            {conversation.type !== 'group' && (
              <div className="absolute -bottom-0.5 -right-0.5">
                <OnlineStatus status={partnerStatus} size="sm" />
              </div>
            )}
          </div>

          <div>
            <h2 className="font-semibold text-foreground" data-testid="chat-partner-name">
              {conversation.name}
            </h2>
            <div className="flex items-center gap-2">
              {/* Show typing indicator or online status */}
              {isPartnerTyping ? (
                <TypingIndicator userName={partnerName} />
              ) : (
                <div className="flex items-center gap-1.5">
                  <OnlineStatus status={partnerStatus} size="sm" showLabel />
                </div>
              )}
              {conversation.aiParticipant && (
                <span className="flex items-center gap-1 text-xs text-ai">
                  <Sparkles size={10} />
                  AI active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleAI}
            className={cn(
              'h-8 gap-1.5 text-xs',
              conversation.aiEnabled ? 'text-ai' : 'text-muted-foreground'
            )}
            data-testid="toggle-ai-btn"
          >
            {conversation.aiEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
            AI {conversation.aiEnabled ? 'On' : 'Off'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleInsights}
            className={cn(
              'h-8 gap-1.5 text-xs',
              showInsights ? 'text-primary bg-primary/10' : 'text-muted-foreground'
            )}
            data-testid="toggle-insights-btn"
          >
            <Lightbulb size={14} />
            Insights
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div 
        className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4"
        data-testid="messages-container"
      >
        {conversation.messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            sender={getSender(message.senderId)}
            isCurrentUser={message.senderId === currentUser.id}
          />
        ))}
        
        {/* Typing indicator at bottom of messages */}
        {isPartnerTyping && (
          <div className="flex items-start gap-2 animate-fade-in" data-testid="typing-indicator-message">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
              {partnerName?.charAt(0).toUpperCase()}
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2">
              <TypingIndicator />
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <MessageComposer
        onSendMessage={onSendMessage}
        aiEnabled={conversation.aiEnabled}
        onTypingStart={partnerId ? () => onTypingStart?.(partnerId) : undefined}
        onTypingStop={partnerId ? (content) => onTypingStop?.(`${userId}:${partnerId}`, content) : undefined}
      />
    </div>
  );
}

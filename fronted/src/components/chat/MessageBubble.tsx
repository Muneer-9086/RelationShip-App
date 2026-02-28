import { Message, User } from '@/types/chat';
import { HighlightedText } from './HighlightedText';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
  sender: User;
  isCurrentUser: boolean;
}

export function MessageBubble({ message, sender, isCurrentUser }: MessageBubbleProps)
{
  

  const isAI = message.type === 'ai';

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className={cn(
        'flex gap-3 chat-bubble-enter',
        isCurrentUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium',
          isAI
            ? 'gradient-calm text-primary-foreground'
            : isCurrentUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {isAI ? (
          <Sparkles size={18} className="ai-pulse" />
        ) : (
          sender.name.charAt(0).toUpperCase()
        )}
      </div>

      {/* Message content */}
      <div
        className={cn(
          'max-w-[70%] flex flex-col gap-1',
          isCurrentUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Sender name (for group chats) */}
        {!isCurrentUser && (
          <span className="text-xs text-muted-foreground px-1">
            {isAI ? 'MindfulAI' : sender.name}
          </span>
        )}

        {/* Bubble */}
        <div
          className={cn(
            'px-4 py-2.5 rounded-bubble shadow-soft',
            isAI
              ? 'bg-chat-ai border border-ai/20'
              : isCurrentUser
              ? 'bg-chat-sent'
              : 'bg-chat-received border border-border'
          )}
        >
          <div className="text-sm leading-relaxed">
            <HighlightedText
              content={message.content}
              highlights={message.highlights}
            />
          </div>
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground px-1">
          {/* {formatTime(message.timestamp)} */}
          {message.isEdited && ' · Edited'}
        </span>
      </div>
    </div>
  );
}

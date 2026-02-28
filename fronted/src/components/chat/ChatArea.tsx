import { useRef, useEffect,useState } from 'react';
import { Conversation, User } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { Sparkles, Users, Eye, EyeOff, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatAreaProps {
  conversation: Conversation;
  currentUser: User;
  onSendMessage: (content: string) => void;
  onToggleAI: () => void;
  onToggleInsights: () => void;
  showInsights: boolean;
  onTypingStart?: (partnerId: string) => void;
  onTypingStop?: (partnerId: string,content:string) => void;
  typingFrom?: Record<string, boolean>;
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

    const otherParticipants = conversation.participants.filter(
    (p) => p.id !== currentUser.id
  );
  const [partnerId,setPartnerId] = useState<string>(otherParticipants[0]?.id);
  const [isPartnerTyping, setIsPartnerTyping] = useState<boolean>(otherParticipants[0]?.id && typingFrom?.[otherParticipants[0]?.id]);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.messages]);

  useEffect(() =>
  {
    if (!isPartnerTyping) {
      setIsPartnerTyping(otherParticipants[0]?.id && typingFrom?.[otherParticipants[0]?.id])
    }
    if (!partnerId) {
      setPartnerId(otherParticipants[0]?.id);
    }
  },[partnerId,isPartnerTyping])

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
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium',
              conversation.type === 'group'
                ? 'bg-muted text-muted-foreground'
                : 'bg-primary/10 text-primary'
            )}
          >
            {conversation.type === 'group' ? (
              <Users size={18} />
            ) : (
              otherParticipants[0]?.name.charAt(0).toUpperCase()
            )}
          </div>

          <div>
            <h2 className="font-semibold text-foreground">{conversation.name}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {conversation.type === 'group'
                  ? `${conversation.participants.length} participants`
                  : otherParticipants[0]?.status === 'online'
                  ? 'Online'
                  : 'Offline'}
              </span>
              {conversation.aiParticipant && (
                <span className="flex items-center gap-1 text-xs text-ai">
                  <Sparkles size={10} />
                  AI active
                </span>
              )}
              {isPartnerTyping && (
                <span className="text-xs text-muted-foreground italic">
                  typing...
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
          >
            <Lightbulb size={14} />
            Insights
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {conversation.messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            sender={getSender(message.senderId)}
            isCurrentUser={message.senderId === currentUser.id}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <MessageComposer
        onSendMessage={onSendMessage}
        aiEnabled={conversation.aiEnabled}
        onTypingStart={partnerId ? () => onTypingStart?.(partnerId) : undefined}
        onTypingStop={partnerId ? (content) => onTypingStop?.(`${userId}:${partnerId}`,content) : undefined}
      />
    </div>
  );
}

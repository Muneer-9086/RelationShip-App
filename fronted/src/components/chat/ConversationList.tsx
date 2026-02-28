import type { Conversation, User, UserPresenceStatus } from '@/types/chat';
import { cn } from '@/lib/utils';
import { Users, Sparkles } from 'lucide-react';
import { OnlineStatus } from './OnlineStatus';

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  currentUser: User;
  onNewChat?: () => void;
  onlineUsers?: string[];
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  currentUser,
  onNewChat,
  onlineUsers = [],
}: ConversationListProps) {
  const getOtherParticipant = (conversation: Conversation): User | undefined => {
    return conversation.participants.find((p) => p.id !== currentUser.id);
  };

  const getParticipantStatus = (participant: User | undefined): UserPresenceStatus => {
    if (!participant) return 'offline';
    if (participant.id === '__ai__') return 'online';
    return onlineUsers.includes(participant.id) ? 'online' : 'offline';
  };

  const formatTime = (date?: Date): string => {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getPreviewText = (conversation: Conversation): string => {
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (!lastMessage) return 'No messages yet';

    const prefix =
      lastMessage.senderId === currentUser.id
        ? 'You: '
        : lastMessage.type === 'ai'
          ? 'AI: '
          : '';

    return prefix + lastMessage.content;
  };

  return (
    <div className="flex flex-col h-full" data-testid="conversation-list">
      {/* Header */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold text-sidebar-foreground">Messages</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Communicate mindfully
            </p>
          </div>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {conversations.map((conversation) => {
          const otherParticipant = getOtherParticipant(conversation);
          const participantStatus = getParticipantStatus(otherParticipant);
          const isActive = conversation.id === activeConversationId;
          const lastMessage = conversation.messages[conversation.messages.length - 1];

          return (
            <div
              key={conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
              className={cn(
                'px-4 py-3 cursor-pointer transition-colors border-b border-sidebar-border/50',
                isActive
                  ? 'bg-sidebar-accent'
                  : 'hover:bg-sidebar-accent/50'
              )}
              data-testid={`conversation-item-${conversation.id}`}
            >
              <div className="flex items-start gap-3">
                {/* Avatar with online indicator */}
                <div className="relative flex-shrink-0">
                  <div
                    className={cn(
                      'w-11 h-11 rounded-full flex items-center justify-center text-sm font-medium',
                      conversation.type === 'group'
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-primary/10 text-primary'
                    )}
                    data-testid="conversation-avatar"
                  >
                    {otherParticipant && conversation.type === 'group' ? (
                      <Users size={18} />
                    ) : (
                      otherParticipant?.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  {/* Online status indicator */}
                  {conversation.type !== 'group' && (
                    <div className="absolute -bottom-0.5 -right-0.5">
                      <OnlineStatus 
                        status={participantStatus} 
                        size="md" 
                      />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span 
                        className="font-medium text-sm text-sidebar-foreground truncate"
                        data-testid="conversation-name"
                      >
                        {conversation.name}
                      </span>
                      {conversation.aiParticipant && (
                        <Sparkles size={12} className="text-ai flex-shrink-0" />
                      )}
                      {/* Inline status badge */}
                      {conversation.type !== 'group' && (
                        <span 
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full",
                            participantStatus === 'online' 
                              ? 'bg-green-500/10 text-green-600' 
                              : 'bg-gray-500/10 text-gray-500'
                          )}
                          data-testid={`status-badge-${participantStatus}`}
                        >
                          {participantStatus === 'online' ? 'Online' : 'Offline'}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {formatTime(lastMessage?.timestamp)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {getPreviewText(conversation)}
                    </p>
                    {conversation.unreadCount > 0 && (
                      <span 
                        className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center"
                        data-testid="unread-count"
                      >
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

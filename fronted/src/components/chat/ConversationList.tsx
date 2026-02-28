import { Conversation, User } from '@/types/chat';
import { cn } from '@/lib/utils';
import { Users, Sparkles, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConversationListProps
{
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  currentUser: User;
  onNewChat?: () => void;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  currentUser,
  onNewChat,
}: ConversationListProps)
{
  const getOtherParticipant = (conversation: Conversation) =>
  {
    console.log("GET OTHER PARTICAIPTATIOn");
    console.log()
    console.log(conversation.participants.find((p) => p.id !== currentUser.id))
    return conversation.participants.find((p) => p.id !== currentUser.id);
  };

  const formatTime = (date?: Date) =>
  {
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

  const getPreviewText = (conversation: Conversation) =>
  {
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

  console.log("___conversations___otherParticipant___");
  console.log(conversations)

  return (
    <div className="flex flex-col h-full">
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
        {conversations.map((conversation) =>
        {
          console.log("___conversation___");
          console.log(conversation);
          const otherParticipant = getOtherParticipant(conversation);
          const isActive = conversation.id === activeConversationId;
          const lastMessage = conversation.messages[conversation.messages.length - 1];

          console.log("___otherParticipant___");
          console.log(otherParticipant);
          console.log(isActive);
          console.log(lastMessage);
          console.log(otherParticipant?.name.charAt(0).toUpperCase());

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
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div
                  className={cn(
                    'flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-sm font-medium',
                    conversation.type === 'group'
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {
                    otherParticipant && conversation.type === 'group' ? (
                      <Users size={18} />
                    ) : (
                      <>
{                      otherParticipant?.name.charAt(0).toUpperCase()
}
                      </>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm text-sidebar-foreground truncate">
                        {conversation.name}
                      </span>
                      {conversation.aiParticipant && (
                        <Sparkles size={12} className="text-ai flex-shrink-0" />
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
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
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

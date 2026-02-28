import type { ConversationInsights, ParticipantInsight, User } from '@/types/chat';
import {
  X, TrendingUp, MessageCircle, ThumbsUp, Lightbulb, Heart, Send, Bot,
  User as UserIcon, ChevronLeft, AlertTriangle, RefreshCw, Brain,
  Eye, BarChart2, Wand2, Sparkles, CheckCircle2, ChevronDown, ChevronUp, StopCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from "@/contexts/ChatContext";
import api from "@/lib/proxy";
import type { AITokenPayload, AIDonePayload, AIStreamStartPayload, AIAbortedPayload, AIErrorPayload } from "@/lib/wsClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InsightsPanelProps {
  insights: ConversationInsights;
  participants: User[];
  onClose: () => void;
  converstationId: string;
  rawMessages?: RawMessage[];
}

export interface RawMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date;
  positiveSpans?: string[];
  negativeSpans?: string[];
  thoughtProcess?: string;
  underlyingNeed?: string;
}

interface ChatMessage {
  id: string;
  role: "ai" | "user";
  text: string;
  timestamp: Date;
  isStreaming?: boolean;
}

// ─── Utility Functions ────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function highlightText(text: string, positive: string[], negative: string[]): string {
  let result = text;
  positive.forEach((p) => {
    result = result.replace(
      new RegExp(`(${p})`, 'gi'),
      '<mark class="highlight-positive">$1</mark>'
    );
  });
  negative.forEach((n) => {
    result = result.replace(
      new RegExp(`(${n})`, 'gi'),
      '<mark class="highlight-negative">$1</mark>'
    );
  });
  return result;
}

// ─── Warning Banner ───────────────────────────────────────────────────────────

interface WarnBannerProps {
  text: string;
  onRephrase: () => void;
  onDismiss: () => void;
}

function WarnBanner({ text, onRephrase, onDismiss }: WarnBannerProps): JSX.Element {
  return (
    <div className="warn-banner animate-slide-up">
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-200 leading-relaxed">{text}</p>
      </div>
      <div className="flex gap-2 mt-2">
        <button className="warn-btn warn-btn-rephrase" onClick={onRephrase}>
          <Wand2 size={11} /> Rephrase
        </button>
        <button className="warn-btn warn-btn-dismiss" onClick={onDismiss}>
          Send anyway
        </button>
      </div>
    </div>
  );
}

// ─── Rephrase Panel ───────────────────────────────────────────────────────────

interface RephrasePanelProps {
  original: string;
  suggestions: string[];
  onPick: (s: string) => void;
  onBack: () => void;
  converstationId: string;
  userMessage: string;
}

function RephrasePanel({
  userMessage,
  suggestions,
  converstationId,
  onPick,
  onBack
}: RephrasePanelProps): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiData, setApiData] = useState<{
    aiRewriteSuggestion?: string[];
    tone?: string;
    reason?: string;
  } | null>(null);

  const fetchSuggestions = useCallback(async (): Promise<void> => {
    if (!converstationId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await api.get(
        `/api/chat/converstation/rephase/suggestion?conversationId=${converstationId}`
      );
      setApiData(response.data);
    } catch (err: unknown) {
      console.error("Error: Rephrase Panel", err);
      setError("Unable to fetch rephrase suggestions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [converstationId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  if (loading) {
    return (
      <div className="rephrase-panel panel-slide-in">
        <p className="text-xs text-muted-foreground">Loading suggestions…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rephrase-panel panel-slide-in space-y-3">
        <button className="back-btn" onClick={onBack}>
          <ChevronLeft size={13} /> Back
        </button>
        <p className="text-xs text-negative">{error}</p>
        <Button size="sm" variant="outline" onClick={fetchSuggestions}>
          Retry
        </Button>
      </div>
    );
  }

  const finalSuggestions = apiData?.aiRewriteSuggestion?.length
    ? apiData.aiRewriteSuggestion
    : suggestions;

  return (
    <div className="rephrase-panel panel-slide-in">
      <button className="back-btn" onClick={onBack}>
        <ChevronLeft size={13} /> Back
      </button>

      <p className="text-[10px] text-muted-foreground mb-1 mt-3">Original</p>
      <div className="original-bubble">{userMessage}</div>

      <p className="text-[10px] text-ai font-semibold mb-2 mt-4 flex items-center gap-1">
        <Sparkles size={10} /> Suggested rephrases
      </p>

      {apiData && (
        <div className="mb-3 space-y-1">
          <p className="text-[10px] text-muted-foreground">
            Tone: <span className="font-semibold">{apiData.tone}</span>
          </p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {apiData.reason}
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {finalSuggestions.map((s, i) => (
          <li key={i}>
            <button className="rephrase-option" onClick={() => onPick(s)}>
              <span className="rephrase-num">{i + 1}</span>
              <span className="text-xs leading-relaxed">{s}</span>
              <CheckCircle2 size={12} className="ml-auto text-positive flex-shrink-0" />
            </button>
          </li>
        ))}
        {finalSuggestions.length === 0 && (
          <li className="text-xs text-muted-foreground">No suggestions are available right now.</li>
        )}
      </ul>
    </div>
  );
}

// ─── Highlight View ───────────────────────────────────────────────────────────

interface HighlightViewProps {
  messages: RawMessage[];
  participants: User[];
}

function HighlightView({ messages, participants }: HighlightViewProps): JSX.Element {
  const getUser = (id: string): User | undefined => participants.find((p) => p.id === id);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="legend-dot bg-positive-bg border border-positive/30" />
        <span className="text-[10px] text-muted-foreground">Positive</span>
        <span className="legend-dot bg-negative-bg border border-negative/30 ml-3" />
        <span className="text-[10px] text-muted-foreground">Negative</span>
      </div>
      {messages.map((msg) => {
        const user = getUser(msg.senderId);
        const highlighted = highlightText(
          msg.text,
          msg.positiveSpans ?? [],
          msg.negativeSpans ?? []
        );
        return (
          <div key={msg.id} className="highlight-msg-card">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="avatar-xs">{user?.name.charAt(0).toUpperCase() ?? '?'}</div>
              <span className="text-xs font-medium">{user?.name ?? 'Unknown'}</span>
              <span className="text-[9px] text-muted-foreground ml-auto">{formatTime(msg.timestamp)}</span>
            </div>
            <p
              className="text-xs leading-relaxed text-foreground"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Thought View ─────────────────────────────────────────────────────────────

interface ThoughtViewProps {
  messages: RawMessage[];
  participants: User[];
}

function ThoughtView({ messages, participants }: ThoughtViewProps): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null);
  const getUser = (id: string): User | undefined => participants.find((p) => p.id === id);

  return (
    <div className="space-y-3 p-4">
      {messages.map((msg) => {
        const user = getUser(msg.senderId);
        const isOpen = expanded === msg.id;
        return (
          <div key={msg.id} className="thought-card">
            <div className="flex items-start gap-2">
              <div className="avatar-xs mt-0.5">{user?.name.charAt(0).toUpperCase() ?? '?'}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground leading-relaxed">{msg.text}</p>
                {(msg.thoughtProcess || msg.underlyingNeed) && (
                  <button
                    className="thought-toggle"
                    onClick={() => setExpanded(isOpen ? null : msg.id)}
                  >
                    <Brain size={10} />
                    {isOpen ? 'Hide thought process' : 'Show thought process'}
                    {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  </button>
                )}
                {isOpen && (
                  <div className="thought-expand animate-slide-up">
                    {msg.thoughtProcess && (
                      <div className="thought-section">
                        <span className="thought-label">💭 Thinking</span>
                        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                          {msg.thoughtProcess}
                        </p>
                      </div>
                    )}
                    {msg.underlyingNeed && (
                      <div className="thought-section mt-2">
                        <span className="thought-label">🎯 Underlying need</span>
                        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                          {msg.underlyingNeed}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Growth Report ────────────────────────────────────────────────────────────

interface GrowthReportProps {
  insights: ConversationInsights;
  participants: User[];
}

function GrowthReport({ insights, participants }: GrowthReportProps): JSX.Element {
  return (
    <div className="space-y-5 p-4">
      <div className="growth-header">
        <BarChart2 size={18} className="text-ai" />
        <div>
          <h4 className="text-sm font-semibold">Post-Conversation Report</h4>
          <p className="text-[10px] text-muted-foreground">What you need to work on</p>
        </div>
      </div>

      {insights.participants.map((p) => {
        const user = participants.find((u) => u.id === p.userId);
        if (!user) return null;
        return (
          <div key={p.userId} className="growth-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="avatar-sm">{user.name.charAt(0).toUpperCase()}</div>
              <span className="text-sm font-medium">{user.name}</span>
            </div>

            <div className="growth-section positive">
              <h5 className="growth-section-title text-positive">✅ What's working</h5>
              <ul className="space-y-1 mt-1">
                {p.strengths.map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                    <span className="text-positive">•</span>{s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="growth-section negative mt-3">
              <h5 className="growth-section-title text-amber-500">⚠️ Work on this</h5>
              <ul className="space-y-1 mt-1">
                {p.improvements.map((imp, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                    <span className="text-amber-500">•</span>{imp}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}

      <div className="recommendations-block">
        <h5 className="text-xs font-semibold text-ai mb-2 flex items-center gap-1">
          <Lightbulb size={11} /> Key recommendations
        </h5>
        <ol className="space-y-2">
          {insights.recommendations.map((rec, i) => (
            <li key={i} className="text-xs text-ai-foreground flex gap-2">
              <span className="text-ai font-bold flex-shrink-0">{i + 1}.</span>
              {rec}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── AI Chat Modal with Streaming Support ─────────────────────────────────────

function AIChatModal({ onClose }: { onClose: () => void }): JSX.Element {
  const {
    userId,
    conversations,
    activeConversationId,
    connect,
    sendMessageAI,
    client,
  } = useChat();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const chatRoomIdRef = useRef<string>("");
  const currentReceiverRef = useRef<string>("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Map API messages to chat messages
  const mapApiMessages = (apiMessages: Array<{
    _id: string;
    senderType: string;
    content: string;
    createdAt: string;
    channel?: string;
  }>): ChatMessage[] => {
    return apiMessages.map((msg) => ({
      id: msg._id,
      role: msg.senderType === "ai" || msg.channel === "ai" ? "ai" as const : "user" as const,
      text: msg.content,
      timestamp: new Date(msg.createdAt),
    }));
  };

  // Handle connection
  const handleConnect = useCallback(
    (uid: string | null) => {
      if (uid) connect(uid);
    },
    [connect]
  );

  // Set up WebSocket listeners for streaming
  useEffect(() => {
    if (!client) return;

    // Stream start
    const unsubStreamStart = client.on("ai:stream_start", (data: unknown) => {
      const payload = data as AIStreamStartPayload;
      if (payload.receiver === currentReceiverRef.current) {
        setIsStreaming(true);
        const newMsgId = `streaming-${Date.now()}`;
        setStreamingMessageId(newMsgId);
        
        // Add placeholder message for streaming
        setMessages((prev) => [
          ...prev,
          {
            id: newMsgId,
            role: "ai",
            text: "",
            timestamp: new Date(),
            isStreaming: true,
          },
        ]);
      }
    });

    // Token received
    const unsubToken = client.on("ai:token", (data: unknown) => {
      const payload = data as AITokenPayload;
      if (payload.receiver === currentReceiverRef.current && streamingMessageId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingMessageId
              ? { ...msg, text: msg.text + payload.chunk }
              : msg
          )
        );
      }
    });

    // Stream complete
    const unsubDone = client.on("ai:done", (data: unknown) => {
      const payload = data as AIDonePayload;
      if (payload.receiver === currentReceiverRef.current) {
        setIsStreaming(false);
        setStreamingMessageId(null);
        
        // Update the streaming message with final content
        setMessages((prev) =>
          prev.map((msg) =>
            msg.isStreaming
              ? { ...msg, text: payload.content, isStreaming: false }
              : msg
          )
        );
      }
    });

    // Stream aborted
    const unsubAborted = client.on("ai:aborted", (data: unknown) => {
      const payload = data as AIAbortedPayload;
      if (payload.receiver === currentReceiverRef.current) {
        setIsStreaming(false);
        setStreamingMessageId(null);
        
        // Mark as aborted
        setMessages((prev) =>
          prev.map((msg) =>
            msg.isStreaming
              ? { ...msg, text: msg.text + " [Stopped]", isStreaming: false }
              : msg
          )
        );
      }
    });

    // Stream error
    const unsubError = client.on("ai:error", (data: unknown) => {
      const payload = data as AIErrorPayload;
      if (payload.receiver === currentReceiverRef.current) {
        setIsStreaming(false);
        setStreamingMessageId(null);
        
        // Show error message
        setMessages((prev) =>
          prev.map((msg) =>
            msg.isStreaming
              ? { ...msg, text: "Sorry, something went wrong. Please try again.", isStreaming: false }
              : msg
          )
        );
      }
    });

    return () => {
      unsubStreamStart();
      unsubToken();
      unsubDone();
      unsubAborted();
      unsubError();
    };
  }, [client, streamingMessageId]);

  // Load initial messages
  useEffect(() => {
    const init = async (): Promise<void> => {
      try {
        handleConnect(userId);

        const activeConversation = conversations.find(
          (c) => c.id === activeConversationId
        );

        if (!activeConversation) return;

        const currentConversationId = activeConversation.participants?.[0]?.id;
        const otherConversationId = activeConversation.participants?.[1]?.id;

        if (!currentConversationId || !otherConversationId) return;

        const response = await api.post(
          "/api/chat/converstation/ai/chat/getAll",
          {
            converstationId: currentConversationId,
            otherConversationId,
          }
        );

        const normalized = mapApiMessages(response.data.chat).sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        );

        chatRoomIdRef.current = response.data.chatRoomId;
        currentReceiverRef.current = `${response.data.chatRoomId}:${currentConversationId}`;

        setMessages(normalized);
      } catch (err) {
        console.error("AI CHAT LOAD ERROR:", err);
      }
    };

    if (userId && activeConversationId && conversations.length) {
      init();
    }
  }, [userId, activeConversationId, conversations, handleConnect]);

  // Send message
  const sendMessage = (): void => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "user",
        text: trimmed,
        timestamp: new Date(),
      },
    ]);

    // Send via WebSocket
    sendMessageAI(currentReceiverRef.current, trimmed);
    setInput("");
  };

  // Stop streaming
  const stopStreaming = (): void => {
    if (client && currentReceiverRef.current) {
      client.stopAIStream(currentReceiverRef.current);
    }
  };

  return (
    <div className="h-full flex flex-col bg-card panel-slide-in" data-testid="ai-chat-modal">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 mr-1"
          onClick={onClose}
          data-testid="ai-chat-close-btn"
        >
          <ChevronLeft size={16} />
        </Button>

        <div className="w-8 h-8 rounded-full gradient-insight flex items-center justify-center">
          <Bot size={16} className="text-ai" />
        </div>

        <div>
          <h3 className="font-semibold text-sm">AI Assistant</h3>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className={cn(
              "w-1.5 h-1.5 rounded-full inline-block",
              isStreaming ? "bg-amber-500 animate-pulse" : "bg-positive"
            )} />
            {isStreaming ? "Thinking..." : "Online"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4" data-testid="ai-chat-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex items-end gap-2",
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            )}
          >
            <div
              className={cn(
                "w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px]",
                msg.role === "ai"
                  ? "gradient-insight"
                  : "bg-primary/10 text-primary"
              )}
            >
              {msg.role === "ai" ? (
                <Bot size={12} className="text-ai" />
              ) : (
                <UserIcon size={12} />
              )}
            </div>

            <div
              className={cn(
                "max-w-[75%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                msg.role === "ai"
                  ? "bg-muted text-foreground rounded-bl-sm"
                  : "bg-primary text-primary-foreground rounded-br-sm"
              )}
            >
              <p className={cn(msg.isStreaming && "animate-pulse")}>
                {msg.text || (msg.isStreaming ? "..." : "")}
                {msg.isStreaming && <span className="inline-block w-1 h-3 bg-ai ml-0.5 animate-pulse" />}
              </p>
              {!msg.isStreaming && (
                <p
                  className={cn(
                    "text-[9px] mt-1 opacity-60",
                    msg.role === "user" ? "text-right" : "text-left"
                  )}
                >
                  {formatTime(msg.timestamp)}
                </p>
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={isStreaming ? "Wait for response..." : "Ask about the conversation..."}
          disabled={isStreaming}
          className="flex-1 text-xs bg-muted border border-border rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60 disabled:opacity-50"
          data-testid="ai-chat-input"
        />

        {isStreaming ? (
          <Button
            size="sm"
            variant="destructive"
            className="h-8 w-8 p-0 flex-shrink-0"
            onClick={stopStreaming}
            data-testid="ai-chat-stop-btn"
          >
            <StopCircle size={13} />
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8 w-8 p-0 flex-shrink-0"
            onClick={sendMessage}
            disabled={!input.trim()}
            data-testid="ai-chat-send-btn"
          >
            <Send size={13} />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Composer Guard ───────────────────────────────────────────────────────────

interface ComposerGuardProps {
  draft: string;
  onClear: () => void;
  converstationId: string;
}

function ComposerGuard({ draft, converstationId, onClear }: ComposerGuardProps): JSX.Element | null {
  const [step, setStep] = useState<'warn' | 'rephrase' | null>(null);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userMessage, setUserMessage] = useState<string>("");

  const fetchGuardStatus = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/api/chat/converstation/rephrase?conversationId=${converstationId}`);
      const data = response.data as { lastMessageIsBlocked?: boolean; lastMessage?: string | null };

      if (data.lastMessageIsBlocked) {
        setStep('warn');
        setHidden(false);
        setUserMessage(data.lastMessage ?? '');
      } else {
        setStep(null);
        setHidden(true);
        setUserMessage('');
      }
    } catch (err: unknown) {
      console.error("COMPOSE GUARD ERROR", err);
      setError('Unable to check message safety status.');
      setStep(null);
      setHidden(true);
    } finally {
      setLoading(false);
    }
  }, [converstationId]);

  useEffect(() => {
    fetchGuardStatus();
  }, [fetchGuardStatus]);

  const mockWarning = draft.length > 10 ? "This message may come across as dismissive. Consider softening your tone." : null;

  if (hidden) return null;

  if (loading) {
    return <div className="text-xs text-muted-foreground">Checking for message warnings…</div>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-negative">{error}</p>
        <Button size="sm" variant="outline" onClick={fetchGuardStatus}>
          Retry
        </Button>
      </div>
    );
  }

  if (step === 'rephrase') {
    return (
      <RephrasePanel
        original={draft}
        userMessage={userMessage}
        converstationId={converstationId}
        suggestions={[]}
        onPick={() => { onClear(); setStep(null); }}
        onBack={() => setStep('warn')}
      />
    );
  }

  if (!mockWarning) return null;

  return (
    <WarnBanner
      text={mockWarning}
      onRephrase={() => setStep('rephrase')}
      onDismiss={() => { onClear(); setStep(null); }}
    />
  );
}

// ─── Tab Types ────────────────────────────────────────────────────────────────

type Tab = 'insights' | 'highlights' | 'thoughts' | 'report';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'insights', label: 'Insights', icon: <Lightbulb size={12} /> },
  { id: 'highlights', label: 'Highlights', icon: <Eye size={12} /> },
  { id: 'thoughts', label: 'Thoughts', icon: <Brain size={12} /> },
  { id: 'report', label: 'Report', icon: <BarChart2 size={12} /> },
];

// ─── Main InsightsPanel Component ─────────────────────────────────────────────

export function InsightsPanel({ 
  insights, 
  participants, 
  onClose, 
  converstationId, 
  rawMessages = [] 
}: InsightsPanelProps): JSX.Element {
  const [showChat, setShowChat] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('insights');
  const [composerDraft] = useState('This is terrible and you always do this');

  const getHealthColor = (h: number): string => 
    h >= 70 ? 'text-positive' : h >= 40 ? 'text-amber-500' : 'text-negative';
  
  const getSentimentColor = (s: ParticipantInsight['overallSentiment']): string =>
    s === 'positive' ? 'text-positive' : s === 'negative' ? 'text-negative' : 'text-muted-foreground';
  
  const getSentimentBg = (s: ParticipantInsight['overallSentiment']): string =>
    s === 'positive' ? 'bg-positive-bg' : s === 'negative' ? 'bg-negative-bg' : 'bg-muted';

  if (showChat) return <AIChatModal onClose={() => setShowChat(false)} />;

  return (
    <>
      <style>{`
        mark.highlight-positive {
          background: rgba(34,197,94,.18);
          color: #22c55e;
          border-radius: 3px;
          padding: 0 2px;
        }
        mark.highlight-negative {
          background: rgba(239,68,68,.15);
          color: #ef4444;
          border-radius: 3px;
          padding: 0 2px;
        }
        .warn-banner {
          background: linear-gradient(135deg, rgba(245,158,11,.12), rgba(239,68,68,.08));
          border: 1px solid rgba(245,158,11,.3);
          border-radius: 10px;
          padding: 10px 12px;
          margin: 8px 12px;
        }
        .warn-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: opacity .15s;
        }
        .warn-btn:hover { opacity: .8; }
        .warn-btn-rephrase { background: rgba(245,158,11,.25); color: #f59e0b; }
        .warn-btn-dismiss { background: rgba(255,255,255,.06); color: #9ca3af; }
        .rephrase-panel { padding: 16px; }
        .back-btn {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; color: #6b7280; cursor: pointer;
          background: none; border: none; padding: 0;
        }
        .back-btn:hover { color: #e5e7eb; }
        .original-bubble {
          background: rgba(255,255,255,.05);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 12px;
          color: #9ca3af;
          line-height: 1.5;
        }
        .rephrase-option {
          width: 100%;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          background: rgba(99,102,241,.07);
          border: 1px solid rgba(99,102,241,.18);
          border-radius: 10px;
          padding: 10px 12px;
          cursor: pointer;
          text-align: left;
          color: inherit;
          transition: background .15s;
        }
        .rephrase-option:hover { background: rgba(99,102,241,.14); }
        .rephrase-num {
          font-size: 10px;
          font-weight: 700;
          color: #818cf8;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .thought-card {
          background: rgba(255,255,255,.03);
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 10px;
          padding: 10px 12px;
        }
        .thought-toggle {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; color: #818cf8;
          background: none; border: none; cursor: pointer; padding: 0;
          margin-top: 6px;
        }
        .thought-toggle:hover { color: #a5b4fc; }
        .thought-expand {
          margin-top: 8px;
          padding: 8px 10px;
          background: rgba(99,102,241,.06);
          border-radius: 8px;
          border-left: 2px solid rgba(99,102,241,.3);
        }
        .thought-label {
          font-size: 10px;
          font-weight: 600;
          color: #818cf8;
        }
        .highlight-msg-card {
          background: rgba(255,255,255,.03);
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 10px;
          padding: 10px 12px;
        }
        .growth-header {
          display: flex; align-items: center; gap: 10px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255,255,255,.07);
        }
        .growth-card {
          background: rgba(255,255,255,.03);
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 12px;
          padding: 14px;
        }
        .recommendations-block {
          background: rgba(99,102,241,.07);
          border: 1px solid rgba(99,102,241,.15);
          border-radius: 12px;
          padding: 14px;
        }
        .avatar-xs {
          width: 22px; height: 22px;
          border-radius: 50%;
          background: rgba(99,102,241,.2);
          color: #818cf8;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 600;
          flex-shrink: 0;
        }
        .avatar-sm {
          width: 28px; height: 28px;
          border-radius: 50%;
          background: rgba(99,102,241,.2);
          color: #818cf8;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 600;
          flex-shrink: 0;
        }
        .legend-dot {
          width: 10px; height: 10px; border-radius: 3px; display: inline-block;
        }
        .tab-bar {
          display: flex;
          border-bottom: 1px solid rgba(255,255,255,.08);
          padding: 0 4px;
          gap: 2px;
        }
        .tab-btn {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 8px 10px;
          font-size: 11px;
          font-weight: 500;
          color: #6b7280;
          background: none; border: none; cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: color .15s, border-color .15s;
          margin-bottom: -1px;
        }
        .tab-btn:hover { color: #e5e7eb; }
        .tab-btn.active { color: #818cf8; border-bottom-color: #818cf8; }
        .chat-ai-cta {
          position: relative;
          width: 100%;
          border-radius: 14px;
          overflow: hidden;
          border: none;
          padding: 0;
          cursor: pointer;
          background: transparent;
        }
        .chat-ai-cta-glow {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4);
          opacity: 1;
          transition: opacity .2s;
        }
        .chat-ai-cta:hover .chat-ai-cta-glow { opacity: 0.85; }
        .chat-ai-cta::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,.12) 0%, transparent 60%);
          border-radius: 14px;
          z-index: 1;
        }
        .chat-ai-cta-inner {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
        }
        .chat-ai-cta-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(255,255,255,.18);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          backdrop-filter: blur(4px);
        }
        .chat-ai-cta-text {
          flex: 1;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .chat-ai-cta-title {
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.01em;
        }
        .chat-ai-cta-sub {
          font-size: 10px;
          color: rgba(255,255,255,.65);
        }
        .chat-ai-cta-arrow {
          color: rgba(255,255,255,.7);
          transition: transform .2s, color .2s;
        }
        .chat-ai-cta:hover .chat-ai-cta-arrow {
          transform: translateX(3px);
          color: #fff;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slideUp .2s ease; }
        .panel-slide-in { animation: slideUp .18s ease; }
      `}</style>

      <div className="h-full flex flex-col bg-card border-l border-border panel-slide-in" data-testid="insights-panel">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full gradient-insight flex items-center justify-center">
              <Lightbulb size={16} className="text-ai" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Conversation Insights</h3>
              <p className="text-[10px] text-muted-foreground">AI-powered analysis</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} data-testid="insights-close-btn">
            <X size={14} />
          </Button>
        </div>

        {/* Composer Guard */}
        <ComposerGuard draft={composerDraft} converstationId={converstationId} onClear={() => {}} />

        {/* Tab Bar */}
        <div className="tab-bar">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={cn('tab-btn', activeTab === t.id && 'active')}
              onClick={() => setActiveTab(t.id)}
              data-testid={`tab-${t.id}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'insights' && (
            <div className="p-4 space-y-6">
              {/* Health Score */}
              <div className="bg-muted/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <Heart size={14} className="text-primary" />
                    Conversation Health
                  </span>
                  <span className={cn('text-2xl font-bold', getHealthColor(insights.overallHealth))}>
                    {insights.overallHealth}%
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full gradient-calm rounded-full transition-all duration-500"
                    style={{ width: `${insights.overallHealth}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{insights.summary}</p>
              </div>

              {/* Participant Insights */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <MessageCircle size={14} className="text-muted-foreground" />
                  Participant Perspectives
                </h4>
                {insights.participants.map((insight) => {
                  const participant = participants.find((p) => p.id === insight.userId);
                  if (!participant) return null;
                  return (
                    <div key={insight.userId} className="bg-card border border-border rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="avatar-sm">{participant.name.charAt(0).toUpperCase()}</div>
                        <div className="flex-1">
                          <span className="text-sm font-medium">{participant.name}</span>
                          <div className="flex items-center gap-1">
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', getSentimentBg(insight.overallSentiment), getSentimentColor(insight.overallSentiment))}>
                              {insight.overallSentiment} tone
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Perspective: </span>{insight.perspective}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Style: </span>{insight.communicationStyle}
                      </div>
                      <div>
                        <span className="text-xs font-medium text-positive flex items-center gap-1 mb-1">
                          <ThumbsUp size={10} /> Doing well
                        </span>
                        <ul className="space-y-1">
                          {insight.strengths.map((s, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <span className="text-positive mt-1">•</span>{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-amber-600 flex items-center gap-1 mb-1">
                          <TrendingUp size={10} /> Can improve
                        </span>
                        <ul className="space-y-1">
                          {insight.improvements.map((imp, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <span className="text-amber-500 mt-1">•</span>{imp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recommendations */}
              <div>
                <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                  <Lightbulb size={14} className="text-ai" /> Recommendations
                </h4>
                <ul className="space-y-2">
                  {insights.recommendations.map((rec, i) => (
                    <li key={i} className="text-xs bg-ai-bg text-ai-foreground p-3 rounded-lg flex items-start gap-2">
                      <span className="text-ai font-bold">{i + 1}.</span>{rec}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Chat with AI CTA */}
              <button className="chat-ai-cta" onClick={() => setShowChat(true)} data-testid="chat-with-ai-btn">
                <div className="chat-ai-cta-glow" />
                <div className="chat-ai-cta-inner">
                  <div className="chat-ai-cta-icon">
                    <Bot size={18} className="text-white" />
                  </div>
                  <div className="chat-ai-cta-text">
                    <span className="chat-ai-cta-title">Chat with AI</span>
                    <span className="chat-ai-cta-sub">Ask anything about this conversation</span>
                  </div>
                  <div className="chat-ai-cta-arrow">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </button>
            </div>
          )}

          {activeTab === 'highlights' && (
            rawMessages.length > 0
              ? <HighlightView messages={rawMessages} participants={participants} />
              : <div className="p-6 text-center text-xs text-muted-foreground">No messages to highlight yet.</div>
          )}

          {activeTab === 'thoughts' && (
            rawMessages.length > 0
              ? <ThoughtView messages={rawMessages} participants={participants} />
              : <div className="p-6 text-center text-xs text-muted-foreground">No thought data available yet.</div>
          )}

          {activeTab === 'report' && (
            <GrowthReport insights={insights} participants={participants} />
          )}
        </div>
      </div>
    </>
  );
}

export default AIChatModal;

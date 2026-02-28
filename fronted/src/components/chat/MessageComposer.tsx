import { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, AlertCircle, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analyzeMessage } from '@/data/mockData';
import { cn } from '@/lib/utils';
import {emotionalAnalyze} from "@/ai/emotionalDetection"

interface MessageComposerProps {
  onSendMessage: (content: string) => void;
  aiEnabled: boolean;
  onTypingStart?: () => void;
  onTypingStop?: (content:string) => void;
}

interface Suggestion {
  id: string;
  original: string;
  rephrased: string;
  reason: string;
}

interface Analysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
  warning?: string;
  suggestions: Suggestion[];
  explanation?: string;
  highlights: { startIndex: number; endIndex: number; type: 'positive' | 'negative'; reason: string }[];
}

export function MessageComposer({
  onSendMessage,
  aiEnabled,
  onTypingStart,
  onTypingStop,
}: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!aiEnabled || !message.trim()) {
      setAnalysis(null);
      setShowSuggestions(false);
      return;
    }

    // Debounce analysis
    clearTimeout(debounceRef.current);
    setIsAnalyzing(true);

    debounceRef.current = setTimeout(() => {
      const result = analyzeMessage(message);
      setAnalysis(result);
      setIsAnalyzing(false);

      // Auto-show suggestions if there's a warning
      if (result.warning) {
        setShowSuggestions(true);
      }
    }, 500);

    return () => clearTimeout(debounceRef.current);
  }, [message, aiEnabled]);

  const handleSend = () =>
  {
    if (!message.trim()) return;
    onTypingStop?.(message);
    onSendMessage(message);
    setMessage('');
    setAnalysis(null);
    setShowSuggestions(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);
    if (value.trim() && onTypingStart) {
      onTypingStart();
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(async() =>
      {
    
        onTypingStop?.(message)
      }, 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const applySuggestion = (suggestion: Suggestion) => {
    setMessage((prev) => prev.replace(suggestion.original, suggestion.rephrased));
    setShowSuggestions(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-positive';
    if (score >= 40) return 'text-muted-foreground';
    return 'text-negative';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 70) return 'Positive';
    if (score >= 40) return 'Neutral';
    return 'Review suggested';
  };

  // Render highlighted preview
  const renderHighlightedPreview = () => {
    if (!analysis?.highlights.length) return null;

    const sortedHighlights = [...analysis.highlights].sort((a, b) => a.startIndex - b.startIndex);
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    sortedHighlights.forEach((highlight, index) => {
      if (highlight.startIndex > lastIndex) {
        parts.push(
          <span key={`text-${index}`}>{message.slice(lastIndex, highlight.startIndex)}</span>
        );
      }

      parts.push(
        <span
          key={`highlight-${index}`}
          className={cn(
            'rounded px-0.5',
            highlight.type === 'positive'
              ? 'bg-positive-bg text-positive-foreground'
              : 'bg-negative-bg text-negative-foreground'
          )}
        >
          {message.slice(highlight.startIndex, highlight.endIndex)}
        </span>
      );

      lastIndex = highlight.endIndex;
    });

    if (lastIndex < message.length) {
      parts.push(<span key="text-end">{message.slice(lastIndex)}</span>);
    }

    return (
      <div className="px-4 py-2 text-sm bg-muted/50 rounded-t-lg border-b border-border">
        <span className="text-muted-foreground text-xs block mb-1">Preview with highlights:</span>
        <div className="leading-relaxed">{parts}</div>
      </div>
    );
  };

  return (
    <div className="border-t border-border bg-card">
      {/* AI Suggestions Panel */}
      {showSuggestions && analysis?.warning && (
        <div className="border-b border-border bg-ai-bg/50 animate-fade-in">
          <div className="px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full gradient-calm flex items-center justify-center">
                <Sparkles size={16} className="text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="text-negative" />
                    <span className="text-sm font-medium">Communication Check</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setShowSuggestions(false)}
                  >
                    <X size={14} />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{analysis.warning}</p>

                {analysis.explanation && (
                  <p className="text-xs text-muted-foreground mb-3 italic">
                    {analysis.explanation}
                  </p>
                )}

                {/* Suggestions */}
                {analysis.suggestions.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Suggested alternatives:
                    </span>
                    {analysis.suggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="bg-card rounded-lg p-3 border border-border hover-lift cursor-pointer group"
                        onClick={() => applySuggestion(suggestion)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-negative line-through mb-1">
                              "{suggestion.original}"
                            </div>
                            <div className="text-sm text-positive font-medium">
                              "{suggestion.rephrased}"
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {suggestion.reason}
                            </div>
                          </div>
                          <ChevronRight
                            size={16}
                            className="text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Highlighted preview */}
      {analysis?.highlights.length > 0 && !showSuggestions && renderHighlightedPreview()}

      {/* Composer */}
      <div className="p-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleChange}
              onBlur={() => onTypingStop?.(message)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[48px] max-h-[200px]"
              rows={1}
              style={{
                height: 'auto',
                minHeight: '48px',
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
              }}
            />

            {/* AI Status indicator */}
            {aiEnabled && message.trim() && (
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                {isAnalyzing ? (
                  <span className="text-xs text-muted-foreground animate-pulse-soft">
                    Analyzing...
                  </span>
                ) : analysis ? (
                  <div className="flex items-center gap-1.5">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        analysis.score >= 70
                          ? 'bg-positive'
                          : analysis.score >= 40
                          ? 'bg-neutral'
                          : 'bg-negative'
                      )}
                    />
                    <span className={cn('text-xs', getScoreColor(analysis.score))}>
                      {getScoreLabel(analysis.score)}
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <Button
            onClick={handleSend}
            disabled={!message.trim()}
            className="h-12 w-12 rounded-full gradient-calm hover:opacity-90 transition-opacity"
          >
            <Send size={18} />
          </Button>
        </div>

        {/* AI toggle hint */}
        {aiEnabled && (
          <div className="flex items-center gap-1.5 mt-2 px-1">
            <Sparkles size={12} className="text-ai" />
            <span className="text-[10px] text-muted-foreground">
              AI communication assistant is active
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

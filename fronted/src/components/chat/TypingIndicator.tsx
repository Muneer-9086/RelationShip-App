import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  userName?: string;
  className?: string;
}

export function TypingIndicator({ userName, className }: TypingIndicatorProps) {
  return (
    <div 
      className={cn("flex items-center gap-2", className)}
      data-testid="typing-indicator"
    >
      <div className="flex items-center gap-1">
        <span 
          className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"
          style={{ animationDelay: "0ms", animationDuration: "600ms" }}
        />
        <span 
          className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"
          style={{ animationDelay: "150ms", animationDuration: "600ms" }}
        />
        <span 
          className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"
          style={{ animationDelay: "300ms", animationDuration: "600ms" }}
        />
      </div>
      <span className="text-xs text-muted-foreground italic">
        {userName ? `${userName} is typing...` : "typing..."}
      </span>
    </div>
  );
}

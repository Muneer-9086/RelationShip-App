import { cn } from "@/lib/utils";
import type { UserPresenceStatus } from "@/types/chat";

interface OnlineStatusProps {
  status: UserPresenceStatus;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "w-2 h-2",
  md: "w-2.5 h-2.5",
  lg: "w-3 h-3",
};

const statusColors = {
  online: "bg-green-500",
  offline: "bg-gray-400",
  away: "bg-amber-500",
};

const statusLabels = {
  online: "Online",
  offline: "Offline",
  away: "Away",
};

export function OnlineStatus({ 
  status, 
  size = "md", 
  showLabel = false,
  className 
}: OnlineStatusProps) {
  return (
    <div 
      className={cn("flex items-center gap-1.5", className)}
      data-testid="online-status"
    >
      <span 
        className={cn(
          "rounded-full flex-shrink-0",
          sizeClasses[size],
          statusColors[status],
          status === "online" && "animate-pulse"
        )}
        data-testid={`status-indicator-${status}`}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground">
          {statusLabels[status]}
        </span>
      )}
    </div>
  );
}

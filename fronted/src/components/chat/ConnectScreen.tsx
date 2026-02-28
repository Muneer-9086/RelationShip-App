import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageSquare, Wifi, WifiOff } from "lucide-react";

interface ConnectScreenProps {
  onConnect: (userId: string) => void;
  isConnecting?: boolean;
}

export function ConnectScreen({ onConnect, isConnecting }: ConnectScreenProps) {
  const [userId, setUserId] = useState(
    () => localStorage.getItem("mindfulchat-userid") ?? "user-1"
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = userId.trim();
    if (trimmed) onConnect(trimmed);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-full gradient-calm mx-auto flex items-center justify-center">
            <MessageSquare size={28} className="text-primary-foreground" />
          </div>
          <h1 className="text-xl font-display font-semibold">MindfulChat</h1>
          <p className="text-sm text-muted-foreground">
            Connect to start chatting
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="userId">Your User ID</Label>
            <Input
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. user-1"
              disabled={isConnecting}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!userId.trim() || isConnecting}
          >
            {isConnecting ? (
              <span className="flex items-center gap-2">
                <WifiOff size={16} className="animate-pulse" />
                Connecting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Wifi size={16} />
                Connect
              </span>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

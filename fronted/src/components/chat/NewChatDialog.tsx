import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { AI_USER_ID } from "@/lib/wsClient";

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (peerId: string) => void;
}

const QUICK_USERS = [
  { id: "user-2", name: "Sarah" },
  { id: "user-3", name: "Marcus" },
  { id: "user-4", name: "Elena" },
];

export function NewChatDialog({
  open,
  onOpenChange,
  onSelect,
}: NewChatDialogProps) {
  const [customId, setCustomId] = useState("");

  const  = (peerId: string) => {
    onSelect(peerId);
    onOpenChange(false);
    setCustomId("");
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customId.trim();
    if (trimmed) handleSelect(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Chat with AI</p>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => handleSelect(AI_USER_ID)}
            >
              <Sparkles size={16} className="text-ai" />
              MindfulAI
            </Button>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Chat with a user
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_USERS.map((u) => (
                <Button
                  key={u.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSelect(u.id)}
                >
                  {u.name}
                </Button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCustomSubmit} className="space-y-2">
            <Label htmlFor="customUserId">Or enter User ID</Label>
            <div className="flex gap-2">
              <Input
                id="customUserId"
                value={customId}
                onChange={(e) => setCustomId(e.target.value)}
                placeholder="e.g. user-5"
              />
              <Button type="submit" disabled={!customId.trim()}>
                Start
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useRef, useState } from "react";
import { Send, MessageSquare, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AgentChatPanelProps {
  sessionId: string;
}

interface ChatRow {
  id: string;
  kind: "human" | "agent";
  text: string;
  status?: string;
  created_at: string;
}

export const AgentChatPanel = ({ sessionId }: AgentChatPanelProps) => {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial load + realtime
  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    const load = async () => {
      const [{ data: instr }, { data: actions }] = await Promise.all([
        supabase
          .from("agent_instructions")
          .select("id, instruction, status, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
          .limit(50),
        supabase
          .from("bot_actions")
          .select("id, action_type, coordinates, timestamp")
          .eq("session_id", sessionId)
          .in("action_type", ["goal_complete", "level_complete", "level_failed", "human_instruction"])
          .order("timestamp", { ascending: true })
          .limit(50),
      ]);

      if (cancelled) return;

      const merged: ChatRow[] = [];
      (instr || []).forEach((r: any) =>
        merged.push({
          id: `i-${r.id}`,
          kind: "human",
          text: r.instruction,
          status: r.status,
          created_at: r.created_at,
        })
      );
      (actions || []).forEach((a: any) => {
        const coords = a.coordinates || {};
        let text = "";
        if (a.action_type === "goal_complete") text = `🎯 Goal reached: ${coords.goal}`;
        else if (a.action_type === "level_complete") text = `✅ ${coords.reason || "Level complete"}`;
        else if (a.action_type === "level_failed") text = `❌ ${coords.reason || "Level failed — retrying"}`;
        else if (a.action_type === "human_instruction") return; // already shown via instructions
        merged.push({ id: `a-${a.id}`, kind: "agent", text, created_at: a.timestamp });
      });
      merged.sort((x, y) => x.created_at.localeCompare(y.created_at));
      setRows(merged);
    };

    load();

    const ch = supabase
      .channel(`agent-chat-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_instructions", filter: `session_id=eq.${sessionId}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bot_actions", filter: `session_id=eq.${sessionId}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [sessionId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rows.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("device-automation", {
        body: { action: "send_instruction", payload: { sessionId, instruction: text } },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error || "send failed");
      setDraft("");
    } catch (e: any) {
      toast.error(`Could not send instruction: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-4 border-t border-border/40 pt-3">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-4 h-4 text-neon-purple" />
        <p className="text-xs font-semibold text-foreground/80">Talk to the agent</p>
      </div>

      <div
        ref={scrollRef}
        className="max-h-40 overflow-y-auto space-y-1.5 mb-2 pr-1 text-xs"
      >
        {rows.length === 0 ? (
          <p className="text-muted-foreground italic">No messages yet. Send the agent a hint, e.g. "tap the green tile" or "skip the popup".</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="flex items-start gap-1.5">
              {r.kind === "human" ? (
                <User className="w-3 h-3 mt-0.5 text-neon-blue shrink-0" />
              ) : (
                <Bot className="w-3 h-3 mt-0.5 text-neon-green shrink-0" />
              )}
              <div className="flex-1 leading-snug">
                <span>{r.text}</span>
                {r.kind === "human" && r.status && (
                  <Badge
                    variant="outline"
                    className="ml-1.5 text-[10px] py-0 px-1 h-4 align-middle"
                  >
                    {r.status}
                  </Badge>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !sending && send()}
          placeholder='e.g. "tap the green tile"'
          className="h-8 text-xs"
          disabled={sending}
        />
        <Button
          size="sm"
          onClick={send}
          disabled={sending || !draft.trim()}
          className="h-8 px-2 bg-neon-purple hover:bg-neon-purple/80 text-gaming-bg"
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};

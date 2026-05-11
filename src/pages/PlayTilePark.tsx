import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Play, Square, Brain, Smartphone } from "lucide-react";
import { toast } from "sonner";

const GAME_NAME = "Tile Park";

type LogEntry = { ts: string; level: "info" | "error" | "success"; msg: string };

export default function PlayTilePark() {
  const [params] = useSearchParams();
  const deviceId = params.get("deviceId") || "";
  const rounds = parseInt(params.get("rounds") || "30", 10);

  const [status, setStatus] = useState<string>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [actions, setActions] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const startedRef = useRef(false);

  const log = (level: LogEntry["level"], msg: string) =>
    setLogs((l) => [{ ts: new Date().toLocaleTimeString(), level, msg }, ...l].slice(0, 100));

  // Subscribe to the session row for live updates from the server-side runner
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bot_sessions", filter: `id=eq.${sessionId}` },
        (payload: any) => {
          const row = payload.new;
          if (!row) return;
          setStatus(row.status);
          setActions(row.actions_performed || 0);
          if (row.error_message) setErrorMsg(row.error_message);
          if (row.status === "completed") log("success", `🏁 Session completed`);
          if (row.status === "error") log("error", `Session error: ${row.error_message}`);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const startServerSide = async () => {
    if (!deviceId) {
      toast.error("Missing ?deviceId=... in URL");
      log("error", "Missing deviceId query param");
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    setStatus("starting");
    setErrorMsg(null);
    log("info", `🚀 Asking server to launch ${GAME_NAME} and run Gemini for ${rounds} rounds...`);
    toast.loading("Starting Gemini agent on server...", { id: "start" });

    try {
      const { data, error } = await supabase.functions.invoke("device-automation", {
        body: { action: "play_tilepark", payload: { deviceId, rounds } },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Server refused to start");

      setSessionId(data.sessionId);
      setStatus("running");
      log("success", `✅ Server started. session=${data.sessionId}`);
      toast.success(`Gemini is playing ${GAME_NAME} (${rounds} rounds)`, { id: "start" });
    } catch (e: any) {
      const msg = e?.message || String(e);
      log("error", `Start failed: ${msg}`);
      toast.error(`Start failed: ${msg}`, { id: "start" });
      setStatus("error");
      setErrorMsg(msg);
      startedRef.current = false;
    }
  };

  const stop = async () => {
    if (!sessionId) {
      setStatus("idle");
      startedRef.current = false;
      return;
    }
    log("info", `🛑 Stopping session ${sessionId}`);
    try {
      await supabase.functions.invoke("device-automation", {
        body: { action: "stop_bot_session", payload: { sessionId } },
      });
      toast.info("Stop requested");
    } catch (e: any) {
      toast.error(`Stop failed: ${e?.message || e}`);
    }
  };

  useEffect(() => {
    if (deviceId) startServerSide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Approximate rounds completed: ~2 taps per round, so use actions/2 as a rough proxy
  const roundsCompleted = Math.min(rounds, Math.floor(actions / 2));
  const pct = Math.min(100, Math.round((roundsCompleted / Math.max(rounds, 1)) * 100));

  const statusVariant =
    status === "running" ? "default" : status === "completed" ? "secondary" : status === "error" ? "destructive" : "outline";

  return (
    <div className="min-h-screen bg-gaming-bg text-foreground p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-glow">🧩 Tile Park — Server-Side Gemini Agent</h1>
            <p className="text-sm text-muted-foreground mt-1">
              The agent runs entirely in the edge function. Browser only displays progress.
              Device <span className="font-mono">{deviceId || "(missing)"}</span> ·{" "}
              <span className="font-bold text-neon-purple">{rounds}</span> rounds
            </p>
          </div>
          <div className="flex gap-2">
            {status === "running" || status === "starting" ? (
              <Button variant="destructive" onClick={stop}>
                <Square className="w-4 h-4 mr-1" /> Stop
              </Button>
            ) : (
              <Button
                onClick={() => {
                  startedRef.current = false;
                  setActions(0);
                  setErrorMsg(null);
                  setLogs([]);
                  startServerSide();
                }}
                disabled={!deviceId}
                className="bg-neon-green text-gaming-bg hover:bg-neon-green/80"
              >
                <Play className="w-4 h-4 mr-1" /> {status === "completed" ? "Run Again" : "Start"}
              </Button>
            )}
          </div>
        </header>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4 bg-gaming-card border-gaming-border">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge variant={statusVariant as any} className="mt-2 capitalize">{status}</Badge>
          </Card>
          <Card className="p-4 bg-gaming-card border-gaming-border">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Smartphone className="w-3 h-3" /> Device
            </p>
            <p className="font-mono text-sm mt-2 truncate">{deviceId || "—"}</p>
          </Card>
          <Card className="p-4 bg-gaming-card border-gaming-border">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Brain className="w-3 h-3" /> Total Actions
            </p>
            <p className="text-2xl font-bold text-neon-pink mt-1">{actions}</p>
          </Card>
        </div>

        <Card className="p-4 bg-gaming-card border-gaming-border space-y-2">
          <div className="flex justify-between text-sm">
            <span>Rounds (approx)</span>
            <span className="text-neon-purple">{roundsCompleted} / {rounds}</span>
          </div>
          <Progress value={pct} className="h-2" />
        </Card>

        {errorMsg && (
          <Card className="p-4 border-destructive bg-destructive/10">
            <p className="text-sm text-destructive font-mono">{errorMsg}</p>
          </Card>
        )}

        <Card className="p-4 bg-gaming-card border-gaming-border">
          <h3 className="font-bold mb-2">Client Log</h3>
          <p className="text-xs text-muted-foreground mb-2">
            Detailed Gemini reasoning &amp; tap traces are in the edge function logs (server-side).
          </p>
          <div className="space-y-1 text-xs font-mono max-h-[320px] overflow-y-auto">
            {logs.length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
            {logs.map((l, i) => (
              <div
                key={i}
                className={
                  l.level === "error"
                    ? "text-destructive"
                    : l.level === "success"
                    ? "text-neon-green"
                    : "text-muted-foreground"
                }
              >
                [{l.ts}] {l.msg}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

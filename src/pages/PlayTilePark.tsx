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
const PACKAGE_NAME = "funvent.tilepark";
const LOOP_INTERVAL_MS = 6000;

type LogEntry = { ts: string; level: "info" | "error" | "success"; msg: string };

export default function PlayTilePark() {
  const [params] = useSearchParams();
  const deviceId = params.get("deviceId") || "";
  const rounds = parseInt(params.get("rounds") || "30", 10);

  const [status, setStatus] = useState<"idle" | "launching" | "playing" | "done" | "error">("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hwDeviceId, setHwDeviceId] = useState<string>(deviceId);
  const [completed, setCompleted] = useState(0);
  const [actions, setActions] = useState(0);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const completedRef = useRef(0);
  const startedRef = useRef(false);

  const log = (level: LogEntry["level"], msg: string) => {
    setLogs((l) => [{ ts: new Date().toLocaleTimeString(), level, msg }, ...l].slice(0, 100));
  };

  const stop = (finalStatus: "done" | "error" | "idle" = "idle") => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatus(finalStatus);
    if (sessionId) {
      supabase.functions.invoke("device-automation", {
        body: { action: "stop_bot_session", payload: { sessionId } },
      }).catch(() => {});
    }
  };

  const runOneRound = async (sid: string, hw: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("device-automation", {
        body: {
          action: "run_bot_loop",
          payload: { sessionId: sid, deviceId: hw, iterations: 1 },
        },
      });
      if (error) {
        log("error", `Loop error: ${error.message}`);
        return;
      }
      if (data?.success) {
        completedRef.current += 1;
        setCompleted(completedRef.current);
        setActions(data.totalActions || 0);
        if (data.screenshot) setScreenshot(`data:image/png;base64,${data.screenshot}`);
        log("success", `Round ${completedRef.current}/${rounds} — ${data.actionsPerformed ?? 0} actions`);
        if (completedRef.current >= rounds) {
          log("success", `🏁 Completed ${rounds} rounds`);
          toast.success(`Tile Park: completed ${rounds} rounds`);
          stop("done");
        }
      } else {
        log("error", `Loop failed: ${data?.error || "unknown"}`);
      }
    } catch (e: any) {
      log("error", `Exception: ${e.message || e}`);
    }
  };

  const start = async () => {
    if (!deviceId) {
      toast.error("Missing deviceId query param");
      log("error", "Missing ?deviceId=...");
      setStatus("error");
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    setStatus("launching");
    log("info", `🚀 Launching ${GAME_NAME} (${PACKAGE_NAME}) on ${deviceId}`);
    toast.loading(`Launching ${GAME_NAME}...`, { id: "launch" });

    try {
      const { data, error } = await supabase.functions.invoke("device-automation", {
        body: {
          action: "start_bot_session",
          payload: { deviceId, gameName: GAME_NAME, packageName: PACKAGE_NAME, config: { rounds } },
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || data?.launchMessage || "Launch failed");

      const sid = data.session?.id;
      const hw = data.hardwareDeviceId || deviceId;
      setSessionId(sid);
      setHwDeviceId(hw);
      log("success", `✅ Launched. Session ${sid}`);
      toast.success(`${GAME_NAME} launched! Starting Gemini agent...`, { id: "launch" });

      setTimeout(() => {
        setStatus("playing");
        log("info", `🧠 Gemini agent starting (${rounds} rounds, every ${LOOP_INTERVAL_MS / 1000}s)`);
        runOneRound(sid, hw);
        intervalRef.current = setInterval(() => runOneRound(sid, hw), LOOP_INTERVAL_MS);
      }, 3000);
    } catch (e: any) {
      log("error", `Launch failed: ${e.message || e}`);
      toast.error(`Launch failed: ${e.message || e}`, { id: "launch" });
      setStatus("error");
      startedRef.current = false;
    }
  };

  // Auto-start on mount when deviceId is present
  useEffect(() => {
    if (deviceId) start();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressPct = Math.min(100, Math.round((completed / Math.max(rounds, 1)) * 100));

  return (
    <div className="min-h-screen bg-gaming-bg text-foreground p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-glow flex items-center gap-2">
              🧩 Play Tile Park — Gemini AI
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browser-controlled SIMA 2 Agent playing {GAME_NAME} on device{" "}
              <span className="font-mono">{deviceId || "(missing)"}</span> for{" "}
              <span className="font-bold text-neon-purple">{rounds}</span> rounds
            </p>
          </div>
          <div className="flex gap-2">
            {status === "playing" || status === "launching" ? (
              <Button variant="destructive" onClick={() => stop("idle")}>
                <Square className="w-4 h-4 mr-1" /> Stop
              </Button>
            ) : (
              <Button
                onClick={() => {
                  startedRef.current = false;
                  completedRef.current = 0;
                  setCompleted(0);
                  setActions(0);
                  setLogs([]);
                  start();
                }}
                disabled={!deviceId}
                className="bg-neon-green text-gaming-bg hover:bg-neon-green/80"
              >
                <Play className="w-4 h-4 mr-1" /> {status === "done" ? "Run Again" : "Start"}
              </Button>
            )}
          </div>
        </header>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4 bg-gaming-card border-gaming-border">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className="mt-2 capitalize">{status}</Badge>
          </Card>
          <Card className="p-4 bg-gaming-card border-gaming-border">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Smartphone className="w-3 h-3" /> Device
            </p>
            <p className="font-mono text-sm mt-2 truncate">{hwDeviceId || "—"}</p>
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
            <span>Rounds completed</span>
            <span className="text-neon-purple">
              {completed} / {rounds}
            </span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-4 bg-gaming-card border-gaming-border">
            <h3 className="font-bold mb-2">Latest Screen</h3>
            {screenshot ? (
              <img src={screenshot} alt="device screen" className="w-full rounded border border-gaming-border" />
            ) : (
              <div className="aspect-[9/16] flex items-center justify-center text-muted-foreground text-sm border border-dashed border-gaming-border rounded">
                Waiting for first frame...
              </div>
            )}
          </Card>
          <Card className="p-4 bg-gaming-card border-gaming-border">
            <h3 className="font-bold mb-2">Agent Log</h3>
            <div className="space-y-1 text-xs font-mono max-h-[480px] overflow-y-auto">
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
    </div>
  );
}

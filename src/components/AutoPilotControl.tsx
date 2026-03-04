import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Orbit, Play, Square, Gauge, Eye, Brain, Zap, BookOpen,
  Clock, Loader2, CheckCircle2, XCircle, AlertTriangle, Info, Trash2
} from "lucide-react";
import type { AutoPilotState, AutoPilotPhase, AutoPilotLogEntry } from "@/hooks/useAutoPilot";
import { useState } from "react";

interface AutoPilotControlProps {
  state: AutoPilotState;
  deviceId?: string;
  gameName?: string;
  onStart: (deviceId: string, gameName: string, objective?: string) => void;
  onStop: () => void;
  onSetSpeed: (speed: 'slow' | 'normal' | 'fast') => void;
  onClearLogs: () => void;
}

const phaseConfig: Record<AutoPilotPhase, { label: string; icon: React.ReactNode; color: string }> = {
  idle: { label: 'Idle', icon: <Clock className="w-4 h-4" />, color: 'text-muted-foreground' },
  perceiving: { label: 'Perceiving', icon: <Eye className="w-4 h-4 animate-pulse" />, color: 'text-neon-purple' },
  reasoning: { label: 'Reasoning', icon: <Brain className="w-4 h-4 animate-pulse" />, color: 'text-neon-blue' },
  executing: { label: 'Executing', icon: <Zap className="w-4 h-4 animate-pulse" />, color: 'text-neon-pink' },
  rewarding: { label: 'Learning', icon: <BookOpen className="w-4 h-4 animate-pulse" />, color: 'text-neon-green' },
  cooldown: { label: 'Cooldown', icon: <Clock className="w-4 h-4" />, color: 'text-muted-foreground' },
};

const logTypeIcons: Record<string, React.ReactNode> = {
  info: <Info className="w-3 h-3 text-neon-blue" />,
  success: <CheckCircle2 className="w-3 h-3 text-neon-green" />,
  error: <XCircle className="w-3 h-3 text-destructive" />,
  warning: <AlertTriangle className="w-3 h-3 text-yellow-500" />,
};

export const AutoPilotControl = ({
  state, deviceId, gameName, onStart, onStop, onSetSpeed, onClearLogs
}: AutoPilotControlProps) => {
  const [objective, setObjective] = useState("");
  const phase = phaseConfig[state.currentPhase];

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  };

  const elapsed = state.startedAt
    ? Date.now() - new Date(state.startedAt).getTime()
    : 0;

  return (
    <Card className="border-gaming-border bg-gaming-card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gaming-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Orbit className={`w-5 h-5 ${state.isRunning ? 'text-neon-green animate-spin' : 'text-neon-purple'}`} style={{ animationDuration: '3s' }} />
            <h3 className="font-bold text-glow">Auto-Pilot</h3>
            <Badge variant="outline" className="text-xs text-neon-green border-neon-green">Phase 5</Badge>
          </div>
          <div className="flex items-center gap-2">
            {state.isRunning && (
              <Badge variant="outline" className={`text-xs ${phase.color}`}>
                {phase.icon}
                <span className="ml-1">{phase.label}</span>
              </Badge>
            )}
            {state.isRunning ? (
              <Button size="sm" variant="destructive" onClick={onStop} className="h-8 gap-1.5 font-bold">
                <Square className="w-3.5 h-3.5" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => deviceId && gameName && onStart(deviceId, gameName, objective || undefined)}
                disabled={!deviceId || !gameName}
                className="bg-neon-green hover:bg-neon-green/80 text-primary-foreground font-bold h-8 gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                Start Auto-Pilot
              </Button>
            )}
          </div>
        </div>

        {/* Objective + Speed controls */}
        {!state.isRunning && (
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="Objective (optional): e.g. 'Reach level 10'"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="bg-gaming-card border-gaming-border text-sm h-8 flex-1"
            />
            <div className="flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
              {(['slow', 'normal', 'fast'] as const).map(s => (
                <Button
                  key={s}
                  size="sm"
                  variant={state.speed === s ? 'default' : 'outline'}
                  onClick={() => onSetSpeed(s)}
                  className="h-8 text-xs px-2 capitalize"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pipeline Visualization */}
      {state.isRunning && (
        <div className="px-4 py-3 border-b border-gaming-border">
          <div className="flex items-center justify-between gap-1">
            {(['perceiving', 'reasoning', 'executing', 'rewarding'] as AutoPilotPhase[]).map((p, i) => {
              const cfg = phaseConfig[p];
              const isActive = state.currentPhase === p;
              const isPast = ['perceiving', 'reasoning', 'executing', 'rewarding'].indexOf(state.currentPhase) > i;
              return (
                <div key={p} className="flex items-center gap-1 flex-1">
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md flex-1 justify-center text-xs font-medium transition-all ${
                    isActive ? `${cfg.color} bg-current/10 ring-1 ring-current/30` :
                    isPast ? 'text-neon-green/60' : 'text-muted-foreground/40'
                  }`}>
                    {isActive ? cfg.icon : isPast ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    <span className="hidden sm:inline">{cfg.label}</span>
                  </div>
                  {i < 3 && <span className="text-muted-foreground/30">→</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats Row */}
      {(state.isRunning || state.cycleCount > 0) && (
        <div className="px-4 py-2 border-b border-gaming-border grid grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-neon-purple">{state.cycleCount}</p>
            <p className="text-xs text-muted-foreground">Cycles</p>
          </div>
          <div>
            <p className="text-lg font-bold text-neon-blue">{state.totalActions}</p>
            <p className="text-xs text-muted-foreground">Actions</p>
          </div>
          <div>
            <p className="text-lg font-bold text-neon-pink">{state.avgCycleTimeMs > 0 ? formatDuration(state.avgCycleTimeMs) : '--'}</p>
            <p className="text-xs text-muted-foreground">Avg Cycle</p>
          </div>
          <div>
            <p className="text-lg font-bold text-neon-green">{elapsed > 0 ? formatDuration(elapsed) : '--'}</p>
            <p className="text-xs text-muted-foreground">Uptime</p>
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div className="p-4">
        {state.logs.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">Activity Log</span>
              <Button variant="ghost" size="sm" onClick={onClearLogs} className="h-6 text-xs gap-1">
                <Trash2 className="w-3 h-3" />
                Clear
              </Button>
            </div>
            <ScrollArea className="max-h-[250px]">
              <div className="space-y-1">
                {state.logs.map(log => (
                  <div key={log.id} className="flex items-start gap-2 py-1 text-xs">
                    <span className="mt-0.5 shrink-0">{logTypeIcons[log.type]}</span>
                    <span className="font-mono text-muted-foreground/60 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <div className="min-w-0">
                      <span className={
                        log.type === 'error' ? 'text-destructive' :
                        log.type === 'success' ? 'text-neon-green' :
                        log.type === 'warning' ? 'text-yellow-500' :
                        'text-foreground/80'
                      }>
                        {log.message}
                      </span>
                      {log.details && (
                        <p className="text-muted-foreground/60 truncate">{log.details}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Orbit className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Auto-Pilot ready</p>
            <p className="text-xs mt-1">
              {deviceId ? "Start Auto-Pilot to run the full agent loop continuously" : "Connect a device and start a game first"}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};

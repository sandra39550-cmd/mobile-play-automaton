import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Rocket, Loader2, StopCircle, CheckCircle2, XCircle,
  AlertTriangle, Info, ArrowRightLeft, Brain, Zap, Eye,
  Star, Clock, Target
} from "lucide-react";
import type { ZeroShotAttempt, ZeroShotLogEntry, ZeroShotPhase } from "@/hooks/useZeroShotAgent";

interface ZeroShotPlayAgentProps {
  currentAttempt: ZeroShotAttempt | null;
  attemptHistory: ZeroShotAttempt[];
  isRunning: boolean;
  deviceId?: string;
  onAttempt: (gameName: string, deviceId: string) => void;
  onAbort: () => void;
}

const phaseConfig: Record<ZeroShotPhase, { icon: any; label: string; color: string }> = {
  idle: { icon: Rocket, label: 'Ready', color: 'text-muted-foreground' },
  analyzing: { icon: Eye, label: 'Analyzing', color: 'text-neon-purple' },
  transferring: { icon: ArrowRightLeft, label: 'Transferring', color: 'text-neon-blue' },
  planning: { icon: Brain, label: 'Planning', color: 'text-neon-blue' },
  executing: { icon: Zap, label: 'Executing', color: 'text-neon-pink' },
  evaluating: { icon: Star, label: 'Evaluating', color: 'text-yellow-500' },
  complete: { icon: CheckCircle2, label: 'Complete', color: 'text-neon-green' },
  failed: { icon: XCircle, label: 'Failed', color: 'text-destructive' },
};

function LogIcon({ type }: { type: ZeroShotLogEntry['type'] }) {
  switch (type) {
    case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-neon-green shrink-0" />;
    case 'error': return <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />;
    case 'warning': return <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />;
    default: return <Info className="w-3.5 h-3.5 text-neon-blue shrink-0" />;
  }
}

export const ZeroShotPlayAgent = ({
  currentAttempt,
  attemptHistory,
  isRunning,
  deviceId,
  onAttempt,
  onAbort,
}: ZeroShotPlayAgentProps) => {
  const [gameName, setGameName] = useState("");

  const phase = currentAttempt?.phase || 'idle';
  const PhaseIcon = phaseConfig[phase].icon;

  const handleStart = () => {
    if (!gameName.trim() || !deviceId) return;
    onAttempt(gameName.trim(), deviceId);
  };

  return (
    <Card className="border-gaming-border bg-gaming-card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gaming-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-neon-pink" />
            <h3 className="font-bold text-glow">Zero-Shot PlayAgent</h3>
            <Badge variant="outline" className="text-xs text-neon-pink border-neon-pink">
              NEW
            </Badge>
          </div>
          <Badge
            variant="outline"
            className={`text-xs ${phaseConfig[phase].color} border-current ${isRunning ? 'animate-pulse' : ''}`}
          >
            <PhaseIcon className="w-3 h-3 mr-1" />
            {phaseConfig[phase].label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Attempt unseen games using generalized knowledge from all learned experiences
        </p>
      </div>

      {/* Controls */}
      <div className="p-4 border-b border-gaming-border">
        <div className="flex gap-2">
          <Input
            placeholder="Enter game name (e.g., Candy Crush)"
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            disabled={isRunning}
            className="bg-background border-gaming-border"
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          />
          {isRunning ? (
            <Button variant="destructive" size="sm" onClick={onAbort} className="gap-1.5 shrink-0">
              <StopCircle className="w-4 h-4" />
              Abort
            </Button>
          ) : (
            <Button
              onClick={handleStart}
              disabled={!gameName.trim() || !deviceId}
              className="bg-neon-pink hover:bg-neon-pink/80 text-primary-foreground gap-1.5 shrink-0"
            >
              <Rocket className="w-4 h-4" />
              Attempt
            </Button>
          )}
        </div>
        {!deviceId && (
          <p className="text-xs text-destructive mt-1.5">No device connected — connect a device first</p>
        )}
      </div>

      {/* Current Attempt Progress */}
      {currentAttempt && (
        <div className="p-4 border-b border-gaming-border space-y-3">
          {/* Phase Progress Bar */}
          <div className="flex items-center gap-1">
            {(['analyzing', 'transferring', 'planning', 'executing', 'evaluating'] as ZeroShotPhase[]).map((p, i) => {
              const phases: ZeroShotPhase[] = ['analyzing', 'transferring', 'planning', 'executing', 'evaluating'];
              const currentIdx = phases.indexOf(currentAttempt.phase);
              const thisIdx = i;
              const isDone = currentAttempt.phase === 'complete' || thisIdx < currentIdx;
              const isActive = thisIdx === currentIdx && isRunning;

              return (
                <div key={p} className="flex items-center gap-1 flex-1">
                  <div
                    className={`h-1.5 rounded-full flex-1 transition-all ${
                      isDone ? 'bg-neon-green' : isActive ? 'bg-neon-pink animate-pulse' : 'bg-muted'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Templates</div>
              <div className="text-sm font-bold text-neon-blue">{currentAttempt.transferredTemplates}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Steps</div>
              <div className="text-sm font-bold">{currentAttempt.stepsSucceeded}/{currentAttempt.stepsExecuted}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Score</div>
              <div className={`text-sm font-bold ${
                currentAttempt.rewardScore !== null
                  ? currentAttempt.rewardScore >= 5 ? 'text-neon-green' : 'text-destructive'
                  : 'text-muted-foreground'
              }`}>
                {currentAttempt.rewardScore !== null ? `${currentAttempt.rewardScore.toFixed(1)}/10` : '—'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Game</div>
              <div className="text-sm font-medium truncate">{currentAttempt.gameName}</div>
            </div>
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div className="p-4">
        <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Activity Log</h4>
        <ScrollArea className="max-h-[250px]">
          {currentAttempt && currentAttempt.logs.length > 0 ? (
            <div className="space-y-1.5">
              {[...currentAttempt.logs].reverse().map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <LogIcon type={log.type} />
                  <div className="min-w-0 flex-1">
                    <span className="text-foreground">{log.message}</span>
                    {log.details && (
                      <p className="text-muted-foreground mt-0.5 line-clamp-2">{log.details}</p>
                    )}
                  </div>
                  <span className="text-muted-foreground/50 shrink-0 tabular-nums">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Enter an unseen game name and click "Attempt" to start</p>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* History */}
      {attemptHistory.length > 0 && (
        <div className="p-4 border-t border-gaming-border">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Previous Attempts</h4>
          <div className="space-y-1.5">
            {attemptHistory.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-muted/30">
                <div className="flex items-center gap-2">
                  {a.phase === 'complete' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-neon-green" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                  )}
                  <span className="font-medium">{a.gameName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {a.transferredTemplates} templates
                  </span>
                  <span className={a.rewardScore !== null && a.rewardScore >= 5 ? 'text-neon-green font-bold' : 'text-muted-foreground'}>
                    {a.rewardScore !== null ? `${a.rewardScore.toFixed(1)}/10` : '—'}
                  </span>
                  <span className="text-muted-foreground/50">
                    <Clock className="w-3 h-3 inline mr-0.5" />
                    {new Date(a.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

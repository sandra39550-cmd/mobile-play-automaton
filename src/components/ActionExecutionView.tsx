import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Zap, Play, Square, RotateCcw, CheckCircle2, XCircle,
  Loader2, Clock, ImageIcon, ChevronDown, ChevronUp
} from "lucide-react";
import { useActionExecution, StepExecutionResult } from "@/hooks/useActionExecution";
import type { ReasoningPlan, ReasoningStep } from "@/hooks/useReasoning";
import { useState } from "react";

interface ActionExecutionViewProps {
  plan: ReasoningPlan | null;
  deviceId?: string;
  sessionId?: string;
  onStepUpdate?: (stepId: number, status: ReasoningStep['status']) => void;
  onRecordAction?: (entry: { action: string; coordinates?: { x: number; y: number }; success: boolean; timestamp: string }) => void;
}

const statusConfig = {
  idle: { label: 'Ready', color: 'text-muted-foreground border-muted', icon: <Clock className="w-4 h-4" /> },
  running: { label: 'Executing', color: 'text-neon-blue border-neon-blue', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  completed: { label: 'Complete', color: 'text-neon-green border-neon-green', icon: <CheckCircle2 className="w-4 h-4" /> },
  failed: { label: 'Failed', color: 'text-destructive border-destructive', icon: <XCircle className="w-4 h-4" /> },
  paused: { label: 'Aborted', color: 'text-yellow-500 border-yellow-500', icon: <Square className="w-4 h-4" /> },
};

export const ActionExecutionView = ({ plan, deviceId, sessionId, onStepUpdate, onRecordAction }: ActionExecutionViewProps) => {
  const { executionState, executePlan, abortExecution, resetExecution } = useActionExecution();
  const [expandedResult, setExpandedResult] = useState<number | null>(null);

  const handleExecute = async () => {
    if (!plan || !deviceId) return;

    const wrappedStepUpdate = (stepId: number, status: ReasoningStep['status']) => {
      onStepUpdate?.(stepId, status);
    };

    const results = await executePlan(plan, deviceId, sessionId, wrappedStepUpdate);

    // Record all actions to history
    if (onRecordAction && results) {
      for (const r of results) {
        const step = plan.steps.find(s => s.id === r.stepId);
        if (step?.action) {
          onRecordAction({
            action: step.action.type,
            coordinates: step.action.coordinates,
            success: r.status === 'completed',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  };

  const cfg = statusConfig[executionState.overallStatus];
  const completedSteps = executionState.results.filter(r => r.status === 'completed').length;
  const totalSteps = plan?.steps.length || 0;
  const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  const renderResult = (result: StepExecutionResult) => {
    const step = plan?.steps.find(s => s.id === result.stepId);
    const isExpanded = expandedResult === result.stepId;
    const isSuccess = result.status === 'completed';

    return (
      <div
        key={result.stepId}
        className={`p-3 rounded-lg border bg-gaming-card/50 ${
          isSuccess ? 'border-neon-green/30' : 'border-destructive/30'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isSuccess
              ? <CheckCircle2 className="w-4 h-4 text-neon-green shrink-0" />
              : <XCircle className="w-4 h-4 text-destructive shrink-0" />
            }
            <span className="text-sm font-medium">Step {result.stepId}</span>
            {step?.action && (
              <Badge variant="outline" className="text-xs">
                {step.action.type}
                {step.action.coordinates && ` (${step.action.coordinates.x}, ${step.action.coordinates.y})`}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{result.executionTimeMs}ms</span>
            {(result.verificationResult || result.error) && (
              <button onClick={() => setExpandedResult(isExpanded ? null : result.stepId)}>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="mt-2 pt-2 border-t border-gaming-border space-y-2">
            {result.error && (
              <p className="text-xs text-destructive">❌ {result.error}</p>
            )}
            {result.verificationResult && (
              <div className="flex items-start gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-neon-purple mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">{result.verificationResult}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="border-gaming-border bg-gaming-card overflow-hidden">
      <div className="p-4 border-b border-gaming-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-neon-pink" />
            <h3 className="font-bold text-glow">Action Execution</h3>
            <Badge variant="outline" className="text-xs text-neon-pink border-neon-pink">
              Phase 3
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${cfg.color}`}>
              {cfg.icon}
              <span className="ml-1">{cfg.label}</span>
            </Badge>
            {executionState.overallStatus !== 'idle' && (
              <Button variant="ghost" size="sm" onClick={resetExecution} className="h-8 gap-1 text-xs">
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </Button>
            )}
            {executionState.isExecuting ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={abortExecution}
                className="h-8 gap-1.5 font-bold"
              >
                <Square className="w-3.5 h-3.5" />
                Abort
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleExecute}
                disabled={!plan || !deviceId || plan.steps.length === 0}
                className="bg-neon-pink hover:bg-neon-pink/80 text-primary-foreground font-bold h-8 gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                Execute Plan
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {executionState.overallStatus !== 'idle' && (
          <div className="mt-3 flex items-center gap-2">
            <Progress value={progressPct} className="h-1.5 flex-1" />
            <span className="text-xs font-mono text-muted-foreground">
              {completedSteps}/{totalSteps}
            </span>
          </div>
        )}
      </div>

      <div className="p-4">
        {!plan && (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No plan to execute</p>
            <p className="text-xs mt-1">Generate a reasoning plan first, then execute it here</p>
          </div>
        )}

        {plan && executionState.overallStatus === 'idle' && (
          <div className="text-center py-6 text-muted-foreground">
            <Play className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Ready to execute {plan.steps.length} step plan</p>
            <p className="text-xs mt-1">
              {deviceId ? "Click 'Execute Plan' to run actions on the device" : "No device connected"}
            </p>
          </div>
        )}

        {executionState.isExecuting && executionState.currentStepId && (
          <div className="mb-4 p-3 rounded-lg border border-neon-blue/30 bg-neon-blue/5">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-neon-blue" />
              <span className="text-sm font-medium">Executing Step {executionState.currentStepId}...</span>
            </div>
            {(() => {
              const step = plan?.steps.find(s => s.id === executionState.currentStepId);
              return step ? (
                <p className="text-xs text-muted-foreground mt-1 ml-6">{step.thought}</p>
              ) : null;
            })()}
          </div>
        )}

        {executionState.results.length > 0 && (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {executionState.results.map(renderResult)}
            </div>
          </ScrollArea>
        )}

        {executionState.overallStatus === 'completed' && (
          <div className="mt-3 p-3 rounded-lg border border-neon-green/30 bg-neon-green/5 text-center">
            <CheckCircle2 className="w-5 h-5 text-neon-green mx-auto mb-1" />
            <p className="text-sm font-medium text-neon-green">Plan executed successfully</p>
            <p className="text-xs text-muted-foreground mt-1">
              {completedSteps} steps completed in{' '}
              {executionState.results.reduce((s, r) => s + r.executionTimeMs, 0)}ms
            </p>
          </div>
        )}

        {executionState.overallStatus === 'failed' && (
          <div className="mt-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-center">
            <XCircle className="w-5 h-5 text-destructive mx-auto mb-1" />
            <p className="text-sm font-medium text-destructive">Execution failed</p>
            <p className="text-xs text-muted-foreground mt-1">
              {completedSteps}/{totalSteps} steps completed before failure
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};

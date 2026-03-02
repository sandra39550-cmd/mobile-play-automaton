import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Brain, Lightbulb, ArrowRight, CheckCircle2, XCircle,
  Clock, Loader2, Target, ChevronDown, ChevronUp, Sparkles, RotateCcw
} from "lucide-react";
import { useReasoning, ReasoningPlan, ReasoningStep } from "@/hooks/useReasoning";
import type { PerceptionResult } from "@/hooks/usePerception";
import { useState } from "react";

interface ReasoningViewProps {
  perception: PerceptionResult | null;
  gameName?: string;
  reasoningHook?: {
    currentPlan: ReasoningPlan | null;
    planHistory: ReasoningPlan[];
    isReasoning: boolean;
    error: string | null;
    reason: (perception: PerceptionResult, gameName: string, objective?: string) => Promise<ReasoningPlan | null>;
    markStepStatus: (stepId: number, status: ReasoningStep['status']) => void;
    recordAction: (entry: any) => void;
    clearPlan: () => void;
  };
}

const stepStatusConfig: Record<ReasoningStep['status'], { icon: React.ReactNode; color: string }> = {
  pending: { icon: <Clock className="w-3.5 h-3.5" />, color: "text-muted-foreground border-muted" },
  executing: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, color: "text-neon-blue border-neon-blue" },
  completed: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "text-neon-green border-neon-green" },
  failed: { icon: <XCircle className="w-3.5 h-3.5" />, color: "text-destructive border-destructive" },
  skipped: { icon: <ArrowRight className="w-3.5 h-3.5" />, color: "text-muted-foreground border-muted" },
};

export const ReasoningView = ({ perception, gameName, reasoningHook }: ReasoningViewProps) => {
  const internalHook = useReasoning();
  const { currentPlan, planHistory, isReasoning, error, reason, clearPlan } = reasoningHook || internalHook;
  const [showChainOfThought, setShowChainOfThought] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [customObjective, setCustomObjective] = useState("");

  const handleReason = async () => {
    if (!perception || !gameName) return;
    await reason(perception, gameName, customObjective || undefined);
  };

  const renderStep = (step: ReasoningStep) => {
    const cfg = stepStatusConfig[step.status];
    return (
      <div
        key={step.id}
        className={`flex items-start gap-3 p-3 rounded-lg border bg-gaming-card/50 ${
          step.status === 'executing' ? 'ring-1 ring-neon-blue/30' : ''
        }`}
      >
        <div className={`mt-0.5 ${cfg.color}`}>{cfg.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-medium">Step {step.id}</span>
            <Badge variant="outline" className={`text-xs ${cfg.color}`}>
              {step.status}
            </Badge>
          </div>
          <p className="text-sm text-foreground/90 mb-1">{step.thought}</p>
          {step.action && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <Target className="w-3 h-3 text-neon-pink" />
              {step.action.type}
              {step.action.coordinates && ` → (${step.action.coordinates.x}, ${step.action.coordinates.y})`}
              {step.action.swipeDirection && ` → ${step.action.swipeDirection}`}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1 italic">
            Expected: {step.expectedOutcome}
          </p>
        </div>
        <div className="text-xs text-right shrink-0">
          <span className="font-mono text-neon-purple">{(step.confidence * 100).toFixed(0)}%</span>
        </div>
      </div>
    );
  };

  const renderPlanSummary = (plan: ReasoningPlan, isActive = false) => (
    <Card
      key={plan.timestamp}
      className={`p-4 border-gaming-border bg-gaming-card ${isActive ? 'ring-1 ring-neon-purple/30' : 'opacity-75'}`}
    >
      {/* Assessment */}
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-neon-blue" />
        <span className="text-sm font-semibold">Assessment</span>
        <Badge variant="outline" className="text-xs text-muted-foreground ml-auto">
          <Clock className="w-3 h-3 mr-1" />
          {plan.processingTimeMs}ms
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{plan.currentAssessment}</p>

      {/* Overall Confidence */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Plan Confidence</span>
        <Progress value={plan.overallConfidence * 100} className="h-1.5 flex-1" />
        <span className="text-xs font-mono text-neon-green">
          {(plan.overallConfidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* Chain of Thought (collapsible) */}
      <button
        onClick={() => setShowChainOfThought(!showChainOfThought)}
        className="flex items-center gap-1.5 text-xs text-neon-purple hover:text-neon-purple/80 mb-3 transition-colors"
      >
        <Brain className="w-3.5 h-3.5" />
        Chain of Thought
        {showChainOfThought ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {showChainOfThought && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 mb-3 whitespace-pre-wrap font-mono leading-relaxed">
          {plan.chainOfThought}
        </div>
      )}

      {/* Steps */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles className="w-3.5 h-3.5 text-neon-pink" />
          <span className="text-xs font-semibold">Action Plan ({plan.steps.length} steps)</span>
        </div>
        {plan.steps.map(renderStep)}
      </div>

      {/* Alternative Strategy */}
      {plan.alternativeStrategy && (
        <div className="mt-3 pt-3 border-t border-gaming-border">
          <div className="flex items-center gap-1.5 mb-1">
            <RotateCcw className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">Fallback Strategy</span>
          </div>
          <p className="text-xs text-muted-foreground">{plan.alternativeStrategy}</p>
        </div>
      )}
    </Card>
  );

  return (
    <Card className="border-gaming-border bg-gaming-card overflow-hidden">
      <div className="p-4 border-b border-gaming-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-neon-blue" />
            <h3 className="font-bold text-glow">Agent Reasoning</h3>
            <Badge variant="outline" className="text-xs text-neon-blue border-neon-blue">
              Phase 2
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {planHistory.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="h-8 gap-1 text-xs"
              >
                <Clock className="w-3.5 h-3.5" />
                {planHistory.length}
              </Button>
            )}
            {currentPlan && (
              <Button variant="ghost" size="sm" onClick={clearPlan} className="h-8 gap-1 text-xs">
                <RotateCcw className="w-3.5 h-3.5" />
                Clear
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleReason}
              disabled={isReasoning || !perception}
              className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-bold h-8 gap-1.5"
            >
              {isReasoning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Thinking...
                </>
              ) : (
                <>
                  <Brain className="w-3.5 h-3.5" />
                  Reason
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Custom Objective */}
        <div className="mt-3">
          <Input
            placeholder="Custom objective (optional): e.g. 'Clear level 5' or 'Collect all coins'"
            value={customObjective}
            onChange={(e) => setCustomObjective(e.target.value)}
            className="bg-gaming-card border-gaming-border text-sm h-8"
          />
        </div>
      </div>

      <div className="p-4">
        {error && (
          <div className="text-xs text-destructive bg-destructive/10 rounded p-2 mb-3">
            ❌ {error}
          </div>
        )}

        {!currentPlan && !isReasoning && (
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No reasoning plan yet</p>
            <p className="text-xs mt-1">
              {perception
                ? "Click 'Reason' to generate an action plan from the current perception"
                : "Run perception first, then reason about the scene"}
            </p>
          </div>
        )}

        {isReasoning && !currentPlan && (
          <div className="text-center py-8">
            <Brain className="w-8 h-8 mx-auto mb-3 text-neon-blue animate-pulse" />
            <p className="text-sm text-muted-foreground">Chain-of-thought reasoning in progress...</p>
            <p className="text-xs text-muted-foreground mt-1">Analyzing scene → Planning actions → Evaluating strategy</p>
          </div>
        )}

        {currentPlan && (
          <div className="space-y-3">
            {renderPlanSummary(currentPlan, true)}

            {showHistory && planHistory.length > 1 && (
              <div>
                <span className="text-xs font-semibold text-muted-foreground">Previous Plans</span>
                <ScrollArea className="max-h-[250px] mt-2">
                  <div className="space-y-2">
                    {planHistory.slice(1).map((p) => renderPlanSummary(p))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Brain, Target, Clock, Zap, History, Loader2 } from "lucide-react";
import type { PerceptionResult } from "@/hooks/usePerception";
import { useState } from "react";

interface PerceptionViewProps {
  deviceId?: string;
  gameName?: string;
  latestPerception: PerceptionResult | null;
  isPerceiving: boolean;
  onPerceive: () => void;
  perceptionHistory: PerceptionResult[];
  error: string | null;
  onClearHistory: () => void;
}

const gameStateColors: Record<string, string> = {
  menu: "text-neon-blue border-neon-blue",
  playing: "text-neon-green border-neon-green",
  paused: "text-yellow-500 border-yellow-500",
  level_complete: "text-neon-purple border-neon-purple",
  loading: "text-muted-foreground border-muted-foreground",
  unknown: "text-destructive border-destructive",
};

const gameStateEmoji: Record<string, string> = {
  menu: "📋", playing: "🎮", paused: "⏸️", level_complete: "🏆", loading: "⏳", unknown: "❓",
};

export const PerceptionView = ({
  deviceId, gameName, latestPerception, isPerceiving, onPerceive, perceptionHistory, error, onClearHistory
}: PerceptionViewProps) => {
  const [showHistory, setShowHistory] = useState(false);

  const renderPerceptionCard = (p: PerceptionResult, isLatest = false) => (
    <Card key={p.timestamp} className={`p-4 border-gaming-border bg-gaming-card ${isLatest ? "ring-1 ring-neon-purple/40" : "opacity-80"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-neon-purple" />
          <span className="text-sm font-semibold">Scene Understanding</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={gameStateColors[p.sceneUnderstanding.gameState] || ""}>
            {gameStateEmoji[p.sceneUnderstanding.gameState]} {p.sceneUnderstanding.gameState}
          </Badge>
          <Badge variant="outline" className="text-muted-foreground text-xs">
            <Clock className="w-3 h-3 mr-1" />{p.processingTimeMs}ms
          </Badge>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{p.sceneUnderstanding.gamePhase}</p>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Confidence</span>
        <Progress value={p.sceneUnderstanding.confidence * 100} className="h-1.5 flex-1" />
        <span className="text-xs font-mono text-neon-green">{(p.sceneUnderstanding.confidence * 100).toFixed(0)}%</span>
      </div>
      {p.detectedElements.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="w-3.5 h-3.5 text-neon-blue" />
            <span className="text-xs font-semibold">Detected Elements ({p.detectedElements.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.detectedElements.map((el, i) => (
              <Badge key={i} variant="outline" className={`text-xs ${el.actionable ? "border-neon-green/50 text-neon-green" : "border-muted text-muted-foreground"}`}>
                {el.label}<span className="ml-1 opacity-60">{(el.confidence * 100).toFixed(0)}%</span>
              </Badge>
            ))}
          </div>
        </div>
      )}
      {p.screenText.length > 0 && (
        <div className="mb-3">
          <span className="text-xs font-semibold text-muted-foreground">Screen Text:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {p.screenText.map((t, i) => (
              <span key={i} className="text-xs bg-muted/50 px-1.5 py-0.5 rounded font-mono">{t}</span>
            ))}
          </div>
        </div>
      )}
      {p.suggestedAction && (
        <div className="border-t border-gaming-border pt-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="w-3.5 h-3.5 text-neon-pink" />
            <span className="text-xs font-semibold">Suggested Action</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{p.suggestedAction.reasoning}</p>
              <p className="text-xs font-mono mt-0.5">{p.suggestedAction.type} → ({p.suggestedAction.coordinates.x}, {p.suggestedAction.coordinates.y})</p>
            </div>
            <Badge variant="outline" className="text-neon-pink border-neon-pink text-xs">{(p.suggestedAction.confidence * 100).toFixed(0)}%</Badge>
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <Card className="border-gaming-border bg-gaming-card overflow-hidden">
      <div className="p-4 border-b border-gaming-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-neon-purple" />
            <h3 className="font-bold text-glow">Agent Perception</h3>
            <Badge variant="outline" className="text-xs text-neon-purple border-neon-purple">Phase 1</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} className="h-8 gap-1">
              <History className="w-3.5 h-3.5" />{perceptionHistory.length}
            </Button>
            <Button size="sm" onClick={onPerceive} disabled={isPerceiving || !deviceId}
              className="bg-neon-purple hover:bg-neon-purple/80 text-primary-foreground font-bold h-8 gap-1.5">
              {isPerceiving ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />Perceiving...</>) : (<><Eye className="w-3.5 h-3.5" />Perceive Now</>)}
            </Button>
          </div>
        </div>
      </div>
      <div className="p-4">
        {error && <div className="text-xs text-destructive bg-destructive/10 rounded p-2 mb-3">❌ {error}</div>}
        {!latestPerception && !isPerceiving && (
          <div className="text-center py-8 text-muted-foreground">
            <Eye className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No perception data yet</p>
            <p className="text-xs mt-1">{deviceId ? "Click 'Perceive Now' to see what the agent sees" : "Connect a device and start a game first"}</p>
          </div>
        )}
        {isPerceiving && !latestPerception && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 mx-auto mb-3 text-neon-purple animate-spin" />
            <p className="text-sm text-muted-foreground">Capturing & analyzing screen...</p>
          </div>
        )}
        {latestPerception && (
          <div className="space-y-3">
            {renderPerceptionCard(latestPerception, true)}
            {showHistory && perceptionHistory.length > 1 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground">History</span>
                  <Button variant="ghost" size="sm" onClick={onClearHistory} className="h-6 text-xs">Clear</Button>
                </div>
                <ScrollArea className="max-h-[300px]">
                  <div className="space-y-2">{perceptionHistory.slice(1).map((p) => renderPerceptionCard(p))}</div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

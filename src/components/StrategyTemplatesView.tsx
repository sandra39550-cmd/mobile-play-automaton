import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Layers, Loader2, RefreshCw, ArrowRightLeft, Sparkles,
  CheckCircle2, XCircle, Tag
} from "lucide-react";
import type { StrategyTemplate } from "@/hooks/useStrategyTemplates";

interface StrategyTemplatesViewProps {
  templates: StrategyTemplate[];
  isLoading: boolean;
  isExtracting: boolean;
  gameName?: string;
  onLoad: (gameName?: string) => void;
  onExtract: (gameName: string) => void;
}

function getRewardColor(score: number): string {
  if (score >= 7) return 'text-neon-green';
  if (score >= 4) return 'text-yellow-500';
  return 'text-destructive';
}

export const StrategyTemplatesView = ({
  templates, isLoading, isExtracting, gameName, onLoad, onExtract
}: StrategyTemplatesViewProps) => {
  useEffect(() => { onLoad(gameName); }, [gameName]);

  const successRate = (t: StrategyTemplate) =>
    t.times_used > 0 ? ((t.times_succeeded / t.times_used) * 100).toFixed(0) : '—';

  return (
    <Card className="border-gaming-border bg-gaming-card overflow-hidden">
      <div className="p-4 border-b border-gaming-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-neon-blue" />
            <h3 className="font-bold text-glow">Strategy Templates</h3>
            <Badge variant="outline" className="text-xs text-neon-blue border-neon-blue">
              Phase 6
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => gameName && onExtract(gameName)}
              disabled={!gameName || isExtracting}
              className="h-8 gap-1 text-xs"
            >
              {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Extract
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onLoad(gameName)} disabled={isLoading} className="h-8 gap-1 text-xs">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4">
        {templates.length > 0 ? (
          <ScrollArea className="max-h-[350px]">
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.id} className="p-3 rounded-lg border bg-gaming-card/50 border-gaming-border">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t.name}</span>
                      {t.is_transferable && (
                        <Badge variant="outline" className="text-xs text-neon-green border-neon-green gap-1">
                          <ArrowRightLeft className="w-3 h-3" /> Transferable
                        </Badge>
                      )}
                    </div>
                    <span className={`text-sm font-mono font-bold ${getRewardColor(Number(t.avg_reward))}`}>
                      {Number(t.avg_reward).toFixed(1)}
                    </span>
                  </div>

                  {t.description && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{t.description}</p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>From: {t.source_game}</span>
                    <span>State: {t.game_state}</span>
                    <span>Used: {t.times_used}x</span>
                    <span>Success: {successRate(t)}%</span>
                  </div>

                  {t.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <Tag className="w-3 h-3 text-muted-foreground" />
                      {t.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No strategy templates yet</p>
            <p className="text-xs mt-1">Click "Extract" to analyze high-reward experiences into reusable patterns</p>
          </div>
        )}
      </div>
    </Card>
  );
};

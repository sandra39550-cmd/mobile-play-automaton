import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookOpen, Trophy, TrendingUp, Star, Loader2, RefreshCw,
  CheckCircle2, XCircle, Clock, Brain
} from "lucide-react";
import type { Experience, ExperienceStats } from "@/hooks/useExperienceBank";

interface ExperienceBankViewProps {
  experiences: Experience[];
  stats: ExperienceStats;
  isLoading: boolean;
  isEstimating: boolean;
  lastReward: { score: number; reasoning: string; outcome: string } | null;
  gameName?: string;
  onLoadExperiences: (gameName: string) => void;
}

const outcomeConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  success: { color: 'text-neon-green border-neon-green', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  partial: { color: 'text-yellow-500 border-yellow-500', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  failure: { color: 'text-destructive border-destructive', icon: <XCircle className="w-3.5 h-3.5" /> },
};

function getRewardColor(score: number): string {
  if (score >= 7) return 'text-neon-green';
  if (score >= 4) return 'text-yellow-500';
  return 'text-destructive';
}

export const ExperienceBankView = ({
  experiences, stats, isLoading, isEstimating, lastReward, gameName, onLoadExperiences
}: ExperienceBankViewProps) => {

  const renderExperience = (exp: Experience) => {
    const cfg = outcomeConfig[exp.outcome || 'failure'] || outcomeConfig.failure;
    const score = Number(exp.reward_score);

    return (
      <div key={exp.id} className="p-3 rounded-lg border bg-gaming-card/50 border-gaming-border">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            {cfg.icon}
            <span className="text-sm font-medium">{exp.game_name}</span>
            <Badge variant="outline" className={`text-xs ${cfg.color}`}>{exp.outcome}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Star className={`w-3.5 h-3.5 ${getRewardColor(score)}`} />
            <span className={`text-sm font-mono font-bold ${getRewardColor(score)}`}>
              {score.toFixed(1)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{exp.steps_count} steps</span>
          <span>{exp.total_execution_ms}ms</span>
          <span>{exp.game_state}</span>
          <span className="ml-auto">{new Date(exp.created_at).toLocaleTimeString()}</span>
        </div>
        {exp.reward_reasoning && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{exp.reward_reasoning}</p>
        )}
      </div>
    );
  };

  return (
    <Card className="border-gaming-border bg-gaming-card overflow-hidden">
      <div className="p-4 border-b border-gaming-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-neon-purple" />
            <h3 className="font-bold text-glow">Experience Bank</h3>
            <Badge variant="outline" className="text-xs text-neon-purple border-neon-purple">
              Phase 4
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {isEstimating && (
              <Badge variant="outline" className="text-xs text-neon-blue border-neon-blue">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Estimating...
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => gameName && onLoadExperiences(gameName)}
              disabled={!gameName || isLoading}
              className="h-8 gap-1 text-xs"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats Row */}
        {stats.total > 0 && (
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center p-2 rounded-lg bg-muted/30">
              <p className="text-lg font-bold text-neon-purple">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Experiences</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/30">
              <p className={`text-lg font-bold ${getRewardColor(stats.avgReward)}`}>{stats.avgReward.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Avg Reward</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/30">
              <p className="text-lg font-bold text-neon-green">{stats.successRate.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/30">
              <p className={`text-lg font-bold ${getRewardColor(stats.bestScore)}`}>{Number(stats.bestScore).toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Best Score</p>
            </div>
          </div>
        )}

        {/* Latest Reward */}
        {lastReward && (
          <div className="p-3 rounded-lg border border-neon-purple/30 bg-neon-purple/5">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className={`w-4 h-4 ${getRewardColor(lastReward.score)}`} />
              <span className="text-sm font-medium">Latest Reward</span>
              <span className={`text-sm font-mono font-bold ml-auto ${getRewardColor(lastReward.score)}`}>
                {lastReward.score.toFixed(1)}/10
              </span>
            </div>
            <Progress value={lastReward.score * 10} className="h-1.5 mb-2" />
            <p className="text-xs text-muted-foreground">{lastReward.reasoning}</p>
          </div>
        )}

        {/* Experience List */}
        {experiences.length > 0 ? (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Brain className="w-3.5 h-3.5 text-neon-purple" />
              <span className="text-xs font-semibold">Past Experiences (Top by Reward)</span>
            </div>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {experiences.map(renderExperience)}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No experiences recorded yet</p>
            <p className="text-xs mt-1">Execute action plans to build the agent's memory</p>
          </div>
        )}
      </div>
    </Card>
  );
};

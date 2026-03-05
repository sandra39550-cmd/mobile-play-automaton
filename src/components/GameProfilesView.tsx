import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Gamepad2, Trophy, TrendingUp, Star, Loader2, RefreshCw,
  Clock, Zap, Target
} from "lucide-react";
import type { GameProfile } from "@/hooks/useGameProfiles";

interface GameProfilesViewProps {
  profiles: GameProfile[];
  isLoading: boolean;
  onLoad: () => void;
  onUpdateStats: (gameName: string) => void;
}

function getRewardColor(score: number): string {
  if (score >= 7) return 'text-neon-green';
  if (score >= 4) return 'text-yellow-500';
  return 'text-destructive';
}

export const GameProfilesView = ({ profiles, isLoading, onLoad, onUpdateStats }: GameProfilesViewProps) => {
  useEffect(() => { onLoad(); }, []);

  return (
    <Card className="border-gaming-border bg-gaming-card overflow-hidden">
      <div className="p-4 border-b border-gaming-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-neon-purple" />
            <h3 className="font-bold text-glow">Game Profiles</h3>
            <Badge variant="outline" className="text-xs text-neon-blue border-neon-blue">
              Phase 6
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={onLoad} disabled={isLoading} className="h-8 gap-1 text-xs">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="p-4">
        {profiles.length > 0 ? (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {profiles.map(profile => (
                <div key={profile.id} className="p-3 rounded-lg border bg-gaming-card/50 border-gaming-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Gamepad2 className="w-4 h-4 text-neon-purple" />
                      <span className="font-semibold text-sm">{profile.game_name}</span>
                      {profile.category && (
                        <Badge variant="outline" className="text-xs">{profile.category}</Badge>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => onUpdateStats(profile.game_name)} className="h-7 text-xs gap-1">
                      <RefreshCw className="w-3 h-3" /> Sync
                    </Button>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mb-2">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Sessions</p>
                      <p className="text-sm font-bold">{profile.total_sessions}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Avg Reward</p>
                      <p className={`text-sm font-bold ${getRewardColor(profile.avg_reward)}`}>
                        {Number(profile.avg_reward).toFixed(1)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Best</p>
                      <p className={`text-sm font-bold ${getRewardColor(profile.best_reward)}`}>
                        {Number(profile.best_reward).toFixed(1)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Success</p>
                      <p className="text-sm font-bold text-neon-green">{Number(profile.success_rate).toFixed(0)}%</p>
                    </div>
                  </div>

                  <Progress value={Number(profile.success_rate)} className="h-1" />

                  {profile.preferred_strategy && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <Target className="w-3 h-3 text-neon-blue" />
                      <span className="text-xs text-muted-foreground">{profile.preferred_strategy}</span>
                    </div>
                  )}

                  {profile.last_played_at && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Last: {new Date(profile.last_played_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Gamepad2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No game profiles yet</p>
            <p className="text-xs mt-1">Profiles are created automatically when playing games</p>
          </div>
        )}
      </div>
    </Card>
  );
};

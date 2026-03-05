import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { BarChart3, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TimeSeriesPoint {
  time: string;
  reward: number;
  success: number;
}

interface GameComparison {
  game: string;
  avgReward: number;
  sessions: number;
  successRate: number;
}

export const AgentPerformanceDashboard = () => {
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [gameComparisons, setGameComparisons] = useState<GameComparison[]>([]);
  const [selectedGame, setSelectedGame] = useState<string>("all");
  const [games, setGames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('agent_experiences')
        .select('game_name, reward_score, success, created_at')
        .order('created_at', { ascending: true });

      if (selectedGame !== "all") {
        query = query.eq('game_name', selectedGame);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data) return;

      // Unique games
      const uniqueGames = [...new Set(data.map(d => d.game_name))];
      setGames(uniqueGames);

      // Time series: reward trend with running average
      let runningSum = 0;
      const ts: TimeSeriesPoint[] = data.map((d, i) => {
        runningSum += Number(d.reward_score);
        return {
          time: new Date(d.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          reward: Number(Number(d.reward_score).toFixed(1)),
          success: d.success ? 1 : 0,
        };
      });
      setTimeSeries(ts);

      // Per-game comparisons
      const gameMap: Record<string, { total: number; rewardSum: number; successCount: number }> = {};
      for (const d of data) {
        if (!gameMap[d.game_name]) gameMap[d.game_name] = { total: 0, rewardSum: 0, successCount: 0 };
        gameMap[d.game_name].total++;
        gameMap[d.game_name].rewardSum += Number(d.reward_score);
        if (d.success) gameMap[d.game_name].successCount++;
      }
      setGameComparisons(
        Object.entries(gameMap).map(([game, s]) => ({
          game,
          avgReward: Number((s.rewardSum / s.total).toFixed(1)),
          sessions: s.total,
          successRate: Number(((s.successCount / s.total) * 100).toFixed(0)),
        }))
      );
    } catch (err) {
      console.error('Performance data error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedGame]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <Card className="border-gaming-border bg-gaming-card overflow-hidden">
      <div className="p-4 border-b border-gaming-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-neon-green" />
            <h3 className="font-bold text-glow">Agent Performance</h3>
            <Badge variant="outline" className="text-xs text-neon-green border-neon-green">Phase 6</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedGame} onValueChange={setSelectedGame}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-gaming-card border-gaming-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gaming-card border-gaming-border">
                <SelectItem value="all">All Games</SelectItem>
                {games.map(g => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={loadData} disabled={isLoading} className="h-8">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {timeSeries.length > 0 ? (
          <>
            {/* Reward Trend */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <TrendingUp className="w-4 h-4 text-neon-purple" />
                <span className="text-sm font-semibold">Reward Trend</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={timeSeries}>
                  <defs>
                    <linearGradient id="rewardGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(270, 70%, 55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(270, 70%, 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 87%)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(220, 10%, 45%)" />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} stroke="hsl(220, 10%, 45%)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(0, 0%, 100%)',
                      border: '1px solid hsl(220, 13%, 87%)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="reward"
                    stroke="hsl(270, 70%, 55%)"
                    fill="url(#rewardGrad)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'hsl(270, 70%, 55%)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Game Comparison */}
            {gameComparisons.length > 1 && (
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <BarChart3 className="w-4 h-4 text-neon-blue" />
                  <span className="text-sm font-semibold">Per-Game Comparison</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={gameComparisons}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 87%)" />
                    <XAxis dataKey="game" tick={{ fontSize: 10 }} stroke="hsl(220, 10%, 45%)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(220, 10%, 45%)" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(0, 0%, 100%)',
                        border: '1px solid hsl(220, 13%, 87%)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="avgReward" name="Avg Reward" fill="hsl(270, 70%, 55%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="successRate" name="Success %" fill="hsl(150, 70%, 40%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No performance data yet</p>
            <p className="text-xs mt-1">Run the agent to generate analytics</p>
          </div>
        )}
      </div>
    </Card>
  );
};

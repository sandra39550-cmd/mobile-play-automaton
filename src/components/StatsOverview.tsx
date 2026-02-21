import { Card } from "@/components/ui/card";
import { TrendingUp, Zap, Target, Clock } from "lucide-react";

interface StatsOverviewProps {
  stats: {
    activeBots: number;
    totalEarnings: number;
    totalRuntime: number;
    successRate: number;
  };
}

export const StatsOverview = ({ stats }: StatsOverviewProps) => {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  const formatRuntime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    if (hours >= 24) return `${Math.floor(hours / 24)}d`;
    if (hours >= 1) return `${hours}h`;
    return `${minutes}m`;
  };

  const statsData = [
    {
      title: "Active Agents",
      value: stats.activeBots.toString(),
      change: stats.activeBots > 0 ? `+${stats.activeBots}` : "0",
      icon: Zap,
      color: "text-neon-green",
      bgColor: "bg-neon-green/10",
    },
    {
      title: "Total Earnings",
      value: formatCurrency(stats.totalEarnings),
      change: stats.totalEarnings > 0 ? "+15%" : "0%",
      icon: TrendingUp,
      color: "text-neon-blue",
      bgColor: "bg-neon-blue/10",
    },
    {
      title: "Success Rate",
      value: `${stats.successRate.toFixed(1)}%`,
      change: stats.successRate > 90 ? "+2.1%" : "--",
      icon: Target,
      color: "text-neon-purple",
      bgColor: "bg-neon-purple/10",
    },
    {
      title: "Runtime",
      value: formatRuntime(stats.totalRuntime),
      change: "Today",
      icon: Clock,
      color: "text-neon-pink",
      bgColor: "bg-neon-pink/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statsData.map((stat, index) => (
        <Card key={index} className="border-gaming-border bg-gaming-card hover:shadow-glow transition-all duration-300 group">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div className={`p-3 rounded-xl ${stat.bgColor} group-hover:scale-110 transition-transform duration-300`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <span className="text-sm text-muted-foreground">{stat.change}</span>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-bold text-glow animate-glow">{stat.value}</h3>
              <p className="text-sm text-muted-foreground mt-1">{stat.title}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
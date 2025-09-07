import { Card } from "@/components/ui/card";
import { TrendingUp, Zap, Target, Clock } from "lucide-react";

export const StatsOverview = () => {
  const stats = [
    {
      title: "Active Bots",
      value: "12",
      change: "+3",
      icon: Zap,
      color: "text-neon-green",
      bgColor: "bg-neon-green/10",
    },
    {
      title: "Total Earnings",
      value: "524K",
      change: "+15%",
      icon: TrendingUp,
      color: "text-neon-blue",
      bgColor: "bg-neon-blue/10",
    },
    {
      title: "Success Rate",
      value: "94.2%",
      change: "+2.1%",
      icon: Target,
      color: "text-neon-purple",
      bgColor: "bg-neon-purple/10",
    },
    {
      title: "Runtime",
      value: "48h",
      change: "Today",
      icon: Clock,
      color: "text-neon-pink",
      bgColor: "bg-neon-pink/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Play, Pause, Square, Settings, TrendingUp, Smartphone, Rocket } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BotCardProps {
  game: {
    id: string;
    name: string;
    icon: string;
    category: string;
    status: "active" | "paused" | "stopped";
    progress: number;
    level: number;
    currency: number;
    hourlyRate: number;
    deviceId?: string;
    packageName?: string;
    sessionId?: string;
  };
  onStatusChange: (id: string, status: "active" | "paused" | "stopped") => void;
}

export const BotCard = ({ game, onStatusChange }: BotCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-neon-green";
      case "paused": return "bg-neon-blue";
      case "stopped": return "bg-muted";
      default: return "bg-muted";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active": return "Running";
      case "paused": return "Paused";
      case "stopped": return "Stopped";
      default: return "Unknown";
    }
  };

  // Launch game directly on device
  const handleLaunchOnDevice = async () => {
    if (!game.packageName || !game.deviceId) {
      toast.error("Missing game or device information");
      return;
    }

    setIsLaunching(true);
    toast.loading(`🚀 Launching ${game.name} on device...`, { id: 'launch-game' });

    try {
      const { data, error } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'start_bot_session',
          payload: {
            deviceId: game.deviceId,
            gameName: game.name,
            packageName: game.packageName,
            config: {},
          }
        }
      });

      if (error) throw error;

      if (data.success && data.launched) {
        toast.success(`🎮 ${game.name} launched on device!`, { id: 'launch-game', duration: 5000 });
      } else if (data.success) {
        toast.warning(`⚠️ Session active but launch failed: ${data.launchMessage || 'Check ADB server'}`, { id: 'launch-game', duration: 8000 });
      } else {
        toast.error(`Failed: ${data.error || 'Unknown error'}`, { id: 'launch-game' });
      }
    } catch (error) {
      console.error('Launch error:', error);
      toast.error(`Launch failed: ${error}`, { id: 'launch-game' });
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <Card 
      className="relative overflow-hidden border-gaming-border bg-gaming-card hover:shadow-neon transition-all duration-300 group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="absolute inset-0 bg-gradient-gaming opacity-50" />
      <div className="relative p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl animate-float">{game.icon}</div>
            <div>
              <h3 className="font-bold text-lg text-glow">{game.name}</h3>
              <p className="text-sm text-muted-foreground">{game.category}</p>
              {game.packageName && (
                <p className="text-xs text-muted-foreground/60 font-mono">{game.packageName}</p>
              )}
            </div>
          </div>
          <Badge 
            className={`${getStatusColor(game.status)} text-gaming-bg border-0 animate-pulse-glow`}
          >
            {getStatusText(game.status)}
          </Badge>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span className="text-neon-purple">{game.progress}%</span>
            </div>
            <Progress value={game.progress} className="h-2" />
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-neon-blue">{game.level}</p>
              <p className="text-xs text-muted-foreground">Level</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-neon-green">{game.currency.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Coins</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-neon-pink">{game.hourlyRate}</p>
              <p className="text-xs text-muted-foreground">Per Hour</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-4">
            {/* Launch on Device button - visible for any game with device info */}
            {game.deviceId && game.packageName && (
              <Button
                variant="default"
                size="sm"
                onClick={handleLaunchOnDevice}
                disabled={isLaunching}
                className="w-full bg-neon-purple hover:bg-neon-purple/80 text-white border-0 font-bold"
              >
                <Rocket className={`w-4 h-4 mr-2 ${isLaunching ? 'animate-pulse' : ''}`} />
                {isLaunching ? 'Launching...' : 'Launch on Device'}
              </Button>
            )}
            
            <div className="flex gap-2">
              {game.status !== "active" && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onStatusChange(game.id, "active")}
                  className="flex-1 bg-neon-green hover:bg-neon-green/80 text-gaming-bg border-0 font-bold"
                >
                  <Play className="w-4 h-4 mr-1" />
                  Play Now
                </Button>
              )}
              
              {game.status === "active" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onStatusChange(game.id, "paused")}
                  className="flex-1"
                >
                  <Pause className="w-4 h-4 mr-1" />
                  Pause
                </Button>
              )}
              
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onStatusChange(game.id, "stopped")}
                className="flex-1"
              >
                <Square className="w-4 h-4 mr-1" />
                Stop
              </Button>
              
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {isHovered && (
        <div className="absolute top-2 right-2">
          <TrendingUp className="w-5 h-5 text-neon-purple animate-glow" />
        </div>
      )}
    </Card>
  );
};
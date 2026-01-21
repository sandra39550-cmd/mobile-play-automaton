import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Play, Square, Settings, TrendingUp, Smartphone } from "lucide-react";
import { useState, useRef, useEffect } from "react";
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [actionsCount, setActionsCount] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [hardwareDeviceId, setHardwareDeviceId] = useState<string | null>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, []);

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

  const startBotLoop = async (sessionId: string, deviceId: string) => {
    console.log(`🤖 Starting bot loop for session ${sessionId} on device ${deviceId}`);
    
    const runLoop = async () => {
      try {
        const { data: loopData, error: loopError } = await supabase.functions.invoke('device-automation', {
          body: {
            action: 'run_bot_loop',
            payload: {
              sessionId: sessionId,
              deviceId: deviceId,  // Pass hardware device ID
              iterations: 3
            }
          }
        });

        if (loopError) {
          console.error('Bot loop error:', loopError);
          return;
        }
        
        if (loopData?.success) {
          setActionsCount(loopData.totalActions || 0);
          console.log(`✅ Bot loop completed: ${loopData.actionsPerformed} actions`);
        } else if (loopData?.error) {
          console.error('Bot loop failed:', loopData.error);
          toast.error(`Bot error: ${loopData.error}`);
        }
      } catch (err) {
        console.error('Bot loop exception:', err);
      }
    };

    // Run immediately
    await runLoop();
    
    // Then run every 2 seconds
    playIntervalRef.current = setInterval(runLoop, 2000);
  };

  const stopBot = () => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    setIsPlaying(false);
    setCurrentSessionId(null);
    onStatusChange(game.id, "stopped");
    toast.info(`⏹️ Bot stopped playing ${game.name}`);
  };

  const handlePlayNow = async () => {
    // Validate required fields
    if (!game.deviceId) {
      toast.error('No device connected. Please connect a device first.');
      return;
    }
    
    if (!game.packageName) {
      toast.error('Game package name not found.');
      return;
    }

    // Set status to active
    onStatusChange(game.id, "active");
    setIsLaunching(true);
    
    console.log(`🎮 Launching ${game.name} on device ${game.deviceId} with package ${game.packageName}`);
    toast.loading(`🚀 Launching ${game.name} on device...`, { id: 'launch-game' });

    try {
      const { data, error } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'start_bot_session',
          payload: {
            deviceId: game.deviceId,  // Hardware device ID (e.g., 330021a82ec4c231)
            gameName: game.name,
            packageName: game.packageName,
            config: {},
          }
        }
      });
      
      console.log('🎮 Launch response:', data);

      if (error) {
        throw error;
      }

      if (data.success && data.launched) {
        toast.success(`🎮 ${game.name} launched! Starting bot in 3 seconds...`, { id: 'launch-game', duration: 3000 });
        
        // Store session info
        const sessionId = data.session?.id;
        const hwDeviceId = data.hardwareDeviceId || game.deviceId;
        
        setCurrentSessionId(sessionId);
        setHardwareDeviceId(hwDeviceId);
        
        // Auto-start the bot after delay for game to load
        setTimeout(() => {
          if (sessionId) {
            setIsPlaying(true);
            toast.success(`🤖 Bot is now playing ${game.name}!`, { duration: 3000 });
            startBotLoop(sessionId, hwDeviceId);
          }
        }, 3000);
      } else {
        const errorMsg = data.launchMessage || data.error || 'Unknown error';
        toast.error(`Failed to launch: ${errorMsg}`, { id: 'launch-game' });
        onStatusChange(game.id, "stopped");
      }
    } catch (error) {
      console.error('Launch error:', error);
      toast.error(`Launch failed: ${error}`, { id: 'launch-game' });
      onStatusChange(game.id, "stopped");
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
                <p className="text-xs text-muted-foreground/60 font-mono truncate max-w-[180px]">{game.packageName}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge 
              className={`${getStatusColor(game.status)} text-gaming-bg border-0 animate-pulse-glow`}
            >
              {getStatusText(game.status)}
            </Badge>
            {game.deviceId && (
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <Smartphone className="w-3 h-3" />
                <span className="truncate max-w-[80px]">{game.deviceId.substring(0, 8)}...</span>
              </Badge>
            )}
          </div>
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
              <p className="text-2xl font-bold text-neon-pink">{actionsCount > 0 ? actionsCount : game.hourlyRate}</p>
              <p className="text-xs text-muted-foreground">{actionsCount > 0 ? 'Actions' : 'Per Hour'}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-4">
            <div className="flex gap-2">
              {/* Play Now - launches game AND starts bot automatically */}
              {!isPlaying ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handlePlayNow}
                  disabled={isLaunching || !game.deviceId}
                  className="flex-1 bg-neon-green hover:bg-neon-green/80 text-gaming-bg border-0 font-bold"
                >
                  <Play className={`w-4 h-4 mr-1 ${isLaunching ? 'animate-spin' : ''}`} />
                  {isLaunching ? 'Launching...' : 'Play Now'}
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={stopBot}
                  className="flex-1 animate-pulse"
                >
                  <Square className="w-4 h-4 mr-1" />
                  Stop ({actionsCount} actions)
                </Button>
              )}
              
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
            </div>
            
            {!game.deviceId && (
              <p className="text-xs text-destructive text-center">
                No device connected. Scan games from a connected device.
              </p>
            )}
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

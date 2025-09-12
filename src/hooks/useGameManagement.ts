import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDeviceAutomation } from "./useDeviceAutomation";

export interface GameBot {
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
  sessionId?: string;
  packageName: string;
}

// Predefined game templates
const GAME_TEMPLATES = [
  {
    name: "Clash Royale",
    icon: "⚔️",
    category: "Strategy",
    packageName: "com.supercell.clashroyale",
  },
  {
    name: "Candy Crush",
    icon: "🍭",
    category: "Puzzle", 
    packageName: "com.king.candycrushsaga",
  },
  {
    name: "Pokemon GO",
    icon: "🎮",
    category: "Adventure",
    packageName: "com.nianticlabs.pokemongo",
  },
  {
    name: "Coin Master",
    icon: "🪙", 
    category: "Casino",
    packageName: "com.moonactive.coinmaster",
  },
  {
    name: "PUBG Mobile",
    icon: "🔫",
    category: "Battle Royale",
    packageName: "com.tencent.ig",
  },
  {
    name: "Subway Surfers",
    icon: "🚇",
    category: "Endless Runner", 
    packageName: "com.kiloo.subwaysurf",
  },
];

export const useGameManagement = () => {
  const [games, setGames] = useState<GameBot[]>([]);
  const [deviceGames, setDeviceGames] = useState<{[deviceId: string]: any[]}>({});
  const [isLoading, setIsLoading] = useState(true);
  const { devices, sessions, startBotSession, stopBotSession, scanDeviceGames } = useDeviceAutomation();

  // Load games from bot sessions
  const loadGames = async () => {
    try {
      setIsLoading(true);
      
      // Create games from active sessions and templates
      const gameMap = new Map<string, GameBot>();

      // Add games from active sessions
      sessions.forEach((session) => {
        const template = GAME_TEMPLATES.find(t => t.packageName === session.package_name);
        if (template) {
          gameMap.set(session.package_name, {
            id: session.id,
            name: template.name,
            icon: template.icon,
            category: template.category,
            packageName: session.package_name,
            status: session.status === 'running' ? 'active' : 
                   session.status === 'paused' ? 'paused' : 'stopped',
            progress: session.level_progress || 0,
            level: Math.floor((session.runtime_minutes || 0) / 30) + 1,
            currency: session.currency_earned || 0,
            hourlyRate: Math.floor((session.currency_earned || 0) / Math.max((session.runtime_minutes || 1) / 60, 1)),
            deviceId: session.device_id || undefined,
            sessionId: session.id,
          });
        }
      });

      // Add remaining templates as available games
      GAME_TEMPLATES.forEach((template) => {
        if (!gameMap.has(template.packageName)) {
          gameMap.set(template.packageName, {
            id: template.packageName,
            name: template.name,
            icon: template.icon,
            category: template.category,
            packageName: template.packageName,
            status: 'stopped',
            progress: 0,
            level: 1,
            currency: 0,
            hourlyRate: 0,
          });
        }
      });

      setGames(Array.from(gameMap.values()));
    } catch (error) {
      console.error('Error loading games:', error);
      toast.error('Failed to load games');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle game status changes
  const handleGameStatusChange = async (gameId: string, newStatus: "active" | "paused" | "stopped") => {
    try {
      const game = games.find(g => g.id === gameId);
      if (!game) return;

      if (newStatus === 'active' && !game.sessionId) {
        // Start new session - need a device
        const availableDevice = devices.find(d => d.status === 'online');
        if (!availableDevice) {
          toast.error('No online devices available');
          return;
        }

        await startBotSession({
          deviceId: availableDevice.id,
          gameName: game.name,
          packageName: game.packageName,
          config: {},
        });
        
        toast.success(`${game.name} bot started on ${availableDevice.name}`);
      } else if (game.sessionId) {
        if (newStatus === 'stopped') {
          await stopBotSession(game.sessionId);
          toast.success(`${game.name} bot stopped`);
        } else {
          // For pause, we'll update the session status directly
          const { error } = await supabase
            .from('bot_sessions')
            .update({ status: newStatus === 'paused' ? 'paused' : 'running' })
            .eq('id', game.sessionId);

          if (error) throw error;
          toast.success(`${game.name} bot ${newStatus}`);
        }
      }

      // Reload games to reflect changes
      await loadGames();
    } catch (error) {
      console.error('Error changing game status:', error);
      toast.error('Failed to change game status');
    }
  };

  // Add a new game session
  const addGameSession = async (gameName: string, deviceId: string) => {
    try {
      const template = GAME_TEMPLATES.find(t => t.name === gameName);
      if (!template) {
        toast.error('Game template not found');
        return;
      }

      await startBotSession({
        deviceId: deviceId,
        gameName: template.name,
        packageName: template.packageName,
        config: {},
      });

      toast.success(`${gameName} bot session created`);
      await loadGames();
    } catch (error) {
      console.error('Error adding game session:', error);
      toast.error('Failed to add game session');
    }
  };

  // Get available games for a specific device
  const getAvailableGamesForDevice = (deviceId: string) => {
    const activeGamePackages = new Set(
      games.filter(g => g.sessionId).map(g => g.packageName)
    );
    const installedGames = deviceGames[deviceId] || [];
    return installedGames.filter(g => !activeGamePackages.has(g.packageName));
  };

  // Get available games that can be added (legacy for backwards compatibility)
  const getAvailableGames = () => {
    const activeGamePackages = new Set(
      games.filter(g => g.sessionId).map(g => g.packageName)
    );
    return GAME_TEMPLATES.filter(t => !activeGamePackages.has(t.packageName));
  };

  // Scan games on a device
  const scanGamesOnDevice = async (deviceId: string) => {
    try {
      const games = await scanDeviceGames(deviceId);
      setDeviceGames(prev => ({
        ...prev,
        [deviceId]: games
      }));
      return games;
    } catch (error) {
      console.error('Error scanning games on device:', error);
      throw error;
    }
  };

  // Get statistics
  const getStats = () => {
    const activeBots = games.filter(g => g.status === 'active').length;
    const totalEarnings = games.reduce((sum, g) => sum + g.currency, 0);
    const totalRuntime = sessions.reduce((sum, s) => sum + (s.runtime_minutes || 0), 0);
    const avgSuccessRate = sessions.length > 0 ? 94.2 : 0; // Mock success rate

    return {
      activeBots,
      totalEarnings,
      totalRuntime,
      successRate: avgSuccessRate,
    };
  };

  useEffect(() => {
    loadGames();
  }, [sessions.length, devices.length]);

  return {
    games,
    deviceGames,
    isLoading,
    handleGameStatusChange,
    addGameSession,
    getAvailableGames,
    getAvailableGamesForDevice,
    scanGamesOnDevice,
    getStats,
    refreshGames: loadGames,
  };
};
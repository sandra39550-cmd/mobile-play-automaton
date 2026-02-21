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

export const useGameManagement = () => {
  const [games, setGames] = useState<GameBot[]>([]);
  const [deviceGames, setDeviceGames] = useState<{[deviceId: string]: any[]}>({});
  const [isLoading, setIsLoading] = useState(true);
  const { devices, sessions, startBotSession, stopBotSession, scanDeviceGames } = useDeviceAutomation();

  // Load games from bot sessions and device scans only
  const loadGames = async () => {
    try {
      setIsLoading(true);
      
      const gameMap = new Map<string, GameBot>();

      // Build a lookup from database UUID to hardware device_id
      const deviceHwIdMap = new Map<string, string>();
      devices.forEach(device => {
        deviceHwIdMap.set(device.id, device.device_id);
      });

      // Add games from active sessions - get info from deviceGames
      sessions.forEach((session) => {
        // Find game info from any device's scanned games
        let gameInfo = null;
        for (const deviceGameList of Object.values(deviceGames)) {
          gameInfo = deviceGameList.find(g => g.packageName === session.package_name);
          if (gameInfo) break;
        }
        
        if (gameInfo) {
          // Use hardware device_id for ADB commands, not database UUID
          const hardwareDeviceId = deviceHwIdMap.get(session.device_id) || session.device_id;
          
          gameMap.set(session.package_name, {
            id: session.id,
            name: gameInfo.name,
            icon: gameInfo.icon,
            category: gameInfo.category,
            packageName: session.package_name,
            status: session.status === 'running' ? 'active' : 
                   session.status === 'paused' ? 'paused' : 'stopped',
            progress: session.level_progress || 0,
            level: Math.floor((session.runtime_minutes || 0) / 30) + 1,
            currency: session.currency_earned || 0,
            hourlyRate: Math.floor((session.currency_earned || 0) / Math.max((session.runtime_minutes || 1) / 60, 1)),
            deviceId: hardwareDeviceId,
            sessionId: session.id,
          });
        }
      });

      // Add games from scanned devices (only for stopped games not already in sessions)
      // Track which device each game was scanned from
      Object.entries(deviceGames).forEach(([dbDeviceId, deviceGameList]) => {
        // Get hardware device_id for this device
        const hardwareDeviceId = deviceHwIdMap.get(dbDeviceId) || dbDeviceId;
        
        deviceGameList.forEach(deviceGame => {
          if (!gameMap.has(deviceGame.packageName)) {
            gameMap.set(deviceGame.packageName, {
              id: deviceGame.packageName,
              name: deviceGame.name,
              icon: deviceGame.icon,
              category: deviceGame.category,
              packageName: deviceGame.packageName,
              status: 'stopped',
              progress: 0,
              level: 1,
              currency: 0,
              hourlyRate: 0,
              deviceId: hardwareDeviceId, // Include hardware device ID for scanned games
            });
          }
        });
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
        
        toast.success(`${game.name} agent started on ${availableDevice.name}`);
      } else if (game.sessionId) {
        if (newStatus === 'stopped') {
          await stopBotSession(game.sessionId);
          toast.success(`${game.name} agent stopped`);
        } else {
          // For pause, we'll update the session status directly
          const { error } = await supabase
            .from('bot_sessions')
            .update({ status: newStatus === 'paused' ? 'paused' : 'running' })
            .eq('id', game.sessionId);

          if (error) throw error;
          toast.success(`${game.name} agent ${newStatus}`);
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
      // Find game info from device's scanned games
      const deviceGameList = deviceGames[deviceId] || [];
      const gameInfo = deviceGameList.find(g => g.name === gameName);
      
      if (!gameInfo) {
        toast.error('Game not found on device');
        return;
      }

      await startBotSession({
        deviceId: deviceId,
        gameName: gameInfo.name,
        packageName: gameInfo.packageName,
        config: {},
      });

      toast.success(`${gameName} agent session created`);
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

  // Get available games that can be added (returns all scanned games not active)
  const getAvailableGames = () => {
    const activeGamePackages = new Set(
      games.filter(g => g.sessionId).map(g => g.packageName)
    );
    
    // Get all unique games from all devices
    const allGames = new Map();
    Object.values(deviceGames).forEach(deviceGameList => {
      deviceGameList.forEach(game => {
        if (!activeGamePackages.has(game.packageName)) {
          allGames.set(game.packageName, game);
        }
      });
    });
    
    return Array.from(allGames.values());
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
  }, [sessions.length, devices.length, deviceGames]);

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
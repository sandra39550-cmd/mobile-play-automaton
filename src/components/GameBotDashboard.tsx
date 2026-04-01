import { useState, useEffect } from "react";
import { BotCard } from "./BotCard";
import { StatsOverview } from "./StatsOverview";
import { DeviceConnection } from "./DeviceConnection";
import { QuickStartGuide } from "./QuickStartGuide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Bot, Smartphone, Play, RefreshCw, Scan } from "lucide-react";
import { toast } from "sonner";
import { useDeviceAutomation } from "@/hooks/useDeviceAutomation";
import { useGameManagement } from "@/hooks/useGameManagement";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const GameBotDashboard = () => {
  const { devices, checkAllDeviceStatus, loadDevices } = useDeviceAutomation();
  const { games, isLoading, handleGameStatusChange, addGameSession, getAvailableGamesForDevice, scanGamesOnDevice, getStats } = useGameManagement();

  const [currentTab, setCurrentTab] = useState("bots");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showAddGame, setShowAddGame] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [selectedGame, setSelectedGame] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  const categories = ["all", "Strategy", "Puzzle", "Adventure", "Casino", "Battle Royale", "Endless Runner"];
  const onlineDevices = devices.filter(d => d.status === 'online');
  const availableDevices = devices;
  const stats = getStats();
  const availableGamesForDevice = selectedDevice ? getAvailableGamesForDevice(selectedDevice) : [];

  // Auto-scan when dialog opens if we have online devices
  useEffect(() => {
    if (showAddGame && onlineDevices.length > 0 && !selectedDevice) {
      const firstOnline = onlineDevices[0];
      handleDeviceSelect(firstOnline.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddGame]);

  // Filter games based on search and category
  const filteredGames = games.filter(game => {
    const matchesSearch = game.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || game.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleDeviceSelect = async (deviceId: string) => {
    setSelectedDevice(deviceId);
    setSelectedGame("");
    
    const device = availableDevices.find(d => d.id === deviceId);
    if (!device) { toast.error('Device not found'); return; }
    
    if (device.status === 'offline') {
      toast.error(`❌ ${device.name} is OFFLINE`, { duration: 8000 });
      return;
    }
    
    setIsScanning(true);
    toast.loading(`🔍 Scanning ${device.name} for games...`, { id: 'scan-games' });
    
    try {
      const scannedGames = await scanGamesOnDevice(deviceId);
      if (scannedGames && scannedGames.length > 0) {
        toast.success(`✅ Found ${scannedGames.length} game(s)`, { id: 'scan-games' });
      } else {
        toast.warning(`⚠️ No games found on ${device.name}`, { id: 'scan-games', duration: 10000 });
      }
    } catch (error: any) {
      toast.error(`❌ Scan Failed: ${(error?.message || '').substring(0, 100)}`, { id: 'scan-games', duration: 8000 });
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddGame = async () => {
    if (!selectedDevice || !selectedGame) { toast.error('Please select both device and game'); return; }
    
    const gameInfo = availableGamesForDevice.find(g => g.name === selectedGame);
    if (!gameInfo) { toast.error('Game not found'); return; }
    
    toast.loading(`Starting ${gameInfo.name}...`, { id: 'start-game' });
    try {
      await addGameSession(selectedGame, selectedDevice);
      toast.success(`${gameInfo.name} is now playing!`, { id: 'start-game' });
      setShowAddGame(false);
      setSelectedDevice("");
      setSelectedGame("");
    } catch (error) {
      toast.error(`Failed to start game: ${error}`, { id: 'start-game' });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            <Bot className="w-8 h-8 text-neon-purple animate-pulse-glow" />
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-neon-purple to-neon-blue bg-clip-text text-transparent animate-glow">
              SIMA 2 FOR MOBILE GAMES
            </h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Gemini Powered AI Agent For Mobile Gaming
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-neon-green border-neon-green">
              {onlineDevices.length} Online
            </Badge>
            <Badge variant="outline" className="text-neon-blue border-neon-blue">
              {stats.activeBots} Active
            </Badge>
            <Badge variant="outline" className="text-neon-pink border-neon-pink">
              {games.length} Games
            </Badge>
          </div>
        </div>

        {/* Quick Start Guide */}
        <QuickStartGuide 
          onConnectDevice={() => setCurrentTab("devices")}
          hasDevices={devices.length > 0}
        />

        {/* Main Tabs */}
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-gaming-card border-gaming-border">
            <TabsTrigger value="bots" className="flex items-center gap-2">
              <Bot className="w-4 h-4" />
              Games
            </TabsTrigger>
            <TabsTrigger value="devices" className="flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Devices
            </TabsTrigger>
          </TabsList>
          
          {/* GAMES TAB */}
          <TabsContent value="bots" className="space-y-6">
            <StatsOverview stats={stats} />

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex flex-1 gap-4 w-full sm:w-auto">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search games..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gaming-card border-gaming-border"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto">
                  {categories.map(category => (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(category)}
                      className="whitespace-nowrap"
                    >
                      {category === "all" ? "All" : category}
                    </Button>
                  ))}
                </div>
              </div>
              <Dialog open={showAddGame} onOpenChange={setShowAddGame}>
                <DialogTrigger asChild>
                  <Button 
                    className="bg-neon-green hover:bg-neon-green/80 text-primary-foreground font-bold"
                    disabled={availableDevices.length === 0}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Select & Play
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-gaming-card border-gaming-border">
                  <DialogHeader>
                    <DialogTitle className="text-glow">Choose Device & Play Game</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      Select your connected device and choose a game to start playing
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {/* Device Select */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium">Step 1: Select Device</label>
                        <div className="flex gap-2">
                          {selectedDevice && (
                            <Button variant="outline" size="sm" onClick={() => handleDeviceSelect(selectedDevice)} disabled={isScanning} className="h-8 gap-1.5">
                              <Scan className="w-3.5 h-3.5" />
                              {isScanning ? 'Scanning...' : 'Scan'}
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={async () => {
                            toast.loading('Checking status...', { id: 'refresh-status' });
                            await checkAllDeviceStatus();
                            await loadDevices();
                            toast.success('Updated', { id: 'refresh-status' });
                          }} className="h-8 gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <Select value={selectedDevice} onValueChange={handleDeviceSelect}>
                        <SelectTrigger className="bg-gaming-card border-gaming-border h-12">
                          <SelectValue placeholder="Choose your mobile device" />
                        </SelectTrigger>
                        <SelectContent className="bg-gaming-card border-gaming-border z-[200]">
                          {availableDevices.map((device) => (
                            <SelectItem key={device.id} value={device.id} disabled={device.status === 'offline'}>
                              <div className="flex items-center gap-2">
                                <Smartphone className={`w-4 h-4 ${device.status === 'offline' ? 'text-muted-foreground' : 'text-neon-green'}`} />
                                <span className={device.status === 'offline' ? 'text-muted-foreground' : ''}>{device.name}</span>
                                <Badge variant="outline" className={device.status === 'online' ? 'text-neon-green border-neon-green' : 'text-destructive border-destructive'}>
                                  {device.status === 'online' ? '🟢' : '🔴'} {device.status}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Game Select */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Step 2: Select Game
                        {isScanning && <Badge variant="outline" className="ml-2 text-neon-blue border-neon-blue animate-pulse">🔍 Scanning...</Badge>}
                      </label>
                      <Select value={selectedGame} onValueChange={setSelectedGame} disabled={!selectedDevice || isScanning || availableGamesForDevice.length === 0}>
                        <SelectTrigger className="bg-gaming-card border-gaming-border h-12">
                          <SelectValue placeholder={isScanning ? "Scanning..." : !selectedDevice ? "Select device first" : availableGamesForDevice.length === 0 ? "No games found" : "Choose a game"} />
                        </SelectTrigger>
                        <SelectContent className="bg-gaming-card border-gaming-border z-[200] max-h-[400px]">
                          {availableGamesForDevice.map((game) => (
                            <SelectItem key={game.packageName} value={game.name} className="py-3">
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{game.icon}</span>
                                <div className="flex flex-col">
                                  <span className="font-medium">{game.name}</span>
                                  <span className="text-xs text-muted-foreground">{game.packageName}</span>
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button variant="outline" onClick={() => setShowAddGame(false)} className="flex-1">Cancel</Button>
                      <Button onClick={handleAddGame} className="flex-1 bg-neon-green hover:bg-neon-green/80 text-primary-foreground font-bold" disabled={!selectedDevice || !selectedGame}>
                        <Play className="w-5 h-5 mr-2" />
                        Play Now
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Bot Cards */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1,2,3].map(i => <div key={i} className="h-64 bg-gaming-card border-gaming-border rounded-lg animate-pulse" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredGames.map((game) => (
                  <BotCard key={game.id} game={game} onStatusChange={handleGameStatusChange} />
                ))}
              </div>
            )}

            {filteredGames.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <Bot className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No games found</h3>
                <p className="text-muted-foreground">Try adjusting your search or filters</p>
              </div>
            )}
          </TabsContent>

          {/* DEVICES TAB */}
          <TabsContent value="devices">
            <DeviceConnection />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

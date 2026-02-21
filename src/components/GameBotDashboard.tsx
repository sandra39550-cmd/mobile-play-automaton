import { useState, useEffect } from "react";
import { BotCard } from "./BotCard";
import { StatsOverview } from "./StatsOverview";
import { DeviceConnection } from "./DeviceConnection";
import { QuickStartGuide } from "./QuickStartGuide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, Filter, Bot, Smartphone, Play, RefreshCw, Scan } from "lucide-react";
import { toast } from "sonner";
import { useDeviceAutomation } from "@/hooks/useDeviceAutomation";
import { useGameManagement } from "@/hooks/useGameManagement";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const GameBotDashboard = () => {
  const { devices, sessions, checkAllDeviceStatus, loadDevices } = useDeviceAutomation();
  const { games, deviceGames, isLoading, handleGameStatusChange, addGameSession, getAvailableGamesForDevice, scanGamesOnDevice, getStats } = useGameManagement();
  const [currentTab, setCurrentTab] = useState("bots");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showAddGame, setShowAddGame] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [selectedGame, setSelectedGame] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Auto-scan when dialog opens if we have online devices
  useEffect(() => {
    if (showAddGame && onlineDevices.length > 0 && !selectedDevice) {
      // Auto-select first online device and scan it
      const firstOnline = onlineDevices[0];
      handleDeviceSelect(firstOnline.id);
    }
  }, [showAddGame]);


  const categories = ["all", "Strategy", "Puzzle", "Adventure", "Casino", "Battle Royale", "Endless Runner"];
  const onlineDevices = devices.filter(d => d.status === 'online');
  const availableDevices = devices; // Show all devices, not just online ones
  const stats = getStats();
  const availableGamesForDevice = selectedDevice ? getAvailableGamesForDevice(selectedDevice) : [];
  
  // Filter games based on search and category
  const filteredGames = games.filter(game => {
    const matchesSearch = game.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || game.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleDeviceSelect = async (deviceId: string) => {
    console.log('🎯 handleDeviceSelect called with deviceId:', deviceId);
    setSelectedDevice(deviceId);
    setSelectedGame("");
    setScanError(null);
    
    const device = availableDevices.find(d => d.id === deviceId);
    console.log('📱 Found device:', device);
    
    if (!device) {
      toast.error('Device not found');
      return;
    }
    
    // Check device status before scanning
    if (device.status === 'offline') {
      console.log('❌ Device is offline, aborting scan');
      toast.error(`❌ ${device.name} is OFFLINE\n\nPlease:\n1. Connect device via USB\n2. Enable USB debugging\n3. Run: adb devices\n4. Ensure ADB server is running on localhost:3000`, { duration: 8000 });
      return;
    }
    
    console.log('✅ Device is online, starting scan...');
    setIsScanning(true);
    toast.loading(`🔍 Scanning ${device.name} for installed games via ADB...`, { id: 'scan-games' });
    
    try {
      console.log('🔍 Calling scanGamesOnDevice...');
      const scannedGames = await scanGamesOnDevice(deviceId);
      console.log('📦 Scan result:', scannedGames);
      
      if (scannedGames && scannedGames.length > 0) {
        console.log(`✅ Found ${scannedGames.length} games:`, scannedGames.map(g => g.name));
        toast.success(`✅ Found ${scannedGames.length} game(s) on ${device.name}`, { id: 'scan-games' });
      } else {
        console.log('⚠️ No games returned from scan');
        toast.warning(`⚠️ No games found on ${device.name}\n\nPlease ensure:\n1. Games are installed on device\n2. ADB server is running: cd adb-server && node server.js\n3. ngrok is tunneling localhost:3000`, { id: 'scan-games', duration: 10000 });
      }
    } catch (error) {
      console.error('❌ Scan error:', error);
      const errorMsg = error?.message || 'Unknown error';
      setScanError(errorMsg);
      
      if (errorMsg.includes('ADB server is offline')) {
        toast.error(`🔴 ADB Server Connection Failed\n\n${errorMsg}\n\nTroubleshooting:\n1. Start ADB server: cd adb-server && node server.js\n2. Start ngrok: ngrok http 3000\n3. Update ADB_SERVER_URL with your ngrok URL`, { id: 'scan-games', duration: 15000 });
      } else if (errorMsg.includes('timeout')) {
        toast.error(`⏱️ Scan Timeout\n\nADB server took too long to respond. Check your connection.`, { id: 'scan-games', duration: 8000 });
      } else {
        toast.error(`❌ Scan Failed: ${errorMsg.substring(0, 100)}`, { id: 'scan-games', duration: 8000 });
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddGame = async () => {
    if (!selectedDevice || !selectedGame) {
      toast.error('Please select both device and game');
      return;
    }
    
    const device = availableDevices.find(d => d.id === selectedDevice);
    const gameInfo = availableGamesForDevice.find(g => g.name === selectedGame);
    
    if (!gameInfo) {
      toast.error('Game not found');
      return;
    }
    
    toast.loading(`Starting ${gameInfo.name} on ${device?.name}...`, { id: 'start-game' });
    
    try {
      await addGameSession(selectedGame, selectedDevice);
      toast.success(`${gameInfo.name} is now playing on ${device?.name}!`, { id: 'start-game' });
      setShowAddGame(false);
      setSelectedDevice("");
      setSelectedGame("");
    } catch (error) {
      toast.error(`Failed to start game: ${error}`, { id: 'start-game' });
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Bot className="w-10 h-10 text-neon-purple animate-pulse-glow" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-neon-purple to-neon-blue bg-clip-text text-transparent animate-glow">
              SIMA 2 FOR MOBILE GAMES
            </h1>
          </div>
          <p className="text-xl text-muted-foreground">
            Gemini Powered AI Agent For Mobile Gaming
          </p>
          <div className="flex items-center justify-center gap-2">
            <Badge variant="outline" className="text-neon-green border-neon-green">
              {onlineDevices.length} Online Devices
            </Badge>
            <Badge variant="outline" className="text-neon-blue border-neon-blue">
              {stats.activeBots} Active Agents
            </Badge>
            <Badge variant="outline" className="text-neon-pink border-neon-pink">
              {games.length} Games Available
            </Badge>
          </div>
        </div>

        {/* Quick Start Guide */}
        <QuickStartGuide 
          onConnectDevice={() => setCurrentTab("devices")}
          hasDevices={devices.length > 0}
        />

        {/* Main Content */}
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-gaming-card border-gaming-border">
            <TabsTrigger value="bots" className="flex items-center gap-2">
              <Bot className="w-4 h-4" />
              Game Agents
            </TabsTrigger>
            <TabsTrigger value="devices" className="flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Devices
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="bots" className="space-y-6">
            {/* Stats Overview */}
            <StatsOverview stats={stats} />

            {/* Controls */}
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
                    className="bg-neon-green hover:bg-neon-green/80 text-gaming-bg font-bold"
                    disabled={availableDevices.length === 0}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Select & Play Game
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-gaming-card border-gaming-border">
                  <DialogHeader>
                    <DialogTitle className="text-glow">Choose Device & Play Game</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      Select your connected device and choose a game to start playing automatically
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium">Step 1: Select Your Device</label>
                        <div className="flex gap-2">
                          {selectedDevice && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeviceSelect(selectedDevice)}
                              disabled={isScanning}
                              className="h-8 gap-1.5"
                            >
                              <Scan className="w-3.5 h-3.5" />
                              {isScanning ? 'Scanning...' : 'Scan Games'}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              toast.loading('Checking device status...', { id: 'refresh-status' });
                              await checkAllDeviceStatus();
                              await loadDevices();
                              toast.success('Device status updated', { id: 'refresh-status' });
                            }}
                            className="h-8 gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Refresh
                          </Button>
                        </div>
                      </div>
                      <Select value={selectedDevice} onValueChange={handleDeviceSelect}>
                        <SelectTrigger className="bg-gaming-card border-gaming-border h-12 hover:bg-gaming-hover">
                          <SelectValue placeholder="Choose your mobile device" />
                        </SelectTrigger>
                        <SelectContent className="bg-gaming-card border-gaming-border z-[200] max-h-[300px]">
                          {availableDevices.map((device) => (
                            <SelectItem 
                              key={device.id} 
                              value={device.id} 
                              className="cursor-pointer hover:bg-gaming-hover focus:bg-gaming-hover bg-gaming-card"
                              disabled={device.status === 'offline'}
                            >
                              <div className="flex items-center gap-2">
                                <Smartphone className={`w-4 h-4 ${device.status === 'offline' ? 'text-muted-foreground' : 'text-neon-green'}`} />
                                <span className={`font-medium ${device.status === 'offline' ? 'text-muted-foreground line-through' : ''}`}>
                                  {device.name}
                                </span>
                                <Badge 
                                  variant="outline" 
                                  className={
                                    device.status === 'online' 
                                      ? 'text-neon-green border-neon-green bg-neon-green/10' 
                                      : 'text-red-500 border-red-500 bg-red-500/10'
                                  }
                                >
                                  {device.status === 'online' ? '🟢 Online' : '🔴 Offline'}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Step 2: Select Game from Device
                        {selectedDevice && deviceGames[selectedDevice] && !isScanning && !scanError && (
                          <Badge variant="outline" className="ml-2 text-neon-green border-neon-green bg-neon-green/10">
                            ✅ {availableGamesForDevice.length} games found on {availableDevices.find(d => d.id === selectedDevice)?.name}
                          </Badge>
                        )}
                        {isScanning && (
                          <Badge variant="outline" className="ml-2 text-neon-blue border-neon-blue animate-pulse">
                            🔍 Scanning device via ADB...
                          </Badge>
                        )}
                        {scanError && !isScanning && (
                          <Badge variant="outline" className="ml-2 text-red-500 border-red-500 bg-red-500/10">
                            ❌ Scan failed
                          </Badge>
                        )}
                        {selectedDevice && !deviceGames[selectedDevice] && !isScanning && !scanError && (
                          <Badge variant="outline" className="ml-2 text-yellow-500 border-yellow-500 bg-yellow-500/10">
                            ⏳ Click "Scan Games" button above
                          </Badge>
                        )}
                      </label>
                      <Select value={selectedGame} onValueChange={setSelectedGame} disabled={!selectedDevice || isScanning || availableGamesForDevice.length === 0}>
                        <SelectTrigger className="bg-gaming-card border-gaming-border h-12 hover:bg-gaming-hover disabled:opacity-50 disabled:cursor-not-allowed">
                          <SelectValue placeholder={
                            isScanning ? "🔍 Scanning device..." : 
                            !selectedDevice ? "Select device first" :
                            availableGamesForDevice.length === 0 ? "No games found on device" :
                            "Choose a game"
                          } />
                        </SelectTrigger>
                        <SelectContent className="bg-gaming-card border-gaming-border z-[200] max-h-[400px]">
                          {availableGamesForDevice.length > 0 ? (
                            availableGamesForDevice.map((game) => (
                              <SelectItem 
                                key={game.packageName} 
                                value={game.name} 
                                className="cursor-pointer hover:bg-gaming-hover focus:bg-gaming-hover bg-gaming-card py-3"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl">{game.icon}</span>
                                  <div className="flex flex-col">
                                    <span className="font-medium text-base">{game.name}</span>
                                    <span className="text-xs text-muted-foreground">{game.packageName}</span>
                                  </div>
                                </div>
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="no-games" disabled className="bg-gaming-card">
                              {isScanning ? '🔍 Scanning...' : 
                               !selectedDevice ? 'Select device first' : 
                               'No games found'}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      {selectedDevice && (
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          {isScanning 
                            ? '🔍 Scanning real device via ADB for installed games...'
                            : deviceGames[selectedDevice] 
                              ? availableGamesForDevice.length > 0 
                                ? `📱 Showing ${availableGamesForDevice.length} game(s) from ${availableDevices.find(d => d.id === selectedDevice)?.name}` 
                                : '⚠️ No games found on this device - install games and try scanning again'
                              : '⏳ Select device to scan for games'}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button 
                        variant="outline" 
                        onClick={() => setShowAddGame(false)}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleAddGame}
                        className="flex-1 bg-neon-green hover:bg-neon-green/80 text-gaming-bg font-bold text-lg"
                        disabled={!selectedDevice || !selectedGame}
                      >
                        <Play className="w-5 h-5 mr-2" />
                        Play Game Now
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Bot Cards */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1,2,3,4,5,6].map((i) => (
                  <div key={i} className="h-64 bg-gaming-card border-gaming-border rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredGames.map((game) => (
                  <BotCard
                    key={game.id}
                    game={game}
                    onStatusChange={handleGameStatusChange}
                  />
                ))}
              </div>
            )}

            {filteredGames.length === 0 && (
              <div className="text-center py-12">
                <Bot className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No games found</h3>
                <p className="text-muted-foreground">Try adjusting your search or filters</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="devices">
            <DeviceConnection />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
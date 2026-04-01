import { useState, useEffect, useMemo } from "react";
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
  const { devices, sessions, checkAllDeviceStatus, loadDevices } = useDeviceAutomation();
  const { games, deviceGames, isLoading, handleGameStatusChange, addGameSession, getAvailableGamesForDevice, scanGamesOnDevice, getStats } = useGameManagement();
  const { latestPerception, isPerceiving, perceive, perceptionHistory, error: perceptionError, clearHistory } = usePerception();
  const { currentPlan, planHistory, isReasoning, error: reasoningError, reason, markStepStatus, recordAction, clearPlan } = useReasoning();
  const { experiences, stats: expStats, isEstimating, isLoading: expLoading, lastReward, estimateReward, loadExperiences } = useExperienceBank();
  const { executePlan } = useActionExecution();
  const gameProfiles = useGameProfiles();
  const strategyTemplates = useStrategyTemplates();
  const zeroShot = useZeroShotAgent({
    perceive,
    executePlan,
    markStepStatus,
  });
  
  // Auto-Pilot
  const autoPilot = useAutoPilot({
    perceive,
    reason,
    executePlan,
    estimateReward,
    markStepStatus,
    recordAction,
    loadExperiences,
  });

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
      const firstOnline = onlineDevices[0];
      handleDeviceSelect(firstOnline.id);
    }
  }, [showAddGame]);

  const categories = ["all", "Strategy", "Puzzle", "Adventure", "Casino", "Battle Royale", "Endless Runner"];
  const onlineDevices = devices.filter(d => d.status === 'online');
  const availableDevices = devices;
  const stats = getStats();
  const availableGamesForDevice = selectedDevice ? getAvailableGamesForDevice(selectedDevice) : [];

  // Determine the active game's device ID for perception
  const activeGame = useMemo(() => games.find(g => g.status === 'active'), [games]);
  const perceptionDeviceId = activeGame?.deviceId || (onlineDevices.length > 0 ? onlineDevices[0].device_id : undefined);
  const perceptionGameName = activeGame?.name || 'Unknown';
  
  // Filter games based on search and category
  const filteredGames = games.filter(game => {
    const matchesSearch = game.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || game.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleDeviceSelect = async (deviceId: string) => {
    setSelectedDevice(deviceId);
    setSelectedGame("");
    setScanError(null);
    
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
      setScanError(error?.message || 'Unknown error');
      toast.error(`❌ Scan Failed: ${(error?.message || '').substring(0, 100)}`, { id: 'scan-games', duration: 8000 });
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddGame = async () => {
    if (!selectedDevice || !selectedGame) { toast.error('Please select both device and game'); return; }
    
    const device = availableDevices.find(d => d.id === selectedDevice);
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
            {autoPilot.state.isRunning && (
              <Badge variant="outline" className="text-neon-green border-neon-green animate-pulse">
                <Orbit className="w-3 h-3 mr-1 animate-spin" style={{ animationDuration: '3s' }} />
                Auto-Pilot Active
              </Badge>
            )}
          </div>
        </div>

        {/* Quick Start Guide */}
        <QuickStartGuide 
          onConnectDevice={() => setCurrentTab("devices")}
          hasDevices={devices.length > 0}
        />

        {/* Main Tabs */}
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 bg-gaming-card border-gaming-border">
            <TabsTrigger value="bots" className="flex items-center gap-2">
              <Bot className="w-4 h-4" />
              Games
            </TabsTrigger>
            <TabsTrigger value="agent" className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Agent Pipeline
            </TabsTrigger>
            <TabsTrigger value="zeroshot" className="flex items-center gap-2">
              <Rocket className="w-4 h-4" />
              Zero-Shot
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Analytics
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

          {/* AGENT PIPELINE TAB */}
          <TabsContent value="agent" className="space-y-6">
            {/* Auto-Pilot Control — Top */}
            <AutoPilotControl
              state={autoPilot.state}
              deviceId={perceptionDeviceId}
              gameName={perceptionGameName}
              onStart={autoPilot.start}
              onStop={autoPilot.stop}
              onSetSpeed={autoPilot.setSpeed}
              onClearLogs={autoPilot.clearLogs}
            />

            {/* Two-column layout: Live Screen + Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Live Screen Preview */}
              <div className="lg:col-span-1">
                <LiveScreenPreview
                  deviceId={perceptionDeviceId}
                  autoRefresh={autoPilot.state.isRunning}
                  refreshIntervalMs={8000}
                />
              </div>

              {/* Right: Pipeline Panels */}
              <div className="lg:col-span-2 space-y-4">
                {/* Phase indicators */}
                <div className="flex items-center gap-2 px-1">
                  {[
                    { icon: Eye, label: 'Perceive', color: 'text-neon-purple', phase: 'perceiving' },
                    { icon: Brain, label: 'Reason', color: 'text-neon-blue', phase: 'reasoning' },
                    { icon: Zap, label: 'Execute', color: 'text-neon-pink', phase: 'executing' },
                    { icon: BookOpen, label: 'Learn', color: 'text-neon-green', phase: 'rewarding' },
                  ].map((p, i) => (
                    <div key={p.phase} className="flex items-center gap-1 flex-1">
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-1 justify-center text-xs font-semibold border ${
                        autoPilot.state.currentPhase === p.phase
                          ? `${p.color} border-current bg-current/5`
                          : 'text-muted-foreground border-gaming-border'
                      }`}>
                        <p.icon className="w-3.5 h-3.5" />
                        {p.label}
                      </div>
                      {i < 3 && <span className="text-muted-foreground/30 text-lg">→</span>}
                    </div>
                  ))}
                </div>

                {/* Pipeline Panels in Tabs */}
                <Tabs defaultValue="perception" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 bg-gaming-card border-gaming-border h-9">
                    <TabsTrigger value="perception" className="text-xs gap-1">
                      <Eye className="w-3 h-3" /> Perceive
                    </TabsTrigger>
                    <TabsTrigger value="reasoning" className="text-xs gap-1">
                      <Brain className="w-3 h-3" /> Reason
                    </TabsTrigger>
                    <TabsTrigger value="execution" className="text-xs gap-1">
                      <Zap className="w-3 h-3" /> Execute
                    </TabsTrigger>
                    <TabsTrigger value="experience" className="text-xs gap-1">
                      <BookOpen className="w-3 h-3" /> Learn
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="perception">
                    <PerceptionView 
                      deviceId={perceptionDeviceId}
                      gameName={perceptionGameName}
                      latestPerception={latestPerception}
                      isPerceiving={isPerceiving}
                      onPerceive={() => perceptionDeviceId && perceive(perceptionDeviceId, perceptionGameName)}
                      perceptionHistory={perceptionHistory}
                      error={perceptionError}
                      onClearHistory={clearHistory}
                    />
                  </TabsContent>

                  <TabsContent value="reasoning">
                    <ReasoningView
                      perception={latestPerception}
                      gameName={perceptionGameName}
                      reasoningHook={{ currentPlan, planHistory, isReasoning, error: reasoningError, reason, markStepStatus, recordAction, clearPlan }}
                    />
                  </TabsContent>

                  <TabsContent value="execution">
                    <ActionExecutionView
                      plan={currentPlan}
                      deviceId={perceptionDeviceId}
                      onStepUpdate={markStepStatus}
                      onRecordAction={recordAction}
                      onExecutionComplete={async (results) => {
                        if (currentPlan && perceptionGameName) {
                          await estimateReward(perceptionGameName, currentPlan, results, latestPerception, null);
                          loadExperiences(perceptionGameName);
                        }
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="experience">
                    <ExperienceBankView
                      experiences={experiences}
                      stats={expStats}
                      isLoading={expLoading}
                      isEstimating={isEstimating}
                      lastReward={lastReward}
                      gameName={perceptionGameName}
                      onLoadExperiences={loadExperiences}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </TabsContent>

          {/* ZERO-SHOT TAB */}
          <TabsContent value="zeroshot" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <LiveScreenPreview
                  deviceId={perceptionDeviceId}
                  autoRefresh={zeroShot.isRunning}
                  refreshIntervalMs={6000}
                />
              </div>
              <div className="lg:col-span-2">
                <ZeroShotPlayAgent
                  currentAttempt={zeroShot.currentAttempt}
                  attemptHistory={zeroShot.attemptHistory}
                  isRunning={zeroShot.isRunning}
                  deviceId={perceptionDeviceId}
                  onAttempt={zeroShot.attemptGame}
                  onAbort={zeroShot.abort}
                />
              </div>
            </div>
          </TabsContent>

          {/* ANALYTICS TAB — Phase 6 */}
          <TabsContent value="analytics" className="space-y-6">
            <AgentPerformanceDashboard />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GameProfilesView
                profiles={gameProfiles.profiles}
                isLoading={gameProfiles.isLoading}
                onLoad={gameProfiles.loadProfiles}
                onUpdateStats={gameProfiles.updateProfileStats}
              />
              <StrategyTemplatesView
                templates={strategyTemplates.templates}
                isLoading={strategyTemplates.isLoading}
                isExtracting={strategyTemplates.isExtracting}
                gameName={perceptionGameName}
                onLoad={strategyTemplates.loadTemplates}
                onExtract={strategyTemplates.extractTemplate}
              />
            </div>
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

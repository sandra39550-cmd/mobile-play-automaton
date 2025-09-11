import { useState } from "react";
import { BotCard } from "./BotCard";
import { StatsOverview } from "./StatsOverview";
import { DeviceConnection } from "./DeviceConnection";
import { QuickStartGuide } from "./QuickStartGuide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, Filter, Bot, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useDeviceAutomation } from "@/hooks/useDeviceAutomation";

export const GameBotDashboard = () => {
  const { devices, sessions, startBotSession, stopBotSession } = useDeviceAutomation();
  const [currentTab, setCurrentTab] = useState("bots");
  const [games, setGames] = useState([
    {
      id: "1",
      name: "Clash Royale",
      icon: "⚔️",
      category: "Strategy",
      status: "active" as const,
      progress: 78,
      level: 15,
      currency: 45670,
      hourlyRate: 1250,
    },
    {
      id: "2",
      name: "Candy Crush",
      icon: "🍭",
      category: "Puzzle",
      status: "paused" as const,
      progress: 45,
      level: 342,
      currency: 28900,
      hourlyRate: 890,
    },
    {
      id: "3",
      name: "Pokemon GO",
      icon: "🎮",
      category: "Adventure",
      status: "active" as const,
      progress: 92,
      level: 28,
      currency: 15400,
      hourlyRate: 650,
    },
    {
      id: "4",
      name: "Coin Master",
      icon: "🪙",
      category: "Casino",
      status: "stopped" as const,
      progress: 23,
      level: 67,
      currency: 89200,
      hourlyRate: 2100,
    },
    {
      id: "5",
      name: "PUBG Mobile",
      icon: "🔫",
      category: "Battle Royale",
      status: "active" as const,
      progress: 67,
      level: 45,
      currency: 12500,
      hourlyRate: 980,
    },
    {
      id: "6",
      name: "Subway Surfers",
      icon: "🚇",
      category: "Endless Runner",
      status: "paused" as const,
      progress: 89,
      level: 156,
      currency: 67800,
      hourlyRate: 1420,
    },
  ]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = ["all", "Strategy", "Puzzle", "Adventure", "Casino", "Battle Royale", "Endless Runner"];

  const handleStatusChange = (id: string, status: "active" | "paused" | "stopped") => {
    setGames(games.map(game => 
      game.id === id ? { ...game, status } : game
    ));
    
    const game = games.find(g => g.id === id);
    toast(`${game?.name} bot ${status}`, {
      description: `Bot status changed to ${status}`,
      duration: 2000,
    });
  };

  const filteredGames = games.filter(game => {
    const matchesSearch = game.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || game.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const activeBotsCount = games.filter(game => game.status === "active").length;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Bot className="w-10 h-10 text-neon-purple animate-pulse-glow" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-neon-purple to-neon-blue bg-clip-text text-transparent animate-glow">
              Mobile Game Bot Controller
            </h1>
          </div>
          <p className="text-xl text-muted-foreground">
            Real AI automation for mobile gaming
          </p>
          <div className="flex items-center justify-center gap-2">
            <Badge variant="outline" className="text-neon-green border-neon-green">
              {devices.filter(d => d.status === 'online').length} Online Devices
            </Badge>
            <Badge variant="outline" className="text-neon-blue border-neon-blue">
              {sessions.filter(s => s.status === 'running').length} Active Sessions
            </Badge>
            <Badge variant="outline" className="text-neon-pink border-neon-pink">
              6 Games Supported
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
              Game Bots
            </TabsTrigger>
            <TabsTrigger value="devices" className="flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Devices
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="bots" className="space-y-6">
            {/* Stats Overview */}
            <StatsOverview />

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
              <Button className="bg-neon-purple hover:bg-neon-purple/80 text-gaming-bg">
                <Plus className="w-4 h-4 mr-2" />
                Add Game
              </Button>
            </div>

            {/* Bot Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredGames.map((game) => (
                <BotCard
                  key={game.id}
                  game={game}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>

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
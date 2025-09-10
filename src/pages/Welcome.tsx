import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bot, Smartphone, Zap, Shield, ArrowRight, Play } from 'lucide-react'

export default function Welcome() {
  const features = [
    {
      icon: <Bot className="w-8 h-8 text-neon-purple" />,
      title: "AI-Powered Automation",
      description: "Advanced computer vision and AI to automate mobile game actions"
    },
    {
      icon: <Smartphone className="w-8 h-8 text-neon-blue" />,
      title: "Multi-Device Support",
      description: "Connect multiple Android and iOS devices simultaneously"
    },
    {
      icon: <Zap className="w-8 h-8 text-neon-green" />,
      title: "Real-Time Control",
      description: "Monitor and control your bots in real-time with live feedback"
    },
    {
      icon: <Shield className="w-8 h-8 text-neon-pink" />,
      title: "Secure & Private",
      description: "Your gaming data stays private and secure on your devices"
    }
  ]

  const supportedGames = [
    "Clash Royale",
    "Candy Crush",
    "Pokemon GO", 
    "Coin Master",
    "PUBG Mobile",
    "Subway Surfers"
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-gaming-border bg-gaming-card/50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="w-8 h-8 text-neon-purple animate-pulse-glow" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-neon-purple to-neon-blue bg-clip-text text-transparent">
              Game Bot Controller
            </h1>
          </div>
          <Link to="/auth">
            <Button className="bg-neon-purple hover:bg-neon-purple/80 text-gaming-bg">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl text-center space-y-8">
          <div className="space-y-4">
            <Badge variant="outline" className="text-neon-green border-neon-green mb-4">
              Real Mobile Game Automation
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              <span className="bg-gradient-to-r from-neon-purple via-neon-blue to-neon-green bg-clip-text text-transparent">
                Automate Your
              </span>
              <br />
              <span className="text-glow">Mobile Games</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Connect your Android or iOS device and let AI take control. 
              Advanced computer vision and automation for mobile gaming.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="bg-neon-purple hover:bg-neon-purple/80 text-gaming-bg gap-2">
                <Play className="w-5 h-5" />
                Start Automating
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="gap-2">
              <Smartphone className="w-5 h-5" />
              View Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-gaming-card/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 text-glow">
              Powerful Features
            </h2>
            <p className="text-xl text-muted-foreground">
              Everything you need for professional mobile game automation
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="p-8 border-gaming-border bg-gaming-card hover:bg-gaming-card/80 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-gaming-bg border border-gaming-border">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2 text-glow">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Games */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-bold mb-8 text-glow">
            Supported Games
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-12">
            {supportedGames.map((game, index) => (
              <Badge key={index} variant="outline" className="p-3 text-sm border-gaming-border">
                {game}
              </Badge>
            ))}
          </div>
          <p className="text-muted-foreground mb-8">
            More games added regularly. Request support for your favorite game!
          </p>
          <Link to="/auth">
            <Button size="lg" className="bg-neon-green hover:bg-neon-green/80 text-gaming-bg gap-2">
              Get Started Now
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gaming-border bg-gaming-card/50 py-8 px-6">
        <div className="container mx-auto max-w-6xl text-center">
          <p className="text-muted-foreground">
            © 2025 Game Bot Controller. Automate responsibly.
          </p>
        </div>
      </footer>
    </div>
  )
}
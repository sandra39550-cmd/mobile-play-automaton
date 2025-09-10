import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Smartphone, Wifi, Play, CheckCircle } from 'lucide-react'
import { useState } from 'react'

interface QuickStartGuideProps {
  onConnectDevice: () => void
  hasDevices: boolean
}

export const QuickStartGuide = ({ onConnectDevice, hasDevices }: QuickStartGuideProps) => {
  const [currentStep, setCurrentStep] = useState(hasDevices ? 2 : 1)

  const steps = [
    {
      id: 1,
      title: "Connect Device",
      description: "Add your Android or iOS device",
      icon: <Smartphone className="w-5 h-5" />,
      completed: hasDevices
    },
    {
      id: 2,
      title: "Select Game",
      description: "Choose a game to automate",
      icon: <Play className="w-5 h-5" />,
      completed: false
    },
    {
      id: 3,
      title: "Start Bot",
      description: "Begin automated gaming",
      icon: <CheckCircle className="w-5 h-5" />,
      completed: false
    }
  ]

  if (hasDevices) return null

  return (
    <Card className="p-6 border-gaming-border bg-gaming-card mb-6">
      <div className="flex items-center gap-3 mb-4">
        <Wifi className="w-6 h-6 text-neon-green" />
        <h3 className="text-xl font-semibold text-glow">Quick Start Guide</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`p-4 rounded-lg border ${
              step.completed 
                ? 'bg-neon-green/10 border-neon-green' 
                : currentStep === step.id
                ? 'bg-neon-purple/10 border-neon-purple'
                : 'bg-gaming-card border-gaming-border'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-full ${
                step.completed 
                  ? 'bg-neon-green text-gaming-bg' 
                  : currentStep === step.id
                  ? 'bg-neon-purple text-gaming-bg'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {step.icon}
              </div>
              <div>
                <h4 className="font-semibold">{step.title}</h4>
                <Badge variant="outline" className="text-xs">
                  Step {step.id}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{step.description}</p>
          </div>
        ))}
      </div>
      
      <div className="text-center">
        <Button
          onClick={onConnectDevice}
          className="bg-neon-green hover:bg-neon-green/80 text-gaming-bg"
          size="lg"
        >
          <Smartphone className="w-4 h-4 mr-2" />
          Connect Your First Device
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Supports Android ADB and iOS (with limitations)
        </p>
      </div>
    </Card>
  )
}
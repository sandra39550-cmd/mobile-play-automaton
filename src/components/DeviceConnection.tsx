import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Smartphone, Wifi, WifiOff, Activity, Trash2, RefreshCw, Server, ExternalLink, Check, Copy } from 'lucide-react'
import { useDeviceAutomation } from '@/hooks/useDeviceAutomation'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export const DeviceConnection = () => {
  const { devices, connectDevice, deleteDevice, isLoading } = useDeviceAutomation()
  const [showConnectionForm, setShowConnectionForm] = useState(false)
  const [adbServerUrl, setAdbServerUrl] = useState('')
  const [newAdbUrl, setNewAdbUrl] = useState('')
  const [isUpdatingUrl, setIsUpdatingUrl] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    deviceId: '',
    platform: 'android' as 'android' | 'ios',
    adbHost: 'localhost',
    adbPort: 5555,
    screenWidth: 1080,
    screenHeight: 1920
  })

  // Fetch current ADB server URL
  useEffect(() => {
    const fetchAdbUrl = async () => {
      const { data, error } = await supabase
        .from('adb_server_config')
        .select('server_url, last_updated')
        .eq('is_active', true)
        .single()
      
      if (data && !error) {
        setAdbServerUrl(data.server_url)
        setNewAdbUrl(data.server_url)
        setLastUpdated(data.last_updated)
      }
    }
    fetchAdbUrl()
  }, [])

  const handleUpdateAdbUrl = async () => {
    if (!newAdbUrl.trim()) {
      toast.error('Please enter a valid URL')
      return
    }

    setIsUpdatingUrl(true)
    try {
      const { error } = await supabase.functions.invoke('update-adb-url', {
        body: { serverUrl: newAdbUrl.trim() }
      })

      if (error) throw error

      setAdbServerUrl(newAdbUrl.trim())
      setLastUpdated(new Date().toISOString())
      toast.success('ADB server URL updated!')
    } catch (err: any) {
      toast.error(`Failed to update URL: ${err.message}`)
    } finally {
      setIsUpdatingUrl(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.deviceId) {
      toast.error('Please fill in all required fields')
      return
    }

    const result = await connectDevice(formData)
    if (result) {
      setShowConnectionForm(false)
      setFormData({
        name: '',
        deviceId: '',
        platform: 'android',
        adbHost: 'localhost',
        adbPort: 5555,
        screenWidth: 1080,
        screenHeight: 1920
      })
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <Wifi className="w-4 h-4 text-neon-green" />
      case 'busy': return <Activity className="w-4 h-4 text-neon-blue" />
      case 'offline': return <WifiOff className="w-4 h-4 text-muted-foreground" />
      default: return <WifiOff className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-neon-green'
      case 'busy': return 'bg-neon-blue'  
      case 'offline': return 'bg-muted'
      default: return 'bg-muted'
    }
  }

  const handleDeleteDevice = async (deviceId: string, deviceName: string) => {
    if (confirm(`Are you sure you want to remove "${deviceName}"?`)) {
      await deleteDevice(deviceId)
    }
  }

  const handleRefreshStatus = async (device: any) => {
    toast.info('Refreshing device status...')
    await connectDevice({
      name: device.name,
      deviceId: device.device_id,
      platform: device.platform,
      adbHost: device.adb_host || 'localhost',
      adbPort: device.adb_port || 5555,
      screenWidth: device.screen_width || 1080,
      screenHeight: device.screen_height || 1920
    })
  }

  return (
    <div className="space-y-6">
      {/* ADB Server URL Panel */}
      <Card className="p-4 border-gaming-border bg-gaming-card">
        <div className="flex items-center gap-2 mb-3">
          <Server className="w-5 h-5 text-neon-blue" />
          <h3 className="font-semibold text-glow">ADB Server URL</h3>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={newAdbUrl}
              onChange={(e) => setNewAdbUrl(e.target.value)}
              placeholder="https://your-ngrok-url.ngrok-free.app"
              className="bg-gaming-card border-gaming-border flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => copyToClipboard(adbServerUrl)}
              className="h-10 w-10"
              title="Copy URL"
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button
              onClick={handleUpdateAdbUrl}
              disabled={isUpdatingUrl || newAdbUrl === adbServerUrl}
              className="bg-neon-blue hover:bg-neon-blue/80"
            >
              {isUpdatingUrl ? 'Updating...' : 'Update URL'}
            </Button>
          </div>
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {adbServerUrl ? (
                <span className="flex items-center gap-1">
                  <Check className="w-3 h-3 text-neon-green" />
                  Active: {adbServerUrl}
                </span>
              ) : (
                'No URL configured'
              )}
            </span>
            {lastUpdated && (
              <span>Updated: {new Date(lastUpdated).toLocaleString()}</span>
            )}
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Smartphone className="w-6 h-6 text-neon-purple" />
          <h2 className="text-2xl font-bold text-glow">Connected Devices</h2>
        </div>
        <Button 
          onClick={() => setShowConnectionForm(!showConnectionForm)}
          className="bg-neon-purple hover:bg-neon-purple/80"
        >
          Add Device
        </Button>
      </div>

      {showConnectionForm && (
        <Card className="p-6 border-gaming-border bg-gaming-card">
          <h3 className="text-lg font-semibold mb-4 text-glow">Connect New Device</h3>
          <form onSubmit={handleConnect} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Device Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Android Phone"
                  className="bg-gaming-card border-gaming-border"
                />
              </div>
              <div>
                <Label htmlFor="deviceId">Device ID</Label>
                <Input
                  id="deviceId"
                  value={formData.deviceId}
                  onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                  placeholder="emulator-5554 or device serial"
                  className="bg-gaming-card border-gaming-border"
                />
              </div>
              <div>
                <Label htmlFor="platform">Platform</Label>
                <Select value={formData.platform} onValueChange={(value: 'android' | 'ios') => setFormData({ ...formData, platform: value })}>
                  <SelectTrigger className="bg-gaming-card border-gaming-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="android">Android</SelectItem>
                    <SelectItem value="ios">iOS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.platform === 'android' && (
                <>
                  <div>
                    <Label htmlFor="adbHost">ADB Host</Label>
                    <Input
                      id="adbHost"
                      value={formData.adbHost}
                      onChange={(e) => setFormData({ ...formData, adbHost: e.target.value })}
                      placeholder="localhost"
                      className="bg-gaming-card border-gaming-border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="adbPort">ADB Port</Label>
                    <Input
                      id="adbPort"
                      type="number"
                      value={formData.adbPort}
                      onChange={(e) => setFormData({ ...formData, adbPort: parseInt(e.target.value) })}
                      placeholder="5555"
                      className="bg-gaming-card border-gaming-border"
                    />
                  </div>
                </>
              )}
              <div>
                <Label htmlFor="screenWidth">Screen Width</Label>
                <Input
                  id="screenWidth"
                  type="number"
                  value={formData.screenWidth}
                  onChange={(e) => setFormData({ ...formData, screenWidth: parseInt(e.target.value) })}
                  className="bg-gaming-card border-gaming-border"
                />
              </div>
              <div>
                <Label htmlFor="screenHeight">Screen Height</Label>
                <Input
                  id="screenHeight"
                  type="number"
                  value={formData.screenHeight}
                  onChange={(e) => setFormData({ ...formData, screenHeight: parseInt(e.target.value) })}
                  className="bg-gaming-card border-gaming-border"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={isLoading}
                className="bg-neon-green hover:bg-neon-green/80 text-gaming-bg"
              >
                {isLoading ? 'Connecting...' : 'Connect Device'}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowConnectionForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.map((device) => (
          <Card key={device.id} className="p-4 border-gaming-border bg-gaming-card">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-neon-purple" />
                <h3 className="font-semibold text-glow">{device.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${getStatusColor(device.status)} text-gaming-bg border-0`}>
                  <div className="flex items-center gap-1">
                    {getStatusIcon(device.status)}
                    {device.status}
                  </div>
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRefreshStatus(device)}
                  className="h-8 w-8 hover:bg-neon-green/10"
                  title="Refresh status"
                >
                  <RefreshCw className="w-4 h-4 text-neon-green" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteDevice(device.id, device.name)}
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>ID: {device.device_id}</div>
              <div>Platform: {device.platform}</div>
              {device.screen_width && device.screen_height && (
                <div>Resolution: {device.screen_width}x{device.screen_height}</div>
              )}
              <div>Last seen: {new Date(device.last_seen).toLocaleString()}</div>
            </div>
          </Card>
        ))}
      </div>

      {devices.length === 0 && !showConnectionForm && (
        <Card className="p-8 text-center border-gaming-border bg-gaming-card">
          <Smartphone className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Devices Connected</h3>
          <p className="text-muted-foreground mb-4">
            Connect your Android or iOS device to start automating mobile games
          </p>
          <Button 
            onClick={() => setShowConnectionForm(true)}
            className="bg-neon-purple hover:bg-neon-purple/80"
          >
            Connect First Device
          </Button>
        </Card>
      )}
    </div>
  )
}
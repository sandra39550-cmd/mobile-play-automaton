import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

interface Device {
  id: string
  name: string
  device_id: string
  platform: string
  status: string
  screen_width?: number
  screen_height?: number
  last_seen: string
  adb_host?: string
  adb_port?: number
  android_version?: string
  ios_version?: string
  created_at: string
  updated_at: string
  user_id: string
}

interface BotSession {
  id: string
  device_id: string
  game_name: string
  package_name: string
  status: string
  actions_performed: number
  runtime_minutes: number
  level_progress: number
  currency_earned: number
  error_message?: string
  config?: any
  created_at: string
  updated_at: string
  user_id: string
}

export const useDeviceAutomation = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [sessions, setSessions] = useState<BotSession[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load devices and sessions
  useEffect(() => {
    loadDevices()
    loadSessions()
    
    // Set up real-time subscriptions
    const devicesChannel = supabase
      .channel('devices-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, 
        () => loadDevices())
      .subscribe()

    const sessionsChannel = supabase
      .channel('sessions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_sessions' }, 
        () => loadSessions())
      .subscribe()

    return () => {
      supabase.removeChannel(devicesChannel)
      supabase.removeChannel(sessionsChannel)
    }
  }, [])

  const loadDevices = async () => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .order('last_seen', { ascending: false })

      if (error) throw error
      setDevices(data || [])
    } catch (error) {
      console.error('Error loading devices:', error)
      toast.error('Failed to load devices')
    }
  }

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('bot_sessions')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setSessions(data || [])
    } catch (error) {
      console.error('Error loading sessions:', error)
      toast.error('Failed to load bot sessions')
    }
  }

  const connectDevice = async (deviceInfo: {
    name: string
    deviceId: string
    platform: 'android' | 'ios'
    adbHost?: string
    adbPort?: number
    screenWidth?: number
    screenHeight?: number
  }) => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'connect_device',
          payload: deviceInfo
        }
      })

      if (error) throw error

      if (data.success) {
        toast.success(`Device "${deviceInfo.name}" connected successfully`)
        await loadDevices()
        return data.device
      } else {
        toast.error('Failed to connect device')
        return null
      }
    } catch (error) {
      console.error('Error connecting device:', error)
      toast.error('Failed to connect device')
      return null
    } finally {
      setIsLoading(false)
    }
  }

  const startBotSession = async (sessionData: {
    deviceId: string
    gameName: string
    packageName: string
    config?: any
  }) => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'start_bot_session',
          payload: sessionData
        }
      })

      if (error) throw error

      if (data.success) {
        toast.success(`Bot started for ${sessionData.gameName}`)
        await loadSessions()
        return data.session
      } else {
        toast.error('Failed to start bot session')
        return null
      }
    } catch (error) {
      console.error('Error starting bot session:', error)
      toast.error('Failed to start bot session')
      return null
    } finally {
      setIsLoading(false)
    }
  }

  const stopBotSession = async (sessionId: string) => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'stop_bot_session',
          payload: { sessionId }
        }
      })

      if (error) throw error

      if (data.success) {
        toast.success('Bot session stopped')
        await loadSessions()
        return data.session
      } else {
        toast.error('Failed to stop bot session')
        return null
      }
    } catch (error) {
      console.error('Error stopping bot session:', error)
      toast.error('Failed to stop bot session')
      return null
    } finally {
      setIsLoading(false)
    }
  }

  const executeAction = async (sessionId: string, action: {
    type: 'tap' | 'swipe' | 'screenshot' | 'open_app' | 'close_app'
    coordinates?: { x: number; y: number }
    swipeDirection?: 'up' | 'down' | 'left' | 'right'
    packageName?: string
  }) => {
    try {
      const { data, error } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'execute_action',
          payload: { ...action, sessionId }
        }
      })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error executing action:', error)
      toast.error('Failed to execute action')
      return null
    }
  }

  const getDeviceScreenshot = async (deviceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'get_device_screenshot',
          payload: { deviceId }
        }
      })

      if (error) throw error
      return data.screenshot
    } catch (error) {
      console.error('Error getting screenshot:', error)
      toast.error('Failed to get screenshot')
      return null
    }
  }

  return {
    devices,
    sessions,
    isLoading,
    connectDevice,
    startBotSession,
    stopBotSession,
    executeAction,
    getDeviceScreenshot,
    loadDevices,
    loadSessions
  }
}
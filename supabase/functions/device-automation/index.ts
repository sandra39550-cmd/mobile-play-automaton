import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeviceAction {
  type: 'tap' | 'swipe' | 'screenshot' | 'install_app' | 'open_app' | 'close_app'
  coordinates?: { x: number; y: number }
  swipeDirection?: 'up' | 'down' | 'left' | 'right'
  packageName?: string
  duration?: number
}

interface GameBot {
  sessionId: string
  deviceId: string
  gameName: string
  packageName: string
  actions: DeviceAction[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { action, payload } = await req.json()
    console.log(`Device automation action: ${action}`, payload)

    // Use NULL for user_id since we removed authentication
    const defaultUserId = null

    switch (action) {
      case 'connect_device':
        return await connectDevice(supabaseClient, defaultUserId, payload)
      case 'start_bot_session':
        return await startBotSession(supabaseClient, defaultUserId, payload)
      case 'execute_action':
        return await executeDeviceAction(supabaseClient, payload)
      case 'get_device_screenshot':
        return await getDeviceScreenshot(supabaseClient, payload.deviceId)
      case 'stop_bot_session':
        return await stopBotSession(supabaseClient, payload.sessionId)
      case 'scan_device_games':
        return await scanDeviceGames(supabaseClient, payload.deviceId)
      case 'check_device_status':
        return await checkDeviceStatus(supabaseClient, payload.deviceId)
      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
  } catch (error) {
    console.error('Device automation error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function connectDevice(supabaseClient: any, userId: string, deviceInfo: any) {
  console.log('Connecting device:', deviceInfo)
  
  // Check device connection via ADB for Android or iOS tools
  const connectionInfo = await simulateDeviceConnection(deviceInfo)
  
  // Check if device already exists
  const { data: existingDevice } = await supabaseClient
    .from('devices')
    .select('id')
    .eq('device_id', deviceInfo.deviceId)
    .single()

  let data, error
  
  if (existingDevice) {
    // Update existing device
    const result = await supabaseClient
      .from('devices')
      .update({
        name: deviceInfo.name,
        status: connectionInfo.connected ? 'online' : 'offline',
      adb_host: deviceInfo.adbHost,
      adb_port: deviceInfo.adbPort,
      screen_width: deviceInfo.screenWidth,
      screen_height: deviceInfo.screenHeight,
      connection_type: connectionInfo.connectionType,
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString()
      })
      .eq('device_id', deviceInfo.deviceId)
      .select()
      .single()
    
    data = result.data
    error = result.error
  } else {
    // Insert new device
    const result = await supabaseClient
      .from('devices')
      .insert({
        user_id: userId,
        name: deviceInfo.name,
        device_id: deviceInfo.deviceId,
        platform: deviceInfo.platform,
        status: connectionInfo.connected ? 'online' : 'offline',
        connection_type: connectionInfo.connectionType,
        adb_host: deviceInfo.adbHost,
        adb_port: deviceInfo.adbPort,
        screen_width: deviceInfo.screenWidth,
        screen_height: deviceInfo.screenHeight,
        android_version: deviceInfo.androidVersion,
        ios_version: deviceInfo.iosVersion,
        last_seen: new Date().toISOString()
      })
      .select()
      .single()
    
    data = result.data
    error = result.error
  }

  if (error) throw error

  return new Response(JSON.stringify({ 
    success: true, 
    device: data,
    connected: deviceStatus
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function startBotSession(supabaseClient: any, userId: string, sessionData: any) {
  console.log('Starting bot session:', sessionData)
  
  // Verify device exists and is online (no user_id check since auth is disabled)
  const { data: device, error: deviceError } = await supabaseClient
    .from('devices')
    .select('*')
    .eq('id', sessionData.deviceId)
    .single()

  if (deviceError || !device) {
    console.error('Device lookup error:', deviceError)
    throw new Error('Device not found or offline')
  }

  if (device.status !== 'online') {
    throw new Error(`Device ${device.name} is ${device.status}`)
  }

  // Create bot session
  const { data: session, error } = await supabaseClient
    .from('bot_sessions')
    .insert({
      user_id: userId,
      device_id: sessionData.deviceId,
      game_name: sessionData.gameName,
      package_name: sessionData.packageName,
      status: 'running',
      config: sessionData.config || {}
    })
    .select()
    .single()

  if (error) throw error

  // Start the actual bot automation
  startGameAutomation(session, device)

  return new Response(JSON.stringify({ 
    success: true, 
    session: session
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function executeDeviceAction(supabaseClient: any, actionData: DeviceAction & { sessionId: string }) {
  console.log('Executing device action:', actionData)
  
  // Record the action in database
  const startTime = Date.now()
  
  // Simulate executing the action on the real device
  const result = await simulateDeviceAction(actionData)
  
  const executionTime = Date.now() - startTime
  
  // Log the action
  await supabaseClient
    .from('bot_actions')
    .insert({
      session_id: actionData.sessionId,
      action_type: actionData.type,
      coordinates: actionData.coordinates,
      success: result.success,
      execution_time_ms: executionTime
    })

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function getDeviceScreenshot(supabaseClient: any, deviceId: string) {
  console.log('Taking screenshot for device:', deviceId)
  
  // Simulate taking a screenshot from the device
  const screenshot = await simulateScreenshot(deviceId)
  
  return new Response(JSON.stringify({ 
    success: true, 
    screenshot: screenshot // Base64 encoded image
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function stopBotSession(supabaseClient: any, sessionId: string) {
  console.log('Stopping bot session:', sessionId)
  
  const { data, error } = await supabaseClient
    .from('bot_sessions')
    .update({ 
      status: 'stopped',
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .select()
    .single()

  if (error) throw error

  return new Response(JSON.stringify({ 
    success: true, 
    session: data
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// Check device status via ADB
async function checkDeviceStatus(supabaseClient: any, deviceId: string) {
  console.log('Checking device status via ADB:', deviceId)
  
  try {
    // Get device from database
    const { data: device, error: deviceError } = await supabaseClient
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .single()

    if (deviceError || !device) {
      throw new Error('Device not found')
    }

    // Check if device is actually connected via ADB
    const connectionInfo = await checkADBConnection(device.device_id)
    
    // Update device status and connection type in database
    const newStatus = connectionInfo.connected ? 'online' : 'offline'
    await supabaseClient
      .from('devices')
      .update({ 
        status: newStatus,
        connection_type: connectionInfo.connectionType,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', deviceId)

    console.log(`Device ${device.device_id} status: ${newStatus} (${connectionInfo.connectionType})`)

    return new Response(JSON.stringify({ 
      success: true, 
      status: newStatus,
      deviceId: device.device_id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error checking device status:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Check if device is connected via ADB and return connection details
async function checkADBConnection(deviceId: string): Promise<{ connected: boolean; connectionType: string }> {
  try {
    const adbServerUrl = Deno.env.get('ADB_SERVER_URL')
    if (!adbServerUrl) {
      console.warn('ADB_SERVER_URL not configured, cannot check device status')
      return { connected: false, connectionType: 'unknown' }
    }

    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    const statusUrl = `${baseUrl}/devices`
    
    console.log('Checking ADB connected devices at:', statusUrl)
    
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
    
    if (!response.ok) {
      console.error('Failed to get ADB devices:', response.status, await response.text())
      return { connected: false, connectionType: 'unknown' }
    }
    
    const result = await response.json()
    const connectedDevices = result.devices || []
    
    console.log('Connected devices via ADB:', connectedDevices)
    
    // Find our device and determine connection type
    const device = connectedDevices.find((d: any) => {
      const matchesSerial = d.id === deviceId || d.serial === deviceId
      const isReady = d.state === 'device' // Only count devices that are ready/authorized
      return matchesSerial && isReady
    })
    
    if (device) {
      // Determine if USB or wireless based on connection string
      // USB devices typically show as just serial number
      // Wireless devices show as IP:port (e.g., "192.168.1.100:5555")
      const connectionType = (device.id || device.serial || '').includes(':') ? 'wireless' : 'usb'
      console.log(`Device ${deviceId} connected via ${connectionType.toUpperCase()}`)
      return { connected: true, connectionType }
    }
    
    console.log(`Device ${deviceId} is OFFLINE`)
    return { connected: false, connectionType: 'unknown' }
  } catch (error) {
    console.error('Error checking ADB connection:', error.message)
    return { connected: false, connectionType: 'unknown' }
  }
}

// Real ADB device connection functions
async function simulateDeviceConnection(deviceInfo: any): Promise<{ connected: boolean; connectionType: string }> {
  try {
    const adbServerUrl = Deno.env.get('ADB_SERVER_URL')
    if (!adbServerUrl) {
      console.warn('ADB_SERVER_URL not configured, treating device as online')
      // If no ADB server, assume USB tethered devices are online
      return { connected: true, connectionType: 'usb' }
    }

    console.log('Connecting to real device:', deviceInfo.deviceId)
    
    // Ensure URL has protocol
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    const connectUrl = `${baseUrl}/connect`
    
    try {
      const response = await fetch(connectUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: deviceInfo.adbHost || 'localhost',
          port: deviceInfo.adbPort || 5555,
          deviceId: deviceInfo.deviceId
        })
      })
      
      if (!response.ok) {
        console.error('Failed to connect to ADB server:', await response.text())
        // Check actual device status instead of assuming online
        return await checkADBConnection(deviceInfo.deviceId)
      }
      
      const result = await response.json()
      console.log('Device connection result:', result)
      
      // Verify device is actually connected
      return await checkADBConnection(deviceInfo.deviceId)
    } catch (fetchError) {
      console.error('Error connecting to ADB server:', fetchError)
      // Check actual device status
      return await checkADBConnection(deviceInfo.deviceId)
    }
  } catch (error) {
    console.error('Error in device connection:', error)
    return { connected: false, connectionType: 'unknown' }
  }
}

async function simulateDeviceAction(action: DeviceAction): Promise<{ success: boolean; result?: any }> {
  try {
    const adbServerUrl = Deno.env.get('ADB_SERVER_URL')
    if (!adbServerUrl) {
      console.warn('ADB_SERVER_URL not configured, using simulation mode')
      await new Promise(resolve => setTimeout(resolve, 500))
      return { success: true, result: `Simulated ${action.type}` }
    }

    console.log('Executing real device action:', action.type)
    
    // Ensure URL has protocol
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    const actionUrl = `${baseUrl}/action`
    const response = await fetch(actionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action)
    })
    
    if (!response.ok) {
      console.error('Failed to execute action:', await response.text())
      return { success: false, result: 'Action failed' }
    }
    
    const result = await response.json()
    console.log('Action result:', result)
    return result
  } catch (error) {
    console.error('Error executing device action:', error)
    return { success: false, result: error.message }
  }
}

async function simulateScreenshot(deviceId: string): Promise<string> {
  try {
    const adbServerUrl = Deno.env.get('ADB_SERVER_URL')
    if (!adbServerUrl) {
      console.warn('ADB_SERVER_URL not configured, using placeholder')
      await new Promise(resolve => setTimeout(resolve, 2000))
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    }

    console.log('Taking real screenshot from device:', deviceId)
    
    // Ensure URL has protocol
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    const screenshotUrl = `${baseUrl}/screenshot`
    const response = await fetch(screenshotUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId })
    })
    
    if (!response.ok) {
      console.error('Failed to take screenshot:', await response.text())
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    }
    
    const result = await response.json()
    return result.screenshot || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  } catch (error) {
    console.error('Error taking screenshot:', error)
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  }
}

async function scanDeviceGames(supabaseClient: any, deviceId: string) {
  console.log('Scanning games on device:', deviceId)
  
  // Verify device is online
  const { data: device, error: deviceError } = await supabaseClient
    .from('devices')
    .select('*')
    .eq('id', deviceId)
    .single()

  if (deviceError || !device) {
    throw new Error('Device not found or offline')
  }

  // Simulate scanning installed games on the device
  const installedGames = await simulateGameScan(device)
  
  return new Response(JSON.stringify({ 
    success: true, 
    games: installedGames
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function simulateGameScan(device: any): Promise<any[]> {
  try {
    const adbServerUrl = Deno.env.get('ADB_SERVER_URL')
    if (!adbServerUrl) {
      console.warn('ADB_SERVER_URL not configured, returning mock data')
      await new Promise(resolve => setTimeout(resolve, 2000))
      return [
        { name: "Candy Crush Saga", icon: "🍭", category: "Puzzle", packageName: "com.king.candycrushsaga" },
        { name: "Clash of Clans", icon: "⚔️", category: "Strategy", packageName: "com.supercell.clashofclans" },
        { name: "Pokemon GO", icon: "🎮", category: "Adventure", packageName: "com.nianticlabs.pokemongo" }
      ]
    }

    console.log('Scanning real games on device:', device.name)
    
    // Ensure URL has protocol
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    const scanUrl = `${baseUrl}/scan-apps`
    const response = await fetch(scanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        deviceId: device.device_id,
        category: 'games'
      })
    })
    
    if (!response.ok) {
      console.error('Failed to scan games:', await response.text())
      console.log('Returning mock games data as fallback')
      return [
        { name: "Candy Crush Saga", icon: "🍭", category: "Puzzle", packageName: "com.king.candycrushsaga" },
        { name: "Clash of Clans", icon: "⚔️", category: "Strategy", packageName: "com.supercell.clashofclans" },
        { name: "Pokemon GO", icon: "🎮", category: "Adventure", packageName: "com.nianticlabs.pokemongo" }
      ]
    }
    
    const result = await response.json()
    console.log('Scanned games:', result.apps)
    
    // Map game apps to expected format
    return (result.apps || []).map((app: any) => ({
      name: app.name || app.packageName,
      icon: "🎮",
      category: app.category || "Game",
      packageName: app.packageName
    }))
  } catch (error) {
    console.error('Error scanning games:', error)
    console.log('Returning mock games data as fallback')
    return [
      { name: "Candy Crush Saga", icon: "🍭", category: "Puzzle", packageName: "com.king.candycrushsaga" },
      { name: "Clash of Clans", icon: "⚔️", category: "Strategy", packageName: "com.supercell.clashofclans" },
      { name: "Pokemon GO", icon: "🎮", category: "Adventure", packageName: "com.nianticlabs.pokemongo" }
    ]
  }
}

async function startGameAutomation(session: any, device: any) {
  console.log('Starting game automation for:', session.game_name)
  
  try {
    const adbServerUrl = Deno.env.get('ADB_SERVER_URL')
    
    // Define automation actions for the game
    const actions = [
      { type: 'open_app', packageName: session.package_name },
      { type: 'screenshot' },
      { type: 'tap', coordinates: { x: device.screen_width / 2, y: device.screen_height / 2 } },
      { type: 'swipe', swipeDirection: 'up', duration: 300 }
    ]
    
    // Execute actions on the real device
    for (const action of actions) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      console.log('Executing automated action:', action.type)
      
      if (adbServerUrl) {
        const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
        const actionUrl = `${baseUrl}/action`
        
        try {
          const actionPayload = {
            deviceId: device.device_id,
            ...action
          }
          
          const response = await fetch(actionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(actionPayload)
          })
          
          if (response.ok) {
            const result = await response.json()
            console.log(`Action ${action.type} executed:`, result)
          } else {
            console.error(`Failed to execute ${action.type}:`, await response.text())
          }
        } catch (error) {
          console.error(`Error executing ${action.type}:`, error)
        }
      } else {
        console.log(`Simulated action: ${action.type}`)
      }
    }
    
    console.log('Game automation sequence completed for:', session.game_name)
  } catch (error) {
    console.error('Error in game automation:', error)
  }
}
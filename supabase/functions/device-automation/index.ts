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
  
  // Simulate device connection via ADB for Android or iOS tools
  const deviceStatus = await simulateDeviceConnection(deviceInfo)
  
  const { data, error } = await supabaseClient
    .from('devices')
    .upsert({
      user_id: userId,
      name: deviceInfo.name,
      device_id: deviceInfo.deviceId,
      platform: deviceInfo.platform,
      status: deviceStatus ? 'online' : 'offline',
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
  
  // Verify device is online
  const { data: device, error: deviceError } = await supabaseClient
    .from('devices')
    .select('*')
    .eq('id', sessionData.deviceId)
    .eq('user_id', userId)
    .single()

  if (deviceError || !device) {
    throw new Error('Device not found or offline')
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

// Simulation functions for device automation
async function simulateDeviceConnection(deviceInfo: any): Promise<boolean> {
  // In real implementation, this would use ADB for Android or libimobiledevice for iOS
  console.log('Simulating device connection for:', deviceInfo.deviceId)
  
  // Simulate network call to device
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  // Return true if connection successful
  return Math.random() > 0.2 // 80% success rate
}

async function simulateDeviceAction(action: DeviceAction): Promise<{ success: boolean; result?: any }> {
  console.log('Simulating device action:', action.type)
  
  // Simulate action execution time
  await new Promise(resolve => setTimeout(resolve, 500))
  
  switch (action.type) {
    case 'tap':
      return { success: true, result: `Tapped at ${action.coordinates?.x}, ${action.coordinates?.y}` }
    case 'swipe':
      return { success: true, result: `Swiped ${action.swipeDirection}` }
    case 'screenshot':
      return { success: true, result: 'Screenshot taken' }
    case 'open_app':
      return { success: true, result: `Opened app ${action.packageName}` }
    default:
      return { success: false, result: 'Unknown action' }
  }
}

async function simulateScreenshot(deviceId: string): Promise<string> {
  // In real implementation, this would capture the actual device screen
  // For now, return a placeholder base64 image
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Return a small placeholder image as base64
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
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
  console.log('Simulating game scan for device:', device.name)
  
  // Simulate scanning time
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Always include Candy Crush since user has it installed
  const candyCrush = { name: "Candy Crush", icon: "🍭", category: "Puzzle", packageName: "com.king.candycrushsaga" }
  
  // Other popular games that might be on the device
  const otherGames = [
    { name: "Clash Royale", icon: "⚔️", category: "Strategy", packageName: "com.supercell.clashroyale" },
    { name: "Pokemon GO", icon: "🎮", category: "Adventure", packageName: "com.nianticlabs.pokemongo" },
    { name: "Coin Master", icon: "🪙", category: "Casino", packageName: "com.moonactive.coinmaster" },
    { name: "PUBG Mobile", icon: "🔫", category: "Battle Royale", packageName: "com.tencent.ig" },
    { name: "Subway Surfers", icon: "🚇", category: "Endless Runner", packageName: "com.kiloo.subwaysurf" },
  ]
  
  // Randomly return 2-4 additional games plus Candy Crush
  const numGames = Math.floor(Math.random() * 3) + 2
  const shuffled = otherGames.sort(() => 0.5 - Math.random())
  return [candyCrush, ...shuffled.slice(0, numGames)]
}

async function startGameAutomation(session: any, device: any) {
  console.log('Starting game automation for:', session.game_name)
  
  // This would contain the actual AI logic for playing the game
  // For now, we'll just simulate some actions
  const actions = [
    { type: 'open_app', packageName: session.package_name },
    { type: 'screenshot' },
    { type: 'tap', coordinates: { x: 500, y: 800 } },
    { type: 'swipe', swipeDirection: 'up' }
  ]
  
  // Execute actions with delays
  for (const action of actions) {
    await new Promise(resolve => setTimeout(resolve, 3000))
    console.log('Executing automated action:', action.type)
  }
}
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ngrok free plan may show an interstitial unless we send this header.
const ngrokBypassHeaders = {
  'ngrok-skip-browser-warning': 'true',
}

interface DeviceAction {
  type: 'tap' | 'swipe' | 'screenshot' | 'install_app' | 'open_app' | 'close_app'
  coordinates?: { x: number; y: number }
  swipeDirection?: 'up' | 'down' | 'left' | 'right'
  packageName?: string
  duration?: number
  deviceId?: string
}

interface GameBot {
  sessionId: string
  deviceId: string
  gameName: string
  packageName: string
  actions: DeviceAction[]
}

// STRICT WHITELIST: Only games visible on user's home screen
// Add new games here as they are installed on the device home screen
const HOME_SCREEN_GAMES: { [packageName: string]: { name: string; icon: string; category: string } } = {
  'funvent.tilepark': { name: 'Tile Park', icon: '🧩', category: 'Puzzle' },
  'com.fungames.poolbilliard': { name: 'Pool Billiard', icon: '🎱', category: 'Sports' },
  'com.pm.billiard': { name: 'Pool Billiard', icon: '🎱', category: 'Sports' },
  'com.pool.billiard': { name: 'Pool Billiard', icon: '🎱', category: 'Sports' },
  // Fallback patterns for billiard games
}

// Patterns for detecting billiard/pool games (case insensitive)
const BILLIARD_PATTERNS = [
  /pool/i,
  /billiard/i,
  /8ball/i,
  /snooker/i,
]

// Check if a package is a home screen game
function isHomeScreenGame(pkg: string): { isGame: boolean; info?: { name: string; icon: string; category: string } } {
  // Check exact match first
  if (HOME_SCREEN_GAMES[pkg]) {
    return { isGame: true, info: HOME_SCREEN_GAMES[pkg] }
  }
  
  // Check tilepark pattern
  if (pkg.toLowerCase().includes('tilepark')) {
    return { isGame: true, info: { name: 'Tile Park', icon: '🧩', category: 'Puzzle' } }
  }
  
  // Check billiard/pool patterns
  if (BILLIARD_PATTERNS.some(pattern => pattern.test(pkg))) {
    return { isGame: true, info: { name: 'Pool Billiard', icon: '🎱', category: 'Sports' } }
  }
  
  return { isGame: false }
}

// Filter packages to only return home screen games
function filterGamePackages(packages: string[]): { packageName: string; name: string; icon: string; category: string }[] {
  const games: { packageName: string; name: string; icon: string; category: string }[] = []

  for (const pkg of packages) {
    const result = isHomeScreenGame(pkg)
    if (result.isGame && result.info) {
      games.push({
        packageName: pkg,
        name: result.info.name,
        icon: result.info.icon,
        category: result.info.category,
      })
    }
  }

  console.log(`🎮 Filtered ${packages.length} packages down to ${games.length} home screen games`)
  return games
}

function formatPackageName(pkg: string): string {
  const parts = pkg.split('.')
  const lastPart = parts[parts.length - 1]
  
  return lastPart
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

// Get ADB server URL from database (auto-detected) or fallback to env var
async function getAdbServerUrl(supabaseClient: any): Promise<string> {
  try {
    const { data, error } = await supabaseClient
      .from('adb_server_config')
      .select('server_url')
      .eq('is_active', true)
      .order('last_updated', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data?.server_url) {
      console.log('📡 Using auto-detected ADB server URL from database:', data.server_url)
      return data.server_url
    }

    const envUrl = Deno.env.get('ADB_SERVER_URL')
    if (envUrl) {
      console.log('⚙️  Using ADB server URL from environment variable:', envUrl)
      return envUrl
    }

    throw new Error('ADB server URL not found. Please start your ADB server with ngrok, or manually set ADB_SERVER_URL.')
  } catch (error) {
    console.error('Error getting ADB server URL:', error)
    throw error
  }
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
      case 'update_device':
        return await updateDevice(supabaseClient, payload)
      case 'run_bot_loop':
        return await runBotLoop(supabaseClient, payload.sessionId, payload.deviceId, payload.iterations || 1)
      case 'execute_tap':
        return await executeTapAction(supabaseClient, payload.deviceId, payload.x, payload.y)
      case 'analyze_screen':
        return await analyzeScreenWithAI(supabaseClient, payload.deviceId, payload.gameName)
      case 'perceive':
        return await perceiveScene(supabaseClient, payload.deviceId, payload.gameName)
      case 'reason':
        return await reasonAboutScene(supabaseClient, payload.perception, payload.gameName, payload.objective, payload.actionHistory)
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
  
  let realDeviceId = deviceInfo.deviceId
  const adbServerUrl = await getAdbServerUrl(supabaseClient)
  
  if (adbServerUrl) {
    try {
      const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
      const devicesResponse = await fetch(`${baseUrl}/devices`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000)
      })
      
      if (devicesResponse.ok) {
        const devicesResult = await devicesResponse.json()
        const connectedDevices = devicesResult.devices || []
        
        if (connectedDevices.length > 0) {
          realDeviceId = connectedDevices[0].id
          console.log(`Using real ADB device ID: ${realDeviceId}`)
        }
      }
    } catch (error) {
      console.error('Error fetching real device ID:', error)
    }
  }
  
  const deviceStatus = await checkADBConnection(realDeviceId, supabaseClient)
  
  const { data: existingDevice } = await supabaseClient
    .from('devices')
    .select('id')
    .eq('name', deviceInfo.name)
    .maybeSingle()

  let data, error
  
  if (existingDevice) {
    const result = await supabaseClient
      .from('devices')
      .update({
        device_id: realDeviceId,
        status: deviceStatus ? 'online' : 'offline',
        adb_host: deviceInfo.adbHost,
        adb_port: deviceInfo.adbPort,
        screen_width: deviceInfo.screenWidth,
        screen_height: deviceInfo.screenHeight,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', existingDevice.id)
      .select()
      .single()
    
    data = result.data
    error = result.error
  } else {
    const result = await supabaseClient
      .from('devices')
      .insert({
        user_id: userId,
        name: deviceInfo.name,
        device_id: realDeviceId,
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
  
  let device = null
  let deviceError = null
  
  // First try by UUID id
  const { data: deviceById, error: errorById } = await supabaseClient
    .from('devices')
    .select('*')
    .eq('id', sessionData.deviceId)
    .maybeSingle()
  
  if (deviceById) {
    device = deviceById
  } else {
    // Fallback: try by hardware device_id
    const { data: deviceByHwId, error: errorByHwId } = await supabaseClient
      .from('devices')
      .select('*')
      .eq('device_id', sessionData.deviceId)
      .maybeSingle()
    
    device = deviceByHwId
    deviceError = errorByHwId
  }

  if (!device) {
    console.error('Device lookup error:', deviceError)
    throw new Error(`Device not found: ${sessionData.deviceId}`)
  }

  if (device.status !== 'online') {
    throw new Error(`Device ${device.name} is ${device.status}`)
  }

  // Create bot session using the database UUID (device.id)
  const { data: session, error } = await supabaseClient
    .from('bot_sessions')
    .insert({
      user_id: userId,
      device_id: device.id,
      game_name: sessionData.gameName,
      package_name: sessionData.packageName,
      status: 'running',
      config: sessionData.config || {}
    })
    .select()
    .single()

  if (error) throw error

  // Launch the game on the device - pass hardware device_id
  const launchResult = await launchGameOnDevice(supabaseClient, device, sessionData.packageName)
  
  console.log('Game launch result:', launchResult)

  return new Response(JSON.stringify({ 
    success: true, 
    session: session,
    launched: launchResult.success,
    launchMessage: launchResult.message,
    hardwareDeviceId: device.device_id  // Return hardware ID for bot loop
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function executeDeviceAction(supabaseClient: any, actionData: DeviceAction & { sessionId: string }) {
  console.log('Executing device action:', actionData)
  
  const startTime = Date.now()
  const result = await simulateDeviceAction(actionData, supabaseClient)
  const executionTime = Date.now() - startTime
  
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
  
  const screenshot = await simulateScreenshot(deviceId, supabaseClient)
  
  return new Response(JSON.stringify({ 
    success: true, 
    screenshot: screenshot
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

async function checkDeviceStatus(supabaseClient: any, deviceId: string) {
  console.log('Checking device status via ADB:', deviceId)
  
  try {
    const { data: device, error: deviceError } = await supabaseClient
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .single()

    if (deviceError || !device) {
      throw new Error('Device not found')
    }

    const isConnected = await checkADBConnection(device.device_id, supabaseClient)
    
    const newStatus = isConnected ? 'online' : 'offline'
    await supabaseClient
      .from('devices')
      .update({ 
        status: newStatus,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', deviceId)

    console.log(`Device ${device.device_id} status updated to: ${newStatus}`)

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

async function checkADBConnection(deviceId: string, supabaseClient?: any): Promise<boolean> {
  try {
    let adbServerUrl: string | null = null
    
    if (supabaseClient) {
      try {
        adbServerUrl = await getAdbServerUrl(supabaseClient)
      } catch (error) {
        console.error('⚠️ Could not get ADB server URL:', error.message)
        return false
      }
    } else {
      adbServerUrl = Deno.env.get('ADB_SERVER_URL') || null
    }
    
    if (!adbServerUrl) {
      console.error('⚠️ ADB_SERVER_URL not configured')
      return false
    }

    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    const statusUrl = `${baseUrl}/devices`
    
    console.log('🔍 Checking ADB server for connected devices at:', statusUrl)
    
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...ngrokBypassHeaders },
      signal: AbortSignal.timeout(5000)
    })
    
    if (!response.ok) {
      console.error('❌ ADB server request failed:', response.status)
      return false
    }
    
    const result = await response.json()
    const connectedDevices = result.devices || []
    
    console.log('📱 Connected devices via ADB:', JSON.stringify(connectedDevices))
    
    const isConnected = connectedDevices.some((d: any) => {
      const matchesSerial = d.id === deviceId || d.serial === deviceId
      const isDevice = d.status === 'device' || d.type === 'device'
      return matchesSerial && isDevice
    })
    
    console.log(`✅ Device ${deviceId} status: ${isConnected ? '🟢 ONLINE' : '🔴 OFFLINE'}`)
    return isConnected
  } catch (error) {
    console.error('❌ Error checking device via ADB:', error.message)
    return false
  }
}

async function simulateDeviceAction(action: DeviceAction, supabaseClient?: any): Promise<{ success: boolean; result?: any }> {
  try {
    let adbServerUrl: string | null = null
    
    if (supabaseClient) {
      try {
        adbServerUrl = await getAdbServerUrl(supabaseClient)
      } catch (e) {
        adbServerUrl = Deno.env.get('ADB_SERVER_URL') || null
      }
    } else {
      adbServerUrl = Deno.env.get('ADB_SERVER_URL') || null
    }
    
    if (!adbServerUrl) {
      console.warn('ADB_SERVER_URL not configured, using simulation mode')
      await new Promise(resolve => setTimeout(resolve, 500))
      return { success: true, result: `Simulated ${action.type}` }
    }

    console.log('Executing real device action:', action.type, 'on device:', action.deviceId)
    
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    const actionUrl = `${baseUrl}/action`
    
    const response = await fetch(actionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ngrokBypassHeaders },
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

async function simulateScreenshot(deviceId: string, supabaseClient?: any): Promise<string> {
  try {
    let adbServerUrl: string | null = null
    
    if (supabaseClient) {
      try {
        adbServerUrl = await getAdbServerUrl(supabaseClient)
      } catch (e) {
        adbServerUrl = Deno.env.get('ADB_SERVER_URL') || null
      }
    } else {
      adbServerUrl = Deno.env.get('ADB_SERVER_URL') || null
    }
    
    if (!adbServerUrl) {
      console.warn('ADB_SERVER_URL not configured, using placeholder')
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    }

    console.log('Taking real screenshot from device:', deviceId)
    
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    const screenshotUrl = `${baseUrl}/screenshot`
    
    const response = await fetch(screenshotUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ngrokBypassHeaders },
      body: JSON.stringify({ deviceId })
    })
    
    if (!response.ok) {
      console.error('Failed to take screenshot:', await response.text())
      return ""
    }
    
    const result = await response.json()
    return result.screenshot || ""
  } catch (error) {
    console.error('Error taking screenshot:', error)
    return ""
  }
}

async function scanDeviceGames(supabaseClient: any, deviceId: string) {
  try {
    console.log('🎮 Scanning device for games:', deviceId)
    
    const adbServerUrl = await getAdbServerUrl(supabaseClient)
    
    const { data: device, error: deviceError } = await supabaseClient
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .single()

    if (deviceError || !device) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Device not found',
        games: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (device.status !== 'online') {
      return new Response(JSON.stringify({ 
        success: false,
        error: `Device ${device.name} is ${device.status}`,
        games: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const installedGames = await simulateGameScan(device, adbServerUrl)
    
    return new Response(JSON.stringify({ 
      success: true, 
      games: installedGames
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Scan failed:', error.message)
    
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      games: []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

async function simulateGameScan(device: any, adbServerUrl: string): Promise<any[]> {
  console.log(`🔍 Scanning real games on device: ${device.name} (device_id: ${device.device_id})`)
  
  if (!adbServerUrl) {
    throw new Error('ADB server not configured')
  }

  const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
  
  // Check if ADB server is reachable
  const healthPaths = ['/health', '/devices']
  let reachable = false

  for (const path of healthPaths) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: { ...ngrokBypassHeaders, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        reachable = true
        break
      }
    } catch (e) {
      console.warn(`Health check ${path} failed:`, e?.message)
    }
  }

  if (!reachable) {
    throw new Error(`ADB server is offline at ${baseUrl}`)
  }

  console.log('✅ ADB server is reachable')

  // Scan for games
  const scanUrl = `${baseUrl}/scan-apps`
  
  try {
    const response = await fetch(scanUrl, {
      method: 'POST',
      headers: { ...ngrokBypassHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: device.device_id, category: 'games' }),
      signal: AbortSignal.timeout(15000),
    })

    let allPackages: string[] = []

    if (!response.ok && response.status === 404) {
      // Fallback to GET
      const fallbackUrl = `${baseUrl}/scan-apps?deviceId=${encodeURIComponent(device.device_id)}&category=games`
      const fallbackRes = await fetch(fallbackUrl, {
        method: 'GET',
        headers: { ...ngrokBypassHeaders, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
      })

      if (!fallbackRes.ok) {
        throw new Error(`Scan failed: ${fallbackRes.status}`)
      }

      const result = await fallbackRes.json()
      // Extract package names from response
      if (result.apps) {
        allPackages = result.apps.map((app: any) => app.packageName || app)
      } else if (result.packages) {
        allPackages = result.packages
      }
    } else if (response.ok) {
      const result = await response.json()
      if (result.apps) {
        allPackages = result.apps.map((app: any) => app.packageName || app)
      } else if (result.packages) {
        allPackages = result.packages
      }
    } else {
      throw new Error(`Scan failed: ${response.status}`)
    }

    console.log(`📦 Total packages from device: ${allPackages.length}`)
    
    // Apply strict home screen game filtering
    const homeScreenGames = filterGamePackages(allPackages)
    
    return homeScreenGames.map((game) => ({
      name: game.name,
      icon: game.icon,
      category: game.category,
      packageName: game.packageName,
      isInstalled: true,
    }))
  } catch (error) {
    console.error('Scan error:', error)
    throw error
  }
}

async function launchGameOnDevice(supabaseClient: any, device: any, packageName: string): Promise<{ success: boolean; message: string }> {
  console.log(`🚀 Launching ${packageName} on device ${device.name} (${device.device_id})`)
  
  try {
    const adbServerUrl = await getAdbServerUrl(supabaseClient)
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    
    // Verify ADB server is reachable
    try {
      const healthResponse = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: { ...ngrokBypassHeaders, 'User-Agent': 'Lovable-Bot/1.0' },
        signal: AbortSignal.timeout(5000)
      })
      
      if (!healthResponse.ok) {
        return { success: false, message: 'ADB server is not responding' }
      }
    } catch (healthError) {
      return { success: false, message: `Cannot reach ADB server at ${baseUrl}` }
    }
    
    // Send open_app action to ADB server with deviceId
    const actionPayload = {
      type: 'open_app',
      packageName: packageName,
      deviceId: device.device_id  // CRITICAL: Include hardware device ID
    }
    
    console.log('📱 Sending launch command:', actionPayload)
    
    const response = await fetch(`${baseUrl}/action`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...ngrokBypassHeaders,
        'User-Agent': 'Lovable-Bot/1.0'
      },
      body: JSON.stringify(actionPayload),
      signal: AbortSignal.timeout(15000)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Failed to launch game:', errorText)
      return { success: false, message: `Failed to launch: ${errorText.substring(0, 200)}` }
    }
    
    const result = await response.json()
    console.log('✅ Game launched successfully:', result)
    
    return { success: true, message: `${packageName} launched on ${device.name}` }
  } catch (error) {
    console.error('❌ Error launching game:', error)
    return { success: false, message: error.message }
  }
}

async function updateDevice(supabaseClient: any, payload: { deviceId: string; updates: Record<string, any> }) {
  const { deviceId, updates } = payload
  
  if (!deviceId) {
    return new Response(JSON.stringify({ error: 'Device ID is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  
  const allowedFields = ['name', 'adb_host', 'adb_port']
  const sanitizedUpdates: Record<string, any> = {}
  
  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) {
      sanitizedUpdates[key] = updates[key]
    }
  }
  
  if (Object.keys(sanitizedUpdates).length === 0) {
    return new Response(JSON.stringify({ error: 'No valid fields to update' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  
  sanitizedUpdates.updated_at = new Date().toISOString()
  
  const { data, error } = await supabaseClient
    .from('devices')
    .update(sanitizedUpdates)
    .eq('id', deviceId)
    .select()
    .single()
  
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  
  return new Response(JSON.stringify({ success: true, device: data }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ============ AI VISION FUNCTIONS ============

// Analyze screen using AI vision
async function analyzeScreenWithAI(supabaseClient: any, deviceId: string, gameName: string) {
  console.log(`🔬 Analyzing screen for ${gameName} on device ${deviceId}`)
  
  try {
    const adbServerUrl = await getAdbServerUrl(supabaseClient)
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    
    // Take screenshot
    const screenshot = await takeRealScreenshot(baseUrl, deviceId)
    if (!screenshot) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to capture screenshot' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    // Analyze with AI
    const analysis = await analyzeScreenWithGemini(screenshot, gameName)
    
    return new Response(JSON.stringify({ 
      success: true,
      analysis,
      screenshotCaptured: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Screen analysis error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// ============ BOT AUTOMATION FUNCTIONS ============

// Run bot automation loop with AI vision
async function runBotLoop(supabaseClient: any, sessionId: string, hardwareDeviceId: string | null, iterations: number = 1) {
  console.log(`🤖 Starting bot loop for session ${sessionId}, iterations: ${iterations}`)
  
  try {
    // Get session with device info
    const { data: session, error: sessionError } = await supabaseClient
      .from('bot_sessions')
      .select('*, devices(*)')
      .eq('id', sessionId)
      .single()
    
    if (sessionError || !session) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    
    if (session.status !== 'running') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Session is ${session.status}, not running` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const device = session.devices
    if (!device || device.status !== 'online') {
      throw new Error('Device is offline')
    }
    
    // Use provided hardware ID or fall back to device.device_id
    const deviceId = hardwareDeviceId || device.device_id
    console.log(`📱 Using device ID for ADB: ${deviceId}`)
    
    const adbServerUrl = await getAdbServerUrl(supabaseClient)
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    
    const results: any[] = []
    let actionsPerformed = session.actions_performed || 0
    
    for (let i = 0; i < iterations; i++) {
      console.log(`🔄 Bot loop iteration ${i + 1}/${iterations}`)
      
      // 1. Take screenshot
      const screenshot = await takeRealScreenshot(baseUrl, deviceId)
      
      if (!screenshot || screenshot.length < 500) {
        console.warn(`⚠️ Screenshot invalid (length: ${screenshot?.length || 0}), skipping`)
        continue
      }
      
      console.log(`🖼️ Screenshot ready (${screenshot.length} chars), calling Gemini AI...`)
      
      // 2. Analyze screenshot with AI to find tile matches
      let analysis
      if (session.game_name.toLowerCase().includes('tile') || 
          session.package_name.toLowerCase().includes('tilepark')) {
        // Use AI vision for Tile Park
        analysis = await analyzeScreenWithGemini(screenshot, session.game_name)
        console.log(`🎯 AI result: ${analysis.description}`)
      } else {
        // Fallback to heuristic analysis
        analysis = analyzeScreenHeuristic(session.game_name)
      }
      
      // 3. Execute the recommended action
      if (analysis.action) {
        const coords = analysis.action.coordinates
        console.log(`👆 Tapping at (${coords?.x}, ${coords?.y})...`)
        
        // Add deviceId to the action
        const actionWithDevice = {
          ...analysis.action,
          deviceId: deviceId
        }
        
        const actionResult = await executeRealAction(baseUrl, actionWithDevice)
        actionsPerformed++
        console.log(`✅ Tap result: success=${actionResult.success}, time=${actionResult.executionTime}ms`)
        
        // Log the action
        await supabaseClient
          .from('bot_actions')
          .insert({
            session_id: sessionId,
            action_type: analysis.action.type,
            coordinates: analysis.action.coordinates,
            success: actionResult.success,
            execution_time_ms: actionResult.executionTime || 100
          })
        
        results.push({
          iteration: i + 1,
          action: analysis.action,
          result: actionResult,
          description: analysis.description
        })
      }
      
      // Small delay between iterations
      if (i < iterations - 1) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    }
    
    // Update session stats
    await supabaseClient
      .from('bot_sessions')
      .update({
        actions_performed: actionsPerformed,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
    
    console.log(`✅ Bot loop completed: ${results.length} actions performed`)
    
    return new Response(JSON.stringify({ 
      success: true,
      actionsPerformed: results.length,
      totalActions: actionsPerformed,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('❌ Bot loop error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Take a real screenshot from device
async function takeRealScreenshot(baseUrl: string, deviceId: string): Promise<string> {
  try {
    console.log(`📸 Taking screenshot from device: ${deviceId}`)

    // Prefer POST (JSON body), but allow GET fallback for tunnels/proxies that block POST.
    const postResponse = await fetch(`${baseUrl}/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...ngrokBypassHeaders,
      },
      body: JSON.stringify({ deviceId }),
      signal: AbortSignal.timeout(15000),
    })

    if (postResponse.ok) {
      const result = await postResponse.json()
      const screenshot = result.screenshot || ''
      if (screenshot && screenshot.length > 500) {
        console.log(`📸 Screenshot OK (POST): ${screenshot.length} chars`)
        return screenshot
      }
      console.warn(`⚠️ POST screenshot too short: ${screenshot.length} chars`)
    }

    if (!postResponse.ok) {
      console.error('Screenshot POST failed:', postResponse.status)
    }

    const url = new URL(`${baseUrl}/screenshot`)
    url.searchParams.set('deviceId', deviceId)

    const getResponse = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        ...ngrokBypassHeaders,
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!getResponse.ok) {
      console.error('Screenshot GET failed:', getResponse.status)
      return ''
    }

    const result = await getResponse.json()
    const screenshot = result.screenshot || ''
    if (screenshot && screenshot.length > 500) {
      console.log(`📸 Screenshot OK (GET): ${screenshot.length} chars`)
      return screenshot
    }
    console.warn(`⚠️ GET screenshot too short: ${screenshot.length} chars`)
    return ''
  } catch (error) {
    console.error('Screenshot error:', error)
    return ''
  }
}

// Enhanced AI Vision Analysis for Tile Park game
async function analyzeScreenWithGemini(screenshotBase64: string, gameName: string): Promise<{
  action: DeviceAction | null
  description: string
  tiles?: any[]
}> {
  console.log(`🧠 Analyzing ${gameName} with Gemini AI Vision...`)
  
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  
  if (!LOVABLE_API_KEY) {
    console.warn('⚠️ LOVABLE_API_KEY not configured, using heuristic analysis')
    return analyzeScreenHeuristic(gameName)
  }
  
  // Validate screenshot
  if (!screenshotBase64 || screenshotBase64.length < 100) {
    console.warn('⚠️ Invalid screenshot, using heuristic')
    return analyzeScreenHeuristic(gameName)
  }
  
  const systemPrompt = `You are an expert game automation bot for the Tile Park tile-matching puzzle game.

GAME RULES:
- Tile Park shows a grid of tiles with icons (fruits, vegetables, shapes)
- Tap TWO identical tiles to match and remove them
- Tiles can only match if there's a clear path between them (max 2 corners)
- Clear all tiles to win the level

SCREEN LAYOUT (720x1280 pixels):
- Top area (y: 0-300): Score, timer, level info
- Game board (y: 350-950, x: 50-670): Tile grid
- Bottom area (y: 950+): Hints, settings buttons

TILE GRID:
- Tiles are ~80x80 pixels each
- Grid is typically 7-8 columns wide
- Tiles have distinct icons (🥕🍇🥑🍎🍊🫐🍋 etc.)

YOUR JOB:
1. Determine screen state: "menu", "playing", "level_complete", or "paused"
2. If "menu": tap the PLAY or START button (usually center, y: 600-900)
3. If "level_complete": tap NEXT button
4. If "playing": Find a matching pair and return the FIRST tile's coordinates

RESPOND WITH ONLY THIS JSON FORMAT:
{
  "gameState": "playing",
  "action": { "type": "tap", "x": 360, "y": 500 },
  "description": "Tapping carrot tile at row 2 col 4",
  "confidence": 0.85
}`
  
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this Tile Park screenshot. Return the exact x,y coordinates to tap.' },
              {
                type: 'image_url',
                image_url: { url: screenshotBase64 }
              }
            ]
          }
        ],
        max_tokens: 600,
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(25000)
    })
    
    if (!response.ok) {
      const errText = await response.text()
      console.error('❌ Gemini API error:', response.status, errText)
      return analyzeScreenHeuristic(gameName)
    }
    
    const result = await response.json()
    const content = result.choices?.[0]?.message?.content || ''
    
    console.log('🧠 Gemini response:', content.substring(0, 500))
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        console.log('✅ Parsed AI action:', JSON.stringify(parsed.action))
        
        if (parsed.action && typeof parsed.action.x === 'number' && typeof parsed.action.y === 'number') {
          // Clamp coordinates to valid screen area
          const x = Math.max(50, Math.min(670, Math.round(parsed.action.x)))
          const y = Math.max(200, Math.min(1100, Math.round(parsed.action.y)))
          
          console.log(`🎯 AI target: (${x}, ${y}) - ${parsed.description || 'tile tap'}`)
          
          return {
            action: { type: 'tap', coordinates: { x, y } },
            description: parsed.description || `AI tap at (${x}, ${y})`
          }
        }
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError)
      }
    }
    
    console.warn('⚠️ Using heuristic fallback')
    return analyzeScreenHeuristic(gameName)
  } catch (error) {
    console.error('❌ Gemini analysis error:', error)
    return analyzeScreenHeuristic(gameName)
  }
}

// Heuristic fallback for when AI is unavailable
function analyzeScreenHeuristic(gameName: string): {
  action: DeviceAction | null
  description: string
} {
  const lowerGame = gameName.toLowerCase()
  
  if (lowerGame.includes('tile') || lowerGame.includes('match') || lowerGame.includes('puzzle')) {
    // Tile Park grid positions (720x1280 screen)
    const tilePositions = [
      { x: 130, y: 430 }, { x: 210, y: 430 }, { x: 290, y: 430 }, { x: 370, y: 430 }, { x: 450, y: 430 }, { x: 530, y: 430 },
      { x: 130, y: 510 }, { x: 210, y: 510 }, { x: 290, y: 510 }, { x: 370, y: 510 }, { x: 450, y: 510 }, { x: 530, y: 510 },
      { x: 130, y: 590 }, { x: 210, y: 590 }, { x: 290, y: 590 }, { x: 370, y: 590 }, { x: 450, y: 590 }, { x: 530, y: 590 },
      { x: 130, y: 670 }, { x: 210, y: 670 }, { x: 290, y: 670 }, { x: 370, y: 670 }, { x: 450, y: 670 }, { x: 530, y: 670 },
      { x: 130, y: 750 }, { x: 210, y: 750 }, { x: 290, y: 750 }, { x: 370, y: 750 }, { x: 450, y: 750 }, { x: 530, y: 750 },
    ]
    const pos = tilePositions[Math.floor(Math.random() * tilePositions.length)]
    return {
      action: { type: 'tap', coordinates: pos },
      description: `Heuristic tap at (${pos.x}, ${pos.y})`
    }
  }
  
  // Pool/Billiard games
  if (lowerGame.includes('pool') || lowerGame.includes('billiard')) {
    const x = 300 + Math.floor(Math.random() * 120)
    const y = 640 + Math.floor(Math.random() * 200)
    
    return {
      action: {
        type: 'tap',
        coordinates: { x, y }
      },
      description: `Pool shot at (${x}, ${y})`
    }
  }
  
  // Default: tap center (for menus, play buttons, etc.)
  return {
    action: {
      type: 'tap',
      coordinates: { x: 360, y: 640 }
    },
    description: 'Tapping center of screen'
  }
}

// Execute a real action on device
async function executeRealAction(baseUrl: string, action: DeviceAction): Promise<{
  success: boolean
  executionTime: number
}> {
  const startTime = Date.now()
  
  try {
    console.log(`⚡ Executing action on device ${action.deviceId}:`, action.type, action.coordinates)
    
    const response = await fetch(`${baseUrl}/action`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...ngrokBypassHeaders,
        'User-Agent': 'Lovable-Bot/1.0'
      },
      body: JSON.stringify(action),
      signal: AbortSignal.timeout(5000)
    })
    
    const executionTime = Date.now() - startTime
    
    if (!response.ok) {
      console.error('Action failed:', await response.text())
      return { success: false, executionTime }
    }
    
    const result = await response.json()
    console.log(`✅ Action executed in ${executionTime}ms:`, result)
    
    return { success: result.success !== false, executionTime }
  } catch (error) {
    console.error('Action error:', error)
    return { success: false, executionTime: Date.now() - startTime }
  }
}

// ============ PERCEPTION LAYER (SIMA 2 Phase 1) ============

async function perceiveScene(supabaseClient: any, deviceId: string, gameName: string) {
  const startTime = Date.now()
  console.log(`👁️ PERCEIVE: Starting perception for ${gameName} on device ${deviceId}`)

  try {
    // 1. Resolve device
    let device = null
    const { data: deviceById } = await supabaseClient
      .from('devices').select('*').eq('id', deviceId).maybeSingle()
    if (deviceById) {
      device = deviceById
    } else {
      const { data: deviceByHwId } = await supabaseClient
        .from('devices').select('*').eq('device_id', deviceId).maybeSingle()
      device = deviceByHwId
    }

    if (!device) throw new Error('Device not found')
    if (device.status !== 'online') throw new Error(`Device is ${device.status}`)

    const hwDeviceId = device.device_id
    const adbServerUrl = await getAdbServerUrl(supabaseClient)
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`

    // 2. Capture screenshot
    const screenshot = await takeRealScreenshot(baseUrl, hwDeviceId)
    if (!screenshot || screenshot.length < 500) {
      throw new Error('Failed to capture valid screenshot')
    }
    console.log(`👁️ PERCEIVE: Screenshot captured (${screenshot.length} chars)`)

    // 3. Send to Gemini for structured perception
    const perception = await geminiPerceive(screenshot, gameName)
    const processingTimeMs = Date.now() - startTime

    const result = {
      timestamp: new Date().toISOString(),
      screenshotPreview: screenshot.substring(0, 200) + '...',
      sceneUnderstanding: perception.sceneUnderstanding,
      detectedElements: perception.detectedElements,
      screenText: perception.screenText,
      suggestedAction: perception.suggestedAction,
      processingTimeMs,
    }

    console.log(`👁️ PERCEIVE: Complete in ${processingTimeMs}ms — state: ${perception.sceneUnderstanding.gameState}, elements: ${perception.detectedElements.length}`)

    return new Response(JSON.stringify({ success: true, perception: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('👁️ PERCEIVE ERROR:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

async function geminiPerceive(screenshotBase64: string, gameName: string) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')

  // Fallback if no API key
  if (!LOVABLE_API_KEY) {
    console.warn('👁️ No LOVABLE_API_KEY, using heuristic perception')
    return heuristicPerception(gameName)
  }

  const systemPrompt = `You are the PERCEPTION MODULE of SIMA 2, an advanced AI game agent.
Your job is to OBSERVE and UNDERSTAND the current game screen — not to play, just to perceive.

Analyze the screenshot and return a STRUCTURED JSON perception report.

RESPOND WITH ONLY THIS JSON (no markdown, no explanation):
{
  "sceneUnderstanding": {
    "gameState": "menu|playing|paused|level_complete|loading|unknown",
    "gamePhase": "Brief description of what's happening on screen",
    "confidence": 0.0-1.0
  },
  "detectedElements": [
    {
      "type": "button|tile|text|icon|progress_bar|timer|score|menu_item|ad|popup",
      "label": "Human-readable label for this element",
      "confidence": 0.0-1.0,
      "boundingBox": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "actionable": true
    }
  ],
  "screenText": ["any text visible on screen"],
  "suggestedAction": {
    "type": "tap|swipe|wait|dismiss",
    "coordinates": { "x": 360, "y": 640 },
    "reasoning": "Why this action makes sense given current state",
    "confidence": 0.0-1.0
  }
}

RULES:
- Report ALL visible UI elements (buttons, tiles, text, scores, timers)
- Be precise with bounding boxes (screen is 720x1280)
- Set actionable=true only for elements the player can interact with
- suggestedAction should be the SINGLE best next move
- If screen shows a popup/ad, suggest dismissing it
- Confidence should reflect how certain you are`

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Analyze this ${gameName} screenshot. Return structured perception JSON.` },
              { type: 'image_url', image_url: { url: screenshotBase64 } }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: 0.1
      }),
      signal: AbortSignal.timeout(30000)
    })

    if (!response.ok) {
      console.error('Gemini perception API error:', response.status)
      return heuristicPerception(gameName)
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content || ''

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        // Validate and sanitize
        return {
          sceneUnderstanding: {
            gameState: parsed.sceneUnderstanding?.gameState || 'unknown',
            gamePhase: parsed.sceneUnderstanding?.gamePhase || 'Unknown screen state',
            confidence: Math.min(1, Math.max(0, parsed.sceneUnderstanding?.confidence || 0.5)),
          },
          detectedElements: (parsed.detectedElements || []).map((el: any) => ({
            type: el.type || 'unknown',
            label: el.label || 'Unknown element',
            confidence: Math.min(1, Math.max(0, el.confidence || 0.5)),
            boundingBox: {
              x: Math.max(0, el.boundingBox?.x || 0),
              y: Math.max(0, el.boundingBox?.y || 0),
              width: Math.max(0, el.boundingBox?.width || 0),
              height: Math.max(0, el.boundingBox?.height || 0),
            },
            actionable: !!el.actionable,
          })),
          screenText: Array.isArray(parsed.screenText) ? parsed.screenText : [],
          suggestedAction: parsed.suggestedAction ? {
            type: parsed.suggestedAction.type || 'tap',
            coordinates: {
              x: Math.max(0, Math.min(720, parsed.suggestedAction.coordinates?.x || 360)),
              y: Math.max(0, Math.min(1280, parsed.suggestedAction.coordinates?.y || 640)),
            },
            reasoning: parsed.suggestedAction.reasoning || 'AI suggested action',
            confidence: Math.min(1, Math.max(0, parsed.suggestedAction.confidence || 0.5)),
          } : null,
        }
      } catch (parseError) {
        console.error('Perception JSON parse error:', parseError)
      }
    }

    return heuristicPerception(gameName)
  } catch (error) {
    console.error('Gemini perception error:', error)
    return heuristicPerception(gameName)
  }
}

function heuristicPerception(gameName: string) {
  return {
    sceneUnderstanding: {
      gameState: 'unknown' as const,
      gamePhase: 'Heuristic fallback — no AI vision available',
      confidence: 0.3,
    },
    detectedElements: [
      {
        type: 'button',
        label: 'Probable center button',
        confidence: 0.4,
        boundingBox: { x: 260, y: 540, width: 200, height: 60 },
        actionable: true,
      }
    ],
    screenText: [],
    suggestedAction: {
      type: 'tap',
      coordinates: { x: 360, y: 640 },
      reasoning: 'Heuristic: tapping center of screen (no AI available)',
      confidence: 0.3,
    },
  }
}

// ============ REASONING ENGINE (SIMA 2 Phase 2) ============

async function reasonAboutScene(supabaseClient: any, perception: any, gameName: string, objective: string, actionHistory: any[]) {
  const startTime = Date.now()
  console.log(`🧠 REASON: Starting chain-of-thought for ${gameName}, objective: "${objective}"`)

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')

    if (!LOVABLE_API_KEY) {
      console.warn('🧠 No LOVABLE_API_KEY, using heuristic reasoning')
      return new Response(JSON.stringify({
        success: true,
        plan: heuristicReasoning(perception, gameName, objective, Date.now() - startTime)
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const historyContext = actionHistory && actionHistory.length > 0
      ? `\n\nRECENT ACTION HISTORY (last ${actionHistory.length} actions):\n${actionHistory.map((a: any, i: number) => `${i+1}. ${a.action} at (${a.coordinates?.x || '?'}, ${a.coordinates?.y || '?'}) → ${a.success ? 'SUCCESS' : 'FAILED'}`).join('\n')}`
      : ''

    const systemPrompt = `You are the REASONING ENGINE of SIMA 2, an advanced AI game agent.
You receive PERCEPTION DATA (what the agent sees) and must produce a MULTI-STEP ACTION PLAN.

THINK STEP BY STEP using chain-of-thought reasoning:
1. Assess the current game state from perception data
2. Identify the objective and sub-goals
3. Plan 2-5 concrete actions to achieve the next sub-goal
4. Consider what could go wrong and plan alternatives

GAME: ${gameName}
OBJECTIVE: ${objective}
${historyContext}

RESPOND WITH ONLY THIS JSON (no markdown):
{
  "chainOfThought": "Step-by-step reasoning about what I see and what to do...",
  "currentAssessment": "One sentence summary of the current situation",
  "steps": [
    {
      "id": 1,
      "thought": "Why I'm doing this action",
      "action": { "type": "tap|swipe|wait|dismiss", "coordinates": { "x": 360, "y": 640 }, "swipeDirection": "up|down|left|right" },
      "expectedOutcome": "What should happen after this action",
      "confidence": 0.85
    }
  ],
  "overallConfidence": 0.8,
  "estimatedDurationMs": 5000,
  "alternativeStrategy": "What to do if the primary plan fails"
}

RULES:
- Each step must have a clear THOUGHT explaining the reasoning
- Coordinates must be within screen bounds (720x1280)
- Use "wait" type for steps that require the game to animate/load
- Set null for action if the step is observational only
- Chain of thought should show your FULL reasoning process
- Consider the action history to avoid repeating failed actions`

    const perceptionSummary = JSON.stringify({
      gameState: perception.sceneUnderstanding?.gameState,
      gamePhase: perception.sceneUnderstanding?.gamePhase,
      confidence: perception.sceneUnderstanding?.confidence,
      elements: perception.detectedElements?.map((e: any) => ({
        type: e.type, label: e.label, actionable: e.actionable,
        pos: `(${e.boundingBox?.x},${e.boundingBox?.y})`
      })),
      screenText: perception.screenText,
      suggestedAction: perception.suggestedAction,
    })

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `PERCEPTION DATA:\n${perceptionSummary}\n\nGenerate a multi-step action plan with chain-of-thought reasoning.`
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      }),
      signal: AbortSignal.timeout(30000)
    })

    if (!response.ok) {
      const status = response.status
      if (status === 429) {
        return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (status === 402) {
        return new Response(JSON.stringify({ success: false, error: 'Payment required. Please add credits to your workspace.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      console.error('Gemini reasoning error:', status)
      return new Response(JSON.stringify({
        success: true,
        plan: heuristicReasoning(perception, gameName, objective, Date.now() - startTime)
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content || ''
    console.log('🧠 Gemini reasoning response:', content.substring(0, 300))

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        const processingTimeMs = Date.now() - startTime

        const plan = {
          timestamp: new Date().toISOString(),
          objective,
          chainOfThought: parsed.chainOfThought || 'No chain of thought provided',
          currentAssessment: parsed.currentAssessment || 'Unable to assess',
          steps: (parsed.steps || []).map((s: any, i: number) => ({
            id: s.id || i + 1,
            thought: s.thought || 'No reasoning provided',
            action: s.action ? {
              type: s.action.type || 'tap',
              coordinates: s.action.coordinates ? {
                x: Math.max(0, Math.min(720, s.action.coordinates.x)),
                y: Math.max(0, Math.min(1280, s.action.coordinates.y)),
              } : undefined,
              swipeDirection: s.action.swipeDirection || undefined,
              duration: s.action.duration || undefined,
            } : null,
            expectedOutcome: s.expectedOutcome || 'Unknown outcome',
            confidence: Math.min(1, Math.max(0, s.confidence || 0.5)),
            status: 'pending',
          })),
          overallConfidence: Math.min(1, Math.max(0, parsed.overallConfidence || 0.5)),
          estimatedDurationMs: parsed.estimatedDurationMs || 5000,
          alternativeStrategy: parsed.alternativeStrategy || null,
          processingTimeMs,
        }

        console.log(`🧠 REASON: Plan generated in ${processingTimeMs}ms — ${plan.steps.length} steps, confidence: ${plan.overallConfidence}`)

        return new Response(JSON.stringify({ success: true, plan }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } catch (parseError) {
        console.error('Reasoning JSON parse error:', parseError)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      plan: heuristicReasoning(perception, gameName, objective, Date.now() - startTime)
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('🧠 REASON ERROR:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

function heuristicReasoning(perception: any, gameName: string, objective: string, processingTimeMs: number) {
  const gameState = perception?.sceneUnderstanding?.gameState || 'unknown'
  const suggestedAction = perception?.suggestedAction

  const steps = []

  if (gameState === 'menu') {
    steps.push({
      id: 1, thought: 'Screen appears to be a menu. Need to find and tap the play/start button.',
      action: { type: 'tap', coordinates: { x: 360, y: 700 } },
      expectedOutcome: 'Game should transition from menu to gameplay',
      confidence: 0.5, status: 'pending',
    })
  } else if (gameState === 'playing' && suggestedAction) {
    steps.push({
      id: 1, thought: `Following perception suggestion: ${suggestedAction.reasoning}`,
      action: { type: suggestedAction.type, coordinates: suggestedAction.coordinates },
      expectedOutcome: 'Game state should progress',
      confidence: suggestedAction.confidence || 0.4, status: 'pending',
    })
    steps.push({
      id: 2, thought: 'Wait for animation/transition to complete',
      action: { type: 'wait', duration: 500 },
      expectedOutcome: 'Game animations settle',
      confidence: 0.9, status: 'pending',
    })
  } else {
    steps.push({
      id: 1, thought: 'Uncertain game state. Tapping center to interact.',
      action: { type: 'tap', coordinates: { x: 360, y: 640 } },
      expectedOutcome: 'Some game response',
      confidence: 0.3, status: 'pending',
    })
  }

  return {
    timestamp: new Date().toISOString(),
    objective,
    chainOfThought: `Heuristic reasoning (no AI): Game state is "${gameState}". Using basic rules to decide next action.`,
    currentAssessment: `Game is in "${gameState}" state. Using heuristic fallback.`,
    steps,
    overallConfidence: 0.3,
    estimatedDurationMs: 2000,
    alternativeStrategy: 'Tap random positions if current approach fails',
    processingTimeMs,
  }
}

// Execute a direct tap action on device
async function executeTapAction(supabaseClient: any, deviceId: string, x: number, y: number) {
  console.log(`👆 Executing tap at (${x}, ${y}) on device ${deviceId}`)
  
  try {
    // Try to find device by UUID first, then by hardware ID
    let device = null
    
    const { data: deviceById } = await supabaseClient
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .maybeSingle()
    
    if (deviceById) {
      device = deviceById
    } else {
      const { data: deviceByHwId } = await supabaseClient
        .from('devices')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle()
      device = deviceByHwId
    }
    
    if (!device) {
      throw new Error('Device not found')
    }
    
    if (device.status !== 'online') {
      throw new Error('Device is offline')
    }
    
    const adbServerUrl = await getAdbServerUrl(supabaseClient)
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    
    const action: DeviceAction = {
      type: 'tap',
      coordinates: { x, y },
      deviceId: device.device_id  // Use hardware device ID
    }
    
    const result = await executeRealAction(baseUrl, action)
    
    return new Response(JSON.stringify({ 
      success: result.success,
      coordinates: { x, y },
      executionTime: result.executionTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Tap action error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

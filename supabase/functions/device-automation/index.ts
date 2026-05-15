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
  type: 'tap' | 'swipe' | 'long_press' | 'screenshot' | 'install_app' | 'open_app' | 'close_app'
  coordinates?: { x: number; y: number }
  fromCoordinates?: { x: number; y: number }
  toCoordinates?: { x: number; y: number }
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
      case 'execute_step':
        return await executeStep(supabaseClient, payload.step, payload.deviceId, payload.sessionId)
      case 'estimate_reward':
        return await estimateReward(supabaseClient, payload)
      case 'retrieve_experiences':
        return await retrieveExperiences(supabaseClient, payload.gameName, payload.gameState, payload.limit)
      case 'extract_strategy':
        return await extractStrategy(supabaseClient, payload.gameName)
      case 'transfer_knowledge':
        return await transferKnowledge(supabaseClient, payload.targetGame, payload.targetState)
      case 'zero_shot_plan':
        return await zeroShotPlan(supabaseClient, payload.perception, payload.gameName, payload.transferredTemplates)
      case 'play_tilepark':
        return await playTileParkServerSide(supabaseClient, payload.deviceId, payload.rounds || 30)
      case 'send_instruction':
        return await sendAgentInstruction(supabaseClient, payload.sessionId, payload.instruction)
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
  let deviceStatus: boolean | null = null
  const adbServerUrl = await getAdbServerUrl(supabaseClient)
  
  if (adbServerUrl) {
    try {
      const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
      const devicesResponse = await fetch(`${baseUrl}/devices`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...ngrokBypassHeaders,
          'User-Agent': 'Lovable-Bot/1.0',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000)
      })
      
      if (devicesResponse.ok) {
        const devicesResult = await devicesResponse.json()
        const connectedDevices = devicesResult.devices || []
        const matchedDevice = connectedDevices.find((d: any) =>
          d.id === deviceInfo.deviceId ||
          d.serial === deviceInfo.deviceId ||
          d.device_id === deviceInfo.deviceId
        )
        
        if (matchedDevice) {
          realDeviceId = matchedDevice.id || matchedDevice.serial || matchedDevice.device_id || realDeviceId
          const normalizedStatus = String(matchedDevice.status || '').toLowerCase()
          const normalizedAdbStatus = String(matchedDevice.adbStatus || matchedDevice.adb_status || matchedDevice.type || '').toLowerCase()
          deviceStatus = normalizedAdbStatus === 'device' || normalizedStatus === 'device' || normalizedStatus === 'online'
          console.log(`Using matched ADB device ID: ${realDeviceId}, status: ${deviceStatus ? 'online' : 'offline'}`)
        } else if (connectedDevices.length > 0) {
          realDeviceId = connectedDevices[0].id || realDeviceId
          console.log(`Using fallback ADB device ID: ${realDeviceId}`)
        }
      }
    } catch (error) {
      console.error('Error fetching real device ID:', error)
    }
  }
  
  if (deviceStatus === null) {
    deviceStatus = await checkADBConnection(realDeviceId, supabaseClient)
  }
  
  const { data: existingDevice } = await supabaseClient
    .from('devices')
    .select('id, status')
    .eq('name', deviceInfo.name)
    .maybeSingle()

  const resolvedStatus = deviceStatus === null
    ? 'online'
    : (deviceStatus ? 'online' : 'offline')

  let data, error
  
  if (existingDevice) {
    const result = await supabaseClient
      .from('devices')
      .update({
        device_id: realDeviceId,
        status: resolvedStatus,
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
        status: resolvedStatus,
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
    connected: resolvedStatus === 'online'
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
    const newStatus = isConnected === null ? device.status : (isConnected ? 'online' : 'offline')
    
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
      deviceId: device.device_id,
      reachable: isConnected !== null
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

async function checkADBConnection(deviceId: string, supabaseClient?: any): Promise<boolean | null> {
  try {
    let adbServerUrl: string | null = null
    
    if (supabaseClient) {
      try {
        adbServerUrl = await getAdbServerUrl(supabaseClient)
      } catch (error) {
        console.error('⚠️ Could not get ADB server URL:', error.message)
        return null
      }
    } else {
      adbServerUrl = Deno.env.get('ADB_SERVER_URL') || null
    }
    
    if (!adbServerUrl) {
      console.error('⚠️ ADB_SERVER_URL not configured')
      return null
    }

    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    const statusUrl = `${baseUrl}/devices`
    
    console.log('🔍 Checking ADB server for connected devices at:', statusUrl)
    
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...ngrokBypassHeaders,
        'User-Agent': 'Lovable-Bot/1.0',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000)
    })
    
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      console.error('❌ ADB server request failed:', response.status, bodyText.slice(0, 200))
      if (bodyText.includes('ERR_NGROK_725') || bodyText.toLowerCase().includes('bandwidth limit')) {
        return null
      }
      return false
    }
    
    const result = await response.json()
    const connectedDevices = result.devices || []
    
    console.log('📱 Connected devices via ADB:', JSON.stringify(connectedDevices))
    
    const isConnected = connectedDevices.some((d: any) => {
      const matchesSerial = d.id === deviceId || d.serial === deviceId || d.device_id === deviceId
      const normalizedStatus = String(d.status || '').toLowerCase()
      const normalizedAdbStatus = String(d.adbStatus || d.adb_status || d.type || '').toLowerCase()
      const isDevice = normalizedAdbStatus === 'device' || normalizedStatus === 'device' || normalizedStatus === 'online'
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
    
    const deviceId = hardwareDeviceId || device.device_id
    console.log(`📱 Using device ID for ADB: ${deviceId}`)
    
    const adbServerUrl = await getAdbServerUrl(supabaseClient)
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    
    const results: any[] = []
    let actionsPerformed = session.actions_performed || 0

    // ======== SIMA 2: Goal stack (load or seed) ========
    let sessionConfig: any = (session.config && typeof session.config === 'object') ? { ...session.config } : {}
    if (!Array.isArray(sessionConfig.goals) || sessionConfig.goals.length === 0) {
      sessionConfig.goals = ['dismiss popups', 'reach Level 1', 'follow tutorial', 'clear Level 1']
      await supabaseClient.from('bot_sessions').update({ config: sessionConfig, updated_at: new Date().toISOString() }).eq('id', sessionId)
      console.log(`🎯 Seeded goal stack: ${sessionConfig.goals.join(' → ')}`)
    }

    for (let i = 0; i < iterations; i++) {
      console.log(`🔄 Bot loop iteration ${i + 1}/${iterations}`)

      // 1. Take screenshot
      const screenshot = await takeRealScreenshot(baseUrl, deviceId)

      if (!screenshot || screenshot.length < 500) {
        console.warn(`⚠️ Screenshot invalid (length: ${screenshot?.length || 0}), skipping`)
        continue
      }

      console.log(`🖼️ Screenshot ready (${screenshot.length} chars), calling Gemini AI...`)

      // 2. Analyze screenshot with AI
      const isTilePark = session.game_name.toLowerCase().includes('tile') ||
          session.package_name.toLowerCase().includes('tilepark')

      // ===== Pull live human override (conversational interface) =====
      let humanOverride: string | undefined
      const { data: pendingInstr } = await supabaseClient
        .from('agent_instructions')
        .select('id, instruction')
        .eq('session_id', sessionId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (pendingInstr) {
        humanOverride = pendingInstr.instruction
        await supabaseClient.from('agent_instructions')
          .update({ status: 'consumed', consumed_at: new Date().toISOString() })
          .eq('id', pendingInstr.id)
        await supabaseClient.from('bot_actions').insert({
          session_id: sessionId,
          action_type: 'human_instruction',
          coordinates: { instruction: humanOverride, instructionId: pendingInstr.id },
          success: true,
          execution_time_ms: 0,
        })
        console.log(`💬 Human override consumed: "${humanOverride}"`)
      }

      // ===== Pull recent failure lessons (self-improvement) =====
      let lessons: string[] = []
      const { data: recentExp } = await supabaseClient
        .from('agent_experiences')
        .select('reward_reasoning, outcome')
        .eq('game_name', session.game_name)
        .eq('outcome', 'failed')
        .order('created_at', { ascending: false })
        .limit(3)
      if (recentExp && recentExp.length > 0) {
        lessons = recentExp.map((e: any) => e.reward_reasoning).filter(Boolean)
      }

      const currentGoal = sessionConfig.goals[0] || 'clear Level 1'

      const analysis: any = isTilePark
        ? await analyzeScreenWithGemini(screenshot, session.game_name, { currentGoal, humanOverride, lessons })
        : analyzeScreenHeuristic(session.game_name)

      console.log(`🎯 [goal: ${currentGoal}] AI result: ${analysis.description}`)

      // ===== Goal advancement =====
      if (analysis.goalAchieved && sessionConfig.goals.length > 0) {
        const completedGoal = sessionConfig.goals.shift()
        console.log(`✅ Goal completed: "${completedGoal}". Remaining: ${sessionConfig.goals.join(' → ') || '(none)'}`)
        await supabaseClient.from('bot_actions').insert({
          session_id: sessionId,
          action_type: 'goal_complete',
          coordinates: { goal: completedGoal, remaining: sessionConfig.goals, instruction: analysis.instruction || null },
          success: true,
          execution_time_ms: 0,
        })
        await supabaseClient.from('bot_sessions').update({ config: sessionConfig, updated_at: new Date().toISOString() }).eq('id', sessionId)
      }

      // Detect terminal states (Level 1 success / failure) and record reason
      const aGameState = (analysis as any).gameState as string | undefined
      const aInstruction = (analysis as any).instruction as string | undefined
      if (aGameState === 'level_complete' || aGameState === 'game_over') {
        const isWin = aGameState === 'level_complete'
        // Track retry attempts in session.config so each failure is logged separately
        const cfg: any = sessionConfig
        const attemptNum = (cfg.level1_attempts || 0) + 1
        cfg.level1_attempts = attemptNum

        const reason = isWin
          ? `✅ LEVEL 1 COMPLETE on attempt #${attemptNum} — ${analysis.description}${aInstruction ? ` | read: "${aInstruction}"` : ''}`
          : `❌ LEVEL 1 FAILED (attempt #${attemptNum}) — ${analysis.description}${aInstruction ? ` | read: "${aInstruction}"` : ''}`
        console.log(`🏁 Terminal state detected: ${reason}`)

        // Log this attempt as its own bot_action row
        await supabaseClient.from('bot_actions').insert({
          session_id: sessionId,
          action_type: isWin ? 'level_complete' : 'level_failed',
          coordinates: { gameState: aGameState, instruction: aInstruction || null, reason, attempt: attemptNum, goal: currentGoal },
          success: isWin,
          execution_time_ms: 0,
        })

        // ===== Self-improvement: store experience for next attempt to learn from =====
        try {
          const { data: actionTrail } = await supabaseClient
            .from('bot_actions')
            .select('action_type, coordinates, success, timestamp')
            .eq('session_id', sessionId)
            .order('timestamp', { ascending: false })
            .limit(30)
          await supabaseClient.from('agent_experiences').insert({
            session_id: sessionId,
            game_name: session.game_name,
            game_state: aGameState,
            objective: 'Complete Level 1',
            outcome: isWin ? 'success' : 'failed',
            success: isWin,
            reward_score: isWin ? 1 : 0,
            reward_reasoning: reason,
            action_sequence: actionTrail || [],
            steps_count: actionsPerformed,
            total_execution_ms: 0,
            perception_summary: { gameState: aGameState, instruction: aInstruction, lastDescription: analysis.description, attempt: attemptNum },
          })
          console.log(`📚 Stored agent_experience (outcome=${isWin ? 'success' : 'failed'})`)
        } catch (expErr) {
          console.warn(`⚠️ Failed to store agent_experience:`, expErr)
        }

        if (isWin) {
          await supabaseClient
            .from('bot_sessions')
            .update({
              status: 'completed',
              level_progress: 1,
              actions_performed: actionsPerformed,
              error_message: reason,
              config: cfg,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sessionId)

          return new Response(JSON.stringify({
            success: true, terminal: true, win: true, reason, attempts: attemptNum,
            actionsPerformed: results.length, totalActions: actionsPerformed,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // FAILURE → automatic retry: relaunch the level and keep looping
        console.log(`🔁 Auto-retry: relaunching ${session.package_name} for attempt #${attemptNum + 1}`)
        // Reset goal stack for the next attempt
        cfg.goals = ['dismiss popups', 'reach Level 1', 'follow tutorial', 'clear Level 1']
        sessionConfig = cfg
        await supabaseClient
          .from('bot_sessions')
          .update({
            status: 'retrying',
            actions_performed: actionsPerformed,
            error_message: reason,
            config: cfg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sessionId)

        try {
          const relaunch = await launchGameOnDevice(supabaseClient, { device_id: deviceId }, session.package_name)
          console.log(`🚀 Relaunch result: success=${relaunch.success} — ${relaunch.message}`)
        } catch (e) {
          console.warn(`⚠️ Relaunch failed:`, e)
        }
        // Give the game a few seconds to load before next perception cycle
        await new Promise((r) => setTimeout(r, 4000))
        results.push({ iteration: i + 1, retry: true, attempt: attemptNum, reason })
        continue
      }

      // 3. Execute actions
      if (analysis.action) {
        // For tile matching: tap first tile, wait, tap second tile
        if (analysis.matchPair) {
          const tile1 = analysis.matchPair.tile1
          const tile2 = analysis.matchPair.tile2
          
          console.log(`🧩 Matching pair: (${tile1.x},${tile1.y}) → (${tile2.x},${tile2.y})`)
          
          // Tap first tile
          const tap1Result = await executeRealAction(baseUrl, { type: 'tap', coordinates: tile1, deviceId })
          actionsPerformed++
          console.log(`👆 Tap 1 result: success=${tap1Result.success}`)
          
          await supabaseClient.from('bot_actions').insert({
            session_id: sessionId, action_type: 'tap',
            coordinates: tile1, success: tap1Result.success,
            execution_time_ms: tap1Result.executionTime || 100
          })
          
          // Wait for selection highlight animation
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Tap second tile to complete match
          const tap2Result = await executeRealAction(baseUrl, { type: 'tap', coordinates: tile2, deviceId })
          actionsPerformed++
          console.log(`👆 Tap 2 result: success=${tap2Result.success}`)
          
          await supabaseClient.from('bot_actions').insert({
            session_id: sessionId, action_type: 'tap',
            coordinates: tile2, success: tap2Result.success,
            execution_time_ms: tap2Result.executionTime || 100
          })
          
          results.push({
            iteration: i + 1,
            action: 'match_pair',
            tile1, tile2,
            description: analysis.description
          })
        } else {
          // Single action (menu tap, swipe, etc.)
          const actionWithDevice = { ...analysis.action, deviceId }
          const actionResult = await executeRealAction(baseUrl, actionWithDevice)
          actionsPerformed++
          
          await supabaseClient.from('bot_actions').insert({
            session_id: sessionId, action_type: analysis.action.type,
            coordinates: analysis.action.coordinates || analysis.action.fromCoordinates,
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
      }
      
      // Delay between iterations to let animations play
      if (i < iterations - 1) {
        await new Promise(resolve => setTimeout(resolve, 800))
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

    if (!deviceId) {
      console.error('📸 No deviceId provided for screenshot!')
      return ''
    }

    const commonHeaders = {
      ...ngrokBypassHeaders,
      'User-Agent': 'Lovable-Bot/1.0',
      'Accept': 'application/json, image/png',
    }

    // Helper to extract base64 from a response (handles JSON or raw PNG)
    async function extractScreenshot(resp: Response): Promise<string> {
      const contentType = resp.headers.get('content-type') || ''
      
      if (contentType.includes('image/png') || contentType.includes('application/octet-stream')) {
        console.log('📸 Received raw PNG, converting to base64...')
        const arrayBuffer = await resp.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        const CHUNK_SIZE = 8192
        let binary = ''
        for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
          const chunk = bytes.subarray(i, i + CHUNK_SIZE)
          binary += String.fromCharCode.apply(null, Array.from(chunk))
        }
        const b64 = btoa(binary)
        return `data:image/png;base64,${b64}`
      }
      
      // Try JSON
      try {
        const text = await resp.text()
        // Check for ngrok interstitial HTML
        if (text.includes('ngrok') && text.includes('<html')) {
          console.warn('📸 Got ngrok interstitial page, not a screenshot')
          return ''
        }
        const parsed = JSON.parse(text)
        if (parsed.error) {
          console.error('📸 ADB server error:', parsed.error)
          return ''
        }
        return parsed.screenshot || ''
      } catch {
        console.warn('📸 Could not parse response, content-type:', contentType)
        return ''
      }
    }

    // Try POST first (with deviceId in body)
    try {
      const postResponse = await fetch(`${baseUrl}/screenshot`, {
        method: 'POST',
        headers: { ...commonHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
        signal: AbortSignal.timeout(15000),
      })

      if (postResponse.ok) {
        const screenshot = await extractScreenshot(postResponse)
        if (screenshot && screenshot.length > 500) {
          console.log(`📸 Screenshot OK (POST): ${screenshot.length} chars`)
          return screenshot
        }
      } else {
        // Consume body to prevent leak
        await postResponse.text().catch(() => {})
        console.warn('📸 POST failed:', postResponse.status, '- trying GET')
      }
    } catch (postErr) {
      console.warn('📸 POST error, trying GET fallback')
    }

    // GET fallback — always include deviceId
    try {
      const getUrl = `${baseUrl}/screenshot?deviceId=${encodeURIComponent(deviceId)}`
      console.log(`📸 GET fallback: ${getUrl}`)

      const getResponse = await fetch(getUrl, {
        method: 'GET',
        headers: commonHeaders,
        signal: AbortSignal.timeout(15000),
      })

      if (!getResponse.ok) {
        await getResponse.text().catch(() => {})
        console.error('📸 GET failed:', getResponse.status)
        return ''
      }

      const screenshot = await extractScreenshot(getResponse)
      if (screenshot && screenshot.length > 500) {
        console.log(`📸 Screenshot OK (GET): ${screenshot.length} chars`)
        return screenshot
      }
      console.warn(`📸 GET screenshot too short: ${screenshot?.length || 0} chars`)
    } catch (getErr) {
      console.error('📸 GET error:', getErr)
    }

    return ''
  } catch (error) {
    console.error('📸 Screenshot error:', error)
    return ''
  }
}

// Enhanced AI Vision Analysis for Tile Park game
async function analyzeScreenWithGemini(
  screenshotBase64: string,
  gameName: string,
  ctx?: { currentGoal?: string; humanOverride?: string; lessons?: string[] }
): Promise<{
  action: DeviceAction | null
  description: string
  matchPair?: { tile1: { x: number; y: number }; tile2: { x: number; y: number } }
  tiles?: any[]
  gameState?: string
  instruction?: string
  currentGoal?: string
  goalAchieved?: boolean
}> {
  console.log(`🧠 Analyzing ${gameName} with Gemini AI Vision (goal=${ctx?.currentGoal || 'none'}, override=${ctx?.humanOverride ? 'yes' : 'no'}, lessons=${ctx?.lessons?.length || 0})...`)
  
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
  
  const systemPrompt = `You are SIMA 2 — a generalist instruction-following AI agent (Scalable Instructable Multiworld Agent) playing the Tile Park tile-matching puzzle on Android.

PRIMARY GOAL: Read any on-screen instructions / tutorial text, FOLLOW them literally, navigate to LEVEL 1, and COMPLETE Level 1 by clearing all tiles.

SIMA OPERATING PRINCIPLES:
- Always perceive the screen first, then ground language → action.
- If the game shows ANY written instruction ("Tap to start", "Match 3 tiles", "Drag here", arrow pointing somewhere, finger icon, highlighted tile), OBEY that instruction exactly — it overrides any default heuristic.
- One step at a time. After each step, re-observe.
- Never skip a tutorial step; complete it before continuing.
- Goal hierarchy: dismiss popups → reach Level 1 → follow tutorial → clear Level 1.

SCREEN LAYOUT (720x1280 pixels):
- Top (y: 0-300): score, timer, level header, instruction banners
- Board (y: 300-1000, x: 30-690): tile grid (~6 columns, tiles ~70-90px)
- Bottom (y: 1000+): hint / shuffle / settings, tutorial captions

SCREEN STATES — pick exactly one each turn:
1. "splash" — publisher logo / animation (e.g. "FUN VENT STUDIOS"). → action "wait".
2. "loading" — progress bar / spinner. → action "wait".
3. "menu" — big PLAY / START / TAP TO PLAY (often y=900-1100). → tap that button.
4. "level_select" — level map. → tap LEVEL 1 (first/lowest unlocked node).
5. "popup" — daily reward, ad X, "Continue", "Claim", "No thanks". → tap CLOSE/dismiss.
6. "tutorial" — instructional overlay with text, arrow, pointing hand, or highlighted tile telling you exactly what to tap or drag.
   → READ the instruction text into "instruction" field, then perform EXACTLY that action (tap the highlighted tile / follow the arrow / match the indicated pair). Do not improvise.
7. "playing" — tile grid, no tutorial overlay. Find TWO IDENTICAL tiles connectable with ≤2 turns. Return BOTH centers in matchPair.
8. "level_complete" — stars / "Level Complete" / "Next". → tap NEXT/CONTINUE.
9. "game_over" — tap RETRY/CONTINUE.

MATCHING RULES (playing/tutorial):
- Aim for tile CENTER. Only return pairs you are confident are identical icons.
- Prefer pairs the tutorial highlights, then adjacent/same-row pairs.
- If no valid pair and no instruction, return "wait" — never random-tap.

ALWAYS include "instruction" field with any literal on-screen text you used to decide (empty string if none).

OUTPUT — ONE JSON OBJECT ONLY, no prose, no markdown fences:

Match (playing):
{ "gameState":"playing",
  "matchPair":{ "tile1":{"x":130,"y":430}, "tile2":{"x":450,"y":590}, "tileName":"carrot" },
  "description":"Matching two carrots",
  "confidence":0.9 }

Splash/loading — DO NOT TAP:
{ "gameState":"splash", "action":{"type":"wait"}, "description":"Splash screen, waiting", "confidence":0.95 }

Menu / level select / popup / level_complete (single tap on a real button):
{ "gameState":"menu", "action":{"type":"tap","x":360,"y":1000}, "description":"Tapping PLAY", "confidence":0.9 }

Swipe to drag a tile (rare, only if game requires it):
{ "gameState":"playing", "action":{"type":"swipe","fromX":130,"fromY":430,"toX":210,"toY":430}, "description":"Drag tile", "confidence":0.7 }

CRITICAL: Never invent buttons. If you don't clearly see a button or a matchable pair, return "wait".

ACTIVE GOAL (from goal stack): "${ctx?.currentGoal || 'clear Level 1'}".
- Decide if this goal is now satisfied based on the screen.
- ALWAYS include "currentGoal" (echo the active goal) and "goalAchieved" (boolean) in your JSON.
${ctx?.lessons?.length ? `\nLESSONS FROM PRIOR FAILED ATTEMPTS — avoid repeating these mistakes:\n${ctx.lessons.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : ''}
${ctx?.humanOverride ? `\nHUMAN OVERRIDE — the operator just sent this instruction. Treat it as the highest priority and execute it on this turn:\n"""${ctx.humanOverride}"""` : ''}`
  
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: `SIMA 2 task: active goal is "${ctx?.currentGoal || 'clear Level 1'}". ${ctx?.humanOverride ? `The operator just said: "${ctx.humanOverride}". Execute that now if visible on screen. ` : ''}Read on-screen instructions, take ONE action that advances the active goal, and include "currentGoal", "goalAchieved", and the literal "instruction" text you read.` },
              {
                type: 'image_url',
                image_url: { url: screenshotBase64 }
              }
            ]
          }
        ],
        max_tokens: 800,
        temperature: 0.1
      }),
      signal: AbortSignal.timeout(30000)
    })
    
    if (!response.ok) {
      const errText = await response.text()
      console.error('❌ Gemini API error:', response.status, errText)
      return analyzeScreenHeuristic(gameName)
    }
    
    const result = await response.json()
    const content = result.choices?.[0]?.message?.content || ''
    
    console.log('🧠 Gemini response:', content.substring(0, 600))
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        console.log('✅ Parsed AI response:', JSON.stringify(parsed))
        if (parsed.instruction) console.log(`📖 SIMA read instruction: "${parsed.instruction}" (state=${parsed.gameState})`)
        const instrTag = parsed.instruction ? ` [📖 "${String(parsed.instruction).substring(0, 80)}"]` : ''
        
        // Handle matching pair response
        if (parsed.matchPair && parsed.matchPair.tile1 && parsed.matchPair.tile2) {
          const t1 = parsed.matchPair.tile1
          const t2 = parsed.matchPair.tile2
          
          const tile1 = {
            x: Math.max(30, Math.min(690, Math.round(t1.x))),
            y: Math.max(200, Math.min(1100, Math.round(t1.y)))
          }
          const tile2 = {
            x: Math.max(30, Math.min(690, Math.round(t2.x))),
            y: Math.max(200, Math.min(1100, Math.round(t2.y)))
          }
          
          console.log(`🧩 Match found: ${parsed.matchPair.tileName || 'tile'} at (${tile1.x},${tile1.y}) and (${tile2.x},${tile2.y})`)
          
          return {
            action: { type: 'tap' as const, coordinates: tile1 },
            matchPair: { tile1, tile2 },
            gameState: parsed.gameState, instruction: parsed.instruction, currentGoal: parsed.currentGoal, goalAchieved: !!parsed.goalAchieved,
            description: (parsed.description || `Matching ${parsed.matchPair.tileName || 'tiles'}`) + instrTag
          }
        }
        
        // Handle "wait" action — splash/loading screens, do nothing this iteration
        if (parsed.action?.type === 'wait') {
          console.log(`⏳ Wait state (${parsed.gameState}): ${parsed.description}`)
          return {
            action: null,
            gameState: parsed.gameState, instruction: parsed.instruction, currentGoal: parsed.currentGoal, goalAchieved: !!parsed.goalAchieved,
            description: `⏳ ${parsed.description || 'Waiting for game to be ready'}` + instrTag
          }
        }
        
        // Handle swipe/move action
        if (parsed.action) {
          if (parsed.action.type === 'swipe' && parsed.action.fromX != null && parsed.action.toX != null) {
            const fromX = Math.max(30, Math.min(690, Math.round(parsed.action.fromX)))
            const fromY = Math.max(200, Math.min(1100, Math.round(parsed.action.fromY)))
            const toX = Math.max(30, Math.min(690, Math.round(parsed.action.toX)))
            const toY = Math.max(200, Math.min(1100, Math.round(parsed.action.toY)))
            
            return {
              action: { 
                type: 'swipe' as const, 
                fromCoordinates: { x: fromX, y: fromY },
                toCoordinates: { x: toX, y: toY },
                duration: 400,
              },
              gameState: parsed.gameState, instruction: parsed.instruction, currentGoal: parsed.currentGoal, goalAchieved: !!parsed.goalAchieved,
              description: (parsed.description || `Moving tile from (${fromX},${fromY}) to (${toX},${toY})`) + instrTag
            }
          }
          
          // Handle tap action (menu, popup, etc.)
          if (typeof parsed.action.x === 'number' && typeof parsed.action.y === 'number') {
            const x = Math.max(30, Math.min(690, Math.round(parsed.action.x)))
            const y = Math.max(200, Math.min(1100, Math.round(parsed.action.y)))
            
            return {
              action: { type: 'tap' as const, coordinates: { x, y } },
              gameState: parsed.gameState, instruction: parsed.instruction, currentGoal: parsed.currentGoal, goalAchieved: !!parsed.goalAchieved,
              description: (parsed.description || `Tap at (${x}, ${y})`) + instrTag
            }
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
      const errorText = await response.text()
      console.error('Action failed:', errorText)

      // Some local Tile Park servers expose only /play-tilepark and reject generic tap actions.
      // Fall back to that endpoint so the device still receives real Tile Park moves.
      if (action.type === 'tap' && action.deviceId && errorText.includes('Unsupported action type')) {
        const fallbackUrl = `${baseUrl}/play-tilepark?deviceId=${encodeURIComponent(action.deviceId)}&rounds=1`
        const fallbackResponse = await fetch(fallbackUrl, {
          method: 'GET',
          headers: {
            ...ngrokBypassHeaders,
            'User-Agent': 'Lovable-Bot/1.0',
            'Accept': 'text/html, application/json',
          },
          signal: AbortSignal.timeout(30000)
        })

        return { success: fallbackResponse.ok, executionTime: Date.now() - startTime }
      }

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
    "fromCoordinates": { "x": 0, "y": 0 },
    "toCoordinates": { "x": 0, "y": 0 },
    "reasoning": "Why this action makes sense given current state",
    "confidence": 0.0-1.0
  }
}

RULES:
- Report ALL visible UI elements (buttons, tiles, text, scores, timers)
- Be precise with bounding boxes (screen is 720x1280)
- Set actionable=true only for elements the player can interact with
- For tile-matching games: if tiles need to be MOVED/DRAGGED, use type "swipe" with fromCoordinates and toCoordinates
- For tile taps/selections, use type "tap" with coordinates
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

    // Retrieve past experiences for this game to inform reasoning
    let experienceContext = ''
    try {
      const gameState = perception?.sceneUnderstanding?.gameState || 'unknown'
      const { data: expData } = await supabaseClient
        .from('agent_experiences')
        .select('game_state, objective, reward_score, reward_reasoning, outcome, steps_count')
        .eq('game_name', gameName)
        .order('reward_score', { ascending: false })
        .limit(5)

      if (expData && expData.length > 0) {
        experienceContext = `\n\nPAST EXPERIENCES (top ${expData.length} by reward):\n${expData.map((e: any, i: number) => 
          `${i+1}. State: ${e.game_state} | Score: ${e.reward_score}/10 | ${e.outcome} | ${e.steps_count} steps | ${e.reward_reasoning?.substring(0, 80) || 'No notes'}`
        ).join('\n')}\n\nUse these experiences to improve your strategy. Repeat high-reward patterns and avoid low-reward ones.`
      }
    } catch (expErr) {
      console.warn('Could not load experiences for reasoning:', expErr)
    }

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
${experienceContext}

RESPOND WITH ONLY THIS JSON (no markdown):
{
  "chainOfThought": "Step-by-step reasoning about what I see and what to do...",
  "currentAssessment": "One sentence summary of the current situation",
  "steps": [
    {
      "id": 1,
      "thought": "Why I'm doing this action",
      "action": { "type": "tap|swipe|wait|dismiss|long_press", "coordinates": { "x": 360, "y": 640 }, "swipeDirection": "up|down|left|right", "fromCoordinates": { "x": 130, "y": 430 }, "toCoordinates": { "x": 210, "y": 430 }, "duration": 400 },
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
- Use "swipe" with fromCoordinates and toCoordinates to DRAG/MOVE tiles or objects from one position to another
- Use "tap" with coordinates to select or tap on elements
- Use "long_press" with coordinates and duration for press-and-hold actions
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

// ============ ACTION EXECUTION (SIMA 2 Phase 3) ============

async function executeStep(supabaseClient: any, step: any, deviceId: string, sessionId?: string) {
  const startTime = Date.now()
  console.log(`⚡ EXECUTE STEP ${step.id}: ${step.action?.type} on device ${deviceId}`)

  try {
    // Resolve device
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
    if (device.status !== 'online') throw new Error('Device is offline')

    const hwDeviceId = device.device_id
    const adbServerUrl = await getAdbServerUrl(supabaseClient)
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`

    if (!step.action) {
      return new Response(JSON.stringify({ success: true, executionTimeMs: 0, verificationResult: 'Observational step — no action taken' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const actionType = step.action.type

    // Handle wait
    if (actionType === 'wait') {
      const dur = step.action.duration || 500
      await new Promise(r => setTimeout(r, dur))
      return new Response(JSON.stringify({ success: true, executionTimeMs: dur, verificationResult: `Waited ${dur}ms` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Build ADB action
    const adbAction: DeviceAction = {
      type: actionType === 'dismiss' ? 'tap' : actionType,
      deviceId: hwDeviceId,
    }

    if (step.action.fromCoordinates && step.action.toCoordinates) {
      // Coordinate-to-coordinate swipe (tile drag/move)
      adbAction.fromCoordinates = {
        x: Math.max(0, Math.min(720, step.action.fromCoordinates.x)),
        y: Math.max(0, Math.min(1280, step.action.fromCoordinates.y)),
      }
      adbAction.toCoordinates = {
        x: Math.max(0, Math.min(720, step.action.toCoordinates.x)),
        y: Math.max(0, Math.min(1280, step.action.toCoordinates.y)),
      }
      adbAction.duration = step.action.duration || 400
    } else if (step.action.coordinates) {
      adbAction.coordinates = {
        x: Math.max(0, Math.min(720, step.action.coordinates.x)),
        y: Math.max(0, Math.min(1280, step.action.coordinates.y)),
      }
    }
    if (step.action.swipeDirection) {
      adbAction.swipeDirection = step.action.swipeDirection
    }
    if (step.action.duration) {
      adbAction.duration = step.action.duration
    }

    // Execute action
    const actionResult = await executeRealAction(baseUrl, adbAction)
    const actionTimeMs = Date.now() - startTime

    if (!actionResult.success) {
      // Log to bot_actions if session
      if (sessionId) {
        await supabaseClient.from('bot_actions').insert({
          session_id: sessionId,
          action_type: actionType,
          coordinates: step.action.coordinates || null,
          success: false,
          execution_time_ms: actionTimeMs,
        })
      }
      return new Response(JSON.stringify({ success: false, error: 'ADB action failed', executionTimeMs: actionTimeMs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Post-action verification: take screenshot and quick check
    let verificationScreenshot = ''
    let verificationResult = 'Action executed'

    try {
      await new Promise(r => setTimeout(r, 400)) // Wait for screen to update
      const screenshot = await takeRealScreenshot(baseUrl, hwDeviceId)
      if (screenshot && screenshot.length > 500) {
        verificationScreenshot = screenshot.substring(0, 200) + '...'
        verificationResult = `Action '${actionType}' executed successfully — screen captured for verification (${screenshot.length} chars)`
      }
    } catch (verifyErr) {
      console.warn('Verification screenshot failed:', verifyErr)
      verificationResult = `Action executed but verification screenshot failed`
    }

    // Log to bot_actions
    if (sessionId) {
      await supabaseClient.from('bot_actions').insert({
        session_id: sessionId,
        action_type: actionType,
        coordinates: step.action.coordinates || null,
        success: true,
        execution_time_ms: Date.now() - startTime,
      })
    }

    const totalTimeMs = Date.now() - startTime
    console.log(`✅ STEP ${step.id} complete in ${totalTimeMs}ms`)

    return new Response(JSON.stringify({
      success: true,
      executionTimeMs: totalTimeMs,
      verificationScreenshot,
      verificationResult,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error(`❌ STEP ${step.id} error:`, error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      executionTimeMs: Date.now() - startTime,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Execute a direct tap action on device
async function executeTapAction(supabaseClient: any, deviceId: string, x: number, y: number) {
  console.log(`👆 Executing tap at (${x}, ${y}) on device ${deviceId}`)
  
  try {
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
    if (device.status !== 'online') throw new Error('Device is offline')
    
    const adbServerUrl = await getAdbServerUrl(supabaseClient)
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    
    const action: DeviceAction = {
      type: 'tap',
      coordinates: { x, y },
      deviceId: device.device_id
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

// ============ SELF-IMPROVEMENT LOOP (SIMA 2 Phase 4) ============

async function estimateReward(supabaseClient: any, payload: any) {
  const startTime = Date.now()
  const { gameName, gameState, objective, actionSequence, executionResults, perceptionBefore, perceptionAfter } = payload

  console.log(`🏆 REWARD: Estimating reward for ${gameName}, ${actionSequence?.length || 0} actions`)

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')

    // Calculate basic metrics
    const totalActions = executionResults?.length || 0
    const successfulActions = executionResults?.filter((r: any) => r.status === 'completed')?.length || 0
    const totalExecutionMs = executionResults?.reduce((s: number, r: any) => s + (r.executionTimeMs || 0), 0) || 0
    const successRate = totalActions > 0 ? successfulActions / totalActions : 0

    let rewardScore = successRate * 5 // Base: 0-5 from success rate
    let rewardReasoning = `Base reward from success rate: ${(successRate * 100).toFixed(0)}% (${successfulActions}/${totalActions} actions)`
    let outcome = successRate >= 0.8 ? 'success' : successRate >= 0.5 ? 'partial' : 'failure'

    // If we have AI, do a richer reward estimation
    if (LOVABLE_API_KEY && perceptionBefore && perceptionAfter) {
      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              {
                role: 'system',
                content: `You are a reward estimation model for a game-playing AI agent.
Compare the BEFORE and AFTER game states to estimate how much progress the agent made.

Score from 0.0 to 10.0:
- 0-2: Actions were harmful or no progress
- 3-4: Minimal progress, mostly neutral
- 5-6: Some progress toward objective
- 7-8: Good progress, meaningful advancement
- 9-10: Excellent, significant milestone achieved

RESPOND WITH ONLY JSON:
{
  "rewardScore": 7.5,
  "reasoning": "Why this score...",
  "outcome": "success|partial|failure",
  "learnings": "What the agent should remember for next time"
}`
              },
              {
                role: 'user',
                content: `GAME: ${gameName}
OBJECTIVE: ${objective || 'Play optimally'}
ACTIONS TAKEN: ${JSON.stringify(actionSequence?.map((a: any) => ({ type: a.action?.type, coords: a.action?.coordinates })) || [])}
SUCCESS RATE: ${(successRate * 100).toFixed(0)}%

BEFORE STATE:
- Game phase: ${perceptionBefore?.sceneUnderstanding?.gamePhase || 'unknown'}
- Game state: ${perceptionBefore?.sceneUnderstanding?.gameState || 'unknown'}
- Screen text: ${JSON.stringify(perceptionBefore?.screenText?.slice(0, 5) || [])}

AFTER STATE:
- Game phase: ${perceptionAfter?.sceneUnderstanding?.gamePhase || 'unknown'}
- Game state: ${perceptionAfter?.sceneUnderstanding?.gameState || 'unknown'}
- Screen text: ${JSON.stringify(perceptionAfter?.screenText?.slice(0, 5) || [])}

Estimate the reward.`
              }
            ],
            max_tokens: 500,
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(15000),
        })

        if (response.ok) {
          const result = await response.json()
          const content = result.choices?.[0]?.message?.content || ''
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            rewardScore = Math.min(10, Math.max(0, parsed.rewardScore || rewardScore))
            rewardReasoning = parsed.reasoning || rewardReasoning
            outcome = parsed.outcome || outcome
            if (parsed.learnings) {
              rewardReasoning += `\n\nLearnings: ${parsed.learnings}`
            }
          }
        }
      } catch (aiErr) {
        console.warn('AI reward estimation failed, using heuristic:', aiErr)
      }
    }

    // Store experience in database
    const experienceData = {
      game_name: gameName,
      game_state: gameState || 'unknown',
      objective: objective || 'Play optimally',
      action_sequence: actionSequence || [],
      reward_score: rewardScore,
      reward_reasoning: rewardReasoning,
      outcome,
      perception_summary: {
        before: perceptionBefore ? {
          gameState: perceptionBefore.sceneUnderstanding?.gameState,
          gamePhase: perceptionBefore.sceneUnderstanding?.gamePhase,
        } : null,
        after: perceptionAfter ? {
          gameState: perceptionAfter.sceneUnderstanding?.gameState,
          gamePhase: perceptionAfter.sceneUnderstanding?.gamePhase,
        } : null,
      },
      steps_count: totalActions,
      total_execution_ms: totalExecutionMs,
      success: outcome === 'success',
    }

    const { data: experience, error: insertError } = await supabaseClient
      .from('agent_experiences')
      .insert(experienceData)
      .select()
      .single()

    if (insertError) {
      console.error('Failed to store experience:', insertError)
    }

    const processingTimeMs = Date.now() - startTime
    console.log(`🏆 REWARD: Score ${rewardScore.toFixed(1)}/10, outcome: ${outcome}, stored in ${processingTimeMs}ms`)

    return new Response(JSON.stringify({
      success: true,
      rewardScore,
      rewardReasoning,
      outcome,
      experienceId: experience?.id,
      processingTimeMs,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('🏆 REWARD ERROR:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

async function retrieveExperiences(supabaseClient: any, gameName: string, gameState?: string, limit?: number) {
  console.log(`📚 RETRIEVE: Fetching experiences for ${gameName}, state: ${gameState || 'any'}`)

  try {
    let query = supabaseClient
      .from('agent_experiences')
      .select('*')
      .eq('game_name', gameName)
      .order('reward_score', { ascending: false })
      .limit(limit || 10)

    if (gameState && gameState !== 'unknown') {
      query = query.eq('game_state', gameState)
    }

    const { data: experiences, error } = await query

    if (error) throw error

    // Compute aggregate stats
    const total = experiences?.length || 0
    const avgReward = total > 0 ? experiences.reduce((s: number, e: any) => s + Number(e.reward_score), 0) / total : 0
    const successCount = experiences?.filter((e: any) => e.success)?.length || 0

    console.log(`📚 RETRIEVE: Found ${total} experiences, avg reward: ${avgReward.toFixed(1)}, success rate: ${total > 0 ? ((successCount / total) * 100).toFixed(0) : 0}%`)

    return new Response(JSON.stringify({
      success: true,
      experiences: experiences || [],
      stats: {
        total,
        avgReward: Number(avgReward.toFixed(2)),
        successRate: total > 0 ? Number(((successCount / total) * 100).toFixed(1)) : 0,
        bestScore: experiences?.[0]?.reward_score || 0,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('📚 RETRIEVE ERROR:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// ============ GENERALIZATION & TRANSFER (SIMA 2 Phase 6) ============

async function extractStrategy(supabaseClient: any, gameName: string) {
  console.log(`📋 EXTRACT: Analyzing high-reward experiences for ${gameName}`)

  try {
    // Get top experiences for this game
    const { data: experiences, error } = await supabaseClient
      .from('agent_experiences')
      .select('*')
      .eq('game_name', gameName)
      .gte('reward_score', 5)
      .order('reward_score', { ascending: false })
      .limit(20)

    if (error) throw error
    if (!experiences || experiences.length === 0) {
      return new Response(JSON.stringify({ success: true, templatesCreated: 0, templates: [], message: 'No high-reward experiences to extract from' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Group experiences by game_state
    const stateGroups: Record<string, any[]> = {}
    for (const exp of experiences) {
      const state = exp.game_state || 'unknown'
      if (!stateGroups[state]) stateGroups[state] = []
      stateGroups[state].push(exp)
    }

    const templates: any[] = []

    // Try AI-powered extraction
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')

    if (LOVABLE_API_KEY) {
      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              {
                role: 'system',
                content: `You are a strategy extraction model. Analyze game experiences and extract reusable strategy templates.

For each distinct pattern you find, output a JSON object with:
- name: Short descriptive name
- description: What this strategy does
- game_state: Which game state it applies to
- action_pattern: The sequence of action types and relative positions
- is_transferable: Whether this could work in other games (e.g., "navigate menus" is transferable, "match specific tiles" is not)
- tags: Relevant tags like ["menu_navigation", "combat", "resource_collection"]

RESPOND WITH ONLY a JSON array of templates.`
              },
              {
                role: 'user',
                content: `GAME: ${gameName}
EXPERIENCES (${experiences.length} total, grouped by state):
${Object.entries(stateGroups).map(([state, exps]) =>
  `State "${state}" (${exps.length} experiences, avg reward: ${(exps.reduce((s: number, e: any) => s + Number(e.reward_score), 0) / exps.length).toFixed(1)}):
${exps.slice(0, 3).map((e: any) => `  - Objective: ${e.objective}, Reward: ${e.reward_score}, Actions: ${JSON.stringify(e.action_sequence?.slice(0, 3))}`).join('\n')}`
).join('\n\n')}

Extract reusable strategy templates.`
              }
            ],
            max_tokens: 1000,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(20000),
        })

        if (response.ok) {
          const result = await response.json()
          const content = result.choices?.[0]?.message?.content || ''
          const jsonMatch = content.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            for (const t of parsed) {
              templates.push(t)
            }
          }
        }
      } catch (aiErr) {
        console.warn('AI strategy extraction failed, using heuristic:', aiErr)
      }
    }

    // Heuristic fallback: create one template per game state with enough data
    if (templates.length === 0) {
      for (const [state, exps] of Object.entries(stateGroups)) {
        if (exps.length < 2) continue
        const avgReward = exps.reduce((s: number, e: any) => s + Number(e.reward_score), 0) / exps.length
        templates.push({
          name: `${gameName} - ${state} strategy`,
          description: `Extracted from ${exps.length} experiences in "${state}" state with avg reward ${avgReward.toFixed(1)}`,
          game_state: state,
          action_pattern: exps[0].action_sequence?.slice(0, 5) || [],
          is_transferable: state === 'menu' || state === 'loading',
          tags: [state, gameName.toLowerCase().replace(/\s+/g, '_')],
        })
      }
    }

    // Store templates
    let templatesCreated = 0
    for (const t of templates) {
      const avgReward = stateGroups[t.game_state]
        ? stateGroups[t.game_state].reduce((s: number, e: any) => s + Number(e.reward_score), 0) / stateGroups[t.game_state].length
        : 0

      const { error: insertError } = await supabaseClient
        .from('strategy_templates')
        .insert({
          name: t.name,
          description: t.description || null,
          source_game: gameName,
          game_state: t.game_state || 'any',
          action_pattern: t.action_pattern || [],
          is_transferable: t.is_transferable || false,
          tags: t.tags || [],
          avg_reward: Number(avgReward.toFixed(2)),
        })

      if (!insertError) templatesCreated++
    }

    console.log(`📋 EXTRACT: Created ${templatesCreated} templates from ${experiences.length} experiences`)

    return new Response(JSON.stringify({
      success: true,
      templatesCreated,
      templates,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('📋 EXTRACT ERROR:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

async function zeroShotPlan(supabaseClient: any, perception: any, gameName: string, transferredTemplates: any[]) {
  const startTime = Date.now()
  console.log(`🎯 ZERO-SHOT: Planning for unseen game "${gameName}" with ${transferredTemplates?.length || 0} transferred templates`)

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      // Fallback to heuristic
      return new Response(JSON.stringify({
        success: true,
        plan: heuristicReasoning(perception, gameName, 'Play this unseen game using general gaming knowledge', Date.now() - startTime)
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const templateContext = transferredTemplates?.length > 0
      ? `\n\nTRANSFERRED STRATEGIES FROM OTHER GAMES:\n${transferredTemplates.map((t: any) =>
          `- "${t.name}" from ${t.source_game} (reward: ${t.avg_reward}, state: ${t.game_state}): ${t.description || 'No description'}\n  Action pattern: ${JSON.stringify(t.action_pattern?.slice(0, 3))}`
        ).join('\n')}`
      : ''

    const systemPrompt = `You are a ZERO-SHOT game playing agent. You have NEVER seen this game before.
Your job is to figure out how to play an unseen game by:
1. Analyzing the visual layout and UI elements on screen
2. Using general gaming knowledge (menus have play buttons, games have interactive elements, etc.)
3. Applying any transferred strategies from similar games

${templateContext}

You must generate a careful, exploratory action plan. Since this is an unseen game:
- Start with safe exploratory actions (tapping obvious buttons, dismissing popups)
- Look for familiar UI patterns (play buttons, X to close, arrows to navigate)
- Avoid random tapping — be methodical
- Plan observation steps between actions to check results

RESPOND WITH ONLY a JSON object:
{
  "chainOfThought": "Your full reasoning about what you see and what this game might be...",
  "currentAssessment": "Summary of the unfamiliar game state",
  "steps": [
    {
      "id": 1,
      "thought": "Why I'm doing this exploratory action",
      "action": { "type": "tap|swipe|wait|dismiss", "coordinates": { "x": 360, "y": 640 }, "swipeDirection": "up" },
      "expectedOutcome": "What I expect to learn or achieve",
      "confidence": 0.5
    }
  ],
  "overallConfidence": 0.4,
  "estimatedDurationMs": 8000,
  "alternativeStrategy": "Backup plan if primary approach fails"
}`

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
            content: `UNSEEN GAME: ${gameName}\n\nPERCEPTION DATA:\n${perceptionSummary}\n\nGenerate a careful, exploratory zero-shot action plan.`
          }
        ],
        max_tokens: 2000,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ success: false, error: 'Payment required' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({
        success: true,
        plan: heuristicReasoning(perception, gameName, 'Play this unseen game', Date.now() - startTime)
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        const processingTimeMs = Date.now() - startTime

        const plan = {
          timestamp: new Date().toISOString(),
          objective: `Zero-shot: Play unseen game "${gameName}" using generalized knowledge`,
          chainOfThought: parsed.chainOfThought || 'Zero-shot reasoning — no prior experience with this game',
          currentAssessment: parsed.currentAssessment || 'Analyzing unseen game',
          steps: (parsed.steps || []).map((s: any, i: number) => ({
            id: s.id || i + 1,
            thought: s.thought || 'Exploratory action',
            action: s.action ? {
              type: s.action.type || 'tap',
              coordinates: s.action.coordinates ? {
                x: Math.max(0, Math.min(720, s.action.coordinates.x)),
                y: Math.max(0, Math.min(1280, s.action.coordinates.y)),
              } : undefined,
              swipeDirection: s.action.swipeDirection || undefined,
              duration: s.action.duration || undefined,
            } : null,
            expectedOutcome: s.expectedOutcome || 'Unknown — exploratory',
            confidence: Math.min(1, Math.max(0, s.confidence || 0.3)),
            status: 'pending',
          })),
          overallConfidence: Math.min(1, Math.max(0, parsed.overallConfidence || 0.3)),
          estimatedDurationMs: parsed.estimatedDurationMs || 8000,
          alternativeStrategy: parsed.alternativeStrategy || 'Try tapping prominent UI elements',
          processingTimeMs,
        }

        console.log(`🎯 ZERO-SHOT: Plan generated in ${processingTimeMs}ms — ${plan.steps.length} steps`)

        return new Response(JSON.stringify({ success: true, plan }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } catch (parseError) {
        console.error('Zero-shot JSON parse error:', parseError)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      plan: heuristicReasoning(perception, gameName, 'Play this unseen game', Date.now() - startTime)
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('🎯 ZERO-SHOT ERROR:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

async function transferKnowledge(supabaseClient: any, targetGame: string, targetState?: string) {
  console.log(`🔄 TRANSFER: Finding transferable strategies for ${targetGame}, state: ${targetState || 'any'}`)

  try {
    // Get transferable templates from OTHER games
    let query = supabaseClient
      .from('strategy_templates')
      .select('*')
      .eq('is_transferable', true)
      .neq('source_game', targetGame)
      .order('avg_reward', { ascending: false })
      .limit(10)

    if (targetState && targetState !== 'unknown') {
      query = query.or(`game_state.eq.${targetState},game_state.eq.any`)
    }

    const { data: templates, error } = await query
    if (error) throw error

    // Also get the target game's own high-reward experiences for context
    const { data: targetExperiences } = await supabaseClient
      .from('agent_experiences')
      .select('game_state, reward_score, objective')
      .eq('game_name', targetGame)
      .order('reward_score', { ascending: false })
      .limit(5)

    console.log(`🔄 TRANSFER: Found ${templates?.length || 0} transferable templates`)

    return new Response(JSON.stringify({
      success: true,
      applicableTemplates: templates || [],
      targetGameContext: {
        game: targetGame,
        state: targetState,
        existingExperiences: targetExperiences?.length || 0,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('🔄 TRANSFER ERROR:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// ============================================================================
// SERVER-SIDE TILE PARK PLAYER
// Launches Tile Park and runs the Gemini agent loop entirely in the edge runtime
// (no browser polling). Uses EdgeRuntime.waitUntil so the HTTP response returns
// immediately while play continues in the background.
// ============================================================================
async function playTileParkServerSide(
  supabaseClient: any,
  hardwareDeviceId: string,
  rounds: number
) {
  console.log(`🎮 [play-tilepark] Request: deviceId=${hardwareDeviceId} rounds=${rounds}`)

  if (!hardwareDeviceId) {
    return new Response(JSON.stringify({ success: false, error: 'Missing deviceId' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // 1. Launch the game (synchronous so we can report immediate failures)
  let launchResp: Response
  try {
    launchResp = await startBotSession(supabaseClient, null as any, {
      deviceId: hardwareDeviceId,
      gameName: 'Tile Park',
      packageName: 'funvent.tilepark',
      config: { rounds, serverSide: true },
    })
  } catch (e: any) {
    console.error('🎮 [play-tilepark] Launch threw:', e)
    return new Response(JSON.stringify({ success: false, error: e.message || String(e) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const launchData = await launchResp.clone().json().catch(() => ({}))
  if (!launchData?.success || !launchData?.launched) {
    console.error('🎮 [play-tilepark] Launch failed:', launchData)
    return new Response(JSON.stringify({
      success: false,
      error: launchData?.launchMessage || launchData?.error || 'Failed to launch Tile Park',
      launchData,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const sessionId = launchData.session?.id
  const hwId = launchData.hardwareDeviceId || hardwareDeviceId
  console.log(`🎮 [play-tilepark] Launched. session=${sessionId} hw=${hwId}. Scheduling background loop.`)

  // 2. Run the agent loop in the background. The HTTP response returns now.
  const runner = async () => {
    try {
      // Give the game 4s to load before first capture
      await new Promise(r => setTimeout(r, 4000))

      for (let round = 1; round <= rounds; round++) {
        // Check if user stopped the session
        const { data: s } = await supabaseClient
          .from('bot_sessions')
          .select('status')
          .eq('id', sessionId)
          .single()
        if (!s || s.status !== 'running') {
          console.log(`🛑 [play-tilepark] Session ${sessionId} no longer running (status=${s?.status}). Stopping.`)
          break
        }

        console.log(`🔁 [play-tilepark] Round ${round}/${rounds}`)
        const r = await runBotLoop(supabaseClient, sessionId, hwId, 1)
        const body = await r.clone().json().catch(() => ({}))
        if (!body?.success) {
          console.warn(`⚠️ [play-tilepark] Round ${round} failed: ${body?.error}`)
        }
        // Pace rounds (game animations + rate limits)
        if (round < rounds) await new Promise(r => setTimeout(r, 2000))
      }

      await supabaseClient
        .from('bot_sessions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('status', 'running')

      console.log(`🏁 [play-tilepark] Finished session ${sessionId}`)
    } catch (e: any) {
      console.error('🎮 [play-tilepark] Background loop error:', e)
      await supabaseClient
        .from('bot_sessions')
        .update({
          status: 'error',
          error_message: e.message || String(e),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
    }
  }

  // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(runner())
  } else {
    runner()
  }

  return new Response(JSON.stringify({
    success: true,
    started: true,
    sessionId,
    hardwareDeviceId: hwId,
    rounds,
    message: `Gemini agent started on device ${hwId} for ${rounds} rounds`,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

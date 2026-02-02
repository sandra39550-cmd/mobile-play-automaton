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

// Known game package patterns and specific games
const KNOWN_GAME_PACKAGES = [
  // Match games
  'com.king.candycrushsaga',
  'com.king.candycrushsodasaga',
  'com.king.farmheroessaga',
  'com.supercell.clashofclans',
  'com.supercell.clashroyale',
  'com.supercell.brawlstars',
  'com.rovio.angrybirds',
  'com.igg.castleclash',
  'com.gameloft',
  'com.ea.game',
  'com.zynga',
  'com.outfit7',
  'com.halfbrick',
  'com.mojang.minecraftpe',
  'com.kiloo.subwaysurf',
  'com.nekki',
  'com.fingersoft.hillclimb',
  'com.dts.freefireth',
  'com.tencent.ig',
  'com.pubg',
  'com.activision.callofduty',
  'com.roblox.client',
  'com.funvent.tilepark', // Tile Park specific
]

// Package name patterns that indicate games
const GAME_PATTERNS = [
  /\.game\./i,
  /game$/i,
  /games\./i,
  /\.play\./i,
  /puzzle/i,
  /arcade/i,
  /adventure/i,
  /racing/i,
  /shooter/i,
  /rpg/i,
  /casino/i,
  /slots/i,
  /candy/i,
  /crush/i,
  /clash/i,
  /craft/i,
  /ninja/i,
  /zombie/i,
  /dragon/i,
  /hero/i,
  /saga/i,
  /run/i,
  /jump/i,
  /tilepark/i,
  /tile/i,
]

function isSkippedPackage(pkg: string): boolean {
  const skipPrefixes = [
    'com.android.',
    'com.google.android.',
    'com.samsung.',
    'com.sec.',
    'com.microsoft.',
    'com.facebook.',
    'com.monotype.',
    'com.dsi.ant.',
    'com.gd.mobicore.',
    'com.osp.',
    'org.simalliance.',
    'com.cleanmaster.',
    'android.',
  ]
  
  const skipExact = [
    'com.whatsapp',
    'android',
    'com.wsomacp',
    'com.wssnps',
    'com.policydm',
    'com.wssyncmldm',
  ]
  
  if (skipPrefixes.some(prefix => pkg.startsWith(prefix))) return true
  if (skipExact.includes(pkg)) return true
  
  const systemPatterns = [
    /\.service$/i,
    /\.provider$/i,
    /\.signin$/i,
    /\.socket$/i,
    /\.server$/i,
    /\.sdk$/i,
    /\.pa$/i,
    /font\./i,
  ]
  if (systemPatterns.some(pattern => pattern.test(pkg))) return true
  
  return false
}

function filterGamePackages(packages: string[]): { packageName: string; name: string }[] {
  const games: { packageName: string; name: string }[] = []

  for (const pkg of packages) {
    if (isSkippedPackage(pkg)) continue

    const isKnownGame = KNOWN_GAME_PACKAGES.some((known) => pkg.startsWith(known))
    const matchesPattern = GAME_PATTERNS.some((pattern) => pattern.test(pkg))

    if (isKnownGame || matchesPattern) {
      games.push({
        packageName: pkg,
        name: formatPackageName(pkg),
      })
    }
  }

  return games
}

function packagesToApps(packages: string[]): { packageName: string; name: string }[] {
  return packages
    .filter((pkg) => !isSkippedPackage(pkg))
    .map((pkg) => ({ packageName: pkg, name: formatPackageName(pkg) }))
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
      return (result.apps || []).map((app: any) => ({
        name: app.name || formatPackageName(app.packageName || app),
        icon: app.icon || '🎮',
        category: app.category || 'Game',
        packageName: app.packageName || app,
        isInstalled: true,
      }))
    }

    if (!response.ok) {
      throw new Error(`Scan failed: ${response.status}`)
    }
    
    const result = await response.json()
    
    return (result.apps || []).map((app: any) => ({
      name: app.name || formatPackageName(app.packageName || app),
      icon: app.icon || '🎮',
      category: app.category || 'Game',
      packageName: app.packageName || app,
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
      
      if (!screenshot) {
        console.warn('⚠️ Failed to capture screenshot, skipping iteration')
        continue
      }
      
      // 2. Analyze screenshot with AI to find tile matches
      let analysis
      if (session.game_name.toLowerCase().includes('tile') || 
          session.package_name.toLowerCase().includes('tilepark')) {
        // Use AI vision for Tile Park
        analysis = await analyzeScreenWithGemini(screenshot, session.game_name)
      } else {
        // Fallback to heuristic analysis
        analysis = analyzeScreenHeuristic(session.game_name)
      }
      
      // 3. Execute the recommended action
      if (analysis.action) {
        // Add deviceId to the action
        const actionWithDevice = {
          ...analysis.action,
          deviceId: deviceId
        }
        
        const actionResult = await executeRealAction(baseUrl, actionWithDevice)
        actionsPerformed++
        
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
      console.log('📸 Screenshot captured successfully (POST)')
      return result.screenshot || ''
    }

    const postText = await postResponse.text()
    console.error('Screenshot POST failed:', postText)

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
      console.error('Screenshot GET failed:', await getResponse.text())
      return ''
    }

    const result = await getResponse.json()
    console.log('📸 Screenshot captured successfully (GET)')
    return result.screenshot || ''
  } catch (error) {
    console.error('Screenshot error:', error)
    return ''
  }
}

// Analyze screenshot with Gemini AI for Tile Park game
async function analyzeScreenWithGemini(screenshot: string, gameName: string): Promise<{
  action: DeviceAction | null
  description: string
  tiles?: any[]
}> {
  console.log(`🧠 Analyzing ${gameName} screenshot with AI...`)
  
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  
  if (!LOVABLE_API_KEY) {
    console.warn('⚠️ LOVABLE_API_KEY not configured, using heuristic analysis')
    return analyzeScreenHeuristic(gameName)
  }
  
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
          {
            role: 'system',
            content: `You are a game automation assistant analyzing screenshots of the Tile Park game. 
            
The game shows a grid of tiles with fruit/vegetable icons (carrots, avocados, grapes, etc.). 
The goal is to tap matching tiles to remove them.

Analyze the screenshot and identify:
1. The current game state (menu, playing, level complete, etc.)
2. Visible tiles and their positions
3. The best tile to tap next (prioritize matching pairs that are accessible)

The screen is 720x1280 pixels. The game board is typically in the center.
- The tile area is roughly x: 150-570, y: 400-800
- Each tile is approximately 80-100 pixels wide

Respond with JSON in this exact format:
{
  "gameState": "playing" | "menu" | "level_complete" | "game_over",
  "action": {
    "type": "tap",
    "x": <number between 150-570>,
    "y": <number between 400-800>,
    "tileType": "carrot" | "avocado" | "grapes" | "unknown"
  },
  "description": "Brief description of what you see and why you chose this action",
  "confidence": <0-1>
}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this Tile Park game screenshot and tell me which tile to tap next.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: screenshot
                }
              }
            ]
          }
        ],
        max_tokens: 500
      }),
      signal: AbortSignal.timeout(15000)
    })
    
    if (!response.ok) {
      console.error('AI analysis failed:', response.status, await response.text())
      return analyzeScreenHeuristic(gameName)
    }
    
    const result = await response.json()
    const content = result.choices?.[0]?.message?.content || ''
    
    console.log('🧠 AI response:', content)
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        
        if (parsed.action && parsed.action.x && parsed.action.y) {
          return {
            action: {
              type: 'tap',
              coordinates: { 
                x: Math.round(parsed.action.x), 
                y: Math.round(parsed.action.y) 
              }
            },
            description: parsed.description || `AI detected ${parsed.action.tileType || 'tile'} at (${parsed.action.x}, ${parsed.action.y})`
          }
        }
      } catch (parseError) {
        console.error('Failed to parse AI response JSON:', parseError)
      }
    }
    
    // If parsing failed, use heuristic
    return analyzeScreenHeuristic(gameName)
  } catch (error) {
    console.error('AI analysis error:', error)
    return analyzeScreenHeuristic(gameName)
  }
}

// Heuristic-based screen analysis (fallback)
function analyzeScreenHeuristic(gameName: string): {
  action: DeviceAction | null
  description: string
} {
  const lowerGame = gameName.toLowerCase()
  
  // Tile Park / Tile matching games
  if (lowerGame.includes('tile') || lowerGame.includes('match') || lowerGame.includes('puzzle')) {
    // Tile Park game board is typically centered
    // Random tap in the game tile area (based on 720x1280 screen)
    // Game area is approximately: x=150-570, y=400-800
    const tilePositions = [
      { x: 200, y: 450 }, { x: 290, y: 450 }, { x: 380, y: 450 }, { x: 470, y: 450 },
      { x: 200, y: 530 }, { x: 290, y: 530 }, { x: 380, y: 530 }, { x: 470, y: 530 },
      { x: 200, y: 610 }, { x: 290, y: 610 }, { x: 380, y: 610 }, { x: 470, y: 610 },
      { x: 200, y: 690 }, { x: 290, y: 690 }, { x: 380, y: 690 }, { x: 470, y: 690 },
    ]
    
    // Pick a random tile position
    const pos = tilePositions[Math.floor(Math.random() * tilePositions.length)]
    
    return {
      action: {
        type: 'tap',
        coordinates: pos
      },
      description: `Tapping tile at (${pos.x}, ${pos.y})`
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

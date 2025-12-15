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

// Get ADB server URL from database (auto-detected) or fallback to env var
async function getAdbServerUrl(supabaseClient: any): Promise<string> {
  try {
    // Try to get the URL from the database first (auto-detected by ADB server)
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

    // Fallback to environment variable if database lookup fails
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
  
  // Get real device ID from ADB
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
  
  // Check device status
  const deviceStatus = await checkADBConnection(realDeviceId, supabaseClient)
  
  // Check if device already exists (check by name to allow ID updates)
  const { data: existingDevice } = await supabaseClient
    .from('devices')
    .select('id')
    .eq('name', deviceInfo.name)
    .maybeSingle()

  let data, error
  
  if (existingDevice) {
    // Update existing device with real device ID
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
    // Insert new device with real device ID
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
    const isConnected = await checkADBConnection(device.device_id, supabaseClient)
    
    // Update device status in database
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

// Check if device is connected via ADB (USB or wireless)
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
      console.error('⚠️ ADB_SERVER_URL not configured - device cannot be online without ADB server')
      return false
    }

    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    const statusUrl = `${baseUrl}/devices`
    
    console.log('🔍 Checking ADB server for connected devices at:', statusUrl)
    
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
    
    if (!response.ok) {
      console.error('❌ ADB server request failed:', response.status, await response.text())
      return false
    }
    
    const result = await response.json()
    const connectedDevices = result.devices || []
    
    console.log('📱 Connected devices via ADB:', JSON.stringify(connectedDevices))
    console.log(`🔎 Looking for device: ${deviceId}`)
    
    // Check if our device is in the list of connected devices (USB or wireless)
    const isConnected = connectedDevices.some((d: any) => {
      const matchesSerial = d.id === deviceId || d.serial === deviceId
      // Handle both 'status' and 'type' field names, check for 'device' value
      const isDevice = d.status === 'device' || d.type === 'device'
      console.log(`  Comparing: ${d.id} === ${deviceId}, status/type: ${d.status || d.type}, match: ${matchesSerial && isDevice}`)
      return matchesSerial && isDevice
    })
    
    console.log(`✅ Device ${deviceId} final status: ${isConnected ? '🟢 ONLINE' : '🔴 OFFLINE'}`)
    return isConnected
  } catch (error) {
    console.error('❌ Error checking device via ADB:', error.message)
    return false
  }
}

// Real ADB device connection functions
async function simulateDeviceConnection(deviceInfo: any): Promise<boolean> {
  try {
    const adbServerUrl = Deno.env.get('ADB_SERVER_URL')
    if (!adbServerUrl) {
      console.warn('ADB_SERVER_URL not configured, treating device as online')
      return true
    }

    console.log('Connecting to real device:', deviceInfo.deviceId)
    
    const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
    
    // First, get list of connected devices to find the real device ID
    try {
      const devicesResponse = await fetch(`${baseUrl}/devices`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000)
      })
      
      if (devicesResponse.ok) {
        const devicesResult = await devicesResponse.json()
        const connectedDevices = devicesResult.devices || []
        console.log('Found connected devices:', JSON.stringify(connectedDevices))
        
          // If there are connected devices, use the first one's ID
          if (connectedDevices.length > 0) {
            const realDeviceId = connectedDevices[0].id
            console.log(`Using real device ID from ADB: ${realDeviceId}`)
            // Check connection using the real device ID - no supabaseClient needed in this helper
            return await checkADBConnection(realDeviceId)
          }
      }
    } catch (error) {
      console.error('Error getting device list:', error)
    }
    
    // Fallback: check with provided device ID
    return await checkADBConnection(deviceInfo.deviceId)
  } catch (error) {
    console.error('Error in device connection:', error)
    return false
  }
}

async function simulateDeviceAction(action: DeviceAction): Promise<{ success: boolean; result?: any }> {
  try {
    // Note: This function is called without supabaseClient, so we use env var fallback
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
    // Note: This function is called without supabaseClient, so we use env var fallback
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
  try {
    console.log('🎮 Scanning device for games:', deviceId)
    
    const adbServerUrl = await getAdbServerUrl(supabaseClient)
    
    // Verify device is online
    const { data: device, error: deviceError } = await supabaseClient
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .single()

    console.log('Device lookup result:', device, 'Error:', deviceError)

    if (deviceError || !device) {
      console.error('Device not found or error:', deviceError)
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Device not found',
        games: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Device found: ${device.name}, status: ${device.status}, device_id: ${device.device_id}`)

    if (device.status !== 'online') {
      return new Response(JSON.stringify({ 
        success: false,
        error: `Device ${device.name} is ${device.status}. Please ensure device is connected via ADB.`,
        games: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Scan installed games on the device
    const installedGames = await simulateGameScan(device, adbServerUrl)
    
    console.log('=== SCAN COMPLETE, RETURNING GAMES ===')
    console.log('Games found:', JSON.stringify(installedGames))
    
    return new Response(JSON.stringify({ 
      success: true, 
      games: installedGames
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('=== SCAN FAILED ===')
    console.error('Error:', error.message)
    
    // Always return 200 with success:false for proper error handling
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
    const errorMsg = '❌ ADB_SERVER_URL not configured - cannot scan real games'
    console.error(errorMsg)
    throw new Error('ADB server not configured. Please ensure ngrok tunnel is running.')
  }

  // Ensure URL has protocol
  const baseUrl = adbServerUrl.startsWith('http') ? adbServerUrl : `http://${adbServerUrl}`
  
  // First check if ADB server is reachable
  const healthPaths = ['/health', '/devices']
  let reachable = false

  for (const path of healthPaths) {
    const url = `${baseUrl}${path}`
    console.log(`🏥 Health check: ${url}`)

    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })

      if (res.ok) {
        reachable = true
        break
      }

      // If /health isn't implemented, many servers return 404; try next endpoint.
      console.warn(`⚠️ Health check ${path} returned status ${res.status}`)
    } catch (e) {
      console.warn(`⚠️ Health check ${path} failed: ${e?.message ?? String(e)}`)
    }
  }

  if (!reachable) {
    throw new Error(
      `ADB server is offline at ${baseUrl}. Please ensure:\n1. ADB server is running: cd adb-server && node server.js\n2. ngrok is tunneling localhost:3000: ngrok http 3000\n3. ADB_SERVER_URL env var is set to your ngrok URL`
    )
  }

  console.log('✅ ADB server is reachable')

  // Now scan for games
  const scanUrl = `${baseUrl}/scan-apps`
  console.log(`📡 Calling ADB server at: ${scanUrl}`)
  console.log(`📤 Request body:`, JSON.stringify({ deviceId: device.device_id, category: 'games' }))
  
  try {
    const response = await fetch(scanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: device.device_id,
        category: 'games',
      }),
      signal: AbortSignal.timeout(15000), // 15 second timeout for scanning
    })

    console.log(`📥 ADB server response status: ${response.status}`)

    // Some proxies / mismatched servers return 404 "Cannot POST /scan-apps".
    // Fall back to GET /scan-apps?deviceId=...&category=games.
    if (!response.ok && response.status === 404) {
      const fallbackUrl = `${baseUrl}/scan-apps?deviceId=${encodeURIComponent(device.device_id)}&category=${encodeURIComponent('games')}`
      console.warn(`↩️ Falling back to GET scan endpoint: ${fallbackUrl}`)

      const fallbackRes = await fetch(fallbackUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
      })

      console.log(`📥 ADB server fallback status: ${fallbackRes.status}`)

      if (!fallbackRes.ok) {
        const errorText = await fallbackRes.text()
        console.error(`❌ Failed to scan games (fallback ${fallbackRes.status}):`, errorText.substring(0, 500))
        throw new Error(`ADB server returned ${fallbackRes.status}: ${errorText.substring(0, 200)}`)
      }

      const result = await fallbackRes.json()
      console.log(`📦 Raw ADB server response (fallback):`, JSON.stringify(result))

      const apps = result.apps || []
      if (!apps.length) {
        console.warn('⚠️ ADB server returned empty apps array (fallback)')
        return []
      }

      const mappedGames = apps.map((app: any) => ({
        name: app.name || app.packageName,
        icon: app.icon || '🎮',
        category: app.category || 'Game',
        packageName: app.packageName,
        isInstalled: true,
      }))

      console.log(`✅ Successfully scanned ${mappedGames.length} games (fallback):`, mappedGames.map((g: any) => g.name).join(', '))
      return mappedGames
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Failed to scan games (${response.status}):`, errorText.substring(0, 500))
      throw new Error(`ADB server returned ${response.status}: ${errorText.substring(0, 200)}`)
    }
    
    const result = await response.json()
    console.log(`📦 Raw ADB server response:`, JSON.stringify(result))
    console.log(`🎮 Apps array:`, JSON.stringify(result.apps))
    console.log(`📊 Number of apps found: ${(result.apps || []).length}`)
    
    if (!result.apps || result.apps.length === 0) {
      console.warn('⚠️ ADB server returned empty apps array')
      console.log('Device might not have any games installed')
      return []
    }
    
    // Map game apps to expected format
    const mappedGames = (result.apps || []).map((app: any) => ({
      name: app.name || app.packageName,
      icon: app.icon || "🎮",
      category: app.category || "Game",
      packageName: app.packageName,
      isInstalled: true
    }))
    
    console.log(`✅ Successfully scanned ${mappedGames.length} games:`, mappedGames.map(g => g.name).join(', '))
    return mappedGames
  } catch (error) {
    console.error('❌ Error scanning games:', error.message)
    throw error
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
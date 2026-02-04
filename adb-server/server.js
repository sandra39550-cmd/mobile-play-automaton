const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const execPromise = util.promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const NGROK_API_PORT = 4040;
const SUPABASE_PROJECT_ID = 'smyhauaifoqargpcjpkf';
const UPDATE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/update-adb-url`;

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.json({ status: 'ok', message: 'ADB HTTP Server is running', timestamp: new Date().toISOString() });
});

// Connect to device via WiFi
app.post('/connect', async (req, res) => {
  const { host, port, deviceId } = req.body;
  
  console.log(`Connecting to device ${deviceId} at ${host}:${port}`);
  
  try {
    const { stdout, stderr } = await execPromise(`adb connect ${host}:${port}`);
    const success = stdout.includes('connected');
    
    console.log('Connection result:', stdout);
    
    res.json({ 
      success, 
      message: stdout,
      error: stderr 
    });
  } catch (error) {
    console.error('Connection error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// List connected devices
app.get('/devices', async (req, res) => {
  console.log('📱 Listing devices...');
  try {
    const { stdout } = await execPromise('adb devices -l');
    const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('List of devices'));
    
    const devices = lines.map(line => {
      const parts = line.split(/\s+/);
      const device = {
        id: parts[0],
        status: parts[1]
      };
      
      // Extract model name if available
      const modelMatch = line.match(/model:(\S+)/);
      if (modelMatch) {
        device.model = modelMatch[1];
      }
      
      return device;
    }).filter(d => d.id && d.status);
    
    console.log('📱 Found devices:', devices);
    res.json({ success: true, devices });
  } catch (error) {
    console.error('Device listing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute device action
app.post('/action', async (req, res) => {
  const { type, coordinates, packageName, swipeDirection, duration, deviceId } = req.body;

  console.log('========================================');
  console.log('🎯 ACTION RECEIVED:', type);
  console.log('📦 Full payload:', JSON.stringify(req.body, null, 2));
  console.log('========================================');

  try {
    // If a specific deviceId is provided, target it explicitly with `adb -s`.
    const adbPrefix = deviceId ? `adb -s ${deviceId}` : 'adb';

    let command = '';

    console.log('🔍 Building command for type:', type, '| deviceId:', deviceId, '| packageName:', packageName);
    
    switch (type) {
      case 'tap':
        if (!coordinates || typeof coordinates.x !== 'number' || typeof coordinates.y !== 'number') {
          return res.status(400).json({ success: false, error: 'Invalid tap coordinates' });
        }
        command = `${adbPrefix} shell input tap ${coordinates.x} ${coordinates.y}`;
        console.log('👆 tap case matched, command:', command);
        break;

      case 'swipe':
        const directions = {
          up: '540 1500 540 500',
          down: '540 500 540 1500',
          left: '900 960 100 960',
          right: '100 960 900 960'
        };
        const swipeCoords = directions[swipeDirection] || directions.up;
        command = `${adbPrefix} shell input swipe ${swipeCoords} ${duration || 300}`;
        console.log('👋 swipe case matched, command:', command);
        break;

      case 'open_app':
        if (!packageName) {
          return res.status(400).json({ success: false, error: 'Package name required for open_app' });
        }
        command = `${adbPrefix} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
        console.log('📱 open_app case matched, command:', command);
        break;

      case 'close_app':
        if (!packageName) {
          return res.status(400).json({ success: false, error: 'Package name required for close_app' });
        }
        command = `${adbPrefix} shell am force-stop ${packageName}`;
        console.log('🛑 close_app case matched, command:', command);
        break;

      case 'screenshot':
        command = `${adbPrefix} shell screencap -p /sdcard/screenshot.png`;
        console.log('📸 screenshot case matched, command:', command);
        break;

      default:
        console.log('❌ Unknown action type:', type);
        return res.status(400).json({ success: false, error: `Unknown action type: ${type}` });
    }

    if (!command) {
      console.log('❌ No command built!');
      return res.status(400).json({ success: false, error: 'No command built for action' });
    }

    console.log('🔧 Executing command:', command);
    
    const { stdout, stderr } = await execPromise(command);

    console.log('✅ Command stdout:', stdout || '(empty)');
    if (stderr) console.log('⚠️ Command stderr:', stderr);
    console.log('========================================');

    res.json({
      success: true,
      result: stdout || `${type} executed successfully`,
      error: stderr
    });
  } catch (error) {
    console.error('❌ ACTION ERROR:', error.message);
    console.error('Full error:', error);
    console.log('========================================');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Take screenshot - shared handler
async function handleScreenshotRequest(deviceId, res) {
  console.log('========================================');
  console.log('📸 SCREENSHOT REQUEST');
  console.log('📱 Device ID:', deviceId || '(default - first device)');
  console.log('========================================');

  try {
    const adbPrefix = deviceId ? `adb -s ${deviceId}` : 'adb';

    // Step 1: Take screenshot on device
    console.log('📸 Step 1: Taking screenshot on device...');
    const screencapCmd = `${adbPrefix} shell screencap -p /sdcard/screenshot.png`;
    console.log('🔧 Command:', screencapCmd);
    await execPromise(screencapCmd);
    console.log('✅ Screenshot captured on device');

    // Step 2: Pull screenshot to server
    console.log('📸 Step 2: Pulling screenshot to server...');
    const timestamp = Date.now();
    const localPath = path.join(__dirname, `screenshot_${timestamp}.png`);
    const pullCmd = `${adbPrefix} pull /sdcard/screenshot.png ${localPath}`;
    console.log('🔧 Command:', pullCmd);
    await execPromise(pullCmd);
    console.log('✅ Screenshot pulled to:', localPath);

    // Step 3: Read and convert to base64
    console.log('📸 Step 3: Converting to base64...');
    const imageBuffer = fs.readFileSync(localPath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    console.log('✅ Base64 size:', Math.round(base64Image.length / 1024), 'KB');

    // Step 4: Cleanup
    console.log('📸 Step 4: Cleaning up...');
    fs.unlinkSync(localPath);
    await execPromise(`${adbPrefix} shell rm /sdcard/screenshot.png`);
    console.log('✅ Cleanup complete');

    console.log('========================================');
    console.log('✅ SCREENSHOT SUCCESS');
    console.log('========================================');

    res.json({
      success: true,
      screenshot: base64Image
    });
  } catch (error) {
    console.error('========================================');
    console.error('❌ SCREENSHOT ERROR:', error.message);
    console.error('Full error:', error);
    console.error('========================================');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// POST version (preferred)
app.post('/screenshot', async (req, res) => {
  console.log('📸 Screenshot request via POST');
  const { deviceId } = req.body || {};
  return handleScreenshotRequest(deviceId, res);
});

// GET fallback (helps when proxies/tunnels don't POST)
app.get('/screenshot', async (req, res) => {
  console.log('📸 Screenshot request via GET');
  const { deviceId } = req.query || {};
  return handleScreenshotRequest(deviceId, res);
});

// Strict game detection - only matches actual games visible in launcher
const KNOWN_GAME_PACKAGES = [
  'tilepark', 'poolbilliard', 'pool.billiard', 'billiard',
  'com.king.', 'com.supercell.', 'com.rovio.', 'com.gameloft.',
  'com.ea.game', 'com.zynga.', 'com.outfit7.', 'com.halfbrick.',
  'com.mojang.', 'com.kiloo.', 'com.nekki.', 'com.fingersoft.',
  'com.dts.freefireth', 'com.tencent.ig', 'com.pubg.', 'com.activision.',
  'com.roblox.', 'com.igg.', 'com.playrix.', 'com.miniclip.',
  'com.nimblebit.', 'com.ketchapp.', 'com.voodoo.', 'com.yodo1.',
  'com.azurgames.', 'com.crazylabs.', 'com.ludo.', 'me.pou.'
];

// Packages to explicitly exclude
const EXCLUDED_PACKAGES = [
  'com.android', 'com.google', 'com.samsung', 'com.sec.',
  'com.microsoft', 'com.facebook.katana', 'com.whatsapp',
  'com.instagram', 'com.twitter', 'com.snapchat',
  'provider', 'service', 'settings', 'launcher', 'keyboard',
  'chrome', 'browser', 'camera', 'gallery', 'phone', 'contacts',
  'calendar', 'clock', 'calculator', 'weather', 'music', 'video',
  'youtube', 'maps', 'drive', 'docs', 'sheets', 'slides',
  'gmail', 'email', 'message', 'dialer'
];

function isGamePackage(pkg) {
  const lowerPkg = pkg.toLowerCase();
  
  if (EXCLUDED_PACKAGES.some(ex => lowerPkg.includes(ex))) {
    return false;
  }
  
  if (KNOWN_GAME_PACKAGES.some(known => lowerPkg.includes(known.toLowerCase()))) {
    return true;
  }
  
  const strictGameTerms = [
    /\.game\./i, /\.games\./i, /puzzle/i, /arcade/i,
    /candy/i, /crush/i, /clash/i, /craft/i, /quest/i,
    /tile/i, /match3/i, /bubble/i, /jewel/i, /solitaire/i,
    /poker/i, /chess/i, /sudoku/i, /trivia/i, /quiz/i,
    /zombie/i, /dragon/i, /ninja/i, /hero/i, /saga/i,
    /tower/i, /defense/i, /battle/i, /strike/i, /war\./i,
    /farm/i, /city/i, /tycoon/i, /idle/i, /clicker/i,
    /racing/i, /drift/i, /runner/i, /endless/i,
    /pool/i, /billiard/i, /snooker/i, /8ball/i
  ];
  
  return strictGameTerms.some(pattern => pattern.test(lowerPkg));
}

// Scan installed apps (games only)
async function handleScanApps(deviceId, category) {
  console.log('========================================');
  console.log('🔍 SCANNING APPS');
  console.log('📱 Device ID:', deviceId || '(default)');
  console.log('========================================');

  const adbPrefix = deviceId ? `adb -s ${deviceId}` : 'adb';
  const { stdout } = await execPromise(`${adbPrefix} shell pm list packages -3`);

  const packages = stdout
    .split('\n')
    .map((line) => line.replace('package:', '').trim())
    .filter((pkg) => pkg);

  console.log(`Found ${packages.length} third-party packages`);

  const apps = [];
  for (const pkg of packages) {
    if (!isGamePackage(pkg)) {
      continue;
    }

    console.log(`✅ Including game: ${pkg}`);
    const name = pkg.split('.').pop().replace(/([A-Z])/g, ' $1').trim() || pkg;

    apps.push({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      packageName: pkg,
      category: 'Game',
      icon: '🎮',
    });
  }

  console.log(`Found ${apps.length} games`);
  console.log('========================================');
  return apps;
}

// POST version
app.post('/scan-apps', async (req, res) => {
  const { deviceId, category } = req.body || {};
  console.log('Scanning apps on device (POST):', deviceId);
  try {
    const apps = await handleScanApps(deviceId, category);
    res.json({ success: true, apps });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET fallback
app.get('/scan-apps', async (req, res) => {
  const { deviceId, category } = req.query || {};
  console.log('Scanning apps on device (GET):', deviceId);
  try {
    const apps = await handleScanApps(deviceId, category);
    res.json({ success: true, apps });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get device info
app.post('/device-info', async (req, res) => {
  const { deviceId } = req.body;
  const adbPrefix = deviceId ? `adb -s ${deviceId}` : 'adb';
  
  try {
    const { stdout: model } = await execPromise(`${adbPrefix} shell getprop ro.product.model`);
    const { stdout: version } = await execPromise(`${adbPrefix} shell getprop ro.build.version.release`);
    const { stdout: size } = await execPromise(`${adbPrefix} shell wm size`);
    
    const screenMatch = size.match(/Physical size: (\d+)x(\d+)/);
    
    res.json({
      success: true,
      info: {
        model: model.trim(),
        androidVersion: version.trim(),
        screenWidth: screenMatch ? parseInt(screenMatch[1]) : 1080,
        screenHeight: screenMatch ? parseInt(screenMatch[2]) : 1920
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Function to detect ngrok URL
async function detectNgrokUrl() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${NGROK_API_PORT}/api/tunnels`, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const tunnels = JSON.parse(data);
          const httpsTunnel = tunnels.tunnels?.find(t => t.proto === 'https');
          
          if (httpsTunnel && httpsTunnel.public_url) {
            console.log('🔗 Detected ngrok tunnel:', httpsTunnel.public_url);
            resolve(httpsTunnel.public_url);
          } else {
            resolve(null);
          }
        } catch (error) {
          console.error('Error parsing ngrok response:', error);
          resolve(null);
        }
      });
    });
    
    req.on('error', () => {
      resolve(null);
    });
    
    req.end();
  });
}

// Function to report ngrok URL to Supabase
async function reportNgrokUrl(ngrokUrl) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ serverUrl: ngrokUrl });
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      }
    };
    
    const req = https.request(UPDATE_URL, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Successfully reported ngrok URL to Supabase');
          resolve(true);
        } else {
          console.error('❌ Failed to report ngrok URL:', res.statusCode);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Error reporting ngrok URL:', error.message);
      resolve(false);
    });
    
    req.write(postData);
    req.end();
  });
}

// Check for ngrok tunnel and report it
async function checkAndReportNgrok() {
  const ngrokUrl = await detectNgrokUrl();
  
  if (ngrokUrl) {
    await reportNgrokUrl(ngrokUrl);
  }
}

app.listen(PORT, async () => {
  console.log('');
  console.log('========================================');
  console.log('🚀 ADB HTTP Server v2.0');
  console.log('========================================');
  console.log(`📍 Running on: http://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`📱 Devices: http://localhost:${PORT}/devices`);
  console.log(`📸 Screenshot: POST/GET http://localhost:${PORT}/screenshot`);
  console.log(`🎯 Actions: POST http://localhost:${PORT}/action`);
  console.log('');
  
  // Check for ngrok on startup
  const ngrokUrl = await detectNgrokUrl();
  if (ngrokUrl) {
    console.log('🌐 ngrok tunnel detected:', ngrokUrl);
    console.log('📡 Reporting to Supabase...');
    await reportNgrokUrl(ngrokUrl);
  } else {
    console.log('📍 Running on localhost only (no ngrok detected)');
    console.log('💡 Start ngrok with: ngrok http 3000');
  }
  
  console.log('');
  console.log('🔄 Monitoring for ngrok changes every 30s...');
  console.log('========================================');
  console.log('');
  
  setInterval(checkAndReportNgrok, 30000);
});

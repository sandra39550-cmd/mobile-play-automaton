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
  res.json({ status: 'ok', message: 'ADB HTTP Server is running' });
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
  try {
    const { stdout } = await execPromise('adb devices -l');
    const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('List of devices'));
    
    const devices = lines.map(line => {
      const parts = line.split(/\s+/);
      return {
        id: parts[0],
        status: parts[1]
      };
    });
    
    res.json({ success: true, devices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute device action
app.post('/action', async (req, res) => {
  const { type, coordinates, packageName, swipeDirection, duration, deviceId } = req.body;

  console.log('Executing action:', type, req.body);

  try {
    // If a specific deviceId is provided, target it explicitly with `adb -s`.
    // This is critical when multiple devices/emulators are connected.
    const adbPrefix = deviceId ? `adb -s ${deviceId}` : 'adb';

    let command = '';

    switch (type) {
      case 'tap':
        command = `${adbPrefix} shell input tap ${coordinates.x} ${coordinates.y}`;
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
        break;

      case 'open_app':
        command = `${adbPrefix} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
        break;

      case 'close_app':
        command = `${adbPrefix} shell am force-stop ${packageName}`;
        break;

      case 'screenshot':
        command = `${adbPrefix} shell screencap -p /sdcard/screenshot.png`;
        break;

      default:
        return res.status(400).json({ success: false, error: 'Unknown action type' });
    }

    const { stdout, stderr } = await execPromise(command);

    console.log('Action result:', stdout || 'success');

    res.json({
      success: true,
      result: stdout || `${type} executed successfully`,
      error: stderr
    });
  } catch (error) {
    console.error('Action error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Take screenshot
app.post('/screenshot', async (req, res) => {
  const { deviceId } = req.body;

  console.log('Taking screenshot for device:', deviceId);

  try {
    const adbPrefix = deviceId ? `adb -s ${deviceId}` : 'adb';

    // Take screenshot on device
    await execPromise(`${adbPrefix} shell screencap -p /sdcard/screenshot.png`);

    // Pull screenshot to server
    const timestamp = Date.now();
    const localPath = path.join(__dirname, `screenshot_${timestamp}.png`);
    await execPromise(`${adbPrefix} pull /sdcard/screenshot.png ${localPath}`);

    // Read and convert to base64
    const imageBuffer = fs.readFileSync(localPath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    // Cleanup
    fs.unlinkSync(localPath);
    await execPromise(`${adbPrefix} shell rm /sdcard/screenshot.png`);

    console.log('Screenshot captured successfully');

    res.json({
      success: true,
      screenshot: base64Image
    });
  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Strict game detection - only matches actual games visible in launcher
const KNOWN_GAME_PACKAGES = [
  // Your specific games
  'tilepark', 'poolbilliard', 'pool.billiard', 'billiard',
  // Major game publishers
  'com.king.', 'com.supercell.', 'com.rovio.', 'com.gameloft.',
  'com.ea.game', 'com.zynga.', 'com.outfit7.', 'com.halfbrick.',
  'com.mojang.', 'com.kiloo.', 'com.nekki.', 'com.fingersoft.',
  'com.dts.freefireth', 'com.tencent.ig', 'com.pubg.', 'com.activision.',
  'com.roblox.', 'com.igg.', 'com.playrix.', 'com.miniclip.',
  'com.nimblebit.', 'com.ketchapp.', 'com.voodoo.', 'com.yodo1.',
  'com.azurgames.', 'com.crazylabs.', 'com.ludo.', 'me.pou.'
];

// Packages to explicitly exclude (system/utility apps that might match patterns)
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
  
  // First, exclude known non-game packages
  if (EXCLUDED_PACKAGES.some(ex => lowerPkg.includes(ex))) {
    return false;
  }
  
  // Check if it matches known game packages/patterns
  if (KNOWN_GAME_PACKAGES.some(known => lowerPkg.includes(known.toLowerCase()))) {
    return true;
  }
  
  // Only match very specific game-related terms that are unlikely to be system apps
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
  // List third-party packages (non-system apps)
  const { stdout } = await execPromise('adb shell pm list packages -3');

  const packages = stdout
    .split('\n')
    .map((line) => line.replace('package:', '').trim())
    .filter((pkg) => pkg);

  console.log(`Found ${packages.length} third-party packages, filtering for games...`);
  console.log('All packages:', packages.join(', '));

  const apps = [];
  for (const pkg of packages) {
    // Only include actual games
    if (!isGamePackage(pkg)) {
      console.log(`Skipping non-game: ${pkg}`);
      continue;
    }

    console.log(`Including game: ${pkg}`);
    const name = pkg.split('.').pop().replace(/([A-Z])/g, ' $1').trim() || pkg;

    apps.push({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      packageName: pkg,
      category: 'Game',
      icon: '🎮',
    });
  }

  console.log(`Found ${apps.length} games after strict filtering:`, apps.map(a => a.name).join(', '));
  return apps;
}

// POST version (preferred)
app.post('/scan-apps', async (req, res) => {
  const { deviceId, category } = req.body || {};

  console.log('Scanning apps on device (POST):', deviceId);

  try {
    const apps = await handleScanApps(deviceId, category);

    res.json({
      success: true,
      apps,
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET fallback (helps when proxies/clients can’t POST)
app.get('/scan-apps', async (req, res) => {
  const { deviceId, category } = req.query || {};

  console.log('Scanning apps on device (GET):', deviceId);

  try {
    const apps = await handleScanApps(deviceId, category);

    res.json({
      success: true,
      apps,
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get device info
app.post('/device-info', async (req, res) => {
  const { deviceId } = req.body;
  
  try {
    const { stdout: model } = await execPromise('adb shell getprop ro.product.model');
    const { stdout: version } = await execPromise('adb shell getprop ro.build.version.release');
    const { stdout: size } = await execPromise('adb shell wm size');
    
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
      // Silently fail if ngrok not running
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
  console.log(`🚀 ADB HTTP Server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
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
  console.log('🔄 Monitoring for ngrok tunnel changes every 30s...');
  console.log('');
  
  // Check every 30 seconds for ngrok URL changes
  setInterval(checkAndReportNgrok, 30000);
});

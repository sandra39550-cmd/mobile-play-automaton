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
  const { type, coordinates, packageName, swipeDirection, duration } = req.body;
  
  console.log('Executing action:', type, req.body);
  
  try {
    let command = '';
    
    switch (type) {
      case 'tap':
        command = `adb shell input tap ${coordinates.x} ${coordinates.y}`;
        break;
        
      case 'swipe':
        const directions = {
          up: '540 1500 540 500',
          down: '540 500 540 1500',
          left: '900 960 100 960',
          right: '100 960 900 960'
        };
        const swipeCoords = directions[swipeDirection] || directions.up;
        command = `adb shell input swipe ${swipeCoords} ${duration || 300}`;
        break;
        
      case 'open_app':
        command = `adb shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
        break;
        
      case 'close_app':
        command = `adb shell am force-stop ${packageName}`;
        break;
        
      case 'screenshot':
        command = 'adb shell screencap -p /sdcard/screenshot.png';
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
    // Take screenshot on device
    await execPromise('adb shell screencap -p /sdcard/screenshot.png');
    
    // Pull screenshot to server
    const timestamp = Date.now();
    const localPath = path.join(__dirname, `screenshot_${timestamp}.png`);
    await execPromise(`adb pull /sdcard/screenshot.png ${localPath}`);
    
    // Read and convert to base64
    const imageBuffer = fs.readFileSync(localPath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    
    // Cleanup
    fs.unlinkSync(localPath);
    await execPromise('adb shell rm /sdcard/screenshot.png');
    
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

// Known game package patterns
const GAME_PATTERNS = [
  /\.game\./i, /game$/i, /games\./i, /\.play\./i,
  /puzzle/i, /arcade/i, /adventure/i, /racing/i, /shooter/i, /rpg/i,
  /casino/i, /slots/i, /candy/i, /crush/i, /clash/i, /craft/i,
  /ninja/i, /zombie/i, /dragon/i, /hero/i, /saga/i, /run/i, /jump/i,
  /tile/i, /match/i, /bubble/i, /ball/i, /bird/i, /fruit/i, /jewel/i,
  /solitaire/i, /poker/i, /chess/i, /sudoku/i, /word/i, /trivia/i,
  /tower/i, /defense/i, /war/i, /battle/i, /strike/i, /quest/i,
  /farm/i, /city/i, /tycoon/i, /simulator/i, /racing/i, /drift/i,
  /pool/i, /billiard/i, /snooker/i
];

const KNOWN_GAME_PACKAGES = [
  'com.king.', 'com.supercell.', 'com.rovio.', 'com.gameloft.',
  'com.ea.game', 'com.zynga.', 'com.outfit7.', 'com.halfbrick.',
  'com.mojang.', 'com.kiloo.', 'com.nekki.', 'com.fingersoft.',
  'com.dts.freefireth', 'com.tencent.ig', 'com.pubg.', 'com.activision.',
  'com.roblox.', 'com.igg.', 'com.playrix.', 'com.miniclip.',
  'com.nimblebit.', 'com.ketchapp.', 'com.voodoo.', 'com.yodo1.',
  'com.azurgames.', 'com.crazylabs.', 'com.ludo.', 'me.pou.',
  'com.bfriedsoftware.tilepark'  // Tile Park
];

function isGamePackage(pkg) {
  // Check known game publishers
  if (KNOWN_GAME_PACKAGES.some(known => pkg.startsWith(known))) return true;
  // Check game patterns
  if (GAME_PATTERNS.some(pattern => pattern.test(pkg))) return true;
  return false;
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

  const apps = [];
  for (const pkg of packages) {
    // Only include games
    if (!isGamePackage(pkg)) {
      continue;
    }

    try {
      const name = pkg.split('.').pop().replace(/([A-Z])/g, ' $1').trim() || pkg;

      apps.push({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        packageName: pkg,
        category: 'Game',
        icon: '🎮',
      });
    } catch (err) {
      console.log(`Skipping package: ${pkg}`);
    }
  }

  console.log(`Found ${apps.length} games after filtering`);
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

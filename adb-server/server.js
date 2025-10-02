const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = util.promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

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

// Scan installed apps (games)
app.post('/scan-apps', async (req, res) => {
  const { deviceId, category } = req.body;
  
  console.log('Scanning apps on device:', deviceId);
  
  try {
    // List third-party packages (non-system apps)
    const { stdout } = await execPromise('adb shell pm list packages -3');
    
    const packages = stdout.split('\n')
      .map(line => line.replace('package:', '').trim())
      .filter(pkg => pkg);
    
    // Get app names
    const apps = [];
    for (const pkg of packages) {
      try {
        const { stdout: labelOut } = await execPromise(
          `adb shell dumpsys package ${pkg} | grep -A 1 "applicationInfo"`
        );
        
        const name = pkg.split('.').pop().replace(/([A-Z])/g, ' $1').trim() || pkg;
        
        apps.push({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          packageName: pkg,
          category: category || 'Game',
          icon: '🎮'
        });
      } catch (err) {
        // Skip apps that can't be queried
        console.log(`Skipping package: ${pkg}`);
      }
    }
    
    console.log(`Found ${apps.length} apps`);
    
    res.json({ 
      success: true, 
      apps 
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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

app.listen(PORT, () => {
  console.log(`🚀 ADB HTTP Server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`\nMake sure ADB is installed and in your PATH`);
  console.log(`Test with: adb devices\n`);
});

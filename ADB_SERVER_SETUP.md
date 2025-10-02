# Real Device Automation Setup

This guide explains how to connect and automate a real Android device via WiFi using ADB.

## Prerequisites

1. Android device with Developer Options enabled
2. Computer with ADB installed
3. Device and computer on the same WiFi network

## Step 1: Enable WiFi Debugging on Android Device

1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times to enable Developer Options
3. Go to **Settings** → **Developer Options**
4. Enable **Wireless debugging**
5. Note the IP address and port (e.g., 192.168.1.100:5555)

## Step 2: Set Up ADB Server with HTTP API

You need to run an ADB server that exposes an HTTP API. Here's a simple Node.js example:

```javascript
// adb-server.js
const express = require('express');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
app.use(express.json());

// Connect to device
app.post('/connect', async (req, res) => {
  const { host, port } = req.body;
  try {
    const { stdout } = await execPromise(`adb connect ${host}:${port}`);
    res.json({ success: stdout.includes('connected'), message: stdout });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute action
app.post('/action', async (req, res) => {
  const { type, coordinates, packageName, swipeDirection } = req.body;
  try {
    let command = '';
    
    switch (type) {
      case 'tap':
        command = `adb shell input tap ${coordinates.x} ${coordinates.y}`;
        break;
      case 'swipe':
        const directions = {
          up: '500 1500 500 500',
          down: '500 500 500 1500',
          left: '900 500 100 500',
          right: '100 500 900 500'
        };
        command = `adb shell input swipe ${directions[swipeDirection]}`;
        break;
      case 'open_app':
        command = `adb shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
        break;
      case 'screenshot':
        command = 'adb shell screencap -p /sdcard/screenshot.png';
        break;
    }
    
    const { stdout } = await execPromise(command);
    res.json({ success: true, result: stdout });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Take screenshot
app.post('/screenshot', async (req, res) => {
  try {
    await execPromise('adb shell screencap -p /sdcard/screenshot.png');
    const { stdout } = await execPromise('adb pull /sdcard/screenshot.png screenshot.png');
    const fs = require('fs');
    const imageBuffer = fs.readFileSync('screenshot.png');
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    res.json({ success: true, screenshot: base64Image });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scan installed apps
app.post('/scan-apps', async (req, res) => {
  try {
    const { stdout } = await execPromise('adb shell pm list packages -3');
    const packages = stdout.split('\n')
      .map(line => line.replace('package:', '').trim())
      .filter(pkg => pkg);
    
    const apps = packages.map(pkg => ({
      name: pkg.split('.').pop(),
      packageName: pkg,
      category: 'Game'
    }));
    
    res.json({ success: true, apps });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`ADB HTTP Server running on port ${PORT}`);
});
```

## Step 3: Run the ADB Server

```bash
npm install express
node adb-server.js
```

## Step 4: Configure Lovable

1. Deploy your ADB server to a publicly accessible URL (use ngrok for testing):
   ```bash
   ngrok http 3000
   ```

2. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

3. The ADB_SERVER_URL secret is already configured in your Supabase project

## Step 5: Connect Your Device

1. Go to the "Devices" tab in your app
2. Click "Add Device"
3. Enter:
   - Device name (e.g., "My Android Phone")
   - Device ID from WiFi debugging screen
   - Platform: android
   - ADB Host: Your device's IP address
   - ADB Port: Your device's port (usually 5555)
   - Screen dimensions

4. Click "Connect Device"

## Testing

Once connected, you can:
- Scan for installed games
- Start bot sessions
- Automate game actions
- Take screenshots

## Troubleshooting

- **Connection refused**: Ensure WiFi debugging is enabled and device is on same network
- **Unauthorized**: Accept the debugging prompt on your device
- **ADB not found**: Install ADB tools on your server
- **No games found**: Make sure games are installed and ADB server is properly scanning

## Security Notes

- Keep your ADB server private (use authentication)
- Don't expose ADB server to public internet without security
- Use VPN or secure tunneling for production use

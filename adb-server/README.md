# ADB HTTP Server Setup Guide

This server provides an HTTP API for controlling Android devices via ADB over WiFi.

## Prerequisites

1. **Install ADB (Android Debug Bridge)**
   - **macOS**: `brew install android-platform-tools`
   - **Windows**: Download [Platform Tools](https://developer.android.com/studio/releases/platform-tools)
   - **Linux**: `sudo apt-get install android-tools-adb`

2. **Verify ADB Installation**
   ```bash
   adb version
   ```

3. **Node.js** (v14 or higher)

## Setup Steps

### 1. Install Dependencies

```bash
cd adb-server
npm install
```

### 2. Enable WiFi Debugging on Your Android Device

1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times to enable Developer Options
3. Go to **Settings** → **Developer Options**
4. Enable **USB Debugging**
5. Enable **Wireless debugging** (Android 11+) or use USB first:

#### Option A: Wireless Debugging (Android 11+)
- Tap **Wireless debugging** → **Pair device with pairing code**
- Note the IP address and port (e.g., 192.168.1.100:5555)

#### Option B: USB Setup then WiFi
1. Connect device via USB
2. Run: `adb tcpip 5555`
3. Disconnect USB
4. Find device IP: **Settings** → **About** → **Status** → **IP address**
5. Connect: `adb connect YOUR_DEVICE_IP:5555`

### 3. Test ADB Connection

```bash
# Connect to your device
adb connect 192.168.1.100:5555

# List connected devices
adb devices

# You should see your device listed
```

### 4. Start the Server

```bash
npm start
```

Server will run on `http://localhost:3000`

### 5. Expose Server to Internet (for Lovable to access)

Use **ngrok** to create a public URL:

```bash
# Install ngrok
npm install -g ngrok

# Expose your local server
ngrok http 3000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok-free.app`)

### 6. Configure in Lovable

The `ADB_SERVER_URL` secret has already been added to your Supabase project.

Update it with your ngrok URL:
1. Go to: https://supabase.com/dashboard/project/smyhauaifoqargpcjpkf/settings/functions
2. Find `ADB_SERVER_URL`
3. Set value to your ngrok URL (e.g., `https://abc123.ngrok-free.app`)
4. Click Save

### 7. Connect Your Device in the App

1. Open your Lovable app
2. Go to **Devices** tab
3. Click **Add Device**
4. Enter:
   - **Device name**: My Android Phone
   - **Device ID**: (from `adb devices` output)
   - **Platform**: android
   - **ADB Host**: Your device's IP address
   - **ADB Port**: 5555
   - **Screen Width**: 1080 (or your device's width)
   - **Screen Height**: 1920 (or your device's height)
5. Click **Connect Device**

## Testing the Server

Test endpoints with curl:

```bash
# Health check
curl http://localhost:3000/health

# List devices
curl http://localhost:3000/devices

# Take screenshot
curl -X POST http://localhost:3000/screenshot \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "your-device-id"}'

# Tap screen
curl -X POST http://localhost:3000/action \
  -H "Content-Type: application/json" \
  -d '{"type": "tap", "coordinates": {"x": 500, "y": 800}}'
```

## Troubleshooting

### "adb: command not found"
- Install Android Platform Tools (see Prerequisites)
- Add ADB to your PATH

### "Connection refused"
- Ensure device and computer are on same WiFi network
- Check WiFi debugging is enabled on device
- Try reconnecting: `adb disconnect` then `adb connect IP:5555`

### "Device unauthorized"
- Check your device screen for authorization popup
- Accept the debugging connection
- Try again

### "No devices found"
- Run `adb devices` to verify connection
- Restart ADB server: `adb kill-server && adb start-server`

### ngrok session expires
- Free ngrok URLs expire after 2 hours
- For production, use a permanent hosting solution (Railway, Render, Heroku)
- Or upgrade to ngrok paid plan for permanent URLs

## Production Deployment

For production use, deploy to:
- **Railway.app** (easiest)
- **Render.com**
- **Heroku**
- **AWS EC2**
- **DigitalOcean**

Make sure the server has:
1. ADB installed
2. Persistent connection to your device
3. Static IP or domain name
4. Proper security (authentication, HTTPS)

## Security Notes

⚠️ **Important**: This server has no authentication. For production:

1. Add API key authentication
2. Use HTTPS only
3. Whitelist allowed IPs
4. Use VPN for device connection
5. Don't expose to public internet without security

## API Documentation

### POST /connect
Connect to a device via WiFi
```json
{
  "host": "192.168.1.100",
  "port": 5555,
  "deviceId": "R51H30ERD9N"
}
```

### POST /action
Execute an action on device
```json
{
  "type": "tap|swipe|open_app|close_app|screenshot",
  "coordinates": {"x": 500, "y": 800},
  "packageName": "com.example.app",
  "swipeDirection": "up|down|left|right"
}
```

### POST /screenshot
Capture device screenshot
```json
{
  "deviceId": "R51H30ERD9N"
}
```

### POST /scan-apps
Scan installed apps
```json
{
  "deviceId": "R51H30ERD9N",
  "category": "games"
}
```

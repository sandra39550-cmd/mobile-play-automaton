# 🔧 ADB Server Setup Guide

## Quick Start

To enable real game scanning from your Android devices, you need to set up the ADB server:

### Step 1: Start the ADB Server
```bash
cd adb-server
node server.js
```

The server should start on `localhost:3000`

### Step 2: Expose via ngrok
```bash
ngrok http 3000
```

Copy the **HTTPS** forwarding URL (e.g., `https://abc123.ngrok-free.app`)

### Step 3: Update ADB_SERVER_URL Secret

1. Go to [Edge Functions Secrets](https://supabase.com/dashboard/project/smyhauaifoqargpcjpkf/settings/functions)
2. Find `ADB_SERVER_URL` 
3. Update it with your ngrok HTTPS URL
4. Click Save

### Step 4: Connect Your Device

**USB Connection:**
```bash
# Enable USB debugging on your Android device
# Connect via USB cable
adb devices
# You should see your device listed
```

**Wireless Connection:**
```bash
# First connect via USB and enable TCP/IP
adb tcpip 5555

# Find your device IP (Settings > About > Status > IP address)
# Then connect wirelessly
adb connect 192.168.x.x:5555

# You can now disconnect USB
adb devices
# Device should show as connected
```

## Troubleshooting

### ❌ "ADB server is offline"
- Verify the ADB server is running: `cd adb-server && node server.js`
- Check ngrok is running: `ngrok http 3000`
- Update ADB_SERVER_URL secret with the new ngrok URL

### ❌ "No games found"
- Ensure device is connected: `adb devices`
- Verify games are installed on the device
- Check ADB server logs for errors

### ❌ "Device appears offline"
- Disconnect and reconnect the device
- Run `adb devices` to verify connection
- Restart ADB server if needed: `adb kill-server && adb start-server`

## Architecture

```
Android Device (USB/WiFi)
    ↓
ADB Bridge (localhost:3000)
    ↓
ngrok Tunnel (HTTPS)
    ↓
Supabase Edge Function
    ↓
Your Web App
```

## Environment Variables

- **ADB_SERVER_URL**: Your ngrok HTTPS URL (set in Supabase Edge Functions secrets)

## Supported Actions

- ✅ Device connection detection
- ✅ Game scanning (installed apps)
- ✅ Screenshot capture
- ✅ Touch/tap automation
- ✅ Swipe gestures
- ✅ App launch/close

## Notes

- ngrok URLs change each time you restart ngrok (unless you have a paid plan)
- Remember to update ADB_SERVER_URL when ngrok URL changes
- Keep the ADB server running while using the app

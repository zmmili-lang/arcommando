# Kingshot OCR Scraper - Setup Guide

## Prerequisites

## Prerequisites

### 1. Prepare Your Physical Device

**Enable Developer Options:**
1. Go to **Settings > About phone**.
2. Tap **Build number** 7 times until you see "You are now a developer!".

**Enable USB Debugging:**
1. Go back to **Settings > System > Developer options**.
2. Scroll down and enable **USB Debugging**.
3. Connect your phone to the PC via USB cable.
4. When prompted on your phone, tap **"Allow USB debugging"** (Check "Always allow from this computer").

### 2. Install Android SDK Platform Tools (ADB)

**Windows:**
1. Download from [https://developer.android.com/studio/releases/platform-tools](https://developer.android.com/studio/releases/platform-tools)
2. Extract to `C:\platform-tools\`
3. Add `C:\platform-tools\` to your system PATH:
   - Search "Environment Variables" in Windows
   - Edit "Path" under System Variables
   - Add new entry: `C:\platform-tools`
   - Restart terminal/command prompt

**Verify ADB Installation:**
```bash
adb version
```

**Verify Device Connection:**
```bash
adb devices
```
*You should see your device serial number listed. If it says "unauthorized", check your phone screen to allow permissions.*

### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 4. Install Tesseract OCR (Required for Phase 2)

**Windows:**
1. Download from [https://github.com/UB-Mannheim/tesseract/wiki](https://github.com/UB-Mannheim/tesseract/wiki)
2. Install to `C:\Program Files\Tesseract-OCR\`
3. Update `TESSERACT_PATH` in the script

**Verify Tesseract Installation:**
```bash
tesseract --version
```

## Connecting
1. Connect via USB.
2. Ensure `adb devices` shows your device.


## Running the Scraper

### Phase 1 Test (ADB Connection):
```bash
python kingshot_scraper.py
```

This will test ADB connection and perform a basic tap/scroll test.

## Coordinate Calibration

After Phase 1 is working, you'll need to calibrate the coordinates:
1. Take a screenshot of the leaderboard screen
2. Use an image viewer to find pixel coordinates for:
   - Leaderboard button position
   - Scroll start/end positions
   - Power column region (bounding box)
3. Update the `COORDS` dictionary in `kingshot_scraper.py`

## Troubleshooting

**"No devices connected":**
- Ensure emulator is running
- Try `adb kill-server` then `adb start-server`
- Reconnect with `adb connect 127.0.0.1:5555` (or appropriate port)

**ADB not found:**
- Verify ADB is in system PATH
- Restart terminal after adding to PATH

**Emulator port:**
- LDPlayer: Usually 5555
- NoxPlayer: Usually 62001
- Check emulator settings if default doesn't work

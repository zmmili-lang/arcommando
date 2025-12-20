# Kingshot OCR Scraper

Automated leaderboard data extraction tool for Kingshot/Whiteout Survival using ADB and Tesseract OCR.

## 📋 Project Status

- ✅ **Phase 1**: ADB Connection and Core Commands - **COMPLETE**
- ✅ **Phase 2**: Image Processing and OCR - **COMPLETE**
- ⏳ **Phase 3**: Orchestration and Data Structuring - **PENDING**

## 🚀 Quick Start

### Prerequisites

1. **Physical Android Device** (with USB Debugging enabled)
2. **Install ADB** (Android SDK Platform Tools)
3. **Install Tesseract OCR** (for Phase 2+)
4. **Install Python dependencies**: `pip install -r requirements.txt`

📖 See [`SETUP.md`](SETUP.md) for detailed installation instructions.

### Running the Scraper

**Phase 1 Test** (ADB connection and device control):
```bash
python kingshot_scraper.py
```

**Phase 2 Test** (Image capture and OCR):
```bash
python kingshot_scraper.py phase2
```

## 📁 Project Structure

```
ARCommandoScrapper/
├── kingshot_scraper.py    # Main scraper script (Phases 1-3)
├── requirements.txt       # Python dependencies  
├── SETUP.md              # Detailed setup instructions
├── README.md             # This file
├── phase1.md             # Phase 1 specifications
├── phase2.md             # Phase 2 specifications
├── phase3.md             # Phase 3 specifications
└── kingshot_data/        # Output directory (created automatically)
    ├── screenshots/      # Captured leaderboard images
    └── players.json      # Final extracted data (Phase 3)
```

## 🔧 Configuration

Edit `kingshot_scraper.py` to configure:

```python
# ADB Connection
ADB_HOST = '127.0.0.1'
ADB_PORT = 5037

# Output Directory
OUTPUT_DIR = 'kingshot_data'

# Tesseract Path (Windows)
TESSERACT_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# Coordinate Calibration (REQUIRED)
COORDS = {
    'LEADERBOARD_BUTTON': (540, 1800),      # Tap to open leaderboard
    'SCROLL_START': (540, 1400),            # Start of scroll gesture
    'SCROLL_END': (540, 600),               # End of scroll gesture
    'POWER_COLUMN_REGION': (100, 400, 500, 1600),  # OCR crop area
}
```

## 📸 Coordinate Calibration

**Required for accurate scraping:**

1. Run Phase 1 test to capture a screenshot
2. Open the screenshot in an image viewer
3. Note the pixel coordinates for:
   - Leaderboard button position
   - Scroll start/end positions  
   - Power column bounding box `(x1, y1, x2, y2)`
4. Update the `COORDS` dictionary in `kingshot_scraper.py`

**Need help?** Share a screenshot of your leaderboard for assistance.

## 🎯 Features

### Phase 1: ADB Control ✅
- Connect to Android emulator via ADB
- Perform taps, swipes, and scrolls
- Capture screenshots to device storage

### Phase 2: OCR Extraction ✅
- Pull screenshots from device to local storage
- Crop images to specific regions
- Extract text using Tesseract OCR
- Optimized for power numbers (e.g., "123M", "456K")

### Phase 3: Data Pipeline ⏳
- Automated scroll and capture loop
- Data cleaning and deduplication
- Structured JSON/CSV export

## 🐛 Troubleshooting

**"No devices connected"**
- Ensure USB cable is connected securely
- Check "USB Debugging" is enabled in Developer Options
- Run: `adb devices`
- If unauthorized, check phone screen for RSA prompt

**"Tesseract not found"**
- Install Tesseract OCR (see `SETUP.md`)
- Update `TESSERACT_PATH` in script

**OCR extracting wrong text**
- Calibrate `POWER_COLUMN_REGION` coordinates
- Ensure leaderboard is clearly visible
- Check cropped image in `kingshot_data/` folder

## 📝 Usage Example

```bash
# 1. Install emulator and ADB
# 2. Connect emulator
adb connect 127.0.0.1:5555
adb devices

# 3. Test Phase 1 (ADB connection)
python kingshot_scraper.py

# 4. Install Tesseract OCR
# 5. Test Phase 2 (OCR extraction)
python kingshot_scraper.py phase2

# 6. Calibrate coordinates using screenshots
# 7. Run Phase 3 (coming soon - full scrape)
```

## 🤝 Contributing

This is a phased implementation project:
- Each phase builds on the previous
- Test each phase before proceeding
- Coordinate calibration is critical for accuracy

## 📄 License

Personal project for educational purposes.

"""
Kingshot OCR Scraper - Full Script with Calibrated Coordinates

This script establishes ADB connection to a physical Android device and implements
automated leaderboard scraping with OCR text extraction.
"""

import os
import time
from ppadb.client import Client as AdbClient
from PIL import Image
import pytesseract

# ============================================================================
# CONFIGURATION VARIABLES
# ============================================================================

# ADB Connection Settings
ADB_HOST = '127.0.0.1'
ADB_PORT = 5037

# Output Directory
OUTPUT_DIR = 'kingshot_data'

# Ensure output directory exists
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# Coordinate Mapping - CALIBRATED FOR 1080x2340 RESOLUTION
# (Based on actual pixel measurements from device screenshot scaled by 1.5x)
COORDS = {
    # Tap position for the leaderboard button (x, y)
    'LEADERBOARD_BUTTON': (540, 1800),
    
    # Scroll gesture coordinates (x, y)
    # Adjusted to scroll within the list area
    'SCROLL_START': (540, 1800),  # Start of swipe (bottom of visible list)
    'SCROLL_END': (540, 600),     # End of swipe (top of visible list)
    
    # Name column region for OCR (x1, y1, x2, y2)
    # Measured from actual screenshot: 374-769 scaled = 249-513 device coords
    # Y coords: ~265 (below header) to ~1380 (above bottom card)
    'NAME_COLUMN_REGION': (363, 385, 770, 2087),
    
    # Power column region for OCR (x1, y1, x2, y2)
    # Measured from actual screenshot: 776-994 scaled = 517-663 device coords
    # Y coords: ~265 (below header) to ~1380 (above bottom card)
    'POWER_COLUMN_REGION': (777, 387, 997, 2075),
}

# Tesseract Path (Update this to your Tesseract installation)
TESSERACT_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'


# ============================================================================
# PHASE 1: ADB CONNECTION AND CORE COMMANDS
# ============================================================================

def setup_adb():
    """
    Connect to the ADB server and return the first connected device.
    
    Returns:
        device: ADB device object if connected, None otherwise
    """
    try:
        # Connect to ADB server
        client = AdbClient(host=ADB_HOST, port=ADB_PORT)
        
        # Get list of connected devices
        devices = client.devices()
        
        if not devices:
            print("❌ No devices connected!")
            print("\nTroubleshooting:")
            print("1. Ensure your device is connected via USB")
            print("2. Ensure 'USB Debugging' is enabled in Developer Options")
            print("3. Check for 'Allow USB debugging' prompt on your phone")
            print("4. Run: adb devices")
            return None
        
        # Return the first device
        device = devices[0]
        print(f"✅ Connected to device: {device.serial}")
        return device
        
    except Exception as e:
        print(f"❌ Error connecting to ADB: {e}")
        print("\nTroubleshooting:")
        print("1. Ensure ADB is installed and in PATH")
        print("2. Try: adb start-server")
        return None


def adb_command(device, command):
    """
    Execute a shell command on the connected device.
    
    Args:
        device: ADB device object
        command: Shell command string to execute
        
    Returns:
        str: Command output
    """
    try:
        result = device.shell(command)
        return result
    except Exception as e:
        print(f"❌ Error executing command '{command}': {e}")
        return None


def perform_tap(device, x, y):
    """
    Perform a tap at the specified coordinates.
    
    Args:
        device: ADB device object
        x: X coordinate
        y: Y coordinate
    """
    command = f"input tap {x} {y}"
    print(f"📱 Tapping at ({x}, {y})...")
    adb_command(device, command)
    time.sleep(1)  # Brief delay after tap


def perform_scroll(device, start_coords, end_coords, duration=800):
    """
    Perform a swipe gesture to scroll the screen.
    
    Args:
        device: ADB device object
        start_coords: Tuple (x, y) for swipe start position
        end_coords: Tuple (x, y) for swipe end position
        duration: Swipe duration in milliseconds (default: 800ms for human-like behavior)
    """
    x1, y1 = start_coords
    x2, y2 = end_coords
    
    command = f"input swipe {x1} {y1} {x2} {y2} {duration}"
    print(f"📜 Scrolling from ({x1}, {y1}) to ({x2}, {y2})...")
    adb_command(device, command)
    time.sleep(1.5)  # Wait for scroll animation to complete


def get_device_resolution(device):
    """
    Get the screen resolution of the connected device.
    
    Args:
        device: ADB device object
        
    Returns:
        tuple: (width, height) or None if failed
    """
    try:
        result = adb_command(device, "wm size")
        # Output format: "Physical size: 1080x2400"
        if result:
            size_part = result.split(":")[-1].strip()
            width, height = map(int, size_part.split("x"))
            print(f"📱 Device resolution: {width}x{height}")
            return (width, height)
    except Exception as e:
        print(f"⚠️  Could not detect resolution: {e}")
    return None


def capture_screen_to_device(device, filename):
    """
    Capture a screenshot and save it to the device's sdcard.
    
    Args:
        device: ADB device object
        filename: Name of the screenshot file (e.g., 'screenshot.png')
    """
    filepath = f"/sdcard/{filename}"
    command = f"screencap -p {filepath}"
    print(f"📸 Capturing screenshot to {filepath}...")
    adb_command(device, command)
    time.sleep(0.5)  # Brief delay after capture


# ============================================================================
# PHASE 2: IMAGE PROCESSING AND OCR
# ============================================================================

def capture_and_pull_screen(device, filename):
    """
    Capture a screenshot on device, pull it to local storage, and clean up.
    
    Args:
        device: ADB device object
        filename: Name for the screenshot file (e.g., 'leaderboard_001.png')
        
    Returns:
        str: Local path to the downloaded screenshot
    """
    # Capture screenshot on device
    device_path = f"/sdcard/{filename}"
    capture_screen_to_device(device, filename)
    
    # Pull file from device to local output directory
    local_path = os.path.join(OUTPUT_DIR, filename)
    print(f"⬇️ Pulling screenshot to {local_path}...")
    
    try:
        device.pull(device_path, local_path)
        print(f"✅ Screenshot saved to {local_path}")
    except Exception as e:
        print(f"❌ Error pulling screenshot: {e}")
        return None
    
    # Clean up: delete file from device
    print(f"🧹 Cleaning up device storage...")
    adb_command(device, f"rm {device_path}")
    
    return local_path


def process_image_with_ocr(image_path, crop_region, mode='text'):
    """
    Process an image with OCR to extract text from a specific region.
    
    Args:
        image_path: Path to the screenshot image
        crop_region: Tuple of (x1, y1, x2, y2) defining the crop area
        mode: 'text' for generic text (names), 'numeric' for numbers only
        
    Returns:
        list: List of extracted text strings (one per line)
    """
    try:
        from PIL import ImageEnhance, ImageFilter
        
        # Open the image
        img = Image.open(image_path)
        
        # Crop to the region of interest
        x1, y1, x2, y2 = crop_region
        cropped_img = img.crop((x1, y1, x2, y2))
        
        # IMAGE PREPROCESSING for better OCR
        # 1. Resize to 2x (helps OCR accuracy)
        width, height = cropped_img.size
        cropped_img = cropped_img.resize((width * 2, height * 2), Image.LANCZOS)
        
        # 2. Convert to grayscale
        cropped_img = cropped_img.convert('L')
        
        # 3. Increase contrast
        enhancer = ImageEnhance.Contrast(cropped_img)
        cropped_img = enhancer.enhance(2.0)
        
        # 4. Sharpen
        cropped_img = cropped_img.filter(ImageFilter.SHARPEN)
        
        # Save processed image for debugging
        cropped_path = image_path.replace('.png', f'_cropped_{mode}.png')
        cropped_img.save(cropped_path)
        print(f"🔍 Saved processed image to {cropped_path}")
        
        # Configure Tesseract
        if mode == 'numeric':
            # Digits and comma only for power values
            # PSM 6: Assume uniform block of text
            custom_config = r'--psm 6 --oem 1 -c tessedit_char_whitelist=0123456789,'
        else:
            # General text for names
            # PSM 6: Assume uniform block of text
            # Allow alphanumeric + common clan tag characters
            custom_config = r'--psm 6 --oem 1'
        
        # Set Tesseract path if configured
        if os.path.exists(TESSERACT_PATH):
            pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
        
        # Extract text using Tesseract
        extracted_text = pytesseract.image_to_string(cropped_img, config=custom_config)
        
        # Clean and split into lines
        lines = [line.strip() for line in extracted_text.split('\n') if line.strip()]
        
        print(f"✅ Extracted {len(lines)} lines ({mode})")
        return lines
        
    except Exception as e:
        print(f"❌ Error processing image with OCR: {e}")
        return []


def calibration_helper(device):
    """
    Interactive calibration helper to find correct coordinates.
    Takes a screenshot and helps user identify the correct regions.
    """
    print("\n" + "="*60)
    print("CALIBRATION HELPER")
    print("="*60)
    print()
    
    # Get device resolution
    resolution = get_device_resolution(device)
    
    # Capture a screenshot
    print("\n📸 Capturing screenshot for calibration...")
    screenshot_path = capture_and_pull_screen(device, "calibration.png")
    
    if not screenshot_path:
        print("❌ Failed to capture screenshot")
        return
    
    print(f"✅ Screenshot saved to: {screenshot_path}")
    print()
    print("NEXT STEPS:")
    print("1. Open the screenshot in an image editor (Paint, Photoshop, etc.)")
    print("2. Find the coordinates for:")
    print()
    print("   NAME COLUMN:")
    print("   - Left edge (x1): Where names start (after rank icons)")
    print("   - Top edge (y1): Just below 'Governor' header")
    print("   - Right edge (x2): Where names end (before power numbers)")
    print("   - Bottom edge (y2): Bottom of visible list")
    print()
    print("   POWER COLUMN:")
    print("   - Left edge (x1): Where power numbers start")
    print("   - Top edge (y1): Just below 'Power' header")
    print("   - Right edge (x2): Right edge of numbers")
    print("   - Bottom edge (y2): Same as names bottom")
    print()
    print("3. Update the COORDS dictionary in the script with these values")
    print()
    
    # Try current coordinates and show results
    print("Testing current coordinates...")
    print(f"Current NAME_COLUMN_REGION: {COORDS['NAME_COLUMN_REGION']}")
    print(f"Current POWER_COLUMN_REGION: {COORDS['POWER_COLUMN_REGION']}")
    print()
    
    # Process with current coords
    names = process_image_with_ocr(screenshot_path, COORDS['NAME_COLUMN_REGION'], mode='text')
    powers = process_image_with_ocr(screenshot_path, COORDS['POWER_COLUMN_REGION'], mode='numeric')
    
    print(f"\n📊 Current results: {len(names)} names, {len(powers)} powers")
    print("\nSample names:")
    for i, name in enumerate(names[:5], 1):
        print(f"  {i}. {name}")
    print("\nSample powers:")
    for i, power in enumerate(powers[:5], 1):
        print(f"  {i}. {power}")
    
    print(f"\n💡 Check the cropped images in {OUTPUT_DIR}/ to see what OCR is seeing")
    print(f"   - {OUTPUT_DIR}/calibration_cropped_text.png (Names)")
    print(f"   - {OUTPUT_DIR}/calibration_cropped_numeric.png (Powers)")
    print()


# ============================================================================
# PHASE 3: ORCHESTRATION AND DATA CLEANING
# ============================================================================

def clean_and_structure_data(names_list, power_list):
    """
    Combine and clean name/power lists into structured data.
    
    Args:
        names_list: List of player names from OCR
        power_list: List of power values from OCR
        
    Returns:
        list: List of dictionaries with 'name' and 'power' keys
    """
    structured_data = []
    seen_entries = set()
    
    # Zip the lists - stops at the shorter list length
    for name, raw_power in zip(names_list, power_list):
        try:
            # 1. Clean Name
            clean_name = name.strip()
            if not clean_name or len(clean_name) < 2:
                continue
                
            # 2. Clean Power
            # Remove commas, dots, spaces
            power_str = raw_power.upper().replace(',', '').replace('.', '').replace(' ', '')
            
            # Handle K/M suffixes
            multiplier = 1
            if 'K' in power_str:
                multiplier = 1000
                power_str = power_str.replace('K', '')
            elif 'M' in power_str:
                multiplier = 1000000
                power_str = power_str.replace('M', '')
                
            # Convert to int
            power_val = int(float(power_str) * multiplier)
            
            # 3. Deduplicate
            entry_key = (clean_name, power_val)
            if entry_key not in seen_entries:
                seen_entries.add(entry_key)
                structured_data.append({
                    'name': clean_name,
                    'power': power_val
                })
                
        except (ValueError, AttributeError) as e:
            # Skip entries where power cannot be parsed
            print(f"⚠️  Skipping entry - Name: {name}, Power: {raw_power} (Error: {e})")
            continue
            
    return structured_data


def save_data_to_file(data, filename='players.json'):
    """
    Save structured data to a JSON file.
    
    Args:
        data: List of player dictionaries
        filename: Output filename
    """
    import json
    filepath = os.path.join(OUTPUT_DIR, filename)
    
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"💾 Saved {len(data)} players to {filepath}")
    except Exception as e:
        print(f"❌ Error saving data: {e}")


def scrape_leaderboard(device, max_scrolls=10):
    """
    Main scraping loop: Scroll -> Capture -> OCR -> Repeat
    
    Args:
        device: ADB device object
        max_scrolls: Number of scroll iterations to perform
        
    Returns:
        list: Structured player data
    """
    print(f"🚀 Starting leaderboard scrape ({max_scrolls} scrolls)...")
    print("📋 Make sure the leaderboard is visible on screen!")
    print()
    
    all_names = []
    all_powers = []
    
    for i in range(max_scrolls):
        print(f"\n{'='*60}")
        print(f"ITERATION {i+1}/{max_scrolls}")
        print(f"{'='*60}")
        
        # 1. Capture screenshot
        filename = f"scrape_{i:03d}.png"
        img_path = capture_and_pull_screen(device, filename)
        if not img_path:
            print("⚠️  Failed to capture screenshot, skipping iteration")
            continue
            
        # 2. OCR Name Column
        print("\n📝 Extracting player names...")
        names = process_image_with_ocr(img_path, COORDS['NAME_COLUMN_REGION'], mode='text')
        
        # 3. OCR Power Column
        print("💪 Extracting power values...")
        powers = process_image_with_ocr(img_path, COORDS['POWER_COLUMN_REGION'], mode='numeric')
        
        # Debug output
        print(f"\n📊 Results: {len(names)} names, {len(powers)} powers")
        if len(names) != len(powers):
            print(f"⚠️  Warning: Mismatch in name/power counts")
        
        # Show sample of extracted data
        if names and powers:
            print("\n🔍 Sample data:")
            for j in range(min(3, len(names), len(powers))):
                print(f"   {names[j]} -> {powers[j]}")
        
        all_names.extend(names)
        all_powers.extend(powers)
        
        # 4. Scroll to next section (except on last iteration)
        if i < max_scrolls - 1:
            print("\n⬇️  Scrolling to next section...")
            perform_scroll(device, COORDS['SCROLL_START'], COORDS['SCROLL_END'])
            time.sleep(0.5)  # Extra delay for content to load
            
        # 5. Cleanup screenshot
        try:
            os.remove(img_path)
            print("🗑️  Cleaned up screenshot")
        except Exception as e:
            print(f"⚠️  Could not delete screenshot: {e}")
            
    # Process Results
    print(f"\n{'='*60}")
    print("PROCESSING RESULTS")
    print(f"{'='*60}")
    print(f"📊 Total raw entries: {len(all_names)} names, {len(all_powers)} powers")
    
    final_data = clean_and_structure_data(all_names, all_powers)
    
    print(f"✅ Cleaned data: {len(final_data)} unique players")
    
    # Save to file
    save_data_to_file(final_data)
    
    # Display summary
    if final_data:
        print(f"\n{'='*60}")
        print("TOP 10 PLAYERS")
        print(f"{'='*60}")
        sorted_data = sorted(final_data, key=lambda x: x['power'], reverse=True)
        for idx, player in enumerate(sorted_data[:10], 1):
            print(f"{idx:2d}. {player['name']:30s} - {player['power']:,}")
    
    return final_data


# ============================================================================
# TEST/VERIFICATION FUNCTIONS
# ============================================================================

def test_phase1():
    """
    Test Phase 1 functionality: ADB connection and basic device control.
    """
    print("=" * 60)
    print("KINGSHOT OCR SCRAPER - PHASE 1 TEST")
    print("=" * 60)
    print()
    
    # Step 1: Setup ADB connection
    print("Step 1: Connecting to ADB...")
    device = setup_adb()
    
    if device is None:
        print("\n❌ Phase 1 Test Failed: Could not connect to device")
        return False
    
    print()
    
    # Step 2: Test screen capture
    print("Step 2: Testing screen capture...")
    capture_screen_to_device(device, "test_screenshot.png")
    print()
    
    # Step 3: Test scroll functionality
    print("Step 3: Testing scroll functionality...")
    print(f"Will scroll from {COORDS['SCROLL_START']} to {COORDS['SCROLL_END']}")
    input("Press Enter to test scroll (make sure leaderboard is visible)...")
    perform_scroll(device, COORDS['SCROLL_START'], COORDS['SCROLL_END'])
    print()
    
    print("=" * 60)
    print("✅ PHASE 1 TEST COMPLETE!")
    print("=" * 60)
    print()
    print("Next Steps:")
    print("1. Verify the device responded to the scroll")
    print("2. Check if screenshot was saved: /sdcard/test_screenshot.png")
    print("3. Run 'python kingshot_scraper.py phase2' to test OCR")
    print()
    
    return True


def test_phase2():
    """
    Test Phase 2 functionality: Image capture, pull, and OCR processing.
    """
    print("=" * 60)
    print("KINGSHOT OCR SCRAPER - PHASE 2 TEST")
    print("=" * 60)
    print()
    
    # Step 1: Setup ADB connection
    print("Step 1: Connecting to ADB...")
    device = setup_adb()
    
    if device is None:
        print("\n❌ Phase 2 Test Failed: Could not connect to device")
        return False
    
    print()
    
    # Step 2: Capture and pull screenshot
    print("Step 2: Capturing and pulling screenshot from device...")
    print("🎯 Make sure the leaderboard is visible on screen!")
    print()
    
    input("Press Enter when the leaderboard is visible...")
    
    screenshot_path = capture_and_pull_screen(device, "phase2_test.png")
    
    if screenshot_path is None:
        print("\n❌ Phase 2 Test Failed: Could not capture screenshot")
        return False
    
    print()
    
    # Step 3: Process Names with OCR
    print("Step 3: Processing NAMES with OCR...")
    print(f"Using crop region: {COORDS['NAME_COLUMN_REGION']}")
    print()
    
    extracted_names = process_image_with_ocr(screenshot_path, COORDS['NAME_COLUMN_REGION'], mode='text')
    
    # Step 4: Process Powers with OCR
    print("\nStep 4: Processing POWERS with OCR...")
    print(f"Using crop region: {COORDS['POWER_COLUMN_REGION']}")
    print()
    
    extracted_powers = process_image_with_ocr(screenshot_path, COORDS['POWER_COLUMN_REGION'], mode='numeric')
    
    print()
    print("=" * 60)
    print("OCR EXTRACTION RESULTS")
    print("=" * 60)
    print(f"Names extracted: {len(extracted_names)}")
    print(f"Powers extracted: {len(extracted_powers)}")
    print()
    
    if extracted_names:
        print("Player Names:")
        for i, name in enumerate(extracted_names[:5], 1):
            print(f"  {i}. {name}")
        if len(extracted_names) > 5:
            print(f"  ... and {len(extracted_names) - 5} more")
    
    print()
    
    if extracted_powers:
        print("Power Values:")
        for i, power in enumerate(extracted_powers[:5], 1):
            print(f"  {i}. {power}")
        if len(extracted_powers) > 5:
            print(f"  ... and {len(extracted_powers) - 5} more")
    
    if not extracted_names and not extracted_powers:
        print("⚠️  No text extracted. Possible issues:")
        print("  - Tesseract is not installed or path is incorrect")
        print("  - Crop regions need adjustment")
        print("  - Image quality is too low")
    
    print()
    print("=" * 60)
    print("✅ PHASE 2 TEST COMPLETE!")
    print("=" * 60)
    print()
    print("Next Steps:")
    print(f"1. Check the screenshot in {OUTPUT_DIR}/ folder")
    print("2. If results are poor, adjust crop regions in COORDS")
    print("3. Run 'python kingshot_scraper.py phase3' for full scrape")
    print()
    
    return True


# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == "__main__":
    import sys
    
    print()
    print("╔" + "═" * 58 + "╗")
    print("║" + " " * 15 + "KINGSHOT OCR SCRAPER" + " " * 23 + "║")
    print("║" + " " * 12 + "Leaderboard Data Extraction" + " " * 19 + "║")
    print("╚" + "═" * 58 + "╝")
    print()
    
    # Check command line arguments
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == "phase1":
            test_phase1()
        elif command == "phase2":
            test_phase2()
        elif command == "calibrate":
            print("Starting Calibration Mode...")
            device = setup_adb()
            if device:
                input("\n📋 Make sure the leaderboard is visible, then press Enter...")
                calibration_helper(device)
        elif command == "phase3" or command == "scrape":
            print("Starting Full Leaderboard Scrape...")
            device = setup_adb()
            if device:
                # Ask for number of scrolls
                try:
                    scrolls = int(input("\nHow many scrolls? (default: 10): ") or "10")
                except ValueError:
                    scrolls = 10
                print()
                scrape_leaderboard(device, max_scrolls=scrolls)
        else:
            print(f"❌ Unknown command: {command}")
            print("\n💡 Available commands:")
            print("  python kingshot_scraper.py phase1     - Test ADB connection")
            print("  python kingshot_scraper.py calibrate  - Find correct coordinates")
            print("  python kingshot_scraper.py phase2     - Test OCR extraction")
            print("  python kingshot_scraper.py phase3     - Full scrape")
            print("  python kingshot_scraper.py scrape     - Full scrape (alias)")
    else:
        # Show menu
        print("💡 Available commands:")
        print("  python kingshot_scraper.py phase1     - Test ADB connection & controls")
        print("  python kingshot_scraper.py calibrate  - Find correct coordinates")
        print("  python kingshot_scraper.py phase2     - Test OCR extraction")
        print("  python kingshot_scraper.py phase3     - Run full scrape")
        print("  python kingshot_scraper.py scrape     - Run full scrape (alias)")
        print()
        print("Running Phase 1 test by default...")
        print()
        test_phase1()
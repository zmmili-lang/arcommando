"""
Kingshot OCR Scraper - Row-by-Row Version
Processes each leaderboard row individually for better accuracy
"""

import os
import time
from ppadb.client import Client as AdbClient
from PIL import Image, ImageEnhance, ImageFilter
import pytesseract
import json

# Configuration
ADB_HOST = '127.0.0.1'
ADB_PORT = 5037
OUTPUT_DIR = 'kingshot_data'
TESSERACT_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# ROW-BASED COORDINATES (from your actual measurements)
COORDS = {
    'SCROLL_START': (540, 1800),
    'SCROLL_END': (540, 600),
    
    # Each row is approximately 189 pixels tall (original calculation)
    'FIRST_ROW_Y': 385,  # Top of first player row
    'ROW_HEIGHT': 189,   # Height of each row
    'NUM_VISIBLE_ROWS': 9,  # Number of rows visible at once
    
    # Column X coordinates (from your actual measurements)
    'NAME_X1': 360, # Widened from 372 to capture 'Y' in Yelkao
    'NAME_X2': 770,
    'POWER_X1': 777,
    'POWER_X2': 997,
    
    # Power column vertical offset (relative to Name row)
    'POWER_Y_OFFSET': -40, # Shift power crop UP by 40px
}

# ============================================================================
# ADB FUNCTIONS
# ============================================================================

def setup_adb():
    try:
        client = AdbClient(host=ADB_HOST, port=ADB_PORT)
        devices = client.devices()
        if not devices:
            print("❌ No devices connected!")
            return None
        device = devices[0]
        print(f"✅ Connected to device: {device.serial}")
        return device
    except Exception as e:
        print(f"❌ Error connecting to ADB: {e}")
        return None

def capture_and_pull_screen(device, filename):
    device_path = f"/sdcard/{filename}"
    device.shell(f"screencap -p {device_path}")
    
    local_path = os.path.join(OUTPUT_DIR, filename)
    try:
        device.pull(device_path, local_path)
        device.shell(f"rm {device_path}")
        return local_path
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def perform_scroll(device):
    x1, y1 = COORDS['SCROLL_START']
    x2, y2 = COORDS['SCROLL_END']
    device.shell(f"input swipe {x1} {y1} {x2} {y2} 800")
    time.sleep(1.5)

# ============================================================================
# OCR FUNCTIONS
# ============================================================================

def preprocess_image(img, mode='text'):
    """Apply preprocessing to improve OCR accuracy"""
    # Resize 3x for better character recognition (was 2x)
    width, height = img.size
    img = img.resize((width * 3, height * 3), Image.LANCZOS)
    
    # Convert to grayscale
    img = img.convert('L')
    
    # Apply adaptive thresholding for better text separation
    # This is more aggressive than just contrast enhancement
    from PIL import ImageOps
    
    # For text (names), use higher contrast
    if mode == 'text':
        # Increase brightness first
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(1.2)
        
        # Then boost contrast significantly
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.5)
    else:
        # For numbers, slightly different processing
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.2)
    
    # Apply sharpening twice for clearer edges
    img = img.filter(ImageFilter.SHARPEN)
    img = img.filter(ImageFilter.SHARPEN)
    
    # Optional: Apply unsharp mask for even better definition
    img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
    
    return img

def ocr_single_row(screenshot_path, row_num, mode='text', save_debug=False):
    """Extract text from a single row"""
    try:
        img = Image.open(screenshot_path)
        
        # Calculate Y coordinates for this row
        y1 = COORDS['FIRST_ROW_Y'] + (row_num * COORDS['ROW_HEIGHT'])
        y2 = y1 + COORDS['ROW_HEIGHT']
        
        # Get X coordinates based on mode
        if mode == 'text':
            x1, x2 = COORDS['NAME_X1'], COORDS['NAME_X2']
        else:
            x1, x2 = COORDS['POWER_X1'], COORDS['POWER_X2']
            # Apply vertical offset for power column
            y1 += COORDS.get('POWER_Y_OFFSET', 0)
            y2 += COORDS.get('POWER_Y_OFFSET', 0)
        
        # Crop and preprocess
        cropped = img.crop((x1, y1, x2, y2))
        processed = preprocess_image(cropped, mode=mode)
        
        # Save debug images for first few rows
        if save_debug and row_num < 3:
            debug_path = os.path.join(OUTPUT_DIR, f"debug_row{row_num}_{mode}.png")
            processed.save(debug_path)
        
        # OCR config - Enhanced settings
        if mode == 'text':
            # PSM 7 = single line, OEM 1 = LSTM only (best for modern text)
            # Allow common characters in player names
            config = r'--psm 7 --oem 1 -c preserve_interword_spaces=1'
        else:
            # For numbers, strict whitelist
            config = r'--psm 7 --oem 1 -c tessedit_char_whitelist=0123456789, -c preserve_interword_spaces=0'
        
        if os.path.exists(TESSERACT_PATH):
            pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
        
        # Extract text
        text = pytesseract.image_to_string(processed, config=config).strip()
        
        # Fallback: If text is empty and mode is text, try different PSM
        if mode == 'text' and (not text or len(text) < 2):
            print(f"      (Retrying Row {row_num} with PSM 6...)")
            config_fallback = r'--psm 6 --oem 1 -c preserve_interword_spaces=1'
            text = pytesseract.image_to_string(processed, config=config_fallback).strip()
        
        # Post-processing cleanup
        if mode == 'text':
            # Remove common OCR artifacts
            text = text.replace('|', 'I')  # Pipe to I
            text = text.replace('1l', 'Il')  # Common confusion
            text = text.replace('0O', 'OO')  # Zero to O
        else:
            # For numbers, remove spaces and extra characters
            text = text.replace(' ', '')
            text = text.replace('O', '0')  # O to zero
            text = text.replace('o', '0')  # o to zero
        
        return text
        
    except Exception as e:
        print(f"    ⚠️ OCR error on row {row_num}: {e}")
        return ""

def extract_row_data(screenshot_path, row_num, save_debug=False):
    """Extract both name and power from a single row"""
    name = ocr_single_row(screenshot_path, row_num, mode='text', save_debug=save_debug)
    power = ocr_single_row(screenshot_path, row_num, mode='numeric', save_debug=save_debug)
    return name, power

# ============================================================================
# DATA PROCESSING
# ============================================================================

def clean_power_value(power_str):
    """Convert power string to integer"""
    try:
        # Remove everything except digits
        power_str = ''.join(c for c in power_str if c.isdigit() or c == ',')
        power_str = power_str.replace(',', '')
        
        if not power_str:
            return None
            
        return int(power_str)
    except:
        return None

def clean_name_text(text):
    """
    Heuristic cleaning for player names to fix common OCR errors.
    Especially focuses on clan tags like [ARC], [AVN], etc.
    """
    text = text.strip()
    
    # 1. Fix Clan Tag Start (J -> [, I -> [)
    # Check for known tags
    known_tags = ['ARC', 'AVN', 'HOE', 'ExU', 'Exu']
    
    for tag in known_tags:
        # Fix Start: JARC, IARC -> [ARC
        if text.startswith(f"J{tag}"): text = text.replace(f"J{tag}", f"[{tag}", 1)
        if text.startswith(f"I{tag}"): text = text.replace(f"I{tag}", f"[{tag}", 1)
        if text.startswith(f"l{tag}"): text = text.replace(f"l{tag}", f"[{tag}", 1)
        
        # Fix End: ARCI -> ARC]
        text = text.replace(f"{tag}I", f"{tag}]")
        text = text.replace(f"{tag}l", f"{tag}]")
        text = text.replace(f"{tag}1", f"{tag}]")
        text = text.replace(f"{tag}|", f"{tag}]")
        
        # Special Case: ARCW -> ARC]U (OCR merges ] and U into W)
        text = text.replace(f"{tag}W", f"{tag}]U")
        
        # Special Case: HOEH -> HOE]i (OCR failure on bracket+i)
        if tag == 'HOE':
            text = text.replace('HOEH', 'HOE]i')
        
    # 2. General Bracket Fixes
    text = text.replace('(', '[')
    text = text.replace(')', ']')
    text = text.replace('{', '[')
    text = text.replace('}', ']')
    
    # 3. Post-Fix Cleanup
    # Fix double U after tag fix (e.g. [ARC]UUrek -> [ARC]Urek)
    text = text.replace(']UU', ']U')
    
    # Strip trailing noise
    text = text.rstrip(' _.,')
    
    return text

def scrape_leaderboard_rows(device, max_scrolls=10):
    """Main scraping function using row-by-row approach"""
    print(f"🚀 Starting row-by-row scrape ({max_scrolls} scrolls)...\n")
    
    all_players = []
    seen_entries = set()
    
    for scroll_num in range(max_scrolls):
        print(f"{'='*60}")
        print(f"SCROLL {scroll_num+1}/{max_scrolls}")
        print(f"{'='*60}")
        
        # Capture screenshot
        filename = f"scrape_{scroll_num:03d}.png"
        img_path = capture_and_pull_screen(device, filename)
        
        if not img_path:
            print("⚠️  Failed to capture")
            continue
        
        # Process each visible row
        row_count = 0
        for row in range(COORDS['NUM_VISIBLE_ROWS']):
            # Save debug images for first scroll only
            save_debug = (scroll_num == 0)
            name, power_str = extract_row_data(img_path, row, save_debug=save_debug)
            
            # Clean and validate
            name = clean_name_text(name)
            
            if not name or len(name) < 2:
                print(f"    ⚠️ Skipping Row {row+1}: Name too short/empty '{name}'")
                continue
                
            power = clean_power_value(power_str)
            if not power or power < 1000:  # Minimum valid power
                print(f"    ⚠️ Skipping Row {row+1} ({name}): Invalid power '{power_str}'")
                continue
            
            # Deduplicate
            entry_key = (name, power)
            if entry_key in seen_entries:
                continue
            
            seen_entries.add(entry_key)
            all_players.append({'name': name, 'power': power})
            row_count += 1
            
            print(f"  Row {row+1}: {name:30s} -> {power:,}")
        
        print(f"\n✅ Extracted {row_count} valid rows")
        
        # Cleanup
        try:
            os.remove(img_path)
        except:
            pass
        
        # Scroll (except last iteration)
        if scroll_num < max_scrolls - 1:
            print("⬇️  Scrolling...\n")
            perform_scroll(device)
    
    # Save results
    print(f"\n{'='*60}")
    print(f"FINAL RESULTS")
    print(f"{'='*60}")
    print(f"Total unique players: {len(all_players)}")
    
    # Sort by power
    all_players.sort(key=lambda x: x['power'], reverse=True)
    
    # Save to file
    filepath = os.path.join(OUTPUT_DIR, 'players.json')
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(all_players, f, indent=2, ensure_ascii=False)
    print(f"💾 Saved to {filepath}")
    
    # Display top 10
    print(f"\n{'='*60}")
    print("TOP 10 PLAYERS")
    print(f"{'='*60}")
    for idx, player in enumerate(all_players[:10], 1):
        print(f"{idx:2d}. {player['name']:30s} - {player['power']:,}")
    
    return all_players

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    print("\n╔" + "═"*58 + "╗")
    print("║" + " "*15 + "KINGSHOT OCR SCRAPER v2" + " "*20 + "║")
    print("║" + " "*12 + "Row-by-Row Processing" + " "*25 + "║")
    print("╚" + "═"*58 + "╝\n")
    
    device = setup_adb()
    if not device:
        exit()
    
    print("📋 Make sure the leaderboard is visible!\n")
    input("Press Enter to start...")
    
    try:
        scrolls = int(input("\nHow many scrolls? (default: 10): ") or "10")
    except:
        scrolls = 10
    
    print()
    scrape_leaderboard_rows(device, max_scrolls=scrolls)
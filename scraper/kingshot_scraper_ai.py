"""
Kingshot OCR Scraper - AI Version (EasyOCR)
Uses Deep Learning (EasyOCR) for superior accuracy on player names.
Writes data to Neon database for leaderboard tracking.
"""

import os
import time
from ppadb.client import Client as AdbClient
from PIL import Image
import easyocr
import numpy as np
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
ADB_HOST = '127.0.0.1'
ADB_PORT = 5037
OUTPUT_DIR = 'kingshot_data'

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# Database Configuration
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("⚠️  WARNING: DATABASE_URL not set in .env file!")
    print("Data will not be saved to database.")
    print("Please create a .env file with your Neon database URL.")
    print("See .env.example for template.\n")

# ROW-BASED COORDINATES (Same as v2)
COORDS = {
    'SCROLL_START': (540, 1800),
    'SCROLL_END': (540, 630),
    
    'FIRST_ROW_Y': 325,  # Top of first player row
    'ROW_HEIGHT': 201,   # Height of each row
    'NUM_VISIBLE_ROWS': 9,  # Number of rows visible at once
    
    # Column X coordinates
    'NAME_X1': 360, # Widened to capture 'Y' in Yelkao
    'NAME_X2': 770,
    'POWER_X1': 777,
    'POWER_X2': 997,
    
    'POWER_Y_OFFSET': -40, # Shift power crop UP by 40px
}

# Initialize EasyOCR Reader (do this once, global)
print("⏳ Initializing AI Model (this may take a moment)...")
READER = easyocr.Reader(['en'], gpu=True) # Set gpu=False if you don't have CUDA

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
    time.sleep(1.0)

# ============================================================================
# AI OCR FUNCTIONS
# ============================================================================

def preprocess_for_ai(img):
    """
    Preprocess image for EasyOCR:
    1. Grayscale
    2. Thresholding to isolate bright text
    """
    # Convert to grayscale
    img_gray = img.convert('L')
    
    # Simple binarization: Keep only bright pixels (text)
    # Adjust threshold as needed (150 is a safe starting point for white text)
    threshold = 140
    img_binary = img_gray.point(lambda p: 255 if p > threshold else 0)
    
    return img_binary

def ai_ocr_single_row(screenshot_path, row_num, mode='text'):
    """Extract text from a single row using EasyOCR"""
    try:
        img = Image.open(screenshot_path)
        
        # Calculate Y coordinates
        y1 = COORDS['FIRST_ROW_Y'] + (row_num * COORDS['ROW_HEIGHT'])
        y2 = y1 + COORDS['ROW_HEIGHT']
        
        # Get X coordinates
        if mode == 'text':
            x1, x2 = COORDS['NAME_X1'], COORDS['NAME_X2']
        else:
            x1, x2 = COORDS['POWER_X1'], COORDS['POWER_X2']
            y1 += COORDS.get('POWER_Y_OFFSET', 0)
            y2 += COORDS.get('POWER_Y_OFFSET', 0)
        
        # Crop
        cropped = img.crop((x1, y1, x2, y2))
        
        # Convert to numpy array for EasyOCR
        img_np = np.array(cropped)
        
        # Recognize
        if mode == 'text':
            # Detail=0 gives specific simpler output
            results = READER.readtext(img_np, detail=0, paragraph=True) 
        else:
            # For numbers, allow digits and commas
            results = READER.readtext(img_np, detail=0, allowlist='0123456789,')
            
        text = " ".join(results).strip()
        return text
        
    except Exception as e:
        print(f"    ⚠️ AI Error on row {row_num}: {e}")
        return ""

# ============================================================================
# DATA CLEANING
# ============================================================================

def clean_name_text(text):
    """Fallback cleaning for AI results pattern enforcement"""
    text = text.strip()
    
    # 0. Clean leading artifacts (common from left border)
    # Recursively strip I, l, |, [ from the start IF they are extra
    # We want to keep the FIRST legitimate '['
    
    # Fix: I[HOE -> [HOE
    if text.startswith('I[') or text.startswith('|['):
        text = text[1:]
    
    # 1. Fix double starting brackets (e.g. [[HOE...)
    if text.startswith('[['):
        text = text[1:]
        
    # 2. Enforce [XXX] pattern
    # If it starts with [ and has enough length
    if text.startswith('[') and len(text) >= 5:
        # The character at index 4 (5th char) SHOULD be ']'
        # EasyOCR often reads it as 'J', 'W', '1', etc.
        char_at_4 = text[4]
        if char_at_4 != ']':
            # Force compliance: Replace the 5th char with ']'
            # Examples: [AVNJ -> [AVN], [ARCW -> [ARC]
            text = text[:4] + ']' + text[5:]
            
        # Fix known tags casing (e.g. [ARc] -> [ARC], [exu] -> [ExU])
        # Only if we aren't sure about the casing
        tag_content = text[1:4]
        
        # Canonical map of tags
        KNOWN_TAGS = {
            'ARC': 'ARC',
            'AVN': 'AVN',
            'HOE': 'HOE',
            'EXU': 'ExU', 
            'EXu': 'ExU'
        }
        
        # Check upper case version against known tags
        tag_upper = tag_content.upper()
        if tag_upper in KNOWN_TAGS:
            correct_tag = KNOWN_TAGS[tag_upper]
            if tag_content != correct_tag:
                text = '[' + correct_tag + ']' + text[5:]
    
    # 3. Simple bracket fixes (AI is usually smarter, but just in case)
    # Only verify internal brackets, not the one we just fixed
    # text = text.replace('(', '[') 
    # text = text.replace(')', ']')
    # text = text.replace('{', '[')
    # text = text.replace('}', ']')
    
    # Strip noise
    text = text.rstrip(' _.,')
    
    return text

def save_debug_row(img_path, row_num, global_idx, name):
    """Saves the cropped row image for verification"""
    try:
        debug_dir = os.path.join(OUTPUT_DIR, 'debug_crops')
        if not os.path.exists(debug_dir):
            os.makedirs(debug_dir)
            
        img = Image.open(img_path)
        
        # Calculate Y coordinates
        y1 = COORDS['FIRST_ROW_Y'] + (row_num * COORDS['ROW_HEIGHT'])
        y2 = y1 + COORDS['ROW_HEIGHT']
        
        # Crop the full width (Name start to Power end)
        # Using 0 as start to capture rank/avatar too if needed, or just name
        # Let's verify context: User wants to compare results.
        # Ideally we capture Name X1 to Power X2
        
        # BUT: Power has Y offset. We should probably just save the Name region and Power region combined or separate.
        # Let's separate them for clarity or stitch them. Stitched/Separate is complex.
        # Let's just save the entire row strip from Name X1 to Power X2, ignoring the Y-offset jitter for visual check.
        # OR: Save exactly what the AI saw (2 images).
        
        # Decision: Save the entire row strip so they can see context.
        x1 = COORDS['NAME_X1']
        x2 = COORDS['POWER_X2']
        
        # For the Y, we must pick one. Name Y is the "anchor".
        crop = img.crop((x1, y1, x2, y2))
        
        # Sanitize filename
        safe_name = "".join([c for c in name if c.isalnum() or c in (' ', '-', '_')]).strip()
        filename = f"row_{global_idx:03d}_{safe_name}.png"
        
        crop.save(os.path.join(debug_dir, filename))
        
    except Exception as e:
        print(f"Warning: Failed to save debug image: {e}")

def clean_power_value(power_str):
    try:
        power_str = ''.join(c for c in power_str if c.isdigit())
        if not power_str: return None
        return int(power_str)
    except:
        return None

# ============================================================================
# DATABASE FUNCTIONS
# ============================================================================

def get_db_connection():
    """Create a database connection"""
    if not DATABASE_URL:
        return None
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        return None

def save_to_database(players_data):
    """
    Save scraped player data to Neon database.
    Updates leaderboard_players and inserts into leaderboard_power_history.
    """
    if not DATABASE_URL:
        print("⚠️  Skipping database save (no DATABASE_URL configured)")
        return False
        
    conn = get_db_connection()
    if not conn:
        return False
        
    try:
        cursor = conn.cursor()
        scrape_time = int(time.time() * 1000)  # milliseconds
        
        saved_count = 0
        for player in players_data:
            name = player['name']
            power = player['power']
            
            # Upsert player (insert or update last_seen)
            cursor.execute("""
                INSERT INTO leaderboard_players (name, first_seen, last_seen)
                VALUES (%s, %s, %s)
                ON CONFLICT (name) 
                DO UPDATE SET last_seen = EXCLUDED.last_seen
            """, (name, scrape_time, scrape_time))
            
            # Insert power reading (ignore if duplicate timestamp)
            cursor.execute("""
                INSERT INTO leaderboard_power_history (player_name, power, scraped_at)
                VALUES (%s, %s, %s)
                ON CONFLICT (player_name, scraped_at) DO NOTHING
            """, (name, power, scrape_time))
            
            saved_count += 1
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"\n💾 Saved {saved_count} players to database")
        return True
        
    except Exception as e:
        print(f"\n❌ Database save error: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return False

# ============================================================================
# MAIN LOOP
# ============================================================================

def scrape_leaderboard_ai(device, max_scrolls=10):
    print(f"🚀 Starting AI scrape ({max_scrolls} scrolls)...\n")
    
    all_players = []
    seen_entries = set()
    
    for scroll_num in range(max_scrolls):
        print(f"{'='*60}")
        print(f"SCROLL {scroll_num+1}/{max_scrolls}")
        print(f"{'='*60}")
        
        # Capture
        filename = f"scrape_{scroll_num:03d}.png"
        img_path = capture_and_pull_screen(device, filename)
        if not img_path: continue
        
        # Process Rows
        valid_rows = 0
        for row in range(COORDS['NUM_VISIBLE_ROWS']):
            # Extract
            name = ai_ocr_single_row(img_path, row, mode='text')
            power_str = ai_ocr_single_row(img_path, row, mode='numeric')
            
            # Clean
            name = clean_name_text(name)
            power = clean_power_value(power_str)
            
            if not name or len(name) < 2:
                # print(f"    Skipping Row {row+1}: Empty name")
                continue
                
            if not power:
                print(f"    ⚠️ Skipping Row {row+1} ({name}): Invalid power '{power_str}'")
                continue
                
            # Deduplicate
            entry_key = (name, power)
            if entry_key in seen_entries:
                continue
                
            seen_entries.add(entry_key)
            all_players.append({'name': name, 'power': power})
            valid_rows += 1
            
            # Debug images disabled for performance
            # save_debug_row(img_path, row, len(all_players), name)
            
            print(f"  Row {row+1}: {name:30s} -> {power:,}")
            
        print(f"\n✅ Extracted {valid_rows} valid rows")
        
        # Cleanup
        try: os.remove(img_path) 
        except: pass
        
        # Scroll
        if scroll_num < max_scrolls - 1:
            print("⬇️  Scrolling...\n")
            perform_scroll(device)
            
    # Save to database
    print(f"\n{'='*60}")
    print(f"FINAL RESULTS")
    print(f"{'='*60}")
    print(f"Total unique players: {len(all_players)}")
    
    # Save to database
    db_success = save_to_database(all_players)
    
    if not db_success:
        # Fallback: save to JSON if database fails
        print("\n⚠️  Database save failed, falling back to JSON file...")
        filepath = os.path.join(OUTPUT_DIR, 'players.json')
        with open(filepath, 'w', encoding='utf-8') as f:
            import json
            json.dump(all_players, f, indent=2, ensure_ascii=False)
        print(f"💾 Saved to {filepath}")
    
    # Top 10
    print("\nTOP 10:")
    for idx, player in enumerate(all_players[:10], 1):
        print(f"{idx:2d}. {player['name']:30s} - {player['power']:,}")

if __name__ == "__main__":
    import sys
    import argparse
    
    parser = argparse.ArgumentParser(description='Kingshot AI Scraper')
    parser.add_argument('--auto', action='store_true', help='Run automatically without prompts')
    parser.add_argument('--scrolls', type=int, default=10, help='Number of scrolls (default: 10)')
    args = parser.parse_args()
    
    print("\n╔" + "═"*58 + "╗")
    print("║" + " "*15 + "KINGSHOT SCRAPER (AI)" + " "*22 + "║")
    print("║" + " "*17 + "Powered by EasyOCR" + " "*23 + "║")
    print("╚" + "═"*58 + "╝\n")
    
    device = setup_adb()
    if device:
        if not args.auto:
            print("📋 Make sure leaderboard is visible!\n")
            input("Press Enter to start...")
            try:
                scrolls = int(input("\nHow many scrolls? (default: 10): ") or "10")
            except:
                scrolls = 10
        else:
            scrolls = args.scrolls
            print(f"📋 Auto mode: Running {scrolls} scrolls...\n")
            
        print()
        scrape_leaderboard_ai(device, max_scrolls=scrolls)

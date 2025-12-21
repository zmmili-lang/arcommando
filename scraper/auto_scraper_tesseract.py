"""
Kingshot Auto Scraper - Tesseract OCR Version
Processes players one-by-one with immediate database saves.
Uses Tesseract OCR for faster processing and API for player names.
"""

import os
import sys
import time
import json
import hashlib
import requests
from ppadb.client import Client as AdbClient
from PIL import Image, ImageEnhance, ImageFilter
import pytesseract
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
ADB_HOST = '127.0.0.1'
ADB_PORT = 5037
OUTPUT_DIR = 'kingshot_data'
TESSERACT_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
DATABASE_URL = os.getenv('DATABASE_URL')

# Game Package Name
GAME_PACKAGE = "com.run.tower.defense"

# Navigation Steps (Tap Coordinates)
NAVIGATION_STEPS = [
    (560, 370, 1.0),  # Empty
    (70, 144, 1.0),   # Avatar
    (674, 2248, 2.0), # Leaderboard
    (305, 1295, 2.0), # Personal Power
]

# Leaderboard Coordinates (from kingshot_scraper_v2.py)
COORDS = {
    'SCROLL_START': (540, 1800),
    'SCROLL_END': (540, 600),
    'FIRST_ROW_Y': 385,
    'ROW_HEIGHT': 189,
    'NUM_VISIBLE_ROWS': 9,
    'NAME_X1': 360,
    'NAME_X2': 770,
    'POWER_X1': 777,
    'POWER_X2': 997,
    'POWER_Y_OFFSET': -40,
    
    # Profile Screen Coordinates
    'BACK_BUTTON': (72, 137),
    'PROFILE_UID_REGION': (450, 1833, 662, 1876),  # (x1, y1, x2, y2)
    'PROFILE_KILLS_REGION': (480, 1950, 750, 1995),
    'PROFILE_ALLIANCE_REGION': (550, 2000, 650, 2055),
    'PROFILE_KINGDOM_REGION': (850, 1833, 1000, 1876),
}

# API Configuration (from ks-api.js)
LOGIN_URL = 'https://kingshot-giftcode.centurygame.com/api/player'
SECRET = 'mN4!pQs6JrYwV9'

# ============================================================================
# ADB FUNCTIONS
# ============================================================================

def setup_adb():
    """Connect to ADB"""
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
    """Capture screenshot and pull to local"""
    device_path = f"/sdcard/{filename}"
    device.shell(f"screencap -p {device_path}")
    
    local_path = os.path.join(OUTPUT_DIR, filename)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    try:
        device.pull(device_path, local_path)
        device.shell(f"rm {device_path}")
        return local_path
    except Exception as e:
        print(f"❌ Error capturing screen: {e}")
        return None

def launch_game(device):
    """Launch the game"""
    print(f"🚀 Launching {GAME_PACKAGE}...")
    device.shell(f"am force-stop {GAME_PACKAGE}")
    time.sleep(1)
    device.shell(f"monkey -p {GAME_PACKAGE} -c android.intent.category.LAUNCHER 1")
    print("⏳ Waiting for game to load (15 seconds)...")
    time.sleep(15)
    return True

def navigate_to_leaderboard(device):
    """Navigate through the game to reach leaderboard"""
    if not NAVIGATION_STEPS:
        print("\n⚠️  No navigation steps configured!")
        input("Press Enter when you're on the leaderboard screen...")
        return True
        
    print(f"\n🧭 Navigating to leaderboard ({len(NAVIGATION_STEPS)} steps)...")
    for i, (x, y, delay) in enumerate(NAVIGATION_STEPS, 1):
        print(f"  Step {i}/{len(NAVIGATION_STEPS)}: Tap ({x}, {y})")
        device.shell(f"input tap {x} {y}")
        time.sleep(delay)
    print("✅ Navigation complete!")
    return True

def perform_scroll(device):
    """Scroll down the leaderboard"""
    x1, y1 = COORDS['SCROLL_START']
    x2, y2 = COORDS['SCROLL_END']
    device.shell(f"input swipe {x1} {y1} {x2} {y2} 800")
    time.sleep(1.5)

# ============================================================================
# TESSERACT OCR FUNCTIONS
# ============================================================================

def preprocess_image(img, mode='text'):
    """Apply preprocessing to improve OCR accuracy"""
    width, height = img.size
    img = img.resize((width * 3, height * 3), Image.LANCZOS)
    img = img.convert('L')
    
    from PIL import ImageOps
    
    if mode == 'text':
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(1.2)
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.5)
    else:
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.2)
    
    img = img.filter(ImageFilter.SHARPEN)
    img = img.filter(ImageFilter.SHARPEN)
    img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
    
    return img

def ocr_region(img, region, allowlist=None):
    """Extract text from a specific region"""
    try:
        x1, y1, x2, y2 = region
        cropped = img.crop((x1, y1, x2, y2))
        processed = preprocess_image(cropped, mode='text')
        
        config = r'--psm 7 --oem 1'
        if allowlist:
            config += f' -c tessedit_char_whitelist={allowlist}'
        
        if os.path.exists(TESSERACT_PATH):
            pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
        
        text = pytesseract.image_to_string(processed, config=config).strip()
        
        # Clean numeric values
        if allowlist and '0123456789' in allowlist:
            text = ''.join(c for c in text if c.isdigit() or c in (',', '.', 'M', 'K', 'B'))
        
        return text
    except Exception as e:
        print(f"      ⚠️ OCR error: {e}")
        return ""

def ocr_power_from_row(screenshot_path, row_num):
    """Extract power value from a leaderboard row"""
    try:
        img = Image.open(screenshot_path)
        y1 = COORDS['FIRST_ROW_Y'] + (row_num * COORDS['ROW_HEIGHT']) + COORDS['POWER_Y_OFFSET']
        y2 = y1 + COORDS['ROW_HEIGHT']
        x1, x2 = COORDS['POWER_X1'], COORDS['POWER_X2']
        
        cropped = img.crop((x1, y1, x2, y2))
        processed = preprocess_image(cropped, mode='numeric')
        
        config = r'--psm 7 --oem 1 -c tessedit_char_whitelist=0123456789,'
        if os.path.exists(TESSERACT_PATH):
            pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
        
        text = pytesseract.image_to_string(processed, config=config).strip()
        text = text.replace(' ', '').replace(',', '')
        text = text.replace('O', '0').replace('o', '0')
        
        return text
    except Exception as e:
        print(f"      ⚠️ Power OCR error: {e}")
        return ""

def clean_power_value(power_str):
    """Convert power string to integer"""
    try:
        power_str = ''.join(c for c in power_str if c.isdigit() or c == ',')
        power_str = power_str.replace(',', '')
        if not power_str:
            return None
        return int(power_str)
    except:
        return None

# ============================================================================
# PROFILE SCRAPING
# ============================================================================

def scrape_profile_screen(screenshot_path):
    """Extract UID, Kills, Alliance, Kingdom from profile screen"""
    try:
        img = Image.open(screenshot_path)
        
        uid = ocr_region(img, COORDS['PROFILE_UID_REGION'], allowlist='0123456789')
        kills_str = ocr_region(img, COORDS['PROFILE_KILLS_REGION'], allowlist='0123456789,MKB.')
        alliance = ocr_region(img, COORDS['PROFILE_ALLIANCE_REGION'])
        kingdom_str = ocr_region(img, COORDS['PROFILE_KINGDOM_REGION'], allowlist='0123456789')
        
        # Clean kills
        kills = clean_power_value(kills_str)
        
        # Clean kingdom
        kingdom = None
        if kingdom_str:
            try:
                kingdom = int(''.join(c for c in kingdom_str if c.isdigit()))
            except:
                pass
        
        return {
            'uid': uid.strip(),
            'kills': kills or 0,
            'alliance_name': alliance.strip() if alliance else None,
            'kingdom': kingdom
        }
    except Exception as e:
        print(f"      ⚠️ Profile scrape error: {e}")
        return None

# ============================================================================
# API FUNCTIONS
# ============================================================================

def md5(text):
    """Calculate MD5 hash"""
    return hashlib.md5(text.encode()).hexdigest()

def fetch_player_profile(fid):
    """Fetch player profile from API (nickname, avatar)"""
    try:
        import time as time_module
        payload = {
            'fid': str(fid).strip(),
            'time': int(time_module.time() * 1000)
        }
        
        # Sort keys and create signature
        keys = sorted(payload.keys())
        encoded = '&'.join(f"{k}={payload[k]}" for k in keys)
        sign = md5(f"{encoded}{SECRET}")
        payload['sign'] = sign
        
        response = requests.post(LOGIN_URL, json=payload, timeout=10)
        if response.status_code != 200:
            return None
        
        data = response.json()
        if data.get('code') != 0:
            return None
        
        player_data = data.get('data', {})
        return {
            'nickname': player_data.get('nickname', ''),
            'avatar_image': player_data.get('avatar_image', '')
        }
    except Exception as e:
        print(f"      ⚠️ API error for FID {fid}: {e}")
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

def save_player_to_database(player_data):
    """Save a single player to database immediately"""
    if not DATABASE_URL:
        print("      ⚠️  Skipping database save (no DATABASE_URL configured)")
        return False
    
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        cursor = conn.cursor()
        scrape_time = int(time.time() * 1000)  # milliseconds
        
        uid = player_data.get('uid')
        nickname = player_data.get('nickname', '')
        power = player_data.get('power')
        alliance = player_data.get('alliance_name')
        kingdom = player_data.get('kingdom')
        avatar_image = player_data.get('avatar_image', '')
        kid = player_data.get('kid')
        stove_lv = player_data.get('stove_lv')
        stove_lv_content = player_data.get('stove_lv_content', '')
        
        if not uid:
            print("      ⚠️  No UID, skipping database save")
            conn.close()
            return False
        
        # Check if player exists
        cursor.execute("SELECT id, is_verified FROM players WHERE id = %s", (uid,))
        existing = cursor.fetchone()
        
        if existing:
            # Update existing player (skip kills for now)
            cursor.execute("""
                UPDATE players SET 
                    nickname = COALESCE(NULLIF(%s, ''), nickname),
                    avatar_image = COALESCE(NULLIF(%s, ''), avatar_image),
                    last_seen = %s,
                    alliance_name = %s,
                    kingdom = %s,
                    kid = COALESCE(%s, kid),
                    stove_lv = COALESCE(%s, stove_lv),
                    stove_lv_content = COALESCE(NULLIF(%s, ''), stove_lv_content)
                WHERE id = %s
            """, (nickname, avatar_image, scrape_time, alliance, kingdom, kid, stove_lv, stove_lv_content, uid))
        else:
            # Insert new player (skip kills for now)
            cursor.execute("""
                INSERT INTO players (id, nickname, avatar_image, first_seen, last_seen, alliance_name, kingdom, kid, stove_lv, stove_lv_content)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (uid, nickname, avatar_image, scrape_time, scrape_time, alliance, kingdom, kid, stove_lv, stove_lv_content))
        
        # Insert power reading (check if exists first to avoid conflict)
        if power:
            # Check if this power reading already exists
            cursor.execute("""
                SELECT id FROM leaderboard_power_history 
                WHERE player_id = %s AND scraped_at = %s
            """, (uid, scrape_time))
            
            if not cursor.fetchone():
                # Only insert if it doesn't exist
                cursor.execute("""
                    INSERT INTO leaderboard_power_history (player_id, power, scraped_at)
                    VALUES (%s, %s, %s)
                """, (uid, power, scrape_time))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return True
        
    except Exception as e:
        print(f"      ❌ Database save error: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return False

# ============================================================================
# MAIN SCRAPING LOOP
# ============================================================================

def process_single_player(device, screenshot_path, row_num, player_count, max_players):
    """Process a single player: capture power, tap, get FID, fetch API, save to DB"""
    
    if player_count >= max_players:
        return False
    
    print(f"\n  [{player_count + 1}/{max_players}] Processing Row {row_num + 1}...")
    
    # Step 1: Capture power from leaderboard
    power_str = ocr_power_from_row(screenshot_path, row_num)
    power = clean_power_value(power_str)
    
    if not power or power < 1000:
        print(f"      ⚠️  Invalid power '{power_str}', skipping")
        return True  # Continue to next player
    
    print(f"      Power: {power:,}")
    
    # Step 2: Tap the player row
    row_y = COORDS['FIRST_ROW_Y'] + (row_num * COORDS['ROW_HEIGHT']) + (COORDS['ROW_HEIGHT'] // 2)
    device.shell(f"input tap 540 {row_y}")
    time.sleep(2.0)  # Wait for profile screen
    
    # Step 3: Capture profile screen and extract FID
    profile_filename = f"profile_temp_{player_count}.png"
    profile_path = capture_and_pull_screen(device, profile_filename)
    
    if not profile_path:
        print("      ⚠️  Failed to capture profile screen")
        # Try to go back anyway
        device.shell(f"input tap {COORDS['BACK_BUTTON'][0]} {COORDS['BACK_BUTTON'][1]}")
        time.sleep(1.5)
        return True
    
    # Step 4: Extract FID and profile data
    profile_data = scrape_profile_screen(profile_path)
    
    # Cleanup profile screenshot
    try:
        os.remove(profile_path)
    except:
        pass
    
    if not profile_data or not profile_data.get('uid'):
        print("      ⚠️  Failed to extract FID, skipping")
        device.shell(f"input tap {COORDS['BACK_BUTTON'][0]} {COORDS['BACK_BUTTON'][1]}")
        time.sleep(1.5)
        return True
    
    fid = profile_data['uid']
    print(f"      FID: {fid}")
    # Skip kills for now - will be added from different leaderboard
    if profile_data.get('alliance_name'):
        print(f"      Alliance: {profile_data['alliance_name']}")
    if profile_data.get('kingdom'):
        print(f"      Kingdom: {profile_data['kingdom']}")
    
    # Step 5: Fetch player name and avatar from API
    print(f"      Fetching from API...")
    api_data = fetch_player_profile(fid)
    
    if api_data:
        print(f"      Name: {api_data.get('nickname', 'N/A')}")
        profile_data['nickname'] = api_data.get('nickname', '')
        profile_data['avatar_image'] = api_data.get('avatar_image', '')
        profile_data['kid'] = api_data.get('kid')
        profile_data['stove_lv'] = api_data.get('stove_lv')
        profile_data['stove_lv_content'] = api_data.get('stove_lv_content', '')
        if api_data.get('kid'):
            print(f"      Kingdom ID: {api_data.get('kid')}")
        if api_data.get('stove_lv'):
            print(f"      Stove Level: {api_data.get('stove_lv')}")
    else:
        print(f"      ⚠️  API fetch failed, using OCR name only")
        profile_data['nickname'] = ''
        profile_data['avatar_image'] = ''
        profile_data['kid'] = None
        profile_data['stove_lv'] = None
        profile_data['stove_lv_content'] = ''
    
    # Step 6: Add power to player data
    profile_data['power'] = power
    
    # Step 7: Save to database immediately
    print(f"      Saving to database...")
    if save_player_to_database(profile_data):
        print(f"      ✅ Saved to database!")
    else:
        print(f"      ⚠️  Database save failed")
    
    # Step 8: Go back to leaderboard
    device.shell(f"input tap {COORDS['BACK_BUTTON'][0]} {COORDS['BACK_BUTTON'][1]}")
    time.sleep(1.5)
    
    return True

def scrape_leaderboard_tesseract(device, max_players=100, max_scrolls=12):
    """Main scraping function - processes players one by one"""
    print(f"\n🚀 Starting Tesseract scraper")
    print(f"   Max players: {max_players}")
    print(f"   Max scrolls: {max_scrolls}\n")
    
    player_count = 0
    seen_fids = set()
    
    for scroll_num in range(max_scrolls):
        if player_count >= max_players:
            break
        
        print(f"\n{'='*60}")
        print(f"SCROLL {scroll_num+1}/{max_scrolls} (Players: {player_count}/{max_players})")
        print(f"{'='*60}")
        
        # Capture leaderboard screenshot
        filename = f"leaderboard_{scroll_num:03d}.png"
        screenshot_path = capture_and_pull_screen(device, filename)
        
        if not screenshot_path:
            print("⚠️  Failed to capture screenshot")
            continue
        
        # Process each visible row
        for row in range(COORDS['NUM_VISIBLE_ROWS']):
            if player_count >= max_players:
                break
            
            # Process single player
            continue_processing = process_single_player(device, screenshot_path, row, player_count, max_players)
            
            if not continue_processing:
                break
            
            # Check if we've seen this FID before (deduplication)
            # Note: We can't check until after processing, but we'll skip duplicates in DB
            player_count += 1
        
        # Cleanup screenshot
        try:
            os.remove(screenshot_path)
        except:
            pass
        
        # Scroll (except last iteration)
        if scroll_num < max_scrolls - 1 and player_count < max_players:
            print("\n⬇️  Scrolling...")
            perform_scroll(device)
    
    print(f"\n{'='*60}")
    print(f"SCRAPING COMPLETE")
    print(f"{'='*60}")
    print(f"Total players processed: {player_count}")

# ============================================================================
# MAIN
# ============================================================================

def main():
    import sys
    
    print("\n╔" + "═" * 58 + "╗")
    print("║" + " " * 10 + "KINGSHOT TESSERACT SCRAPER" + " " * 23 + "║")
    print("║" + " " * 15 + "One-by-One Processing" + " " * 23 + "║")
    print("╚" + "═" * 58 + "╝\n")
    
    device = setup_adb()
    if not device:
        return
    
    # Get max players from user
    try:
        max_players_input = input("How many players to scrape? (default: 10, max: 100): ").strip()
        max_players = int(max_players_input) if max_players_input else 10
        max_players = min(max_players, 100)
    except:
        max_players = 10
    
    # Launch game
    if not launch_game(device):
        return
    
    # Navigate to leaderboard
    if not navigate_to_leaderboard(device):
        return
    
    print("\n📋 Make sure the leaderboard is visible!")
    input("Press Enter to start scraping...")
    
    # Start scraping
    scrape_leaderboard_tesseract(device, max_players=max_players)
    
    print("\n✅ Done!")

if __name__ == "__main__":
    main()


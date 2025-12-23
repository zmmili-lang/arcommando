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
import io
import threading
import subprocess
from ppadb.client import Client as AdbClient
from PIL import Image, ImageEnhance, ImageFilter
import shutil
import datetime
import pytesseract
import psycopg2
import numpy as np
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SAVE_DEBUG_CROPS = True  # Enable for calibration phase

# Configuration
ADB_HOST = '127.0.0.1'
ADB_PORT = 5037
OUTPUT_DIR = 'kingshot_data'
TESSERACT_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
DATABASE_URL = os.getenv('DATABASE_URL')

# Game Package Name
GAME_PACKAGE = "com.run.tower.defense"

# OCR Debugging
SAVE_DEBUG_CROPS = False # Controlled by CLI argument now
DEBUG_DIR = os.path.join(OUTPUT_DIR, 'debug_ocr')
REPORTS_DIR = os.path.join(OUTPUT_DIR, 'reports')

# Ensure directories exist
for d in [OUTPUT_DIR, DEBUG_DIR]:
    if not os.path.exists(d):
        os.makedirs(d)

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
    'SCROLL_END': (540, 656),    # Final Micro-Tune: 656 (was 658) to fix +2.5px residual undershoot
    'FIRST_ROW_Y': 323,         # Shifted UP 81px (from 404) per user manual measurement
    'ROW_HEIGHT': 201.25,      # Refined height (1610/8) for sub-pixel lock
    'NUM_VISIBLE_ROWS': 8,
    'NAME_X1': 360,
    'NAME_X2': 770,
    'POWER_X1': 777,
    'POWER_X2': 997,
    'POWER_Y_OFFSET': 0,        # Centered vertically in row
    
    # Leaderboard Title Region (to check if we are still on leaderboard)
    # Focused on fixed "Personal Power" title at the very top
    'LEADERBOARD_CHECK_REGION': (150, 140, 950, 230), 
    
    # Profile Screen Coordinates
    'BACK_BUTTON': (72, 137),
    'PROFILE_UID_REGION': (440, 1825, 740, 1885),
    'PROFILE_ALLIANCE_REGION': (550, 2010, 653, 2051),
}

# API Configuration (from ks-api.js)
LOGIN_URL = 'https://kingshot-giftcode.centurygame.com/api/player'
SECRET = 'mN4!pQs6JrYwV9'

# ============================================================================
# ADB FUNCTIONS
# ============================================================================

def setup_adb():
    """Connect to ADB with auto-start and retry"""
    # 1. Attempt to ensure server is running
    try:
        # Check if we can connect to adb server
        client = AdbClient(host=ADB_HOST, port=ADB_PORT)
        client.version()
    except Exception:
        print("⚠️  ADB Server not reachable. Attempting to start it...")
        try:
            # Try to start adb server using subprocess
            subprocess.run(["adb", "start-server"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(3) # Wait for server startup
        except FileNotFoundError:
            print("❌ 'adb' command not found in PATH. Please install Android Platform Tools.")
            return None
        except Exception as e:
            print(f"❌ Failed to start ADB server: {e}")
            return None

    # 2. Connection Retry Loop
    for attempt in range(1, 4):
        try:
            client = AdbClient(host=ADB_HOST, port=ADB_PORT)
            devices = client.devices()
            
            if not devices:
                print(f"      [Attempt {attempt}/3] ADB Server running but no devices found. Waiting...")
                time.sleep(3)
                continue
                
            device = devices[0]
            print(f"[OK] Connected to device: {device.serial}")
            return device
            
        except Exception as e:
            print(f"      [Attempt {attempt}/3] Connection failed: {e}")
            time.sleep(2)
            
    print("[ERROR] Could not connect to any device after 3 retries.")
    print("       CHECK: Is BlueStacks/Emulator running?")
    return None

def fast_capture(device):
    """Capture screenshot directly (much faster)"""
    try:
        # device.screencap() returns raw PNG bytes in pure-python-adb
        raw_png = device.screencap()
        if not raw_png:
            return None
        return Image.open(io.BytesIO(raw_png))
    except Exception as e:
        print(f"[ERROR] Fast capture failed: {e}")
        return None

def capture_and_pull_screen(device, filename):
    """Legacy wrapper: now uses fast_capture and saves if filename is provided"""
    img = fast_capture(device)
    if img and filename:
        local_path = os.path.join(OUTPUT_DIR, filename)
        img.save(local_path)
        return local_path
    return None

def launch_game(device):
    """Launch the game"""
    print(f"[START] Launching {GAME_PACKAGE}...")
    device.shell(f"am force-stop {GAME_PACKAGE}")
    time.sleep(1)
    device.shell(f"monkey -p {GAME_PACKAGE} -c android.intent.category.LAUNCHER 1")
    print("... Waiting for game to load (15 seconds)...")
    time.sleep(15)
    return True

def navigate_to_leaderboard(device):
    """Navigate through the game to reach leaderboard"""
    if not NAVIGATION_STEPS:
        print("\n[WARN] No navigation steps configured!")
        input("Press Enter when you're on the leaderboard screen...")
        return True
        
    print(f"\n[NAV] Navigating to leaderboard ({len(NAVIGATION_STEPS)} steps)...")
    for i, (x, y, delay) in enumerate(NAVIGATION_STEPS, 1):
        print(f"  Step {i}/{len(NAVIGATION_STEPS)}: Tap ({x}, {y})")
        device.shell(f"input tap {x} {y}")
        time.sleep(delay)
    print("[OK] Navigation complete!")
    return True

def perform_scroll(device):
    """Scroll down the leaderboard"""
    x1, y1 = COORDS['SCROLL_START']
    x2, y2 = COORDS['SCROLL_END']
    # Use 5000ms (5 seconds) for absolute zero inertia and perfect distance
    device.shell(f"input swipe {x1} {y1} {x2} {y2} 5000")
    time.sleep(3.0) # Full settle time

def calculate_scroll_shift(img1_path, img2_path):
    """Calculate vertical shift between two screenshots"""
    try:
        img1 = Image.open(img1_path).convert("L")
        img2 = Image.open(img2_path).convert("L")
        w, h = img1.size
        
        # Analyze central strip (avoid scrollbars/edges)
        # Focus on rank/avatar area (left side) which is reliable
        h_start = 380
        h_end = h - 200
        
        # Crop strips (Rank+Avatar area)
        strip1 = np.array(img1.crop((0, h_start, 350, h_end))).astype(np.float32)
        strip2 = np.array(img2.crop((0, h_start, 350, h_end))).astype(np.float32)
        
        total_len = strip1.shape[0]
        min_diff = float('inf')
        best_offset = 0
        
        # Search range: Constrained to Expected 1207 +/- 25px
        # This prevents locking onto false positive matches (noise/outliers)
        search_range = range(1180, 1235)
        
        for offset in search_range:
            if offset >= total_len: break
            
            # Content moves UP. 
            # Bottom of PREV (strip1) matches Top of CURR (strip2)
            # strip1[offset:] matches strip2[:-offset]
            
            s1 = strip1[offset:]
            s2 = strip2[:total_len-offset]
            
            if s1.size == 0: continue
            
            diff = np.mean(np.abs(s1 - s2))
            
            if diff < min_diff:
                min_diff = diff
                best_offset = offset
                
        return best_offset
    except Exception as e:
        print(f"      ⚠️ Offset calc error: {e}")
        return None

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
    
    img = img.filter(ImageFilter.SHARPEN)
    img = img.filter(ImageFilter.SHARPEN)
    img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))

    if mode == 'numeric':
        # Threshold: text is white (~200+), background is dark (~50)
        img = img.point(lambda x: 0 if x < 140 else 255)
    
    return img

def ocr_region(img, region, allowlist=None, debug_name=None, mode='text'):
    """Extract text from a specific region"""
    try:
        x1, y1, x2, y2 = region
        cropped = img.crop((x1, y1, x2, y2))
        processed = preprocess_image(cropped, mode=mode)
        
        # Save processed crop for debugging if requested
        if debug_name and globals().get('SAVE_DEBUG_CROPS', True):
            os.makedirs('kingshot_data/debug_ocr', exist_ok=True)
            processed.save(f"kingshot_data/debug_ocr/{debug_name}.png")
        
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

def ocr_power_from_row(screenshot_path, row_num, player_idx=None, y_offset=0):
    """Extract power value from a leaderboard row"""
    try:
        img = Image.open(screenshot_path)
        y1 = COORDS['FIRST_ROW_Y'] + (row_num * COORDS['ROW_HEIGHT']) + COORDS['POWER_Y_OFFSET'] + y_offset
        y2 = y1 + COORDS['ROW_HEIGHT']
        x1, x2 = COORDS['POWER_X1'], COORDS['POWER_X2']
        
        cropped = img.crop((x1, y1, x2, y2))
        processed = preprocess_image(cropped, mode='numeric')
        
        # Save debug image
        if SAVE_DEBUG_CROPS and player_idx is not None:
            debug_path = os.path.join(DEBUG_DIR, f"player_{player_idx:03d}_row_{row_num+1}_power.png")
            processed.save(debug_path)
        
        config = r'--psm 7 --oem 1 -c tessedit_char_whitelist=0123456789,'
        if os.path.exists(TESSERACT_PATH):
            pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
        
        text = pytesseract.image_to_string(processed, config=config).strip()
        text = text.replace(' ', '').replace(',', '')
        text = text.replace('O', '0').replace('o', '0')
        
        img.close()
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

def scrape_profile_screen_from_image(img, player_idx=0):
    """Extract UID, Kills, Alliance, Kingdom from profile screen (PIL Image)"""
    try:
        uid = ""
        # Try primary tight crop
        for attempt in range(2):
            uid = ocr_region(img, COORDS['PROFILE_UID_REGION'], allowlist='0123456789', debug_name=f"player_{player_idx:03d}_uid_a{attempt}")
            uid = ''.join(c for c in uid if c.isdigit())
            if len(uid) >= 7:
                break
            
            # If still failing, try a slightly WIDER crop (covers cases where labels bleed in)
            if attempt == 1:
                print("      🔍 Tight crop failed, trying wider crop...")
                wider_region = (COORDS['PROFILE_UID_REGION'][0] - 50, COORDS['PROFILE_UID_REGION'][1], 
                                COORDS['PROFILE_UID_REGION'][2] + 50, COORDS['PROFILE_UID_REGION'][3])
                uid = ocr_region(img, wider_region, debug_name=f"player_{player_idx:03d}_uid_wide")
                uid = ''.join(c for c in uid if c.isdigit())
                if len(uid) >= 7:
                    break
                    
        alliance = ocr_region(img, COORDS['PROFILE_ALLIANCE_REGION'], allowlist='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz[]- ', mode='numeric')
        
        return {
            'uid': uid.strip(),
            'alliance_name': alliance.strip() if alliance else None
        }
    except Exception as e:
        print(f"      ⚠️ Profile image scrape error: {e}")
        return None

def scrape_profile_screen(screenshot_path, player_idx=0):
    """Legacy wrapper for path-based scraping"""
    try:
        img = Image.open(screenshot_path)
        data = scrape_profile_screen_from_image(img, player_idx)
        img.close()
        return data
    except Exception as e:
        print(f"      ⚠️ Profile path scrape error: {e}")
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
            print(f"      ⚠️ API failure code {data.get('code')}: {data.get('msg')}")
            return None
        
        player_data = data.get('data', {})
        return {
            'nickname': player_data.get('nickname', ''),
            'avatar_image': player_data.get('avatar_image', ''),
            'kid': player_data.get('kid'),
            'stove_lv': player_data.get('stove_lv'),
            'stove_lv_content': player_data.get('stove_lv_content', ''),
            'exists': True
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

def check_player_exists_in_db(fid):
    """Check if a player already exists in the database"""
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM players WHERE id = %s", (str(fid),))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return row is not None
    except Exception as e:
        print(f"      ⚠️ Database check error: {e}")
        if conn: conn.close()
        return False

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
        
        uid = str(player_data.get('uid', ''))
        nickname = str(player_data.get('nickname', '') or '')
        power = player_data.get('power')
        alliance = str(player_data.get('alliance_name', '') or '')
        
        # Numeric fields should be int or None
        def to_int(val):
            if val is None or val == '': return None
            try: return int(val)
            except: return None
            
        kingdom = to_int(player_data.get('kingdom'))
        kid = to_int(player_data.get('kid'))
        stove_lv = to_int(player_data.get('stove_lv'))
        
        avatar_image = str(player_data.get('avatar_image', '') or '')
        stove_lv_content = str(player_data.get('stove_lv_content', '') or '')
        
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
                    alliance_name = COALESCE(NULLIF(%s, ''), alliance_name),
                    kingdom = COALESCE(%s, kingdom),
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
            try:
                conn.rollback()
                conn.close()
            except:
                pass
        return False

def post_process_player(profile_data, is_new, use_api):
    """Background worker: API fetch and DB save"""
    fid = profile_data['uid']
    power = profile_data['power']
    
    # Rules:
    # 1. ALWAYS fetch if they are NEW (for verification)
    # 2. Otherwise only fetch if use_api is TRUE
    should_fetch_api = is_new or use_api
    
    api_data = None
    if should_fetch_api:
        api_data = fetch_player_profile(fid)
        
        # Validation: If player is NEW and API says they don't exist, skip!
        if is_new and (not api_data or not api_data.get('exists')):
            print(f"      🚫 Background verification failed for FID {fid} (role not exist). Not saving.")
            return

    if api_data:
        profile_data['nickname'] = api_data.get('nickname', '')
        profile_data['avatar_image'] = api_data.get('avatar_image', '')
        profile_data['kid'] = api_data.get('kid')
        profile_data['stove_lv'] = api_data.get('stove_lv')
        profile_data['stove_lv_content'] = api_data.get('stove_lv_content', '')
    else:
        # Defaults for existing players if no API
        profile_data['nickname'] = profile_data.get('nickname', '')
        profile_data['avatar_image'] = profile_data.get('avatar_image', '')
        profile_data['kid'] = profile_data.get('kid')
        profile_data['stove_lv'] = profile_data.get('stove_lv')
        profile_data['stove_lv_content'] = profile_data.get('stove_lv_content', '')

    # Save to database
    if save_player_to_database(profile_data):
        print(f"      ✨ [BG] Saved FID {fid} ({profile_data.get('nickname', 'N/A')})")
    else:
        print(f"      ⚠️  [BG] Failed to save FID {fid}")

# ============================================================================
# MAIN SCRAPING LOOP
# ============================================================================

def process_single_player(device, screenshot_path, row_num, player_count, max_players, use_api=True, y_offset=0):
    """Process a single player: capture power, tap, get FID, fetch API, save to DB"""
    
    if player_count >= max_players:
        return False
    
    print(f"\n  [{player_count + 1}/{max_players}] Processing Row {row_num + 1}...")
    
    # Step 1: Capture power from leaderboard
    power_str = ocr_power_from_row(screenshot_path, row_num, player_idx=player_count, y_offset=y_offset)
    power = clean_power_value(power_str)
    
    if not power or power < 1000:
        print(f"      ⚠️  Invalid power '{power_str}', skipping")
        return "failed"  
    
    print(f"      Power: {power:,}")
    
    # Step 2: Tap the player row
    row_y = COORDS['FIRST_ROW_Y'] + (row_num * COORDS['ROW_HEIGHT']) + (COORDS['ROW_HEIGHT'] // 2) + y_offset
    device.shell(f"input tap 540 {row_y}")
    time.sleep(1.0)  # Reduced wait (was 1.5)
    
    # Step 3: Fast capture profile screen
    img = fast_capture(device)
    if not img:
        print("      ⚠️  Failed to capture profile screen")
        device.shell(f"input tap {COORDS['BACK_BUTTON'][0]} {COORDS['BACK_BUTTON'][1]}")
        time.sleep(1.0)
        return "failed"
    
    # Step 4: Extract FID and profile data
    profile_data = scrape_profile_screen_from_image(img, player_idx=player_count)
    if not profile_data or not profile_data.get('uid'):
        # Safety check using the image we just took
        lb_keywords = ["leaderboard", "governor", "power", "personal", "ranking"]
        check_text = ocr_region(img, COORDS['LEADERBOARD_CHECK_REGION']).lower()
        if any(k in check_text for k in lb_keywords):
            print(f"      🛡️  Safety: Still on leaderboard, skipping 'Back'")
        else:
            print(f"      🔙  Profile scrape failed, tapping Back")
            device.shell(f"input tap {COORDS['BACK_BUTTON'][0]} {COORDS['BACK_BUTTON'][1]}")
            time.sleep(0.8)
        return "failed"
    
    fid = profile_data['uid']
    print(f"      FID: {fid}")
    profile_data['power'] = power
    
    # Check if NEW (needed for API force-verify)
    is_new = not check_player_exists_in_db(fid)
    
    # BACKGROUND POST-PROCESSING (Non-blocking)
    # This starts the API/DB work in another thread so we can go back immediately
    bg_thread = threading.Thread(target=post_process_player, args=(profile_data, is_new, use_api))
    bg_thread.start()
    
    # DEVICE NAVIGATION (Blocking)
    # We must wait for the physical animation to finish before returning to the main loop
    print(f"      🔙 Tapping Back and returning to leaderboard...")
    device.shell(f"input tap {COORDS['BACK_BUTTON'][0]} {COORDS['BACK_BUTTON'][1]}")
    time.sleep(0.7) # Reduced wait (was 1.2)
    
    # Cleanup profile screenshot
    try:
        os.remove(profile_path)
    except:
        pass
    
    return fid

def scrape_leaderboard_tesseract(device, max_players=1000, max_scrolls=100, use_api=True):
    """Main scraping function - processes players one by one"""
    print(f"\n🚀 Starting Tesseract scraper")
    print(f"   Max players: {max_players}")
    print(f"   Max scrolls: {max_scrolls}\n")
    
    player_count = 0
    seen_fids = set()
    
    current_y_drift = 0.0
    prev_screenshot = None
    
    # Calculate Expected Scroll (Target)
    # We WANT to scroll exactly 6 rows. The physical scroll command might differ to handle inertia, 
    # but the drift calculation must compare against the logical target (6 rows).
    EXPECTED_SCROLL_PX = COORDS['ROW_HEIGHT'] * 6
    

    # Initialize stats
    stats = {
        'start_time': datetime.datetime.now(),
        'players_processed': 0,
        'scrolls_completed': 0,
        'errors': 0,
        'successes': 0
    }
    
    # Ensure reports dir exists
    if not os.path.exists(REPORTS_DIR):
        os.makedirs(REPORTS_DIR)

    try:
        # Initial capture (Scroll 0)
        screenshot_filename = f"leaderboard_scroll_000.png"
        screenshot_path = capture_and_pull_screen(device, screenshot_filename)
        
        if not screenshot_path:
            print("❌ Failed to capture initial screenshot")
            return

        prev_screenshot = screenshot_path # Keep reference for drift calc
        current_y_drift = 0.0

        for scroll_num in range(max_scrolls):
            stats['scrolls_completed'] = scroll_num
            print(f"\n============================================================")
            print(f"SCROLL {scroll_num + 1}/{max_scrolls} (Players: {player_count}/{max_players})")
            print(f"============================================================")
            
            # If not first scroll, perform scroll and capture new screenshot
            if scroll_num > 0:
                print(f"[SCROLL] Scrolling down ({scroll_num + 1}/{max_scrolls})...")
                perform_scroll(device)
                
                screenshot_filename = f"leaderboard_scroll_{scroll_num:03d}.png"
                screenshot_path = capture_and_pull_screen(device, screenshot_filename)
                
                if not screenshot_path:
                    print("⚠️ Failed to capture screenshot, stopping.")
                    break
                    
                # Calculate Drift
                if prev_screenshot and os.path.exists(prev_screenshot):
                    actual_shift = calculate_scroll_shift(prev_screenshot, screenshot_path)
                    drift = actual_shift - EXPECTED_SCROLL_PX
                    current_y_drift += drift
                    print(f"   [DRIFT] Step: {drift:+.1f}px | Cumulative: {current_y_drift:+.1f}px")
                
                prev_screenshot = screenshot_path

            # Process each visible row
            for row in range(COORDS['NUM_VISIBLE_ROWS']):
                # Stop if we reached max players
                if player_count >= max_players:
                    break
                    
                # Process the player
                result = process_single_player(device, screenshot_path, row, player_count, max_players, use_api=use_api, y_offset=current_y_drift)
                
                if result == "failed":
                    stats['errors'] += 1
                    # Don't increment player_count, maybe retry or just skip
                    continue
                elif result == False: # Reached max players
                    break
                else:
                    player_count += 1
                    stats['players_processed'] += 1
                    stats['successes'] += 1

            # Cleanup previous screenshot to save space (keep only current and prev)
            # Actually we already updated prev_screenshot. 
            # Logic: We need prev_screenshot for NEXT loop. 
            # We can delete the one BEFORE prev_screenshot if we want.
            # For now let's just keep them or delete lazily.
            
            if player_count >= max_players:
                print("\n✅ Reached max players limit.")
                break
        # except:
        #     pass
        
        # Scroll (except last iteration)
    except KeyboardInterrupt:
        print("\n🛑 Stopped by user.")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        stats['errors'] += 1
    finally:
        # Generate Report
        end_time = datetime.datetime.now()
        duration = end_time - stats['start_time']
        
        report_content = [
            "========================================",
            "      KINGSHOT SCRAPER REPORT",
            "========================================",
            f"Start Time: {stats['start_time'].strftime('%Y-%m-%d %H:%M:%S')}",
            f"End Time:   {end_time.strftime('%Y-%m-%d %H:%M:%S')}",
            f"Duration:   {duration}",
            "----------------------------------------",
            f"Total Players Processed: {stats['players_processed']}",
            f"Successful Scrapes:      {stats['successes']}",
            f"Failed/Skipped:          {stats['errors']}",
            f"Scrolls Completed:       {stats['scrolls_completed']}",
            "========================================"
        ]
        
        report_filename = f"scrape_report_{stats['start_time'].strftime('%Y%m%d_%H%M%S')}.txt"
        report_path = os.path.join(REPORTS_DIR, report_filename)
        
        try:
            with open(report_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(report_content))
            print(f"\n📄 Report saved to: {report_path}")
        except Exception as e:
            print(f"\n❌ Failed to save report: {e}")

        # Cleanup last screenshot reference
        if prev_screenshot and os.path.exists(prev_screenshot):
            try:
                os.remove(prev_screenshot)
            except: pass
            
    print("Done.")

# ============================================================================
# MAIN
# ============================================================================

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Kingshot Tesseract Scraper')
    parser.add_argument('--fast', '-f', action='store_true', help='Skip game launch and navigation (assumes leaderboard is open)')
    parser.add_argument('--players', '-p', type=int, help='Number of players to scrape (overrides prompt)')
    parser.add_argument('--no-api', action='store_true', help='Skip player profile API fetch for speed')
    parser.add_argument('--yes', '-y', action='store_true', help='Skip the "Press Enter" prompt')
    parser.add_argument('--debug-images', action='store_true', help='Enable saving of debug crop images')
    args = parser.parse_args()
    
    # Set global debug flag
    global SAVE_DEBUG_CROPS
    SAVE_DEBUG_CROPS = args.debug_images
    
    if SAVE_DEBUG_CROPS:
        print("📸 Debug Images: ENABLED (Cleaning old images...)")
        if os.path.exists(DEBUG_DIR):
            try:
                # remove all files in the directory but keep the directory
                for filename in os.listdir(DEBUG_DIR):
                    file_path = os.path.join(DEBUG_DIR, filename)
                    try:
                        if os.path.isfile(file_path) or os.path.islink(file_path):
                            os.unlink(file_path)
                        elif os.path.isdir(file_path):
                            shutil.rmtree(file_path)
                    except Exception as e:
                        print(f'Failed to delete {file_path}. Reason: {e}')
            except Exception as e:
                print(f"⚠️ Failed to clean debug directory: {e}")
        os.makedirs(DEBUG_DIR, exist_ok=True)
    else:
        print("🚫 Debug Images: DISABLED")
    
    print("\n╔" + "═" * 58 + "╗")
    print("║" + " " * 10 + "KINGSHOT TESSERACT SCRAPER" + " " * 23 + "║")
    print("║" + " " * 15 + "One-by-One Processing" + " " * 23 + "║")
    print("╚" + "═" * 58 + "╝\n")
    
    device = setup_adb()
    if not device:
        return
    
    # Get max players
    if args.players:
        max_players = args.players
        print(f"📊 Scrape target: {max_players} players (from argument)")
    else:
        try:
            max_players_input = input("How many players to scrape? (default: 50): ").strip()
            max_players = int(max_players_input) if max_players_input else 50
        except:
            max_players = 50
    
    if not args.fast:
        # Launch game
        if not launch_game(device):
            return
        
        # Navigate to leaderboard
        if not navigate_to_leaderboard(device):
            return
        
        print("\n📋 Navigation complete!")
    else:
        print("\n⏩ Fast mode: Skipping launch and navigation")
    
    if not args.yes:
        print("📋 Make sure the leaderboard is visible!")
        input("Press Enter to start scraping...")
    else:
        print("🚀 Auto mode: Starting scraping immediately...")
    
    # Start scraping
    scrape_leaderboard_tesseract(device, max_players=max_players, use_api=not args.no_api)
    
    print("\n✅ Done!")

if __name__ == "__main__":
    main()


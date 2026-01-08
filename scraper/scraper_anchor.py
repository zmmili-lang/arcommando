"""
Kingshot Anchor-Based Scraper
Uses overlapping screenshots and OpenCV template matching
to handle variable scroll distances reliably.

Features:
- 70% overlap scrolling with template matching to find exact offset
- All player processing features from auto_scraper_tesseract.py
- Session tracking, API validation, database saving
"""

import os
import sys
import time
import json
import hashlib
import io
import subprocess
import threading
import requests
import datetime
import shutil
import uuid
import cv2
import numpy as np
from ppadb.client import Client as AdbClient
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import pytesseract
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# =============================================================================
# CONFIGURATION
# =============================================================================

ADB_HOST = '127.0.0.1'
ADB_PORT = 5037
OUTPUT_DIR = 'kingshot_data'
TESSERACT_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
DATABASE_URL = os.getenv('DATABASE_URL')

# Game Package Name
GAME_PACKAGE = "com.run.tower.defense"

# Debugging
SAVE_DEBUG_CROPS = False
DEBUG_DIR = os.path.join(OUTPUT_DIR, 'debug_ocr')
REPORTS_DIR = os.path.join(OUTPUT_DIR, 'reports')

# Navigation Steps (Tap Coordinates)
NAVIGATION_STEPS = [
    (560, 370, 1.0),  # Empty
    (70, 144, 1.0),   # Avatar
    (674, 2248, 2.0), # Leaderboard
    (305, 1295, 2.0), # Personal Power
]

# Screen dimensions
SCREEN_WIDTH = 1080
SCREEN_HEIGHT = 2400

# Row layout
ROW_HEIGHT = 201  # Approximate height of each player row
FIRST_ROW_Y = 323  # Y position of first row
VISIBLE_ROWS = 8

# Scroll configuration - target 6 rows (approx 1200px) for faster traversal
SCROLL_DISTANCE = 1200  # ~6 rows
VISIBLE_ROWS = 8

# OCR regions relative to row
NAME_X1, NAME_X2 = 360, 770
POWER_X1, POWER_X2 = 777, 997

# Profile screen coordinates
BACK_BUTTON = (72, 137)
PROFILE_UID_REGION = (440, 1825, 740, 1885)
PROFILE_ALLIANCE_REGION = (550, 2010, 653, 2051)

# API Configuration
LOGIN_URL = 'https://kingshot-giftcode.centurygame.com/api/player'
SECRET = 'mN4!pQs6JrYwV9'

# Ensure directories exist
for d in [OUTPUT_DIR, DEBUG_DIR, REPORTS_DIR]:
    os.makedirs(d, exist_ok=True)

def clear_debug_directory():
    """Clear the debug_ocr directory on startup"""
    if os.path.exists(DEBUG_DIR):
        try:
            shutil.rmtree(DEBUG_DIR)
            os.makedirs(DEBUG_DIR)
            print("   🧹 Cleared debug_ocr directory")
        except Exception as e:
            print(f"   ⚠️ Failed to clear debug directory: {e}")

# =============================================================================
# ADB FUNCTIONS
# =============================================================================

def process_player_at_row(device, img, row_y, player_count, seen_fids, use_api=True):
    """
    Process a single player at the given Y position.
    Returns: (success, fid) or (False, None)
    """
    max_retries = 2
    
    for attempt in range(max_retries + 1):
        # 1. Get power from leaderboard
        # Use jitter retry only on first attempt to save time, or if previous attempt failed
        retry_jitter = (attempt > 0)
        power_str = ocr_power_from_row(img, row_y, player_idx=player_count, retry_with_jitter=retry_jitter)
        power = clean_power_value(power_str)
        
        if not power:
            if attempt < max_retries:
                print(f"      ⚠️ Invalid power at Y={row_y}, retrying...")
                continue
            print(f"      ⚠️ Invalid power at Y={row_y}")
            return False, None
        
        if attempt == 0:
            print(f"      Power: {power:,}")
        
        # 2. Tap on player row to open profile
        tap_y = row_y + ROW_HEIGHT // 2
        tap_x = 540
        device.shell(f"input tap {tap_x} {tap_y}")
        time.sleep(1.0)  # Reduced wait
        
        # 3. Capture profile screen
        profile_img = fast_capture(device)
        if not profile_img:
            device.shell(f"input tap {BACK_BUTTON[0]} {BACK_BUTTON[1]}")
            time.sleep(0.5)
            continue
        
        # 4. Extract FID from profile
        profile_data = scrape_profile_screen(profile_img, player_count)
        
        # 5. Go back to leaderboard
        device.shell(f"input tap {BACK_BUTTON[0]} {BACK_BUTTON[1]}")
        time.sleep(0.8) # Reduced wait
        
        if not profile_data or not profile_data.get('uid'):
            if attempt < max_retries:
                print(f"      ⚠️ Failed to get FID, retrying...")
                continue
            print(f"      ⚠️ Failed to get FID")
            return False, None
            
        fid = profile_data['uid']
        
        # 6. Check for duplicate (quick check)
        if fid in seen_fids:
            print(f"      FID: {fid} (Duplicate)")
            return False, fid
        
        print(f"      FID: {fid}")
        seen_fids.add(fid)
        
        # 7. API validation
        name = None
        api_data = None
        if use_api:
            api_data = fetch_player_profile(fid)
            if api_data and api_data.get('exists'):
                name = api_data.get('nickname')
                print(f"      ✅ Verified: {name}")
                # Success! Break retry loop
                break
            else:
                # API failed
                if attempt < max_retries:
                    print(f"      ⚠️ API validation failed for FID {fid}, retrying operation...")
                    # Remove from seen_fids so we can retry
                    seen_fids.remove(fid)
                    continue
                else:
                    print(f"      ⚠️ API validation failed, skipping")
                    return False, fid
        else:
            break

    # 8. Save to database
    player_data = {
        'fid': fid,
        'uid': profile_data.get('uid'),
        'power': power,
        'name': name,
        'avatar': api_data.get('avatar_image') if api_data else None,
        'kid': api_data.get('kid') if api_data else None,
        'stove_lv': api_data.get('stove_lv') if api_data else None,
    }
    
    save_player_to_database(player_data)
    
    return True, fid

def setup_adb():
    """Connect to ADB with auto-start and retry"""
    try:
        client = AdbClient(host=ADB_HOST, port=ADB_PORT)
        client.version()
    except Exception:
        print("⚠️  ADB Server not reachable. Attempting to start it...")
        try:
            subprocess.run(["adb", "start-server"], check=True, 
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(3)
        except FileNotFoundError:
            print("❌ 'adb' command not found in PATH.")
            return None
        except Exception as e:
            print(f"❌ Failed to start ADB server: {e}")
            return None

    for attempt in range(1, 4):
        try:
            client = AdbClient(host=ADB_HOST, port=ADB_PORT)
            devices = client.devices()
            
            if not devices:
                print(f"      [Attempt {attempt}/3] No devices found. Waiting...")
                time.sleep(3)
                continue
                
            device = devices[0]
            print(f"[OK] Connected to device: {device.serial}")
            return device
            
        except Exception as e:
            print(f"      [Attempt {attempt}/3] Connection failed: {e}")
            time.sleep(2)
            
    print("[ERROR] Could not connect to any device after 3 retries.")
    return None

def fast_capture(device):
    """Capture screenshot directly as PIL Image"""
    try:
        raw_png = device.screencap()
        if not raw_png:
            return None
        return Image.open(io.BytesIO(raw_png))
    except Exception as e:
        print(f"[ERROR] Fast capture failed: {e}")
        return None

def capture_and_save(device, filename):
    """Capture screenshot and save to disk"""
    img = fast_capture(device)
    if img and filename:
        local_path = os.path.join(OUTPUT_DIR, filename)
        img.save(local_path)
        return local_path, img
    return None, None

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

def perform_scroll(device, distance=None):
    """
    Scroll down the leaderboard.
    Uses slow 3-second swipe to minimize momentum effects.
    """
    if distance is None:
        distance = SCROLL_DISTANCE
        
    x = SCREEN_WIDTH // 2  # Center of screen
    y_start = 1930
    y_end = y_start - distance
    
    # Slow swipe (3 seconds) to reduce momentum/physics effects
    device.shell(f"input swipe {x} {y_start} {x} {y_end} 3000")
    time.sleep(1.5)  # Wait for scroll to settle

# =============================================================================
# RANK-BASED ANCHOR DETECTION
# =============================================================================

# Rank column coordinates (approximate based on user feedback 86-180)
RANK_X1 = 70   # Padding left
RANK_X2 = 200  # Padding right
RANK_Y_OFFSET = 35 # Offset from top of row
RANK_HEIGHT_CROP = 70 # Height of rank number

def ocr_rank_at_row(img, row_y, debug=False):
    """
    OCR the rank number at a given row Y position.
    Returns: int (rank number) or None if failed
    """
    try:
        y1 = row_y + RANK_Y_OFFSET
        y2 = y1 + RANK_HEIGHT_CROP
        
        # Crop the rank area
        cropped = img.crop((RANK_X1, y1, RANK_X2, y2))
        
        # Preprocess for OCR
        processed = preprocess_image(cropped, mode='numeric')
        
        if os.path.exists(TESSERACT_PATH):
            pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
        
        config = r'--psm 7 --oem 1 -c tessedit_char_whitelist=0123456789'
        text = pytesseract.image_to_string(processed, config=config).strip()
        
        # Clean and extract digits
        cleaned = ''.join(c for c in text if c.isdigit())
        
        if cleaned and 1 <= int(cleaned) <= 9999:
            rank = int(cleaned)
            if debug:
                print(f"      [DEBUG] OCR rank at Y={y1}: {rank}")
            return rank
        
        return None
        
    except Exception as e:
        if debug:
            print(f"      [DEBUG] Rank OCR error at Y={row_y}: {e}")
        return None

def find_first_visible_rank(img, debug=False):
    """
    Scan the screen to find the rank number of the first visible player.
    Scans rows from top to find a valid rank.
    
    Returns: (rank: int, row_index: int) or (None, None) if failed
    """
    # Try first 3 rows
    for row_idx in range(3):
        row_y = FIRST_ROW_Y + (row_idx * ROW_HEIGHT)
        rank = ocr_rank_at_row(img, row_y, debug=debug)
        
        if rank is not None:
            if debug:
                print(f"   🔍 Found rank {rank} at row {row_idx + 1} (Y={row_y} + off)")
            return rank, row_idx
    
    return None, None

def calculate_scroll_by_rank(prev_first_rank, curr_first_rank, debug=False):
    """
    Calculate how many players we scrolled based on rank difference.
    
    Returns: number of new players visible
    """
    if prev_first_rank is None or curr_first_rank is None:
        return None
    
    # The difference in ranks tells us how many players scrolled
    new_players = curr_first_rank - prev_first_rank
    
    if debug:
        print(f"   📊 Rank change: {prev_first_rank} → {curr_first_rank} = {new_players} new players")
    
    return new_players

# =============================================================================
# TESSERACT OCR FUNCTIONS
# =============================================================================

def preprocess_image(img, mode='text', threshold=None):
    """Apply preprocessing for OCR"""
    width, height = img.size
    img = img.resize((width * 4, height * 4), Image.LANCZOS)
    img = img.convert('L')
    
    img = ImageEnhance.Contrast(img).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)
    img = img.filter(ImageFilter.UnsharpMask(radius=3, percent=200, threshold=3))

    if mode == 'numeric':
        arr = np.array(img)
        mean_val = np.mean(arr)
        if mean_val < 127:
            img = ImageOps.invert(img)
    
    if threshold:
        arr = np.array(img)
        arr = np.where(arr < threshold, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr)
    
    return img

def ocr_region(img, region, allowlist=None, mode='text'):
    """Extract text from a specific region"""
    try:
        x1, y1, x2, y2 = region
        cropped = img.crop((x1, y1, x2, y2))
        processed = preprocess_image(cropped, mode=mode)
        
        config = r'--psm 7 --oem 1'
        if allowlist:
            config += f' -c tessedit_char_whitelist={allowlist}'
        
        if os.path.exists(TESSERACT_PATH):
            pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
        
        text = pytesseract.image_to_string(processed, config=config).strip()
        
        if allowlist and '0123456789' in allowlist:
            text = ''.join(c for c in text if c.isdigit() or c in (',', '.', 'M', 'K', 'B'))
        
        return text
    except Exception as e:
        print(f"      ⚠️ OCR error: {e}")
        return ""

def ocr_power_from_row(img, row_y, player_idx=None, retry_with_jitter=True):
    """
    Extract power value from a row at given Y position.
    Uses multiple thresholds and voting for robustness.
    If retry_with_jitter=True, tries different Y offsets on failure.
    """
    # Y offsets to try (original, then jitter)
    y_offsets = [0] if not retry_with_jitter else [0, -10, 10, -5, 5, -20, 20]
    
    for offset in y_offsets:
        try:
            thresholds = [100, 130, 160, 190]
            config = r'--psm 7 --oem 1 -c tessedit_char_whitelist=0123456789,'
            
            if os.path.exists(TESSERACT_PATH):
                pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

            all_results = []
            
            y1 = row_y + offset
            y2 = y1 + ROW_HEIGHT
            x1, x2 = POWER_X1, POWER_X2
            
            cropped = img.crop((x1, y1, x2, y2))
            
            for t in thresholds:
                processed = preprocess_image(cropped, mode='numeric', threshold=t)
                text = pytesseract.image_to_string(processed, config=config).strip()
                
                # DEBUG: Print what we see
                # print(f"         [DEBUG] Tthresh={t} Raw='{text}'") 
                
                text_clean = text.replace(' ', '').replace(',', '').replace('O', '0').replace('o', '0')
                cleaned = ''.join(c for c in text_clean if c.isdigit())
                
                if cleaned and len(cleaned) >= 6:
                    all_results.append(cleaned)
            
            if all_results:
                # Vote for most common result
                from collections import Counter
                counts = Counter(all_results)
                most_common, count = counts.most_common(1)[0]
                
                if offset != 0:
                    print(f"      (↕ jitter {offset:+d})")
                return most_common
            
            # If completely failed this offset, maybe save debug image
            if offset == 0 and not retry_with_jitter:
                 # Only save on first hard fail
                 pass

        except Exception as e:
            print(f"      [DEBUG] OCR Exception: {e}")
            pass
    
    # If we get here, all retries failed. Save debug image to understand why.
    try:
        debug_filename = f"debug_fail_power_y{row_y}.png"
        debug_path = os.path.join(DEBUG_DIR, debug_filename)
        img.crop((POWER_X1, row_y, POWER_X2, row_y + ROW_HEIGHT)).save(debug_path)
        print(f"      [DEBUG] Saved failed OCR crop to {debug_filename}")
    except:
        pass
        
    return None

def clean_power_value(power_str):
    """Convert power string to integer"""
    try:
        if not power_str:
            return None
        power_str = power_str.replace(',', '')
        if not power_str:
            return None
        return int(power_str)
    except:
        return None

# =============================================================================
# PROFILE SCRAPING  
# =============================================================================

def scrape_profile_screen(img, player_idx=0):
    """Extract UID from profile screen"""
    try:
        uid = ""
        for attempt in range(2):
            uid = ocr_region(img, PROFILE_UID_REGION, allowlist='0123456789')
            uid = ''.join(c for c in uid if c.isdigit())
            if len(uid) >= 7:
                break
                    
        alliance = ocr_region(img, PROFILE_ALLIANCE_REGION, 
                            allowlist='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz[]- ',
                            mode='text')
        
        return {
            'uid': uid.strip(),
            'alliance_name': alliance.strip() if alliance else None
        }
    except Exception as e:
        print(f"      ⚠️ Profile scrape error: {e}")
        return None

# =============================================================================
# API FUNCTIONS
# =============================================================================

def md5(text):
    """Calculate MD5 hash"""
    return hashlib.md5(text.encode()).hexdigest()

API_LOCK = threading.Lock()
LAST_API_CALL_TIME = 0

def fetch_player_profile(fid):
    """Fetch player profile from API with rate limiting"""
    global LAST_API_CALL_TIME
    
    with API_LOCK:
        now = time.time()
        elapsed = now - LAST_API_CALL_TIME
        if elapsed < 2.1:
            time.sleep(2.1 - elapsed)
        LAST_API_CALL_TIME = time.time()
    
    try:
        import time as time_module
        payload = {
            'fid': str(fid).strip(),
            'time': int(time_module.time() * 1000)
        }
        
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

# =============================================================================
# DATABASE FUNCTIONS
# =============================================================================

def get_db_connection():
    """Create a database connection"""
    try:
        conn = psycopg2.connect(DATABASE_URL, sslmode='require')
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
        
        uid = str(player_data.get('uid', '') or player_data.get('fid', ''))
        nickname = str(player_data.get('nickname', '') or player_data.get('name', '') or '')
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
        
        avatar_image = str(player_data.get('avatar_image', '') or player_data.get('avatar', '') or '')
        stove_lv_content = str(player_data.get('stove_lv_content', '') or '')
        
        if not uid:
            print("      ⚠️  No UID, skipping database save")
            conn.close()
            return False
        
        # Check if player exists
        cursor.execute("SELECT id, is_verified FROM players WHERE id = %s", (uid,))
        existing = cursor.fetchone()
        
        if existing:
            # Update existing player
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
            action = "updated"
        else:
            # Insert new player
            cursor.execute("""
                INSERT INTO players (id, nickname, avatar_image, first_seen, last_seen, alliance_name, kingdom, kid, stove_lv, stove_lv_content)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (uid, nickname, avatar_image, scrape_time, scrape_time, alliance, kingdom, kid, stove_lv, stove_lv_content))
            action = "inserted"
        
        # Insert power reading (check if exists first to avoid conflict)
        if power:
            cursor.execute("""
                SELECT id FROM leaderboard_power_history 
                WHERE player_id = %s AND scraped_at = %s
            """, (uid, scrape_time))
            
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO leaderboard_power_history (player_id, power, scraped_at)
                    VALUES (%s, %s, %s)
                """, (uid, power, scrape_time))
        
        conn.commit()
        cursor.close()
        conn.close()
        print(f"      💾 {action.upper()} FID {uid}")
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

# =============================================================================
# MAIN SCRAPING LOGIC - ANCHOR-BASED
# =============================================================================

def process_player_at_row(device, img, row_y, player_count, seen_fids, use_api=True):
    """
    Process a single player at the given Y position.
    Returns: (success, fid) or (False, None)
    """
    max_retries = 2
    
    for attempt in range(max_retries + 1):
        # 1. Get power from leaderboard
        retry_jitter = (attempt > 0)
        power_str = ocr_power_from_row(img, row_y, player_idx=player_count, retry_with_jitter=retry_jitter)
        power = clean_power_value(power_str)
        
        if not power:
            if attempt < max_retries:
                # print(f"      ⚠️ Invalid power at Y={row_y}, retrying ({attempt+1}/{max_retries})...")
                continue
            print(f"      ⚠️ Invalid power at Y={row_y}")
            return False, None
        
        if attempt == 0:
            print(f"      Power: {power:,}")
        elif attempt > 0:
             print(f"      Power: {power:,} (Retry success)")
    
        # 2. Tap on player row to open profile
        tap_y = row_y + ROW_HEIGHT // 2
        tap_x = 540
        device.shell(f"input tap {tap_x} {tap_y}")
        time.sleep(1.5)  # Wait for profile to open
        
        # 3. Capture profile screen
        profile_img = fast_capture(device)
        if not profile_img:
            device.shell(f"input tap {BACK_BUTTON[0]} {BACK_BUTTON[1]}")
            time.sleep(1.0)
            return False, None
        
        # 4. Extract FID from profile
        profile_data = scrape_profile_screen(profile_img, player_count)
        
        # 5. Go back to leaderboard
        device.shell(f"input tap {BACK_BUTTON[0]} {BACK_BUTTON[1]}")
        time.sleep(1.0)
        
        if not profile_data or not profile_data.get('uid'):
            print(f"      ⚠️ Failed to get FID")
            return False, None
            
        fid = profile_data['uid']
        print(f"      FID: {fid}")
        
        # 6. Check for duplicate
        if fid in seen_fids:
            print(f"      ⏭️ Already processed FID {fid}")
            return False, fid
        
        seen_fids.add(fid)
        
        # 7. API validation (optional)
        name = None
        api_data = None
        if use_api:
            api_data = fetch_player_profile(fid)
            if api_data and api_data.get('exists'):
                name = api_data.get('nickname')
                print(f"      ✅ Verified: {name}")
            else:
                print(f"      ⚠️ API validation failed, skipping")
                return False, fid
        
        # 8. Save to database
        player_data = {
            'fid': fid,
            'uid': profile_data.get('uid'),
            'power': power,
            'name': name,
            'avatar': api_data.get('avatar_image') if api_data else None,
            'kid': api_data.get('kid') if api_data else None,
            'stove_lv': api_data.get('stove_lv') if api_data else None,
        }
        
        save_player_to_database(player_data)
        
        return True, fid

def detect_rows_from_ranks(img, debug=False):
    """
    Scan the rank column to find all visible rows and their Y positions.
    Reconstructs the full grid by interpolating/extrapolating from reliable anchors.
    Returns: list of dicts [{'rank': int, 'y': int}, ...] sorted by Y.
    """
    try:
        # Crop rank column (full height)
        width, height = img.size
        crop_img = img.crop((RANK_X1 - 10, 0, RANK_X2 + 10, height))
        
        # Preprocess
        processed = preprocess_image(crop_img, mode='numeric')
        config = r'--psm 6 --oem 1 -c tessedit_char_whitelist=0123456789'
        
        if os.path.exists(TESSERACT_PATH):
            pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
            
        data = pytesseract.image_to_data(processed, config=config, output_type=pytesseract.Output.DICT)
        
        detected_rows = []
        n_boxes = len(data['text'])
        
        for i in range(n_boxes):
            text = data['text'][i].strip()
            conf = int(data['conf'][i])
            
            # Lower confidence threshold slightly, rely on geometry validation 
            if conf > 30 and text.isdigit():
                rank = int(text)
                if 1 <= rank <= 9999:
                    top = data['top'][i]
                    real_y = int(top / 4)
                    
                    # Row top is relative to rank number top
                    row_start_y = real_y - RANK_Y_OFFSET
                    
                    detected_rows.append({
                        'rank': rank,
                        'y': int(row_start_y),
                        'conf': conf
                    })
        
        # Grid Reconstruction
        if not detected_rows:
            return []

        # Sort by Y
        detected_rows.sort(key=lambda x: x['y'])
        
        # 1. Select the "Best" anchor (highest confidence, reasonable rank)
        # Ideally we want an anchor that isn't an OCR error (e.g. 7 vs 27)
        # We can look for a sequence or just take the highest confidence one
        
        best_anchor = max(detected_rows, key=lambda x: x['conf'])
        
        if debug:
            print(f"   ⚓ Anchoring on Rank {best_anchor['rank']} (Y={best_anchor['y']}, Conf={best_anchor['conf']})")
            
        # 2. Reconstruct grid relative to this anchor
        reconstructed_rows = []
        
        # Fill UPWARDS from anchor
        # Calculate how many rows fit above
        # If anchor is at Y=1000, ROW_HEIGHT=200
        # Possible rows at Y=800, 600, 400, 200, 0
        
        curr_y = best_anchor['y']
        curr_rank = best_anchor['rank']
        
        # Add the anchor itself
        reconstructed_rows.append({'rank': curr_rank, 'y': curr_y, 'type': 'anchor'})
        
        # Go UP
        temp_y = curr_y - ROW_HEIGHT
        temp_rank = curr_rank - 1
        while temp_y > -100: # Allow slightly off-screen top
            if temp_rank >= 1:
                reconstructed_rows.append({'rank': temp_rank, 'y': temp_y, 'type': 'inferred'})
            temp_y -= ROW_HEIGHT
            temp_rank -= 1
            
        # Go DOWN
        temp_y = curr_y + ROW_HEIGHT
        temp_rank = curr_rank + 1
        while temp_y < height:
            reconstructed_rows.append({'rank': temp_rank, 'y': temp_y, 'type': 'inferred'})
            temp_y += ROW_HEIGHT
            temp_rank += 1
            
        # Sort final list
        reconstructed_rows.sort(key=lambda x: x['y'])
        
        # Filter rows that are clearly outside valid interactive area
        # e.g. Y < 200 might be covered by header, Y > 2200 by footer
        valid_rows = [r for r in reconstructed_rows if 250 <= r['y'] <= 2100]
                
        if debug:
             print(f"   🔍 Reconstructed {len(valid_rows)} rows (from {len(detected_rows)} raw detections)")
             # for r in valid_rows:
             #    print(f"      Rank {r['rank']} at Y={r['y']} ({r['type']})")
                
        return valid_rows
        
    except Exception as e:
        print(f"   ⚠️ Dynamic detection error: {e}")
        return []

def scrape_leaderboard_anchor(device, max_players=100, max_scrolls=50, use_api=True):
    """
    Main scraping loop using Dynamic Anchor detection (Rows detected on fly).
    """
    print(f"\n🚀 Starting Anchor-Based Scraper")
    print(f"   Max players: {max_players}")
    print(f"   Max scrolls: {max_scrolls}")
    
    stats = {
        'players_saved': 0,
        'players_skipped': 0,
        'errors': 0,
        'scrolls_completed': 0
    }
    
    seen_fids = set()
    player_count = 0
    
    # Capture initial screenshot
    print("\n[CAPTURE] Taking initial screenshot...")
    prev_path, prev_img = capture_and_save(device, "leaderboard_000.png")
    if not prev_img:
        print("❌ Failed to capture initial screenshot")
        return stats
    
    # Detect rows on first screen
    detected_rows = detect_rows_from_ranks(prev_img, debug=True)
    
    if not detected_rows:
        print("⚠️ No rows detected dynamically, falling back to fixed grid")
        # Pseudo-detect for fixed grid
        detected_rows = []
        for i in range(VISIBLE_ROWS):
            detected_rows.append({
                'rank': i + 1,
                'y': FIRST_ROW_Y + (i * ROW_HEIGHT)
            })
    
    prev_start_rank = detected_rows[0]['rank'] if detected_rows else 1
    
    print(f"\n{'='*60}")
    print(f"SCREEN 1 (Initial)")
    print(f"{'='*60}")
    
    # Process visible rows
    for row_data in detected_rows:
        if player_count >= max_players:
            break
            
        rank = row_data['rank']
        row_y = row_data['y']
        
        print(f"\n  [{player_count + 1}/{max_players}] Rank {rank} (Y={row_y})...")
        
        success, fid = process_player_at_row(device, prev_img, row_y, player_count, seen_fids, use_api)
        
        if success:
            player_count += 1
            stats['players_saved'] += 1
        elif fid:
            stats['players_skipped'] += 1
        else:
            stats['errors'] += 1
            
        # Re-capture in memory only (fast)
        prev_img = fast_capture(device)
        if not prev_img:
             print("⚠️ Failed to re-capture screen")
             break
    
    last_processed_rank = detected_rows[-1]['rank'] if detected_rows else 0
    
    # Scroll loop
    for scroll_num in range(1, max_scrolls + 1):
        if player_count >= max_players:
            break
            
        print(f"\n{'='*60}")
        print(f"SCROLL {scroll_num}/{max_scrolls} (Players: {player_count}/{max_players})")
        print(f"{'='*60}")
        
        # Perform scroll
        print(f"[SCROLL] Scrolling ~{SCROLL_DISTANCE}px...")
        perform_scroll(device, SCROLL_DISTANCE)
        stats['scrolls_completed'] = scroll_num
        
        # Capture new screenshot - Save this one for reference/debugging anchor
        curr_path, curr_img = capture_and_save(device, f"leaderboard_{scroll_num:03d}.png")
        if not curr_img:
            print("⚠️ Failed to capture screenshot")
            break
        
        # Detect rows on new screen
        detected_rows = detect_rows_from_ranks(curr_img, debug=True)
        
        if not detected_rows:
            print("   ⚠️ No rows detected, skipping scroll processing")
            continue
            
        curr_start_rank = detected_rows[0]['rank']
        
        # Determine overlap
        # We only want to process rows where rank > last_processed_rank
        
        # If we went backwards or no change, something is wrong
        if curr_start_rank < prev_start_rank:
             print(f"   ⚠️ Rank went backwards ({prev_start_rank} -> {curr_start_rank})?")
             
        new_rows_count = 0
        
        for row_data in detected_rows:
            if player_count >= max_players:
                break
                
            rank = row_data['rank']
            row_y = row_data['y']
            
            # Skip already processed ranks
            if rank <= last_processed_rank:
                continue
            
            new_rows_count += 1
            print(f"\n  [{player_count + 1}/{max_players}] Rank {rank} (Y={row_y})...")
            
            success, fid = process_player_at_row(device, curr_img, row_y, player_count, seen_fids, use_api)
            
            if success:
                player_count += 1
                stats['players_saved'] += 1
                last_processed_rank = rank
            elif fid:
                stats['players_skipped'] += 1
                last_processed_rank = rank
            else:
                stats['errors'] += 1
                
            # Re-capture in memory only
            curr_img = fast_capture(device)
            if not curr_img:
                break
        
        print(f"   📊 Processed {new_rows_count} new rows")
        
        prev_img = curr_img
        prev_start_rank = curr_start_rank
    
    # Print summary
    print(f"\n{'='*60}")
    print("📊 SCRAPE SUMMARY")
    print(f"{'='*60}")
    print(f"   Players saved: {stats['players_saved']}")
    print(f"   Players skipped: {stats['players_skipped']}")
    print(f"   Errors: {stats['errors']}")
    print(f"   Scrolls: {stats['scrolls_completed']}")
    
    return stats

# =============================================================================
# MAIN
# =============================================================================

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Kingshot Anchor-Based Scraper')
    parser.add_argument('--players', type=int, default=100, help='Max players to scrape')
    parser.add_argument('--scrolls', type=int, default=50, help='Max scroll attempts')
    parser.add_argument('--fast', action='store_true', help='Skip launch and navigation')
    parser.add_argument('--no-api', action='store_true', help='Skip API validation')
    parser.add_argument('--debug-images', action='store_true', help='Save debug crops')
    parser.add_argument('--yes', '-y', action='store_true', help='Auto-start without confirmation')
    
    args = parser.parse_args()
    
    global SAVE_DEBUG_CROPS
    SAVE_DEBUG_CROPS = args.debug_images
    
    if SAVE_DEBUG_CROPS:
        clear_debug_directory()
        print("📸 Debug Images: ENABLED")
    
    print("\n" + "╔" + "═"*58 + "╗")
    print("║" + "KINGSHOT ANCHOR-BASED SCRAPER".center(58) + "║")
    print("║" + "Template Matching for Reliable Scrolling".center(58) + "║")
    print("╚" + "═"*58 + "╝")
    
    # Setup ADB
    device = setup_adb()
    if not device:
        print("❌ Failed to connect to device")
        return
    
    print(f"📊 Scrape target: {args.players} players")
    
    # Launch and navigate (unless --fast)
    if not args.fast:
        launch_game(device)
        navigate_to_leaderboard(device)
    else:
        print("\n⏩ Fast mode: Skipping launch and navigation")
    
    # Confirm start
    if not args.yes:
        input("\nPress Enter to start scraping...")
    else:
        print("🚀 Auto mode: Starting scraping immediately...")
    
    # Run scraper
    use_api = not args.no_api
    stats = scrape_leaderboard_anchor(device, args.players, args.scrolls, use_api)
    
    print("\n✅ Done!")

if __name__ == "__main__":
    main()

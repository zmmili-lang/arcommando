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
import io
import subprocess
import threading
import requests
import datetime
import shutil
import uuid
from ppadb.client import Client as AdbClient
from PIL import Image, ImageGrab, ImageEnhance, ImageFilter, ImageOps
import pytesseract
import numpy as np
import psycopg2
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
SAVE_POWER_ATTEMPTS = False # Save all threshold/jitter trials
DEBUG_DIR = os.path.join(OUTPUT_DIR, 'debug_ocr')
REPORTS_DIR = os.path.join(OUTPUT_DIR, 'reports')
REPORTS_DIR = os.path.join(OUTPUT_DIR, 'reports')

def clear_debug_directory():
    """Clear the debug_ocr directory on startup"""
    if os.path.exists(DEBUG_DIR):
        try:
            shutil.rmtree(DEBUG_DIR)
            os.makedirs(DEBUG_DIR)
            print("   🧹 Cleared debug_ocr directory")
        except Exception as e:
            print(f"   ⚠️ Failed to clear debug directory: {e}")

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
    'SCROLL_START': (540, 1930), # Shifted down to accommodate larger 8-row swipe
    'SCROLL_END': (540, 320),    # Target 8-row scroll: 1610px total distance
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
    """
    Scroll down the leaderboard by exactly 1615px (8 rows).
    Uses a 5-second swipe duration for zero inertia and precise distance.
    """
    # Fixed scroll coordinates for 1615px scroll (8 rows)
    # Start Y and End Y are calculated to give exactly 1615px distance
    x = 540  # Center of screen
    y_start = 1930
    y_end = y_start - 1615  # = 315
    
    device.shell(f"input swipe {x} {y_start} {x} {y_end} 5000")
    time.sleep(2.0)  # Wait for scroll to settle

def calculate_scroll_shift(img1_path, img2_path):
    """Calculate vertical shift between two screenshots (for logging only)"""
    try:
        img1 = Image.open(img1_path).convert("L")
        img2 = Image.open(img2_path).convert("L")
        w, h = img1.size
        
        h_start = 380
        h_end = h - 200
        
        strip1 = np.array(img1.crop((0, h_start, 350, h_end))).astype(np.float32)
        strip2 = np.array(img2.crop((0, h_start, 350, h_end))).astype(np.float32)
        
        total_len = strip1.shape[0]
        min_diff = float('inf')
        best_offset = 0
        
        search_range = range(1585, 1645)
        
        for offset in search_range:
            if offset >= total_len: break
            
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

def preprocess_image(img, mode='text', threshold=None):
    """Apply advanced preprocessing to improve OCR accuracy. 4x Resize + Image Normalization."""
    # 1. High-resolution scaling (4x) for sub-pixel digit clarity
    width, height = img.size
    img = img.resize((width * 4, height * 4), Image.LANCZOS)
    img = img.convert('L')
    
    # 2. Base contrast / Sharpness
    img = ImageEnhance.Contrast(img).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)
    img = img.filter(ImageFilter.UnsharpMask(radius=3, percent=200, threshold=3))

    if mode == 'numeric':
        # 3. Adaptive Inversion (Normalization)
        # Tesseract performs best with Black text on White background.
        # Ranks 1-3 often have White text on Dark/Colored backgrounds.
        # Ranks 4+ have Dark text on Light backgrounds.
        # Heuristic: Check median pixel. If it's dark (<128), text is likely light -> Invert.
        import numpy as np
        data = np.array(img)
        median_v = np.median(data)
        
        # If background is dark (med < 128), invert so text is black on white
        if median_v < 120:
            from PIL import ImageOps
            img = ImageOps.invert(img)
            # Re-read median after inversion to settle threshold
            data = np.array(img)
            median_v = np.median(data)
        
        # 4. Final Binarization
        t_val = threshold if threshold is not None else 140
        img = img.point(lambda x: 0 if x < t_val else 255)
    
    return img

def ocr_region(img, region, allowlist=None, debug_name=None, mode='text', extra_config='', preprocess=True):
    """Extract text from a specific region"""
    try:
        x1, y1, x2, y2 = region
        cropped = img.crop((x1, y1, x2, y2))
        
        if preprocess:
             processed = preprocess_image(cropped, mode=mode)
        else:
             processed = cropped
        
        # Save processed crop for debugging if requested
        if debug_name and globals().get('SAVE_DEBUG_CROPS', True):
            os.makedirs('kingshot_data/debug_ocr', exist_ok=True)
            processed.save(f"kingshot_data/debug_ocr/{debug_name}.png")
        
        config = r'--psm 7 --oem 1'
        if allowlist:
            config += f' -c tessedit_char_whitelist={allowlist}'
        
        if extra_config:
            config += f' {extra_config}'
        
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
    """Extract power value using an Advanced Voting system with Jitter Retries and Adaptive Normalization"""
    try:
        img = Image.open(screenshot_path)
        
        # Jitter offsets: 0 (center), then small vertical shifts to combat drift
        jitters = [0, -4, 4, -2, 2]
        
        thresholds = [100, 130, 160, 190]
        config = r'--psm 7 --oem 1 -c tessedit_char_whitelist=0123456789,'
        if os.path.exists(TESSERACT_PATH):
            pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

        all_valid_results = []
        
        for j_idx, jitter in enumerate(jitters):
            base_y1 = COORDS['FIRST_ROW_Y'] + (row_num * COORDS['ROW_HEIGHT']) + COORDS['POWER_Y_OFFSET'] + y_offset
            y1 = base_y1 + jitter
            y2 = y1 + COORDS['ROW_HEIGHT']
            x1, x2 = COORDS['POWER_X1'], COORDS['POWER_X2']
            
            # --- DEBUG: Save Full Row ---
            # Only save once per row (at jitter 0)
            if SAVE_DEBUG_CROPS and jitter == 0 and player_idx is not None:
                 try:
                     row_y1 = base_y1
                     row_y2 = row_y1 + COORDS['ROW_HEIGHT']
                     full_row = img.crop((0, row_y1, 1080, row_y2))
                     debug_path = os.path.join(DEBUG_DIR, f"debug_row_{row_num+1}_player_{player_idx}_full.png")
                     full_row.save(debug_path)
                 except Exception as e:
                     print(f"      ⚠️ Failed to save full row debug: {e}")
            # -----------------------------
            
            cropped = img.crop((x1, y1, x2, y2))
            jitter_results = []
            
            for t_idx, t in enumerate(thresholds):
                processed = preprocess_image(cropped, mode='numeric', threshold=t)
                text = pytesseract.image_to_string(processed, config=config).strip()
                text = text.replace(' ', '').replace(',', '').replace('O', '0').replace('o', '0')
                cleaned = ''.join(c for c in text if c.isdigit())
                
                # Save only center crop (jitter=0, threshold=130)
                if SAVE_DEBUG_CROPS and player_idx is not None and t == 130 and jitter == 0:
                    debug_path = os.path.join(DEBUG_DIR, f"player_{player_idx:03d}_row_{row_num+1}_power_center.png")
                    processed.save(debug_path)
                
                if cleaned and len(cleaned) >= 6:
                    jitter_results.append(cleaned)
                    all_valid_results.append(cleaned)
            
            # If we found high confidence in this jitter (3+ thresholds agree), we can stop early
            if jitter_results:
                from collections import Counter
                counts = Counter(jitter_results)
                most_common_val, count = counts.most_common(1)[0]
                if count >= 3:
                    img.close()
                    return most_common_val

        img.close()
        
        if not all_valid_results:
            return ""
            
        # VOTING: Pick the result that appears most frequently across all jitters/thresholds
        from collections import Counter
        counts = Counter(all_valid_results)
        most_common_val, count = counts.most_common(1)[0]
        
        # QUALITY HIERARCHY:
        # 1. If we have a consensus (2+ trials agree), use it.
        # 2. If all trials differ, pick the LONGEST result (most likely captured all digits).
        if count >= 2:
            return most_common_val
        
        return max(all_valid_results, key=len)

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
        # Try primary tight crop with optimized config for digits
        # -c tessedit_char_whitelist=0123456789: Only digits
        # --psm 7: Treat as single text line
        # -c load_system_dawg=0 -c load_freq_dawg=0: Disable dictionary (prevents merging numbers into words)
        # -c preserve_interword_spaces=1: Helps with tracking
        
        custom_config = r'--psm 7 -c tessedit_char_whitelist=0123456789 -c load_system_dawg=0 -c load_freq_dawg=0'
        
        uid = ocr_region(img, COORDS['PROFILE_UID_REGION'], allowlist='0123456789', debug_name=f"player_{player_idx:03d}_uid")
        uid = ''.join(c for c in uid if c.isdigit())
        
        # FIX: Check for "111" merging/drop issue (e.g. 1629... vs 111629... or 777... vs 111777...)
        # If the ID is shorter than expected (9 digits is standard for this kingdom range), retry with robust method.
        # Dropped '111' prefex can result in 6, 7, or 8 digit strings.
        if len(uid) < 9:
             print(f"      🕵️  Suspicious short FID '{uid}' (<9 digits). Starting Progressive Erosion...")
             
             # Custom Separation Preprocessing
             # Add padding to prevent border issues (Tesseract hates text touching edges)
             x1, y1, x2, y2 = COORDS['PROFILE_UID_REGION']
             # Expand crop by 15px wide, 5px tall
             base_crop = img.crop((x1 - 15, y1 - 5, x2 + 15, y2 + 5))
             
             # 1. Resize Huge (8x)
             w, h = base_crop.size
             base_crop = base_crop.resize((w * 8, h * 8), Image.LANCZOS)
             
             # 2. Convert to Grayscale & Invert (Make Text Black on White)
             base_crop = ImageOps.invert(base_crop.convert('L'))
             
             # PROGRESSIVE EROSION LOOP: Grid search for best separation
             # Combinations of Filter Size (Erosion strength) and Threshold (Thickness)
             configs = [
                 (3, 160), # Baseline
                 (3, 110), # Thinner
                 (3, 50),  # Very Thin (Aggressive)
                 (5, 150), # Stronger Filter
                 (5, 110)  # Stronger Filter + Thin
             ]
             
             original_uid = uid
             best_uid_candidate = uid
             
             for f_size, thresh in configs:
                 # 3. Apply MaxFilter
                 eroded = base_crop.filter(ImageFilter.MaxFilter(f_size))
                 
                 # 4. Threshold
                 fn = lambda x : 255 if x > thresh else 0
                 eroded = eroded.point(fn, mode='1')
                 
                 # Try PSM 13 (Raw Line)
                 # Allow typical "1" lookalikes in whitelist by removing whitelist and doing manual cleanup, 
                 # OR just whitelist digits + lookalikes? Tesseract whitelist is strict. 
                 # Let's stick to digits whitelist BUT if it fails, maybe '1' is being recognized as 'l'?
                 # Actually, with '0-9' whitelist, Tesseract is forced to pick digits.
                 # If it sees a vertical bar it might force it to 1, or drop it.
                 # Let's try WITHOUT force-digit whitelist for the raw read, then clean.
                 
                 # PSM 13 + No Whitelist (Let it see 'l' or 'I')
                 raw_text = ocr_region(eroded, (0, 0, w*8, h*8), allowlist=None, 
                                    mode='numeric', extra_config=r'--psm 13', preprocess=False, debug_name=f"player_{player_idx:03d}_uid_f{f_size}_t{thresh}")
                 
                 # Post-process: Map lookalikes to 1
                 # Common issues: 111 -> lll or III
                 cleaned_text = raw_text.replace('l', '1').replace('I', '1').replace('i', '1').replace('|', '1').replace(']', '1').replace('[', '1')
                 
                 # Now filter digits
                 raw_uid = ''.join(c for c in cleaned_text if c.isdigit())
                 
                 if len(raw_uid) > len(best_uid_candidate):
                     print(f"      🔧 Improved FID (F{f_size}/T{thresh}): {best_uid_candidate} -> {raw_uid} (Raw: {raw_text})")
                     best_uid_candidate = raw_uid
                     
                     if len(best_uid_candidate) >= 9:
                         break # Found it!
                 else:
                     print(f"      [Debug] F{f_size}/T{thresh}: {raw_uid} (Raw: {raw_text})")

             uid = best_uid_candidate
             if uid == original_uid or len(uid) < 9:
                 print(f"      ⚠️ Tesseract Erosion failed to recover full ID (Result: {uid}). Trying EasyOCR...")
                 
                 # EASYOCR FALLBACK
                 # Lazy import and init to avoid startup lag
                 try:
                     import easyocr
                     import numpy as np
                     
                     # Use global reader if available, else init
                     if 'EASYOCR_READER' not in globals():
                         print("      🚀 Initializing EasyOCR (Deep Learning Model)... This runs once.")
                         globals()['EASYOCR_READER'] = easyocr.Reader(['en'], gpu=False, verbose=False)
                     
                     reader = globals()['EASYOCR_READER']
                     
                     # EasyOCR expects numpy array (OpenCV format) or bytes
                     # Convert PIL crop to numpy
                     x1, y1, x2, y2 = COORDS['PROFILE_UID_REGION']
                     # Use padded crop for EasyOCR too
                     easy_crop = img.crop((x1 - 10, y1 - 5, x2 + 10, y2 + 5))
                     # Convert to numpy array (RGB)
                     easy_np = np.array(easy_crop)
                     
                     # Run EasyOCR (allowlist digits)
                     results = reader.readtext(easy_np, allowlist='0123456789')
                     
                     # Parse result: list of (bbox, text, conf)
                     easy_id = ""
                     best_conf = 0.0
                     
                     for _, text, conf in results:
                         clean = ''.join(c for c in text if c.isdigit())
                         # Append found blocks (sometimes it splits 111 777)
                         easy_id += clean
                     
                     if len(easy_id) > len(uid):
                         print(f"      🧠 EasyOCR Success: {uid} -> {easy_id}")
                         uid = easy_id
                     else:
                         print(f"      EasyOCR Result: {easy_id} (No improvement)")
                         
                 except ImportError:
                     print("      ⚠️ EasyOCR not installed. Skipping deep learning retry.")
                 except Exception as e:
                     print(f"      ⚠️ EasyOCR Error: {e}")

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

# Global API lock to stay under 30 req/min (1 call per 2s)
API_LOCK = threading.Lock()
LAST_API_CALL_TIME = 0

def fetch_player_profile(fid):
    """Fetch player profile from API (nickname, avatar) with rate limiting"""
    global LAST_API_CALL_TIME
    
    with API_LOCK:
        # Enforce 2.1s gap between calls
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

def ensure_session_tables():
    """Ensure scrape session tables exist"""
    conn = get_db_connection()
    if not conn: return
    
    try:
        cursor = conn.cursor()
        
        # Table: scrape_sessions
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scrape_sessions (
                session_id TEXT PRIMARY KEY,
                started_at BIGINT NOT NULL,
                finished_at BIGINT,
                status TEXT,
                target_players INTEGER,
                players_attempted INTEGER DEFAULT 0,
                players_succeeded INTEGER DEFAULT 0,
                players_failed INTEGER DEFAULT 0,
                players_skipped INTEGER DEFAULT 0,
                max_scrolls INTEGER,
                use_api BOOLEAN,
                notes TEXT
            );
        """)
        
        # Table: scrape_attempts
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scrape_attempts (
                id BIGSERIAL PRIMARY KEY,
                session_id TEXT REFERENCES scrape_sessions(session_id) ON DELETE CASCADE,
                player_fid TEXT,
                attempt_number INTEGER,
                attempted_at BIGINT NOT NULL,
                status TEXT,
                failure_reason TEXT,
                power BIGINT,
                scroll_number INTEGER,
                row_number INTEGER,
                UNIQUE(session_id, player_fid, attempt_number)
            );
        """)
        
        # Indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_scrape_attempts_session ON scrape_attempts(session_id, status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_scrape_attempts_fid ON scrape_attempts(player_fid, attempted_at DESC);")
        
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"      ⚠️ Database schema init error: {e}")
        if conn: conn.close()

def init_scrape_session(max_players, max_scrolls, use_api, notes=None):
    """Initialize a new scrape session"""
    ensure_session_tables()
    session_id = f"scrape_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO scrape_sessions 
                (session_id, started_at, status, target_players, max_scrolls, use_api, notes)
                VALUES (%s, %s, 'running', %s, %s, %s, %s)
            """, (session_id, int(time.time() * 1000), max_players, max_scrolls, use_api, notes))
            conn.commit()
            cursor.close()
            conn.close()
        except Exception as e:
            print(f"      ⚠️ Session init error: {e}")
            if conn: conn.close()
    
    return session_id

def record_player_attempt(session_id, player_fid, status, failure_reason=None, 
                         power=None, scroll_num=None, row_num=None):
    """Record a player scrape attempt"""
    if not session_id: return

    conn = get_db_connection()
    if not conn: return
    
    try:
        cursor = conn.cursor()
        
        # Get attempt number for this player in this session
        # Use player_fid "unknown" if None to avoid unique constraint if we want, 
        # but realistically player_fid might be None if scraping completely failed before identifying user.
        # In that case, we can't really enforce uniqueness easily or maybe we assume attempt for 'unknown' player?
        # Let's handle null player_fid gracefully
        
        fid_val = player_fid if player_fid else f"unknown_row_{row_num}_scroll_{scroll_num}"

        cursor.execute("""
            SELECT COALESCE(MAX(attempt_number), 0) + 1 
            FROM scrape_attempts 
            WHERE session_id = %s AND player_fid = %s
        """, (session_id, fid_val))
        row = cursor.fetchone()
        attempt_num = row[0] if row else 1
        
        cursor.execute("""
            INSERT INTO scrape_attempts 
            (session_id, player_fid, attempt_number, attempted_at, status, 
             failure_reason, power, scroll_number, row_number)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (session_id, fid_val, attempt_num, int(time.time() * 1000), 
              status, failure_reason, power, scroll_num, row_num))
        
        # Update session stats
        if status == 'success':
            cursor.execute("""
                UPDATE scrape_sessions 
                SET players_succeeded = players_succeeded + 1,
                    players_attempted = players_attempted + 1
                WHERE session_id = %s
            """, (session_id,))
        elif status == 'failed':
            cursor.execute("""
                UPDATE scrape_sessions 
                SET players_failed = players_failed + 1,
                    players_attempted = players_attempted + 1
                WHERE session_id = %s
            """, (session_id,))
        elif status == 'skipped':
            cursor.execute("""
                UPDATE scrape_sessions 
                SET players_skipped = players_skipped + 1
                WHERE session_id = %s
            """, (session_id,))
        
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"      ⚠️ Record attempt error: {e}")
        if conn: conn.close()

def finalize_scrape_session(session_id, status='completed'):
    """Mark session as completed/interrupted/failed"""
    if not session_id: return

    conn = get_db_connection()
    if not conn: return
    
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE scrape_sessions 
            SET finished_at = %s, status = %s
            WHERE session_id = %s
        """, (int(time.time() * 1000), status, session_id))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"      ⚠️ Finalize session error: {e}")
        if conn: conn.close()

def get_failed_players(session_id):
    """Get list of FIDs that failed in a session"""
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor()
        # Fix: DISTINCT with ORDER BY must include the order column
        # Group by player_fid to deduplicate, order by first attempt time
        cursor.execute("""
            SELECT player_fid, MAX(failure_reason)
            FROM scrape_attempts
            WHERE session_id = %s AND status = 'failed' AND player_fid NOT LIKE 'unknown%%'
            GROUP BY player_fid
            ORDER BY MIN(attempted_at)
        """, (session_id,))
        failed = cursor.fetchall()
        conn.close()
        return [(fid, reason) for fid, reason in failed]
    except Exception as e:
        print(f"      ⚠️ Get failed players error: {e}")
        if conn: conn.close()
        return []

def get_last_session_id():
    """Get the most recent session ID"""
    conn = get_db_connection()
    if not conn: return None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT session_id FROM scrape_sessions
            ORDER BY started_at DESC LIMIT 1
        """, ())
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None
    except Exception as e:
        print(f"      ⚠️ Get last session error: {e}")
        if conn: conn.close()
        return None

def get_player_from_db(fid):
    """Check if a player exists and return key metadata (like kid)"""
    conn = get_db_connection()
    if not conn:
        return {'exists': False, 'data': None}
    
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, kid, nickname FROM players WHERE id = %s", (str(fid),))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row:
            return {
                'exists': True, 
                'data': {'id': row[0], 'kid': row[1], 'nickname': row[2]}
            }
        return {'exists': False, 'data': None}
    except Exception as e:
        print(f"      ⚠️ Database check error: {e}")
        if conn: conn.close()
        return {'exists': False, 'data': None}

# Keep legacy alias just in case, though we will update usage
def check_player_exists_in_db(fid):
    return get_player_from_db(fid)['exists']

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

def post_process_player(profile_data, is_new, use_api, db_player_data=None):
    """Background worker: API fetch and DB save"""
    fid = profile_data['uid']
    power = profile_data['power']
    
    # Check if we have missing critical metadata in DB (Healing Logic)
    # If existing player has NULL kid, we should try to fetch it even if use_api=False
    missing_kid = False
    if not is_new and db_player_data and db_player_data.get('kid') is None:
        missing_kid = True

    # Rules:
    # 1. ALWAYS fetch if they are NEW (for verification)
    # 2. Fetch if use_api is TRUE
    # 3. Fetch if we found MISSING DATA (kid) to heal the record
    should_fetch_api = is_new or use_api or missing_kid
    
    if missing_kid and not use_api:
        print(f"      🩹 [BG] Healing missing Kingdom ID for {fid}...")

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
        action = "Created" if is_new else "Updated"
        print(f"      ✨ [BG] {action} FID {fid} ({profile_data.get('nickname', 'N/A')})")
    else:
        print(f"      ⚠️  [BG] Failed to save FID {fid}")

# ============================================================================
# MAIN SCRAPING LOOP
# ============================================================================

def process_single_player(device, screenshot_path, row_num, player_count, max_players, use_api=True, y_offset=0, session_id=None, scroll_num=0):
    """Process a single player: capture power, tap, get FID, fetch API, save to DB"""
    
    if player_count >= max_players:
        return False
    
    print(f"\n  [{player_count + 1}/{max_players}] Processing Row {row_num + 1}...")
    
    # Step 1: Capture power from leaderboard
    power_str = ocr_power_from_row(screenshot_path, row_num, player_idx=player_count, y_offset=y_offset)
    power = clean_power_value(power_str)
    
    if not power or power < 1000:
        print(f"      ⚠️  Invalid power '{power_str}', skipping")
        if session_id:
            record_player_attempt(session_id, None, 'failed', failure_reason='invalid_power', 
                                scroll_num=scroll_num, row_num=row_num)
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
        if session_id:
            record_player_attempt(session_id, None, 'failed', failure_reason='profile_capture_failed', 
                                scroll_num=scroll_num, row_num=row_num)
        device.shell(f"input tap {COORDS['BACK_BUTTON'][0]} {COORDS['BACK_BUTTON'][1]}")
        time.sleep(1.0)
        return "failed"
    
    # Step 4: Extract FID and profile data
    profile_data = scrape_profile_screen_from_image(img, player_idx=player_count)
    
    # Safety Check: Are we still on the leaderboard?
    # Sometimes taps miss or loading fails, and we never left the leaderboard.
    # If we are seemingly on the leaderboard, we must NOT tap back, or we will exit to the main castle.
    lb_keywords = ["leaderboard", "governor", "power", "personal", "ranking"]
    check_text = ocr_region(img, COORDS['LEADERBOARD_CHECK_REGION']).lower()
    is_on_leaderboard = any(k in check_text for k in lb_keywords)

    if not profile_data or not profile_data.get('uid'):
        if is_on_leaderboard:
            print(f"      🛡️  Safety: Profile scrape failed, but we seem to be on Leaderboard. Skipping 'Back'.")
            # We failed to initiate the profile view.
        else:
            print(f"      🔙  Profile scrape failed and we are NOT on leaderboard. Tapping Back.")
            device.shell(f"input tap {COORDS['BACK_BUTTON'][0]} {COORDS['BACK_BUTTON'][1]}")
            time.sleep(0.8)
        
        if session_id:
            record_player_attempt(session_id, None, 'failed', failure_reason='profile_ocr_failed', 
                                scroll_num=scroll_num, row_num=row_num)
        return "failed"
    
    # If we got profile data, we assume we ARE on the profile screen.
    # But double check: if we somehow got profile data but 'is_on_leaderboard' is true, 
    # it implies a false positive on profile scrape OR overlay issue. 
    # Trusted profile data usually implies we are on profile.
    
    fid = profile_data['uid']
    print(f"      FID: {fid}")
    profile_data['power'] = power
    
    # Record successful attempt
    if session_id:
        record_player_attempt(session_id, fid, 'success', power=power, 
                            scroll_num=scroll_num, row_num=row_num)
    
    # Check if NEW or Existing, and get metadata
    db_result = get_player_from_db(fid)
    is_new = not db_result['exists']
    db_player_data = db_result['data']
    
    # BACKGROUND POST-PROCESSING (Non-blocking)
    # This starts the API/DB work in another thread so we can go back immediately
    bg_thread = threading.Thread(target=post_process_player, args=(profile_data, is_new, use_api, db_player_data))
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

def scrape_leaderboard_tesseract(device, max_players=1000, max_scrolls=100, use_api=True, session_id=None):
    """Main scraping function - processes players one by one"""
    print(f"\n🚀 Starting Tesseract scraper")
    print(f"   Max players: {max_players}")
    print(f"   Max scrolls: {max_scrolls}\n")
    
    player_count = 0
    seen_fids = set()
    
    current_y_drift = 0.0
    prev_screenshot = None
    
    # Calculate Expected Scroll (Target)
    # We WANT to scroll exactly 8 rows to eliminate any duplication.
    # NUM_VISIBLE_ROWS=8, so scrolling 8 rows moves us perfectly to the next batch.
    EXPECTED_SCROLL_PX = COORDS['ROW_HEIGHT'] * 8
    
    # If no session passed, create one
    if not session_id:
        session_id = init_scrape_session(max_players, max_scrolls, use_api)
        
    print(f"   Using Session ID: {session_id}")
    

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
            # Record failed session status before returning
            finalize_scrape_session(session_id, status='failed')
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
                
                # Simple fixed scroll - 1615px (8 rows)
                perform_scroll(device)
                
                screenshot_filename = f"leaderboard_scroll_{scroll_num:03d}.png"
                screenshot_path = capture_and_pull_screen(device, screenshot_filename)
                
                if not screenshot_path:
                    print("⚠️ Failed to capture screenshot, stopping.")
                    break
                    
                # Calculate Drift (for logging only)
                if prev_screenshot and os.path.exists(prev_screenshot):
                    actual_shift = calculate_scroll_shift(prev_screenshot, screenshot_path)
                    if actual_shift:
                        drift = actual_shift - EXPECTED_SCROLL_PX
                        current_y_drift += drift
                        print(f"   [DRIFT] Step: {drift:+.1f}px | Cumulative: {current_y_drift:+.1f}px")

                        # 🔧 RESET THE DRIFT FOR THE NEXT SCREEN
                        # The physical screen doesn't have "drift" - it's just our measurement offset
                        current_y_drift = 0.0  # Reset to zero after each scroll
                
                prev_screenshot = screenshot_path

            # Process each visible row
            new_this_screen = 0
            for row in range(COORDS['NUM_VISIBLE_ROWS']):
                # Stop if we reached max players
                if player_count >= max_players:
                    break
                    
                # Process the player
                result = process_single_player(device, screenshot_path, row, player_count, max_players, 
                                            use_api=use_api, y_offset=current_y_drift, 
                                            session_id=session_id, scroll_num=scroll_num)
                
                if result == "failed":
                    stats['errors'] += 1
                    # Don't increment player_count, maybe retry or just skip
                    continue
                elif result == False: # Reached max players
                    break
                else:
                    # 'result' contains the FID
                    if result in seen_fids:
                        print(f"      ⏭️  Skipping seen FID: {result}")
                        if session_id:
                            # We might want to record 'skipped' but maybe unnecessary spam?
                            # Let's record it so we know we saw them again
                            # record_player_attempt(session_id, result, 'skipped', failure_reason='duplicate_in_session')
                            pass
                        continue
                        
                    seen_fids.add(result)
                    new_this_screen += 1
                    player_count += 1
                    stats['players_processed'] += 1
                    stats['successes'] += 1

            # End of Leaderboard Detection
            # If we scrolled but found NO new players on the entire screen, we hit the end
            if scroll_num > 0 and new_this_screen == 0:
                print("\n🏁 End of leaderboard reached (no new players on current screen).")
                break

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
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        stats['errors'] += 1
        finalize_scrape_session(session_id, status='failed')
    finally:
        finalize_scrape_session(session_id, status='completed')
        
        # Generate Report
        end_time = datetime.datetime.now()
        duration = end_time - stats['start_time']
        
        report_content = [
            "========================================",
            "========================================",
            "      KINGSHOT SCRAPER REPORT",
            "========================================",
            f"Session ID: {session_id}",
            f"Start Time: {stats['start_time'].strftime('%Y-%m-%d %H:%M:%S')}",
            f"End Time:   {end_time.strftime('%Y-%m-%d %H:%M:%S')}",
            f"Duration:   {duration}",
            "----------------------------------------",
            f"Total Players Processed: {stats['players_processed']}",
            f"Successful Scrapes:      {stats['successes']}",
            f"Failed/Skipped:          {stats['errors']}",
            f"Scrolls Completed:       {stats['scrolls_completed']}",
            f"Success Rate:            {(stats['successes'] / stats['players_processed'] * 100) if stats['players_processed'] > 0 else 0:.1f}%",
            "========================================",
            "",
            "To retry failed players (API/DB only), run:",
            f"  python scraper/auto_scraper_tesseract.py --retry-session {session_id}",
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
    parser.add_argument('--save-power-attempts', action='store_true', help='Save all threshold/jitter crops for review')
    parser.add_argument('--retry-session', type=str, help='Retry failed players from a specific session ID (API/DB retry)')
    parser.add_argument('--retry-last', action='store_true', help='Retry failed players from the most recent session')
    args = parser.parse_args()
    
    # Set global debug flag
    global SAVE_DEBUG_CROPS, SAVE_POWER_ATTEMPTS
    SAVE_DEBUG_CROPS = args.debug_images
    SAVE_POWER_ATTEMPTS = args.save_power_attempts
    
    # Clear debug directory if debugging is enabled
    if SAVE_DEBUG_CROPS or SAVE_POWER_ATTEMPTS:
        clear_debug_directory()

    if SAVE_DEBUG_CROPS:
        print("📸 Debug Images: ENABLED")
    else:
        print("🚫 Debug Images: DISABLED")
    
    print("\n╔" + "═" * 58 + "╗")
    print("║" + " " * 10 + "KINGSHOT TESSERACT SCRAPER" + " " * 23 + "║")
    print("║" + " " * 15 + "One-by-One Processing" + " " * 23 + "║")
    print("╚" + "═" * 58 + "╝\n")
    
    device = setup_adb()
    if not device:
        return
    
    # Handle Retries First
    if args.retry_session or args.retry_last:
        sid = args.retry_session
        if args.retry_last:
            sid = get_last_session_id()
            if not sid:
                print("❌ No previous session found.")
                return
        
        if not sid:
            print("❌ No session ID provided.")
            return

        print(f"\n🔄 Retrying failed players for session: {sid}")
        failed = get_failed_players(sid)
        if not failed:
            print("✅ No failed players found in this session.")
            return
            
        print(f"Found {len(failed)} failed players. Attempting to recover...")
        
        success_count = 0
        for fid, reason in failed:
            print(f"  Attempting FID {fid} (Reason: {reason})...")
            # We can't easily re-OCR power without the image, but if we have FID 
            # we can try to fetch profile and save to DB
            
            # Since we don't have the power value if it failed, we might only be able to
            # fix 'api_failed' or 'db_failed' type errors if we saved FID.
            # If reason was 'profile_ocr_failed' or 'invalid_power', we can't do much without re-scraping.
            
            if reason in ['invalid_power', 'profile_capture_failed', 'profile_ocr_failed']:
                print(f"    ⚠️ Cannot retry '{reason}' offline. You must run the scraper again.")
                continue
                
            # If we have FID, try to fetch and save
            try:
                # We need a dummy profile data
                # Fetch fresh from API
                api_data = fetch_player_profile(fid)
                if api_data:
                    # Construct profile data
                    p_data = {
                        'uid': fid,
                        'power': 0, # We don't know power, so maybe 0 or lookup?
                        # Actually save_player_to_database will update existing player info
                    }
                    p_data.update(api_data)
                    
                    if save_player_to_database(p_data):
                        print(f"    ✅ Recovered FID {fid}")
                        success_count += 1
                        # Update attempt status?
                        record_player_attempt(sid, fid, 'recovered', failure_reason='retry_success')
                    else:
                        print(f"    ❌ Failed to save DB")
                else:
                    print(f"    ❌ API fetch failed")
            except Exception as e:
                print(f"    ❌ Retry error: {e}")
                
        print(f"\n✅ Retry complete. Recovered {success_count}/{len(failed)} players.")
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


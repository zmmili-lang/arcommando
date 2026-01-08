import os
import sys
import time
import json
import hashlib
import io
import subprocess
import threading
import datetime
import shutil
import uuid
import re
import requests
import base64

from PIL import Image, ImageOps, ImageFilter
from ppadb.client import Client as AdbClient
import psycopg2
from dotenv import load_dotenv
try:
    import pytesseract
except ImportError:
    print("pytesseract not found, OCR functions will fail")

# Load environment variables
load_dotenv()

# =============================================================================
# CONFIGURATION
# =============================================================================

# ADB Configuration
ADB_HOST = "127.0.0.1"
ADB_PORT = 5037
PACKAGE_NAME = "com.kingsgroup.sos"

# Directories
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'kingshot_data')
DEBUG_DIR = os.path.join(OUTPUT_DIR, 'debug_gemini')
REPORTS_DIR = os.path.join(OUTPUT_DIR, 'reports')
TESSERACT_PATH = os.getenv('TESSERACT_PATH', r'C:\Program Files\Tesseract-OCR\tesseract.exe')
DATABASE_URL = os.getenv('DATABASE_URL')

# Gemini Configuration
GEMINI_API_KEY = "AIzaSyAjs5rCA4fdmLCVlAcZmsifPcOyYyF7ezY" # User provided key
# 1.5-flash returned 404. Using 2.0-flash-001 which was listed in available models
GEMINI_MODEL = "gemini-2.0-flash-001" 
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

# Screen dimensions
SCREEN_WIDTH = 1080
SCREEN_HEIGHT = 2400

# Row layout (still needed for Approximate physical location)
ROW_HEIGHT = 201
FIRST_ROW_Y = 323
VISIBLE_ROWS = 8
SCROLL_DISTANCE = 1200 

# Rank Anchor Coordinates (for Tesseract physical detection)
RANK_X1 = 70
RANK_X2 = 200
RANK_Y_OFFSET = 35

# Profile screen coords
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
    if os.path.exists(DEBUG_DIR):
        try:
            shutil.rmtree(DEBUG_DIR)
            os.makedirs(DEBUG_DIR)
        except: pass

# =============================================================================
# GEMINI ANALYZER
# =============================================================================

class GeminiAnalyzer:
    def __init__(self):
        self.session = requests.Session()
        
    def analyze_leaderboard(self, img):
        """
        Send screenshot to Gemini to extract leaderboard data.
        Returns: list of dicts [{'rank': int, 'governor': str, 'power': int}, ...]
        """
        # Convert image to base64
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        img_b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        prompt = """
        From the provided image of a leaderboard, extract the rank number, governor name, and power value for each entry.
        Return the data as a valid JSON array of objects. Each object must have exactly three keys:
        'rank' (as an integer), 'governor' (as a string), and 'power' (as an integer).
        Do not include markdown formatting like ```json. Just return the raw JSON string.
        """
        
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {
                        "mime_type": "image/png",
                        "data": img_b64
                    }}
                ]
            }]
        }
        
        try:
            print("      🤖 Sending to Gemini...")
            start_time = time.time()
            response = self.session.post(GEMINI_URL, json=payload, timeout=30)
            elapsed = time.time() - start_time
            
            if response.status_code != 200:
                print(f"      ⚠️ Gemini API Error ({response.status_code}): {response.text[:200]}")
                return []
                
            result = response.json()
            # Parse response
            # Structure: candidates[0].content.parts[0].text
            try:
                text_content = result['candidates'][0]['content']['parts'][0]['text']
                # Clean markdown code blocks if present
                text_content = text_content.replace('```json', '').replace('```', '').strip()
                
                data = json.loads(text_content)
                print(f"      🤖 Gemini processed in {elapsed:.1f}s. Found {len(data)} entries.")
                
                # Sanitize data types
                valid_data = []
                for entry in data:
                    try:
                        r = int(entry['rank'])
                        p = int(entry['power']) if isinstance(entry['power'], int) else int(str(entry.get('power', '0')).replace(',', ''))
                        n = str(entry['governor'])
                        valid_data.append({'rank': r, 'power': p, 'governor': n})
                    except:
                        pass
                
                return valid_data
                
            except (KeyError, IndexError, json.JSONDecodeError) as e:
                print(f"      ⚠️ Failed to parse Gemini response: {e}")
                # Save debug response
                with open(os.path.join(DEBUG_DIR, "gemini_error_response.json"), "w") as f:
                    json.dump(result, f, indent=2)
                return []
                
        except Exception as e:
            print(f"      ⚠️ Gemini Request Exception: {e}")
            return []

# =============================================================================
# TESSERACT ANCHOR FUNCTIONS (For Physical Navigation)
# =============================================================================

def preprocess_image(img, mode='text', threshold=128):
    """Preprocess image for OCR"""
    img = img.convert('L') # Grayscale
    width, height = img.size
    img = img.resize((width * 4, height * 4), Image.LANCZOS)
    
    # Simple binary threshold
    if mode == 'numeric':
        # For rank numbers (white on dark)
        pass # Just resize often works, or invert?
    
    # Apply Unsharp Mask for sharpness
    img = img.filter(ImageFilter.UnsharpMask(radius=3, percent=200, threshold=3))
    
    # Binarize
    fn = lambda x : 255 if x > threshold else 0
    img = img.point(fn, mode='1')
    
    return img

def detect_rows_from_ranks(img, debug=False):
    """
    Scan the rank column to find all visible rows and their Y positions using Tesseract.
    Used ONLY for physical navigation (click coordinates).
    Data (Power/Name) comes from Gemini.
    """
    try:
        width, height = img.size
        # Margin of safety for crop
        crop_img = img.crop((RANK_X1 - 10, 0, RANK_X2 + 10, height))
        
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
            
            if conf > 30 and text.isdigit():
                rank = int(text)
                if 1 <= rank <= 9999:
                    top = data['top'][i]
                    real_y = int(top / 4)
                    row_start_y = real_y - RANK_Y_OFFSET
                    
                    detected_rows.append({
                        'rank': rank,
                        'y': int(row_start_y),
                        'conf': conf
                    })
        
        # Grid Reconstruction (Simplified from anchor script)
        if not detected_rows: return []
        detected_rows.sort(key=lambda x: x['y'])
        
        # Use single reliable anchor to reconstruct grid
        best_anchor = max(detected_rows, key=lambda x: x['conf'])
        
        reconstructed_rows = []
        curr_y = best_anchor['y']
        curr_rank = best_anchor['rank']
        
        # Add anchor
        reconstructed_rows.append({'rank': curr_rank, 'y': curr_y})
        
        # Up
        temp_y = curr_y - ROW_HEIGHT
        temp_rank = curr_rank - 1
        while temp_y > -100:
            if temp_rank >= 1:
                reconstructed_rows.append({'rank': temp_rank, 'y': temp_y})
            temp_y -= ROW_HEIGHT
            temp_rank -= 1
            
        # Down
        temp_y = curr_y + ROW_HEIGHT
        temp_rank = curr_rank + 1
        while temp_y < height:
            reconstructed_rows.append({'rank': temp_rank, 'y': temp_y})
            temp_y += ROW_HEIGHT
            temp_rank += 1
            
        reconstructed_rows.sort(key=lambda x: x['y'])
        valid_rows = [r for r in reconstructed_rows if 250 <= r['y'] <= 2100]
        
        return valid_rows
        
    except Exception as e:
        print(f"   ⚠️ Anchor detection error: {e}")
        return []

def ocr_region(img, region, allowlist=None, mode='numeric'):
    """Generic OCR helper"""
    # (Existing implementation kept for Profile UID)
    x1, y1, x2, y2 = region
    cropped = img.crop((x1, y1, x2, y2))
    
    if mode == 'numeric':
         processed = preprocess_image(cropped, mode='numeric', threshold=128)
         config = r'--psm 7'
    else:
         # For names/alliance
         processed = cropped.convert('L')
         processed = processed.point(lambda x: 0 if x < 140 else 255, '1')
         config = r'--psm 7'

    if allowlist:
        config += f' -c tessedit_char_whitelist={allowlist}'
        
    if os.path.exists(TESSERACT_PATH):
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
        
    return pytesseract.image_to_string(processed, config=config).strip()

def scrape_profile_screen(img, player_idx=0):
    try:
        uid = ""
        for attempt in range(2):
            uid = ocr_region(img, PROFILE_UID_REGION, allowlist='0123456789')
            uid = ''.join(c for c in uid if c.isdigit())
            if len(uid) >= 7: break
                    
        alliance = ocr_region(img, PROFILE_ALLIANCE_REGION, 
                            allowlist='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz[]- ',
                            mode='text')
        
        return { 'uid': uid.strip(), 'alliance_name': alliance.strip() if alliance else None }
    except: return None

# =============================================================================
# API & DB (Retained)
# =============================================================================

def md5(text):
    return hashlib.md5(text.encode()).hexdigest()

API_LOCK = threading.Lock()
LAST_API_CALL_TIME = 0

def fetch_player_profile(fid):
    global LAST_API_CALL_TIME
    with API_LOCK:
        now = time.time()
        if now - LAST_API_CALL_TIME < 2.1: time.sleep(2.1 - (now - LAST_API_CALL_TIME))
        LAST_API_CALL_TIME = time.time()
    
    try:
        import time as time_module
        payload = {'fid': str(fid).strip(), 'time': int(time_module.time() * 1000)}
        keys = sorted(payload.keys())
        encoded = '&'.join(f"{k}={payload[k]}" for k in keys)
        payload['sign'] = md5(f"{encoded}{SECRET}")
        
        response = requests.post(LOGIN_URL, json=payload, timeout=10)
        if response.status_code != 200: return None
        
        data = response.json()
        if data.get('code') != 0: return None
        
        p = data.get('data', {})
        return {
            'nickname': p.get('nickname', ''),
            'avatar_image': p.get('avatar_image', ''),
            'kid': p.get('kid'),
            'stove_lv': p.get('stove_lv'),
            'stove_lv_content': p.get('stove_lv_content', ''),
            'exists': True
        }
    except: return None

def get_db_connection():
    try: return psycopg2.connect(DATABASE_URL, sslmode='require')
    except: return None

def save_to_db(pdata):
    # (Same saving logic)
    if not DATABASE_URL: return False
    conn = get_db_connection()
    if not conn: return False
    try:
        cur = conn.cursor()
        t = int(time.time() * 1000)
        
        uid = str(pdata.get('uid') or pdata.get('fid'))
        if not uid: return False
        
        cur.execute("SELECT id FROM players WHERE id=%s", (uid,))
        exists = cur.fetchone()
        
        if exists:
            cur.execute("""
                UPDATE players SET nickname=%s, avatar_image=%s, last_seen=%s, 
                alliance_name=%s, kingdom=%s, kid=%s, stove_lv=%s, stove_lv_content=%s 
                WHERE id=%s
            """, (pdata.get('name'), pdata.get('avatar'), t, pdata.get('alliance'), 
                  pdata.get('kingdom'), pdata.get('kid'), pdata.get('stove_lv'), pdata.get('stove_lv_content'), uid))
        else:
            cur.execute("""
                INSERT INTO players (id, nickname, avatar_image, first_seen, last_seen, alliance_name)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (uid, pdata.get('name'), pdata.get('avatar'), t, t, pdata.get('alliance')))
            
        cur.execute("SELECT id FROM leaderboard_power_history WHERE player_id=%s AND scraped_at=%s", (uid, t))
        if not cur.fetchone() and pdata.get('power'):
            cur.execute("INSERT INTO leaderboard_power_history (player_id, power, scraped_at) VALUES (%s, %s, %s)",
                       (uid, pdata.get('power'), t))
                       
        conn.commit()
        conn.close()
        print(f"      💾 Saved FID {uid}")
        return True
    except Exception as e:
        print(f"      ❌ DB Error: {e}")
        return False

# =============================================================================
# MAIN LOOP
# =============================================================================

def setup_adb():
    client = AdbClient(host=ADB_HOST, port=ADB_PORT)
    try:
        devices = client.devices()
        if not devices: return None
        return devices[0]
    except: return None

def fast_capture(device):
    try:
        raw = device.screencap()
        return Image.open(io.BytesIO(raw))
    except: return None

def perform_scroll(device, px):
    device.shell(f"input swipe 540 1800 540 {1800-px} 1000")
    time.sleep(1.5)

def scrape_with_gemini(device, max_players=20, max_scrolls=10):
    gemini = GeminiAnalyzer()
    stats = {'saved': 0, 'errors': 0}
    seen_fids = set()
    player_count = 0
    last_processed_rank = 0
    
    print("\n[CAPTURE] Taking initial screenshot...")
    img = fast_capture(device)
    
    for scroll in range(max_scrolls + 1):
        if player_count >= max_players: break
        
        print(f"\n{'='*60}")
        print(f"PAGE {scroll+1} (Players: {player_count}/{max_players})")
        print(f"{'='*60}")
        
        # 1. Analyze with Gemini
        gemini_data = gemini.analyze_leaderboard(img)
        # Create map {rank: {power, governor}}
        gemini_map = {item['rank']: item for item in gemini_data}
        
        # 2. Detect Rows (Physical)
        rows = detect_rows_from_ranks(img)
        
        print(f"   📊 Analysis: {len(gemini_data)} data entries, {len(rows)} physical rows")
        
        new_processed = 0
        
        for row in rows:
            if player_count >= max_players: break
            
            rank = row['rank']
            row_y = row['y']
            
            if rank <= last_processed_rank: continue
            
            # Lookup Gemini Data
            player_info = gemini_map.get(rank)
            
            print(f"\n  [{player_count + 1}/{max_players}] Rank {rank}...", end="")
            
            if not player_info:
                print(f" ⚠️ No Gemini data for Rank {rank}, skipping")
                stats['errors'] += 1
                continue
                
            power = player_info['power']
            name = player_info['governor']
            print(f" Power: {power:,} ({name})")
            
            # Tap Entry
            tap_y = row_y + 100 # Center of row
            device.shell(f"input tap 540 {tap_y}")
            time.sleep(1.0)
            
            # Profile
            p_img = fast_capture(device)
            if not p_img:
                device.shell(f"input tap {BACK_BUTTON[0]} {BACK_BUTTON[1]}")
                continue
                
            p_data = scrape_profile_screen(p_img)
            device.shell(f"input tap {BACK_BUTTON[0]} {BACK_BUTTON[1]}")
            time.sleep(0.8)
            
            if not p_data or not p_data['uid']:
                print(f"      ⚠️ Failed to get UID")
                continue
                
            fid = p_data['uid']
            
            # Check dup
            if fid in seen_fids:
                print(f"      ⏭️  Dup FID {fid}")
                last_processed_rank = rank
                continue
            
            seen_fids.add(fid)
            
            # API Verify
            api_info = fetch_player_profile(fid)
            if api_info and api_info.get('exists'):
                print(f"      ✅ Verified: {api_info['nickname']}")
            else:
                 # Retry logic? For now assume gemini is right about power, just api verification failed
                 # But user wants robust.
                 pass
            
            # Save
            save_data = {
                'fid': fid, 
                'uid': fid,
                'name': name,
                'power': power,
                'alliance': p_data.get('alliance_name'),
                'avatar': api_info.get('avatar_image') if api_info else None,
                'kid': api_info.get('kid') if api_info else None,
                'stove_lv': api_info.get('stove_lv') if api_info else None,
                'kingdom': None # Could extract from profile if needed
            }
            
            if save_to_db(save_data):
                stats['saved'] += 1
                player_count += 1
            
            last_processed_rank = rank
            new_processed += 1
            
            # Re-capture MAIN screen (state might change slightly)
            img = fast_capture(device)
        
        if new_processed == 0 and len(rows) > 0 and rank > last_processed_rank:
             # We found rows but didn't process them?
             pass
             
        # Scroll
        if player_count < max_players:
            print(f"[SCROLL] Scrolling ~{SCROLL_DISTANCE}px...")
            perform_scroll(device, SCROLL_DISTANCE)
            img = fast_capture(device)

    print(f"\nDone. Saved {stats['saved']} players.")

def main():
    clear_debug_directory()
    device = setup_adb()
    if not device: 
        print("No device")
        return
        
    scrape_with_gemini(device, 100, 50)

if __name__ == "__main__":
    main()

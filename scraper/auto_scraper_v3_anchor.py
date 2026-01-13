"""
Kingshot Auto Scraper V3 - Visual Anchor System
-----------------------------------------------
Solves scroll drift by using Computer Vision (Template Matching) to lock onto 
the last processed player row after scrolling.

Mechanic:
1. Process Visible Rows
2. Crop "Anchor" (Last Row Image)
3. Scroll (partial page)
4. Find "Anchor" in New Page
5. Resume processing strictly below the found Anchor

No more pixel math guessing!
"""

import os
import sys
import time
import datetime
import uuid
import io
import shutil
import hashlib
import threading
import subprocess
import requests
import json

try:
    import cv2
    import numpy as np
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
    import pytesseract
    import psycopg2
    from ppadb.client import Client as AdbClient
except ImportError as e:
    print(f"❌ Missing dependency: {e}")
    print("Please run: pip install opencv-python numpy pillow pytesseract psycopg2-binary pure-python-adb")
    sys.exit(1)

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ============================================================================
# CONFIGURATION
# ============================================================================

ADB_HOST = '127.0.0.1'
ADB_PORT = 5037
OUTPUT_DIR = 'kingshot_data'
DEBUG_DIR = os.path.join(OUTPUT_DIR, 'debug_v3')
REPORTS_DIR = os.path.join(OUTPUT_DIR, 'reports')
TESSERACT_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
DATABASE_URL = os.getenv('DATABASE_URL')
GAME_PACKAGE = "com.run.tower.defense"

# API Config
LOGIN_URL = 'https://kingshot-giftcode.centurygame.com/api/player'
SECRET = 'mN4!pQs6JrYwV9'

# Coordinates
FIRST_ROW_Y = 323
ROW_HEIGHT = 201
NAME_X1, NAME_X2 = 360, 770
POWER_X1, POWER_X2 = 777, 997

# Anchor Settings
# Region to use as visual template (Name + Power area of a row)
ANCHOR_X1 = 300
ANCHOR_X2 = 1000
ANCHOR_TEMPLATE_HEIGHT = 160 

# Scroll
SCROLL_DURATION = 3500
SCROLL_SWIPE_DIST = 1000 # ~60% screen to ensure overlap

# Profile Screen
BACK_BUTTON = (72, 137)
PROFILE_UID_REGION = (440, 1825, 740, 1885)
PROFILE_ALLIANCE_REGION = (550, 2010, 653, 2051)

# ============================================================================
# UTILS & ADB
# ============================================================================

def setup_dirs():
    for d in [OUTPUT_DIR, DEBUG_DIR, REPORTS_DIR]:
        os.makedirs(d, exist_ok=True)

def connect_adb():
    try:
        client = AdbClient(host=ADB_HOST, port=ADB_PORT)
        devices = client.devices()
        if not devices:
            print("❌ No devices found")
            return None
        print(f"✅ Connected to {devices[0].serial}")
        return devices[0]
    except Exception as e:
        print(f"❌ ADB Error: {e}")
        return None

def fast_capture(device):
    try:
        raw = device.screencap()
        return Image.open(io.BytesIO(raw)) if raw else None
    except: return None

# ============================================================================
# COMPUTER VISION (ANCHORING)
# ============================================================================

def extract_anchor_template(img, row_y):
    """Crop a strip from the image at row_y to use as next anchor"""
    # Crop [y:y+h, x1:x2]
    # We use a slightly smaller height than full row to avoid border noise
    y1 = int(row_y) + 20 
    y2 = y1 + ANCHOR_TEMPLATE_HEIGHT - 40
    return img.crop((ANCHOR_X1, y1, ANCHOR_X2, y2))

def find_anchor_in_image(img, template, debug=False):
    """
    Find the template in the image.
    Returns: (row_top_y, confidence)
    """
    try:
        # Convert to OpenCV BGR
        main_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        templ_cv = cv2.cvtColor(np.array(template), cv2.COLOR_RGB2BGR)
        
        # Match
        res = cv2.matchTemplate(main_cv, templ_cv, cv2.TM_CCOEFF_NORMED)
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
        
        if max_val < 0.7: # Confidence threshold
            if debug:
                 print(f"      ⚠️ Anchor match failed (low confidence: {max_val:.2f})")
            return None, max_val
            
        new_y_top_left = max_loc[1] 
        # Row Top is (match_y - 20) because we cropped at y+20
        row_top_y = new_y_top_left - 20
        
        return row_top_y, max_val
    except Exception as e:
        print(f"      ⚠️ CV Match Error: {e}")
        return None, 0

# ============================================================================
# OCR & DATA EXTRACTION
# ============================================================================

def preprocess_image(img, mode='text', threshold=None):
    width, height = img.size
    img = img.resize((width * 4, height * 4), Image.LANCZOS)
    img = img.convert('L')
    img = ImageEnhance.Contrast(img).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)
    
    if mode == 'numeric':
        # Auto-invert if dark background
        arr = np.array(img)
        if np.median(arr) < 120:
             img = ImageOps.invert(img)
    
    if threshold:
         img = img.point(lambda x: 0 if x < threshold else 255)
         
    return img

def ocr_power(img, row_y):
    """Extract power from row Y"""
    y1 = int(row_y)
    y2 = y1 + ROW_HEIGHT
    crop = img.crop((POWER_X1, y1, POWER_X2, y2))
    
    config = r'--psm 7 --oem 1 -c tessedit_char_whitelist=0123456789,'
    if os.path.exists(TESSERACT_PATH):
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
        
    # Multi-threshold voting
    thresholds = [100, 130, 160]
    results = []
    
    for t in thresholds:
        proc = preprocess_image(crop, mode='numeric', threshold=t)
        txt = pytesseract.image_to_string(proc, config=config).strip()
        clean = ''.join(c for c in txt if c.isdigit())
        if len(clean) >= 6:
            results.append(clean)
            
    if not results: return None
    
    from collections import Counter
    return Counter(results).most_common(1)[0][0]

def scrape_profile(img):
    """Extract UID from profile"""
    try:
        # UID
        uid_crop = img.crop(PROFILE_UID_REGION)
        proc = preprocess_image(uid_crop, mode='numeric')
        config = r'--psm 7 -c tessedit_char_whitelist=0123456789'
        uid = pytesseract.image_to_string(proc, config=config).strip()
        uid = ''.join(c for c in uid if c.isdigit())
        
        # Alliance
        all_crop = img.crop(PROFILE_ALLIANCE_REGION)
        proc_all = preprocess_image(all_crop, mode='text')
        alliance = pytesseract.image_to_string(proc_all, config=r'--psm 7').strip()
        
        return {'uid': uid, 'alliance': alliance}
    except:
        return None

# ============================================================================
# API & DB
# ============================================================================

def save_to_db(data):
    if not DATABASE_URL: return
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        now = int(time.time() * 1000)
        uid = data.get('uid')
        if not uid: return
        
        # Upsert Player
        cur.execute("""
            INSERT INTO players (id, nickname, first_seen, last_seen, alliance_name, 
                               kingdom, kid, stove_lv, stove_lv_content, avatar_image)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
            last_seen = EXCLUDED.last_seen,
            nickname = COALESCE(NULLIF(EXCLUDED.nickname, ''), players.nickname),
            alliance_name = COALESCE(NULLIF(EXCLUDED.alliance_name, ''), players.alliance_name),
            kingdom = COALESCE(EXCLUDED.kingdom, players.kingdom),
            kid = COALESCE(EXCLUDED.kid, players.kid),
            stove_lv = COALESCE(EXCLUDED.stove_lv, players.stove_lv),
            avatar_image = COALESCE(NULLIF(EXCLUDED.avatar_image, ''), players.avatar_image)
        """, (uid, data.get('nickname', ''), now, now, data.get('alliance', ''), 
              data.get('kingdom'), data.get('kid'), data.get('stove_lv'), 
              data.get('stove_lv_content'), data.get('avatar_image')))
        
        # Insert Power History
        if data.get('power'):
             cur.execute("""
                INSERT INTO leaderboard_power_history (player_id, power, scraped_at)
                VALUES (%s, %s, %s)
                ON CONFLICT DO NOTHING
             """, (uid, data['power'], now))
             
        conn.commit()
        conn.close()
        print(f"      💾 Saved FID {uid}")
    except Exception as e:
        print(f"      ❌ DB Error: {e}")

# API Fetcher (Simplified)
def fetch_api(fid):
    try: # Basic rate limit
        time.sleep(2.1) 
        ts = int(time.time() * 1000)
        payload = {'fid': str(fid), 'time': ts}
        sorted_keys = sorted(payload.keys())
        enc = '&'.join(f"{k}={payload[k]}" for k in sorted_keys)
        sign = hashlib.md5(f"{enc}{SECRET}".encode()).hexdigest()
        payload['sign'] = sign
        
        r = requests.post(LOGIN_URL, json=payload, timeout=10)
        if r.status_code == 200 and r.json().get('code') == 0:
            return r.json().get('data', {})
    except: pass
    return None

# ============================================================================
# MAIN LOOP
# ============================================================================

def main():
    setup_dirs()
    device = connect_adb()
    if not device: return
    
    # Args
    max_players = 150
    if len(sys.argv) > 1:
        try: max_players = int(sys.argv[1])
        except: pass
        
    print(f"🚀 Starting V3 Anchor Scraper for {max_players} players")
    input("Press Enter when Leaderboard is visible...")
    
    # State
    processed_count = 0
    seen_fids = set()
    current_anchor_template = None
    
    # Initial Conditions
    # First screen: Assume standard positions
    # We define 'first_row_y' for the current screen dynamically
    current_screen_first_row = FIRST_ROW_Y
    
    while processed_count < max_players:
        print(f"\n📸 Capturing screen (Count: {processed_count})...")
        img = fast_capture(device)
        if not img: break
        
        # 1. ANCHOR RE-ALIGNMENT
        # If we have an anchor from previous screen, find it to set our start Y
        if current_anchor_template:
            match_y, conf = find_anchor_in_image(img, current_anchor_template, debug=True)
            if match_y and conf > 0.7:
                print(f"   ⚓ Anchor Found at Y={match_y:.1f} (Conf: {conf:.2f})")
                # Our new starting row is immediately AFTER the anchored row
                # match_y is proper top of the anchor row. 
                # So next row is match_y + ROW_HEIGHT
                current_screen_first_row = match_y + ROW_HEIGHT
            else:
                print(f"   ⚠️ Anchor LOST! using estimates (Conf: {conf})")
                # Fallback: We targeted to move the anchor to Y=300 (or limited by 1200px scroll)
                # But since we don't know where it is, let's assume we scrolled 1200px?
                # Actually, if we lost it, it might be off screen TOP.
                # Safe bet: Start at estimated new row.
                # If we scrolled 1200px, everything moved up 1200px.
                # If prev active row was 'prev_y', now it's at 'prev_y - 1200'.
                # But we want the NEXT row.
                # Let's just start at top of list (Standard Y) as catastrophic fallback
                current_screen_first_row = FIRST_ROW_Y 
        else:
             print("   🔹 Initial Screen (Standard Alignment)")
             current_screen_first_row = FIRST_ROW_Y
             
        # 2. PROCESS VISIBLE ROWS
        # Iterate down from current_screen_first_row
        y = current_screen_first_row
        
        # Which row was the last successful one? We'll use it as next anchor
        last_successful_row_y = None
        last_successful_row_img = None # We'll crop from 'img'
        
        rows_on_this_screen = 0
        
        while y < 2200 and processed_count < max_players: # 2200 is approx bottom of list area
            rows_on_this_screen += 1
            print(f"   [P{processed_count+1}] Row at Y={y:.0f}")
            
            # Extract Power
            pwr = ocr_power(img, y)
            if not pwr:
                print("      ⚠️ OCR Failed, skipping row")
                y += ROW_HEIGHT
                continue
                
            print(f"      Power: {int(pwr):,}")
            
            # Tap & Profile
            tap_y = int(y + ROW_HEIGHT/2)
            device.shell(f"input tap 540 {tap_y}")
            time.sleep(1.2)
            
            prof = fast_capture(device)
            if not prof: 
                device.shell(f"input tap {BACK_BUTTON[0]} {BACK_BUTTON[1]}")
                break
                
            data = scrape_profile(prof)
            
            # Back
            device.shell(f"input tap {BACK_BUTTON[0]} {BACK_BUTTON[1]}")
            time.sleep(1.0)
            
            if data and data['uid']:
                fid = data['uid']
                print(f"      FID: {fid}")
                if fid not in seen_fids:
                    seen_fids.add(fid)
                    
                    # API Enrich
                    api_d = fetch_api(fid)
                    full_data = {**data, 'power': int(pwr)}
                    if api_d: full_data.update(api_d)
                    
                    save_to_db(full_data)
                    processed_count += 1
                    
                    # Mark this as a candidate for anchor
                    last_successful_row_y = y
                else:
                    print("      Skipping duplicate")
            else:
                 print("      ⚠️ Profile Read Failed")
            
            y += ROW_HEIGHT
            
        # 3. PREPARE NEXT ANCHOR
        # Check if we processed anything
        if rows_on_this_screen == 0:
            print("   ⚠️ No rows processed on this screen. End of list?")
            break
            
        if last_successful_row_y:
            # Crop the anchor template from the LAST processed row
            current_anchor_template = extract_anchor_template(img, last_successful_row_y)
            
            # Debug save
            # current_anchor_template.save(os.path.join(DEBUG_DIR, f"anchor_{processed_count}.png"))
        else:
            print("   ⚠️ Could not establish anchor (no rows success)")
            break
            
        # 4. SCROLL
        # We scroll enough to move the last row to the top area (but not off screen)
        # Last row was at 'last_successful_row_y'
        # We want it to end up at e.g. Y=300
        # So specific scroll distance = last_successful_row_y - 300
        # Or just generic scroll?
        # V3 Strategy: Dynamic scroll
        target_y_for_anchor = 300 
        scroll_dist = last_successful_row_y - target_y_for_anchor
        
        # Ensure scroll is reasonable
        # Min: 800px (to make progress)
        # Max: 1200px (to keep anchor strictly on screen, assuming 2400px height but safe margin)
        if scroll_dist < 800: scroll_dist = 800
        if scroll_dist > 1200: 
            print(f"   ⚠️ Cap scroll dist {scroll_dist} -> 1200 (Safety)")
            scroll_dist = 1200
        
        # Start scrolling from Y=1500 (Safe middle-bottom) to avoid hitting bottom UI
        scroll_start_y = 1500
        scroll_end_y = scroll_start_y - scroll_dist
        
        print(f"   📜 Scrolling {scroll_dist}px (Visual Lock Strategy)...")
        device.shell(f"input swipe 540 {scroll_start_y} 540 {scroll_end_y} {SCROLL_DURATION}")
        time.sleep(2.0)

    print("✅ Done!")

if __name__ == "__main__":
    main()

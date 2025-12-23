import os
import time
import argparse
from PIL import Image, ImageDraw, ImageFont, ImageChops
import pytesseract
import numpy as np
from auto_scraper_tesseract import (
    COORDS, TESSERACT_PATH, preprocess_image, ocr_region, 
    setup_adb, capture_and_pull_screen, perform_scroll, calculate_scroll_shift
)

# Configuration
DEBUG_OUTPUT_DIR = "scraper/debug_mapping"
os.makedirs(DEBUG_OUTPUT_DIR, exist_ok=True)

if os.path.exists(TESSERACT_PATH):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

def draw_region(draw, region, color, label, font):
    """Draw a rectangle and label on the image"""
    x1, y1, x2, y2 = region
    draw.rectangle([x1, y1, x2, y2], outline=color, width=5)
    
    # Draw label background
    text_size = draw.textbbox((x1, y1 - 30), label, font=font)
    draw.rectangle(text_size, fill=color)
    draw.text((x1, y1 - 30), label, fill="white", font=font)

def debug_leaderboard_mapping(screenshot_path, scroll_idx=0, y_start_override=None, y_end_override=None, draw_ruler=False, y_offset=0):
    """Visualize all leaderboard row regions"""
    print(f"[SCAN] Mapping leaderboard regions on {screenshot_path} (Scroll {scroll_idx})...")
    img = Image.open(screenshot_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    w, h = img.size
    
    try:
        font = ImageFont.truetype("arial.ttf", 25)
    except:
        font = ImageFont.load_default()

    # 0. Draw Ruler (optional)
    if draw_ruler:
        for y in range(0, h, 100):
            draw.line([(0, y), (50, y)], fill="gray", width=2)
            draw.text((60, y - 10), f"{y}", fill="gray", font=font)

    # 1. Draw Global Regions
    # ...
    safety_val = ocr_region(img, COORDS['LEADERBOARD_CHECK_REGION'])
    # ...
    draw_region(draw, COORDS['LEADERBOARD_CHECK_REGION'], "blue", f"Safety ({safety_val})", font)
    
    # Drift Indicator
    if y_offset != 0:
        draw.text((50, 50), f"DRIFT CORRECTION: {y_offset:+.2f} px", fill="red", font=font, stroke_width=2, stroke_fill="white")
    
    # 2. Draw Row Regions
    # ...
    for i in range(COORDS['NUM_VISIBLE_ROWS']):
        y1 = COORDS['FIRST_ROW_Y'] + (i * COORDS['ROW_HEIGHT']) + y_offset
        y2 = int(y1 + COORDS['ROW_HEIGHT'])
        y1 = int(y1)
        
        # Row Boundary
        draw.rectangle([0, y1, 1080, y2], outline="gray", width=2)
        
        # Name Region
        name_reg = (COORDS['NAME_X1'], y1, COORDS['NAME_X2'], y2)
        draw_region(draw, name_reg, "green", f"R{i+1} Name", font)
        
        # Power Region
        py1 = int(y1 + COORDS['POWER_Y_OFFSET'])
        py2 = int(py1 + COORDS['ROW_HEIGHT'])
        power_reg = (COORDS['POWER_X1'], py1, COORDS['POWER_X2'], py2)
        draw_region(draw, power_reg, "red", f"R{i+1} Power", font)
        
        # Perform OCR
        crop = img.crop(power_reg)
        proc = preprocess_image(crop, mode='numeric')
        val = pytesseract.image_to_string(proc, config='--psm 7').strip()
        print(f"  Scroll {scroll_idx} Row {i+1} OCR Result: {val}")

    # 3. Draw Scroll Path and Anchors
    y_start = y_start_override if y_start_override is not None else COORDS['SCROLL_START'][1]
    y_end = y_end_override if y_end_override is not None else COORDS['SCROLL_END'][1]
    
    # Start Line (Blue)
    draw.line([(0, y_start), (1080, y_start)], fill="blue", width=7)
    draw.text((10, y_start - 35), f"START Y: {y_start}", fill="blue", font=font)
    
    # End Line (Red)
    draw.line([(0, y_end), (1080, y_end)], fill="red", width=7)
    draw.text((10, y_end + 10), f"END Y: {y_end}", fill="red", font=font)
    
    # Yellow Path Line
    draw.line([(COORDS['SCROLL_START'][0], y_start), 
               (COORDS['SCROLL_END'][0], y_end)], fill="yellow", width=10)
    
    output_path = os.path.join(DEBUG_OUTPUT_DIR, f"mapping_lb_scroll_{scroll_idx:03d}.png")
    img.save(output_path)
    img.close()
    print(f"[OK] Mapping saved to {output_path}")
    return output_path

def debug_profile_mapping(screenshot_path):
    """Visualize profile screen regions"""
    print(f"[SCAN] Mapping profile regions on {screenshot_path}...")
    img = Image.open(screenshot_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    
    try:
        font = ImageFont.truetype("arial.ttf", 25)
    except:
        font = ImageFont.load_default()

    # Draw profile regions
    regions = {
        'UID': COORDS['PROFILE_UID_REGION'],
        'Alliance': COORDS['PROFILE_ALLIANCE_REGION'],
        'Back': (COORDS['BACK_BUTTON'][0]-30, COORDS['BACK_BUTTON'][1]-30, 
                 COORDS['BACK_BUTTON'][0]+30, COORDS['BACK_BUTTON'][1]+30)
    }
    
    colors = ["cyan", "orange", "red"]
    
    # Perform OCR
    val_uid = ocr_region(img, regions['UID'], allowlist='0123456789')
    val_alliance = ocr_region(img, regions['Alliance'], mode='numeric')
    
    results = [val_uid, val_alliance, ""]
    
    for (name, reg), val, color in zip(regions.items(), results, colors):
        draw_region(draw, reg, color, name, font)
        print(f"  {name} OCR Result: {val}")

    output_path = os.path.join(DEBUG_OUTPUT_DIR, "mapping_profile_live.png")
    img.save(output_path)
    img.close()
    print(f"[OK] Mapping saved to {output_path}")
    return output_path

def calculate_scroll_distance(img1_path, img2_path):
    """Find the vertical pixel shift between two images using Rank+Avatar correlation"""
    img1 = Image.open(img1_path).convert("L")
    img2 = Image.open(img2_path).convert("L")
    w, h = img1.size
    
    # Use a wider strip (x=0 to 350) including Rank AND Avatar
    # Avatars are unique per player, preventing the "periodic" false match
    h_start = 380
    h_end = h - 200
    
    strip1 = np.array(img1.crop((0, h_start, 350, h_end))).astype(np.float32)
    strip2 = np.array(img2.crop((0, h_start, 350, h_end))).astype(np.float32)
    
    total_len = strip1.shape[0]
    best_offset = 0
    min_diff = float('inf')
    
    # Search range: Constrained to Expected 1207 +/- 25px
    search_range = range(1180, 1235)
    
    for offset in search_range:
        if offset >= total_len: break
        
        s1 = strip1[offset:]
        s2 = strip2[:total_len-offset]
        
        diff = np.mean(np.abs(s1 - s2))
        
        if diff < min_diff:
            min_diff = diff
            best_offset = offset
            
    return best_offset

def calibrate_scroll(device):
    """Take two shots and find the distance shifted"""
    print("\n[CALIB] SCROLL CALIBRATION MODE")
    print("1. Capturing START position...")
    s1 = capture_and_pull_screen(device, "calib_start.png")
    
    print("\n2. DO THE SCROLL NOW (manual scroll or press Enter to let script do its swipe)...")
    inp = input("Type 'done' after manual scroll, or just press ENTER to test script swipe: ")
    
    if inp.lower() != 'done':
        print(f"... Performing script scroll (Zero-Inertia Drag)...")
        perform_scroll(device)
        time.sleep(2.0)
        
    print("3. Capturing END position...")
    s2 = capture_and_pull_screen(device, "calib_end.png")
    
    try:
        print("\n... Calculating pixel shift...")
        distance = calculate_scroll_distance(s1, s2)
        
        print(f"\n[RESULT] Shifted {distance} pixels vertically.")
        print(f"   Theoretical row height: {COORDS['ROW_HEIGHT']} px")
        rows_shifted = distance / COORDS['ROW_HEIGHT']
        print(f"   Rows moved: {rows_shifted:.2f}")
        
        target_rows = 6 # We usually want 6 rows
        target_dist = target_rows * COORDS['ROW_HEIGHT']
        
        print(f"\n[INFO] Analysis:")
        print(f"   If you want to move exactly {target_rows} rows ({target_dist}px):")
        print(f"   Current SCROLL_START: {COORDS['SCROLL_START']}")
        print(f"   Recommended SCROLL_END Y: {COORDS['SCROLL_START'][1] - target_dist}")
        
    except Exception as e:
        print(f"[ERROR] Error during calibration: {e}")
        import traceback
        traceback.print_exc()
        
    if os.path.exists(s1): os.remove(s1)
    if os.path.exists(s2): os.remove(s2)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Kingshot OCR Debugger")
    parser.add_argument("--scrolls", type=int, default=1, help="Number of scrolls to simulate (leaderboard mode)")
    parser.add_argument("--no-scroll", action="store_true", help="Don't perform physical scroll, just re-capture")
    parser.add_argument("--profile", action="store_true", help="Debug profile screen mapping")
    parser.add_argument("--calibrate", action="store_true", help="Calibrate scroll distance")
    parser.add_argument("--ystart", type=int, help="Override SCROLL_START Y")
    parser.add_argument("--yend", type=int, help="Override SCROLL_END Y")
    parser.add_argument("--ruler", action="store_true", help="Draw pixel ruler")
    args = parser.parse_args()

    device = setup_adb()
    if not device:
        print("[ERROR] No device found")
        exit()
        
    if args.calibrate:
        calibrate_scroll(device)
    elif args.profile:
        print("\n--- PROFILE MAPPING ---")
        print("Please open a player profile, then press Enter...")
        input()
        prof_path = capture_and_pull_screen(device, "debug_prof_live.png")
        if prof_path:
            debug_profile_mapping(prof_path)
            os.remove(prof_path)
    else:
        print(f"\n--- LEADERBOARD MAPPING ({args.scrolls} scrolls) ---")
        prev_lb_path = None
        current_drift = 0.0
        EXPECTED_SCROLL_PX = COORDS['ROW_HEIGHT'] * 6
        
        for s in range(args.scrolls):
            filename = f"leak_check_scroll_{s:03d}.png"
            lb_path = capture_and_pull_screen(device, filename)
            if lb_path:
                debug_leaderboard_mapping(
                    lb_path, 
                    scroll_idx=s, 
                    y_start_override=args.ystart, 
                    y_end_override=args.yend,
                    draw_ruler=args.ruler,
                    y_offset=current_drift
                )
                # Don't delete yet, needed for drift calc
                # os.remove(lb_path)
            
            if s > 0 and prev_lb_path and lb_path:
                 shift = calculate_scroll_shift(prev_lb_path, lb_path)
                 if shift:
                     step_drift = EXPECTED_SCROLL_PX - shift
                     current_drift += step_drift
                     print(f"   [DRIFT] Step: {step_drift:+.1f}px | Cumulative: {current_drift:+.1f}px")
            
            if prev_lb_path and os.path.exists(prev_lb_path):
                os.remove(prev_lb_path)
            prev_lb_path = lb_path

            if s < args.scrolls - 1 and not args.no_scroll:
                print(f"[SCROLL] Scrolling down ({s+1}/{args.scrolls})...")
                perform_scroll(device)
                time.sleep(2.5) # Extra settle time for debugger
    
        if prev_lb_path and os.path.exists(prev_lb_path):
             os.remove(prev_lb_path)

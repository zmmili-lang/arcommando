"""
Scroll Distance Calibration Tool
Helps determine exact scroll distance and test drift correction for auto_scraper_tesseract.py
"""

import os
import sys
import argparse
from ppadb.client import Client as AdbClient
from PIL import Image
import numpy as np
import io
import time

# ADB Configuration
ADB_HOST = '127.0.0.1'
ADB_PORT = 5037

# Coordinates from auto_scraper_tesseract.py
COORDS = {
    'SCROLL_START': (540, 1930),
    'SCROLL_END': (540, 723),    # Target 6 rows (1207px)
    'FIRST_ROW_Y': 323,
    'ROW_HEIGHT': 201.25,
    'NUM_VISIBLE_ROWS': 6,
}

def setup_adb():
    """Connect to ADB"""
    try:
        client = AdbClient(host=ADB_HOST, port=ADB_PORT)
        devices = client.devices()
        if not devices:
            print("❌ No devices found")
            return None
        device = devices[0]
        print(f"✅ Connected to device: {device.serial}")
        return device
    except Exception as e:
        print(f"❌ ADB connection error: {e}")
        return None

def fast_capture(device):
    """Capture screenshot directly"""
    try:
        raw_png = device.screencap()
        if not raw_png:
            return None
        return Image.open(io.BytesIO(raw_png))
    except Exception as e:
        print(f"❌ Capture failed: {e}")
        return None

def calculate_vertical_shift(img1, img2, search_range=(1500, 1700), strip_width=350):
    """
    Calculate vertical pixel shift between two screenshots.
    
    Args:
        img1: PIL Image (before scroll)
        img2: PIL Image (after scroll)
        search_range: tuple (min_px, max_px) to search for shift
        strip_width: width of comparison strip from left edge
    
    Returns:
        dict with keys: 'shift_px', 'confidence', 'min_diff'
    """
    if img1.size != img2.size:
        print("⚠️ Warning: Images have different sizes")
        return None
    
    # Convert to grayscale numpy arrays
    arr1 = np.array(img1.convert("L")).astype(np.float32)
    arr2 = np.array(img2.convert("L")).astype(np.float32)
    
    h, w = arr1.shape
    
    # Define vertical region to compare (avoid top/bottom UI elements)
    h_start = 380
    h_end = h - 200
    
    # Extract left strip for comparison (this area has consistent rank numbers)
    strip1 = arr1[h_start:h_end, 0:strip_width]
    strip2 = arr2[h_start:h_end, 0:strip_width]
    
    total_len = strip1.shape[0]
    min_diff = float('inf')
    best_offset = 0
    diffs = []
    
    search_min, search_max = search_range
    
    print(f"\n🔍 Searching for optimal shift in range {search_min}-{search_max}px...")
    
    for offset in range(search_min, min(search_max, total_len)):
        if offset >= total_len:
            break
        
        # Compare strip1[offset:] with strip2[:total_len-offset]
        s1 = strip1[offset:]
        s2 = strip2[:total_len-offset]
        
        if s1.size == 0:
            continue
        
        # Calculate mean absolute difference
        diff = np.mean(np.abs(s1 - s2))
        diffs.append((offset, diff))
        
        if diff < min_diff:
            min_diff = diff
            best_offset = offset
    
    # Calculate confidence based on how distinct the minimum is
    diffs_sorted = sorted(diffs, key=lambda x: x[1])
    if len(diffs_sorted) >= 2:
        second_best_diff = diffs_sorted[1][1]
        confidence = ((second_best_diff - min_diff) / min_diff) * 100 if min_diff > 0 else 0
    else:
        confidence = 0
    
    return {
        'shift_px': best_offset,
        'confidence': confidence,
        'min_diff': min_diff,
        'all_diffs': diffs[:10]  # Top 10 for debugging
    }

def perform_scroll(device, y_start=None, y_end=None, duration_ms=2000):
    """Perform a scroll with specified parameters"""
    x = 540
    y_start = y_start or COORDS['SCROLL_START'][1]
    y_end = y_end or COORDS['SCROLL_END'][1]
    
    scroll_distance = y_start - y_end
    
    print(f"📜 Scrolling: Y {y_start} → {y_end} ({scroll_distance}px) over {duration_ms}ms")
    device.shell(f"input swipe {x} {y_start} {x} {y_end} {duration_ms}")
    time.sleep(1.2)  # Wait for scroll to settle
    
    return scroll_distance

def draw_horizontal_lines(img, y_positions, color=(255, 0, 0), thickness=2):
    """Draw horizontal reference lines on image"""
    from PIL import ImageDraw
    img = img.copy()
    draw = ImageDraw.Draw(img)
    
    for y in y_positions:
        y_int = int(y)
        for i in range(thickness):
            draw.line([(0, y_int + i), (img.width, y_int + i)], fill=color)
    
    return img

def mode_measure(device):
    """Measure actual scroll distance by capturing before/after screenshots"""
    print("\n" + "=" * 60)
    print("📏 SCROLL DISTANCE MEASUREMENT MODE")
    print("=" * 60)
    print("\nThis mode will:")
    print("1. Capture a screenshot BEFORE scroll")
    print("2. Perform a scroll action")
    print("3. Capture a screenshot AFTER scroll")
    print("4. Calculate the exact pixel shift")
    print("\nMake sure you're on the leaderboard screen!")
    input("\nPress Enter to continue...")
    
    # Capture before scroll
    print("\n📸 Capturing BEFORE screenshot...")
    img_before = fast_capture(device)
    if not img_before:
        print("❌ Failed to capture before screenshot")
        return
    
    img_before.save("scroll_before.png")
    print("   ✅ Saved to scroll_before.png")
    
    # Perform scroll
    print("\n📜 Performing scroll...")
    expected_distance = perform_scroll(device)
    
    # Capture after scroll
    print("\n📸 Capturing AFTER screenshot...")
    img_after = fast_capture(device)
    if not img_after:
        print("❌ Failed to capture after screenshot")
        return
    
    img_after.save("scroll_after.png")
    print("   ✅ Saved to scroll_after.png")
    
    # Calculate shift
    print("\n🔬 Analyzing pixel shift...")
    result = calculate_vertical_shift(img_before, img_after)
    
    if not result:
        print("❌ Failed to calculate shift")
        return
    
    actual_shift = result['shift_px']
    confidence = result['confidence']
    
    # Display results
    print("\n" + "=" * 60)
    print("📊 MEASUREMENT RESULTS")
    print("=" * 60)
    print(f"Expected scroll distance: {expected_distance}px")
    print(f"Actual measured shift:    {actual_shift}px")
    print(f"Drift/Error:              {actual_shift - expected_distance:+d}px")
    print(f"Confidence score:         {confidence:.1f}%")
    print("=" * 60)
    
    # Recommendations
    drift = actual_shift - expected_distance
    target_rows = 8
    
    if abs(drift) <= 5:
        print("\n✅ Excellent! Scroll is very accurate.")
    elif abs(drift) <= 15:
        print("\n⚠️  Minor drift detected. Consider tuning.")
    else:
        print("\n❌ Significant drift detected! Tuning recommended.")
    
    print(f"\n💡 RECOMMENDATIONS:")
    print(f"   To scroll exactly {target_rows} rows ({target_rows * COORDS['ROW_HEIGHT']:.0f}px):")
    
    # Calculate new SCROLL_END
    current_start = COORDS['SCROLL_START'][1]
    current_end = COORDS['SCROLL_END'][1]
    current_distance = current_start - current_end
    
    # Adjust END coordinate to compensate for drift
    new_end = current_start - actual_shift
    
    print(f"\n   Current config:")
    print(f"     SCROLL_START: (540, {current_start})")
    print(f"     SCROLL_END: (540, {current_end})")
    print(f"     → Results in {actual_shift}px scroll")
    
    print(f"\n   Recommended config (to achieve {target_rows * COORDS['ROW_HEIGHT']:.0f}px):")
    # We need to find the END that gives us the target distance
    target_distance = target_rows * COORDS['ROW_HEIGHT']
    scaling_factor = target_distance / actual_shift
    recommended_end = int(current_start - (current_distance * scaling_factor))
    
    print(f"     SCROLL_START: (540, {current_start})")
    print(f"     SCROLL_END: (540, {recommended_end})")
    print(f"     → Should achieve ~{target_distance:.0f}px scroll")
    
    # Save annotated images
    print("\n📸 Saving annotated comparison images...")
    
    # Draw row lines on both images
    row_lines = [COORDS['FIRST_ROW_Y'] + i * COORDS['ROW_HEIGHT'] for i in range(COORDS['NUM_VISIBLE_ROWS'])]
    
    img_before_annotated = draw_horizontal_lines(img_before, row_lines)
    img_before_annotated.save("scroll_before_annotated.png")
    
    img_after_annotated = draw_horizontal_lines(img_after, row_lines)
    img_after_annotated.save("scroll_after_annotated.png")
    
    print("   ✅ scroll_before_annotated.png")
    print("   ✅ scroll_after_annotated.png")
    print("\nOpen these images side-by-side to visually verify alignment!")

def mode_test(device, y_start, y_end, num_scrolls):
    """Test a specific scroll configuration multiple times"""
    print("\n" + "=" * 60)
    print("🧪 SCROLL TEST MODE")
    print("=" * 60)
    print(f"Testing scroll: Y {y_start} → {y_end}")
    print(f"Number of test scrolls: {num_scrolls}")
    print("\nMake sure you're on the leaderboard screen!")
    input("\nPress Enter to start test...")
    
    results = []
    prev_img = None
    
    for i in range(num_scrolls):
        print(f"\n--- Test Scroll {i + 1}/{num_scrolls} ---")
        
        # Capture before
        img_before = fast_capture(device)
        if not img_before:
            print("❌ Failed to capture")
            continue
        
        # Perform scroll
        expected = perform_scroll(device, y_start, y_end)
        
        # Capture after
        img_after = fast_capture(device)
        if not img_after:
            print("❌ Failed to capture")
            continue
        
        # Calculate shift
        result = calculate_vertical_shift(img_before, img_after)
        if result:
            actual = result['shift_px']
            drift = actual - expected
            results.append({
                'scroll': i + 1,
                'expected': expected,
                'actual': actual,
                'drift': drift
            })
            print(f"   Measured: {actual}px (drift: {drift:+d}px)")
    
    # Summary
    if results:
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        avg_actual = sum(r['actual'] for r in results) / len(results)
        avg_drift = sum(r['drift'] for r in results) / len(results)
        max_drift = max(abs(r['drift']) for r in results)
        
        print(f"Scrolls tested:     {len(results)}")
        print(f"Average shift:      {avg_actual:.1f}px")
        print(f"Average drift:      {avg_drift:.1f}px")
        print(f"Max drift:          {max_drift:.0f}px")
        print(f"Consistency:        {'✅ Good' if max_drift <= 10 else '⚠️ Variable'}")
        print("=" * 60)
        
        print("\nIndividual results:")
        for r in results:
            print(f"  Scroll {r['scroll']}: {r['actual']}px (drift: {r['drift']:+d}px)")

def mode_visual_ruler(device):
    """Capture screenshot with row alignment rulers for visual verification"""
    print("\n" + "=" * 60)
    print("📏 VISUAL RULER MODE")
    print("=" * 60)
    print("\nThis will capture a screenshot with horizontal lines")
    print("drawn at each row position for visual verification.")
    input("\nPress Enter to capture...")
    
    img = fast_capture(device)
    if not img:
        print("❌ Failed to capture")
        return
    
    # Draw row lines
    row_lines = [COORDS['FIRST_ROW_Y'] + i * COORDS['ROW_HEIGHT'] for i in range(COORDS['NUM_VISIBLE_ROWS'])]
    
    img_annotated = draw_horizontal_lines(img, row_lines)
    img_annotated.save("ruler_view.png")
    
    print("\n✅ Saved to ruler_view.png")
    print("\nRow positions (red lines):")
    for i, y in enumerate(row_lines):
        print(f"  Row {i + 1}: Y = {y:.2f}")
    
    print("\nOpen ruler_view.png and verify that the red lines")
    print("align with the horizontal centers of each player row.")

def main():
    parser = argparse.ArgumentParser(
        description='Scroll Distance Calibration Tool for Kingshot Scraper',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Measure actual scroll distance
  python scroll_calibrator.py --measure
  
  # Test a specific scroll configuration 5 times
  python scroll_calibrator.py --test --ystart 1930 --yend 320 --scrolls 5
  
  # Visual ruler to check row alignment
  python scroll_calibrator.py --ruler
        """
    )
    
    parser.add_argument('--measure', action='store_true', 
                       help='Measure actual scroll distance')
    parser.add_argument('--test', action='store_true',
                       help='Test a scroll configuration multiple times')
    parser.add_argument('--ruler', action='store_true',
                       help='Capture screenshot with row alignment rulers')
    parser.add_argument('--ystart', type=int, default=COORDS['SCROLL_START'][1],
                       help=f'Scroll start Y coordinate (default: {COORDS["SCROLL_START"][1]})')
    parser.add_argument('--yend', type=int, default=COORDS['SCROLL_END'][1],
                       help=f'Scroll end Y coordinate (default: {COORDS["SCROLL_END"][1]})')
    parser.add_argument('--scrolls', type=int, default=3,
                       help='Number of test scrolls (default: 3)')
    
    args = parser.parse_args()
    
    # Connect to device
    device = setup_adb()
    if not device:
        return 1
    
    # Run selected mode
    if args.measure:
        mode_measure(device)
    elif args.test:
        mode_test(device, args.ystart, args.yend, args.scrolls)
    elif args.ruler:
        mode_visual_ruler(device)
    else:
        parser.print_help()
        print("\n⚠️  Please specify a mode: --measure, --test, or --ruler")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())

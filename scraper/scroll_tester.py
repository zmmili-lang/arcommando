"""
Scroll Tester Tool
Interactive tool to test scroll distances on the phone.
Enter a scroll distance value and it will perform the swipe.
"""

import os
import sys
import time
from ppadb.client import Client as AdbClient
from PIL import Image
import numpy as np

ADB_HOST = '127.0.0.1'
ADB_PORT = 5037
OUTPUT_DIR = 'kingshot_data'

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

def capture_screenshot(device, filename):
    """Capture a screenshot from the device"""
    device_path = f"/sdcard/{filename}"
    device.shell(f"screencap -p {device_path}")
    
    local_path = os.path.join(OUTPUT_DIR, filename)
    try:
        device.pull(device_path, local_path)
        device.shell(f"rm {device_path}")
        return local_path
    except Exception as e:
        print(f"❌ Screenshot error: {e}")
        return None

def measure_scroll_distance(img1_path, img2_path):
    """Measure actual pixel movement between two screenshots"""
    try:
        img1 = Image.open(img1_path).convert("L")
        img2 = Image.open(img2_path).convert("L")
        w, h = img1.size
        
        # Analyze left strip (rank/avatar area - reliable for matching)
        h_start = 300
        h_end = h - 200
        
        strip1 = np.array(img1.crop((0, h_start, 350, h_end))).astype(np.float32)
        strip2 = np.array(img2.crop((0, h_start, 350, h_end))).astype(np.float32)
        
        total_len = strip1.shape[0]
        min_diff = float('inf')
        best_offset = 0
        
        # Wide search range
        for offset in range(500, 2000):
            if offset >= total_len: break
            
            s1 = strip1[offset:]
            s2 = strip2[:total_len-offset]
            
            if s1.size == 0: continue
            
            diff = np.mean(np.abs(s1 - s2))
            
            if diff < min_diff:
                min_diff = diff
                best_offset = offset
                
        return best_offset, min_diff
    except Exception as e:
        print(f"⚠️ Measurement error: {e}")
        return None, None

def perform_test_scroll(device, distance, duration=1000, measure=False):
    """
    Perform a scroll with the given distance.
    If measure=True, capture before/after screenshots and measure actual movement.
    """
    x = 540  # Center of screen
    y_start = 1930
    y_end = y_start - distance
    
    before_path = None
    if measure:
        print("   📸 Capturing BEFORE screenshot...")
        before_path = capture_screenshot(device, "scroll_before.png")
    
    print(f"[SCROLL] Swipe: ({x}, {y_start}) → ({x}, {y_end})")
    print(f"[SCROLL] Distance: {distance}px, Duration: {duration}ms")
    
    device.shell(f"input swipe {x} {y_start} {x} {y_end} {duration}")
    time.sleep(1.5)  # Wait for scroll to settle
    print("✅ Scroll complete!")
    
    if measure and before_path:
        print("   📸 Capturing AFTER screenshot...")
        after_path = capture_screenshot(device, "scroll_after.png")
        
        if after_path:
            actual_distance, confidence = measure_scroll_distance(before_path, after_path)
            if actual_distance:
                diff = actual_distance - distance
                print(f"\n   📏 MEASUREMENT RESULTS:")
                print(f"      Requested: {distance}px")
                print(f"      Actual:    {actual_distance}px")
                print(f"      Diff:      {diff:+d}px")
                print(f"      Match confidence: {100 - confidence:.1f}%")

def main():
    print("\n" + "="*50)
    print("   SCROLL TESTER TOOL (with diagnostics)")
    print("="*50 + "\n")
    
    device = setup_adb()
    if not device:
        return
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print("\n📋 Commands:")
    print("   <number>     - Scroll by that many pixels")
    print("   m <number>   - Scroll and MEASURE actual distance")
    print("   d<ms> <px>   - Custom duration, e.g. 'd500 1615'")
    print("   q            - Quit\n")
    
    duration = 1000  # Default 1 second
    
    while True:
        try:
            user_input = input("Enter command: ").strip()
            
            if user_input.lower() == 'q':
                print("Goodbye!")
                break
            
            measure = False
            
            # Check for measure prefix
            if user_input.lower().startswith('m '):
                measure = True
                user_input = user_input[2:].strip()
            
            # Check for custom duration prefix
            parts = user_input.split()
            if len(parts) == 2 and parts[0].startswith('d'):
                duration = int(parts[0][1:])
                distance = int(parts[1])
            else:
                distance = int(user_input)
            
            perform_test_scroll(device, distance, duration, measure)
            
            input("   (Press Enter for next scroll...)")
            print()
            
        except ValueError:
            print("⚠️ Please enter a valid number\n")
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break

if __name__ == "__main__":
    main()

"""
Navigation Mapper - Interactive Tool
Helps you find tap coordinates for auto_scraper navigation.
"""

import os
import time
from ppadb.client import Client as AdbClient
from PIL import Image, ImageDraw, ImageFont

# Configuration
ADB_HOST = '127.0.0.1'
ADB_PORT = 5037
OUTPUT_DIR = 'kingshot_data'

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

def capture_screenshot(device, filename="navigation_map.png"):
    """Capture and pull screenshot"""
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

def perform_tap(device, x, y):
    """Perform a tap at coordinates"""
    device.shell(f"input tap {x} {y}")

def map_navigation(device):
    """Interactive navigation mapping"""
    print("\n╔" + "═" * 58 + "╗")
    print("║" + " " * 15 + "NAVIGATION MAPPER" + " " * 26 + "║")
    print("╚" + "═" * 58 + "╝\n")
    
    steps = []
    step_num = 1
    
    print("This tool will help you map the navigation to the leaderboard.")
    print("For each step, you'll:\n")
    print("  1. Describe what to tap (e.g., 'Menu button')")
    print("  2. We'll take a screenshot")
    print("  3. Tap on your phone where you want to tap")
    print("  4. We'll detect the coordinates")
    print("\nLet's begin!\n")
    
    while True:
        print(f"\n{'='*60}")
        print(f"STEP {step_num}")
        print(f"{'='*60}")
        
        # Get description
        description = input(f"What should be tapped in step {step_num}? (or 'done' to finish): ").strip()
        
        if description.lower() == 'done':
            break
            
        # Take screenshot
        print(f"\n📸 Taking screenshot...")
        screenshot_path = capture_screenshot(device, f"nav_step{step_num}.png")
        
        if not screenshot_path:
            print("Failed to capture screenshot")
            continue
            
        print(f"✅ Screenshot saved: {screenshot_path}")
        
        # Get coordinates via tap detection
        print(f"\n👆 Now tap on your phone where '{description}' is located...")
        print("   (Tap within the next 10 seconds)")
        
        # Use getevent to detect tap
        # This is tricky - we'll use a simpler approach
        # Ask user to manually input coordinates from screenshot
        
        print("\nOption 1: Manual Entry")
        print("  - Open the screenshot in an image viewer")
        print(f"  - File: {screenshot_path}")
        print("  - Note the X,Y coordinates where you want to tap")
        
        try:
            x = int(input("\nEnter X coordinate: ").strip())
            y = int(input("Enter Y coordinate: ").strip())
            delay = float(input("Enter delay after tap (seconds, default 2.0): ").strip() or "2.0")
        except ValueError:
            print("Invalid input, skipping this step")
            continue
        
        # Test the tap
        test = input(f"\nTest this tap now? (y/n): ").strip().lower()
        if test == 'y':
            print(f"Tapping at ({x}, {y})...")
            perform_tap(device, x, y)
            time.sleep(delay)
            
            confirm = input("Did it work? (y/n): ").strip().lower()
            if confirm != 'y':
                print("Let's try again for this step...")
                continue
        
        # Save step
        steps.append({
            'description': description,
            'x': x,
            'y': y,
            'delay': delay
        })
        
        print(f"✅ Step {step_num} recorded!")
        step_num += 1
    
    # Generate code
    print("\n" + "="*60)
    print("NAVIGATION STEPS CODE")
    print("="*60)
    print("\nCopy this to auto_scraper.py (replace NAVIGATION_STEPS):\n")
    
    print("NAVIGATION_STEPS = [")
    for step in steps:
        print(f"    ({step['x']}, {step['y']}, {step['delay']}),  # {step['description']}")
    print("]")
    
    print("\n✅ Mapping complete!")

if __name__ == "__main__":
    device = setup_adb()
    if device:
        map_navigation(device)

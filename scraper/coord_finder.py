"""
Manual Coordinate Finder - Quick Visual Tool
This will show you exactly what regions are being captured
"""

import os
from ppadb.client import Client as AdbClient
from PIL import Image, ImageDraw, ImageFont

OUTPUT_DIR = 'kingshot_data'
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

def setup_adb():
    try:
        client = AdbClient(host='127.0.0.1', port=5037)
        devices = client.devices()
        if not devices:
            print("❌ No devices connected!")
            return None
        device = devices[0]
        print(f"✅ Connected to device: {device.serial}")
        return device
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def capture_screenshot(device):
    device_path = "/sdcard/test.png"
    device.shell(f"screencap -p {device_path}")
    local_path = os.path.join(OUTPUT_DIR, "test_screenshot.png")
    device.pull(device_path, local_path)
    device.shell(f"rm {device_path}")
    return local_path

def draw_regions_on_image(image_path, regions):
    """Draw colored boxes on image to visualize crop regions"""
    img = Image.open(image_path)
    draw = ImageDraw.Draw(img)
    
    for name, coords, color in regions:
        x1, y1, x2, y2 = coords
        # Draw rectangle
        draw.rectangle([x1, y1, x2, y2], outline=color, width=5)
        # Draw label
        draw.text((x1, y1-30), name, fill=color)
    
    output_path = os.path.join(OUTPUT_DIR, "regions_visualized.png")
    img.save(output_path)
    print(f"✅ Saved visualization to: {output_path}")
    return output_path

if __name__ == "__main__":
    print("="*60)
    print("MANUAL COORDINATE FINDER")
    print("="*60)
    
    device = setup_adb()
    if not device:
        exit()
    
    print("\n📋 Make sure leaderboard is visible, then press Enter...")
    input()
    
    print("📸 Capturing screenshot...")
    screenshot = capture_screenshot(device)
    
    # Open the image to get dimensions
    img = Image.open(screenshot)
    width, height = img.size
    print(f"📱 Screenshot size: {width}x{height}")
    
    print("\n" + "="*60)
    print("INSTRUCTIONS:")
    print("="*60)
    print(f"1. Open this file in Paint or any image editor:")
    print(f"   {screenshot}")
    print()
    print("2. Find these 4 coordinates (hover mouse and note X,Y):")
    print()
    print("   A. Top-left of FIRST player name")
    print("      (just after the avatar, where '[' starts)")
    print()
    print("   B. Bottom-right of LAST visible player name")
    print("      (end of the last name you can see)")
    print()
    print("   C. Top-left of FIRST power number")
    print("      (where first digit starts)")
    print()
    print("   D. Bottom-right of LAST visible power number")
    print("      (end of last power number)")
    print()
    print("="*60)
    print()
    
    # Get coordinates from user
    print("Enter the coordinates:")
    try:
        ax = int(input("A - Name top-left X: "))
        ay = int(input("A - Name top-left Y: "))
        bx = int(input("B - Name bottom-right X: "))
        by = int(input("B - Name bottom-right Y: "))
        cx = int(input("C - Power top-left X: "))
        cy = int(input("C - Power top-left Y: "))
        dx = int(input("D - Power bottom-right X: "))
        dy = int(input("D - Power bottom-right Y: "))
    except:
        print("❌ Invalid input!")
        exit()
    
    # Calculate device resolution scaling factor
    device_result = device.shell("wm size")
    logical_width = int(device_result.split(":")[-1].strip().split("x")[0])
    scale = width / logical_width
    
    print(f"\n📊 Screenshot scale factor: {scale}x")
    print(f"   (Screenshot: {width}px, Device logical: {logical_width}px)")
    
    # Scale coordinates to device logical resolution
    name_coords = (
        int(ax / scale),
        int(ay / scale),
        int(bx / scale),
        int(by / scale)
    )
    
    power_coords = (
        int(cx / scale),
        int(cy / scale),
        int(dx / scale),
        int(dy / scale)
    )
    
    print("\n" + "="*60)
    print("✅ YOUR COORDINATES (Copy these to script):")
    print("="*60)
    print()
    print("'NAME_COLUMN_REGION': " + str(name_coords) + ",")
    print("'POWER_COLUMN_REGION': " + str(power_coords) + ",")
    print()
    
    # Visualize the regions on the screenshot
    regions = [
        ("NAMES", (ax, ay, bx, by), "red"),
        ("POWERS", (cx, cy, dx, dy), "blue")
    ]
    
    viz_path = draw_regions_on_image(screenshot, regions)
    print(f"📊 Check {viz_path} to verify your selections!")
    print()
    print("="*60)
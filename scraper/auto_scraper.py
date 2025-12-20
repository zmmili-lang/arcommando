"""
Kingshot Auto Scraper - Full Automation
Launches the game, navigates to leaderboard, and scrapes data automatically.
"""

import os
import time
import subprocess
from ppadb.client import Client as AdbClient

# Configuration
ADB_HOST = '127.0.0.1'
ADB_PORT = 5037

# Game Package Name - REPLACE THIS WITH YOUR GAME'S PACKAGE
# To find it: Open the game on your phone, then run:
#   python auto_scraper.py --detect
GAME_PACKAGE = "com.run.tower.defense"  # UPDATE THIS!

# Navigation Steps (Tap Coordinates)
# These are the steps to get from game launch to leaderboard
# Format: (x, y, delay_after_tap_in_seconds)
NAVIGATION_STEPS = [
    (560, 370, 1.0),  # Empty
    (70, 144, 2.0),  # Avatar
    (674, 2248, 3.0),  # Leaderboard
    (305, 1295, 3.0),  # Personal Power
]

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

def detect_game_package(device):
    """Detect the currently running game package"""
    print("\n📱 GAME PACKAGE DETECTOR")
    print("=" * 60)
    print("Please open the Kingshot game on your phone now.")
    print("Press Enter when the game is open and visible...")
    input()
    
    # Get current activity
    result = device.shell("dumpsys activity activities | grep 'ResumedActivity'")
    
    # Parse package name
    # Format: ActivityRecord{...} u0 PACKAGE/ACTIVITY ...}
    lines = result.split('\n')
    for line in lines:
        if 'ResumedActivity' in line or 'topResumedActivity' in line:
            # Extract package name (between 'u0 ' and '/')
            try:
                parts = line.split()
                for i, part in enumerate(parts):
                    if 'u0' in part and i + 1 < len(parts):
                        package_activity = parts[i + 1]
                        if '/' in package_activity:
                            package = package_activity.split('/')[0]
                            print(f"\n✅ Detected Package: {package}")
                            print(f"\nUpdate GAME_PACKAGE in auto_scraper.py to:")
                            print(f'GAME_PACKAGE = "{package}"')
                            return package
            except:
                pass
                
    print("❌ Could not detect package. Make sure the game is open.")
    return None

def launch_game(device):
    """Launch the game"""
    if GAME_PACKAGE == "com.YOUR.GAME.PACKAGE":
        print("\n❌ Error: GAME_PACKAGE not configured!")
        print("Run: python auto_scraper.py --detect")
        print("Then update GAME_PACKAGE in this script.")
        return False
        
    print(f"🚀 Launching {GAME_PACKAGE}...")
    
    # Force stop first to ensure clean start
    device.shell(f"am force-stop {GAME_PACKAGE}")
    time.sleep(1)
    
    # Launch
    device.shell(f"monkey -p {GAME_PACKAGE} -c android.intent.category.LAUNCHER 1")
    
    print("⏳ Waiting for game to load (15 seconds)...")
    time.sleep(15)
    
    return True

def navigate_to_leaderboard(device):
    """Navigate through the game to reach leaderboard"""
    if not NAVIGATION_STEPS:
        print("\n⚠️  No navigation steps configured!")
        print("You need to add tap coordinates to NAVIGATION_STEPS in auto_scraper.py")
        print("\nFor now, manually navigate to the leaderboard.")
        input("Press Enter when you're on the leaderboard screen...")
        return True
        
    print(f"\n🧭 Navigating to leaderboard ({len(NAVIGATION_STEPS)} steps)...")
    
    for i, (x, y, delay) in enumerate(NAVIGATION_STEPS, 1):
        print(f"  Step {i}/{len(NAVIGATION_STEPS)}: Tap ({x}, {y})")
        device.shell(f"input tap {x} {y}")
        time.sleep(delay)
        
    print("✅ Navigation complete!")
    return True

def run_scraper():
    """Run the AI scraper"""
    print("\n" + "=" * 60)
    print("Starting Scraper...")
    print("=" * 60 + "\n")
    
    # Run the scraper script with auto mode and 13 scrolls
    result = subprocess.run(
        ["python", "kingshot_scraper_ai.py", "--auto", "--scrolls", "13"],
        cwd=os.path.dirname(os.path.abspath(__file__))
    )
    
    return result.returncode == 0

def main():
    import sys
    
    # Check for --detect flag
    if len(sys.argv) > 1 and sys.argv[1] == "--detect":
        device = setup_adb()
        if device:
            detect_game_package(device)
        return
    
    print("\n╔" + "═" * 58 + "╗")
    print("║" + " " * 12 + "KINGSHOT AUTO SCRAPER" + " " * 25 + "║")
    print("║" + " " * 15 + "Full Automation" + " " * 28 + "║")
    print("╚" + "═" * 58 + "╝\n")
    
    device = setup_adb()
    if not device:
        return
    
    # Launch game
    if not launch_game(device):
        return
    
    # Navigate to leaderboard
    if not navigate_to_leaderboard(device):
        return
    
    # Run scraper
    success = run_scraper()
    
    if success:
        print("\n✅ Automation complete!")
    else:
        print("\n❌ Scraper encountered an error")

if __name__ == "__main__":
    main()

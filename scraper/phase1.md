Project: Kingshot OCR Scraper - Phase 1: ADB Connection and Core Commands

1. Objective

Develop the foundational Python script to connect to the physical Android device via ADB and implement the basic device control functions (tap, swipe, and screen capture initiation).

2. Dependencies

Python Libraries: ppadb (for ADB communication), time (for delays).

External Tools: ADB installed and accessible in the system PATH.

3. Configuration Variables

The script must define these variables for ease of setup:

ADB_HOST, ADB_PORT (default '127.0.0.1', 5037).

OUTPUT_DIR (e.g., 'kingshot_data').

COORDS dictionary with placeholder values for LEADERBOARD_BUTTON, SCROLL_START, and SCROLL_END.

4. Functions Required

setup_adb():

Connect to the ADB server.

List connected devices.

Return the first connected device object, or None if no devices are found.

adb_command(device, command):

Execute a shell command on the device (wrapper for device.shell()).

perform_scroll(device, start_coords, end_coords):

Takes start and end coordinate tuples.

Executes an ADB input swipe command with a duration (e.g., 800ms) for human-like behavior.

Includes a time.sleep(2) delay after the swipe.

capture_screen_to_device(device, filename):

Executes ADB screencap -p /sdcard/{filename}.

5. Test/Verification

The main execution block (if __name__ == "__main__":) should:

Call setup_adb().

If connected, execute a test sequence: tap the placeholder leaderboard button, then perform a single scroll, confirming ADB control is working.
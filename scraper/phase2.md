Project: Kingshot OCR Scraper - Phase 2: Image Processing and OCR

1. Objective

Implement the image processing pipeline: pulling the captured file, cropping the relevant area, and extracting raw text using Tesseract OCR.

2. Dependencies

Python Libraries: Pillow (for image cropping), pytesseract, and os (for file path management).

External Tools: Tesseract OCR engine installed and the executable path set in TESSERACT_PATH.

3. Required Functions & Updates

Update Configuration: Add TESSERACT_PATH variable.

Update COORDS: Add the POWER_COLUMN_REGION bounding box (X1, Y1, X2, Y2).

New Function capture_and_pull_screen(device, filename):

Calls the Phase 1 capture function (screencap -p /sdcard/{filename}).

Uses device.pull() to download the file from the device to the local OUTPUT_DIR.

Uses device.shell('rm ...') to delete the file from the device (cleanup).

Returns the local path of the saved file.

New Function process_image_with_ocr(image_path, crop_region):

Opens the image using Pillow.

Crops the image based on the crop_region (the Power/Name columns).

Uses pytesseract.image_to_string() with a custom configuration string (--psm 6 -c tessedit_char_whitelist=...) optimized for numbers, 'K', and 'M'.

Returns a cleaned list of extracted raw strings (one entry per line of text).

4. Test/Verification

The main execution block should:

Use the ADB functions from Phase 1 to capture one screenshot (simulating being on the leaderboard).

Call capture_and_pull_screen() to get the local image path.

Call process_image_with_ocr() on that image.

Print the raw list of strings extracted by the OCR engine, verifying Tesseract is working correctly.
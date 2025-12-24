
import os
import sys
from PIL import Image
import pytesseract

# Add scraper directory to path so we can import COORDS and preprocess_image
sys.path.append(os.path.join(os.getcwd(), 'scraper'))

from auto_scraper_tesseract import COORDS, preprocess_image, ocr_power_from_row

# Tesseract path
TESSERACT_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

def main():
    print("🚀 Verifying OCR Robustness with Jitter Retry...")
    
    # We'll test the specific rows that failed in the last run
    test_cases = [
        {
            'image': 'kingshot_data/leaderboard_scroll_003.png',
            'row': 0, # Row 1 (0-indexed)
            'expected_min': 100000000,
            'drift': -5.0
        },
        {
            'image': 'kingshot_data/leaderboard_scroll_003.png',
            'row': 1, # Row 2
            'expected_min': 100000000,
            'drift': -5.0
        }
    ]
    
    success_count = 0
    for case in test_cases:
        img_path = case['image']
        row = case['row']
        drift = case['drift']
        
        if not os.path.exists(img_path):
            print(f"⚠️ Image not found: {img_path}")
            continue
            
        print(f"\nAnalyzing {img_path} Row {row+1} (Drift: {drift:+.1f}px)...")
        
        # Test the improved ocr_power_from_row
        # No player_idx here to avoid saving debug images during test unless we want to
        # but we can set up a dummy one if needed.
        power_str = ocr_power_from_row(img_path, row, player_idx=999, y_offset=drift)
        
        try:
            power = int(power_str) if power_str else 0
            if power >= case['expected_min']:
                print(f"✅ SUCCESS: Detected Power={power:,}")
                success_count += 1
            else:
                print(f"❌ FAILURE: Detected Power={power_str} (Expected >= {case['expected_min']:,})")
        except Exception as e:
            print(f"❌ ERROR: {e}")

    print(f"\nVerification Results: {success_count}/{len(test_cases)} cases fixed.")
    if success_count == len(test_cases):
        print("✨ All known failure cases successfully resolved with jitter retry!")
    else:
        print("⚠️ Some cases still failing. Further tuning might be needed.")

if __name__ == "__main__":
    main()

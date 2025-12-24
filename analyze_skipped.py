
import os
from PIL import Image
import pytesseract
from scraper.auto_scraper_tesseract import COORDS, preprocess_image, clean_power_value

# Mock Tesseract path
TESSERACT_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

def ocr_power_from_row(img, row_num, y_offset=0):
    y1 = COORDS['FIRST_ROW_Y'] + (row_num * COORDS['ROW_HEIGHT']) + COORDS['POWER_Y_OFFSET'] + y_offset
    y2 = y1 + COORDS['ROW_HEIGHT']
    x1, x2 = COORDS['POWER_X1'], COORDS['POWER_X2']
    
    cropped = img.crop((x1, y1, x2, y2))
    
    thresholds = [100, 130, 160, 190]
    results = []
    
    config = r'--psm 7 --oem 1 -c tessedit_char_whitelist=0123456789,'
    for t in thresholds:
        processed = preprocess_image(cropped, mode='numeric', threshold=t)
        text = pytesseract.image_to_string(processed, config=config).strip()
        text = text.replace(' ', '').replace(',', '').replace('O', '0').replace('o', '0')
        cleaned = ''.join(c for c in text if c.isdigit())
        if cleaned:
            results.append(cleaned)
    
    if not results:
        return None
        
    valid_results = [r for r in results if len(r) >= 6]
    if not valid_results:
        valid_results = results
        
    from collections import Counter
    counts = Counter(valid_results)
    most_common_val, count = counts.most_common(1)[0]
    
    if count >= 2:
        return most_common_val
    return max(valid_results, key=len)

def main():
    image_dir = 'kingshot_data'
    images = sorted([f for f in os.listdir(image_dir) if f.startswith('leaderboard_scroll_') and f.endswith('.png')])
    
    # We don't have the cumulative drift from the run, so we'll assume 0 for now
    # or try to calculate it if we have consecutive images.
    
    prev_img_path = None
    cumulative_drift = 0.0
    EXPECTED_SCROLL_PX = COORDS['ROW_HEIGHT'] * 8
    
    for img_name in images:
        img_path = os.path.join(image_dir, img_name)
        print(f"\nAnalyzing {img_name}...")
        
        try:
            img = Image.open(img_path)
            
            # Simple drift calc if consecutive
            if prev_img_path:
                from scraper.auto_scraper_tesseract import calculate_scroll_shift
                actual_shift = calculate_scroll_shift(prev_img_path, img_path)
                if actual_shift:
                    drift = actual_shift - EXPECTED_SCROLL_PX
                    cumulative_drift += drift
                    print(f"  [DRIFT] Cumulative: {cumulative_drift:+.1f}px")
            
            for row in range(COORDS['NUM_VISIBLE_ROWS']):
                power_str = ocr_power_from_row(img, row, y_offset=cumulative_drift)
                power = clean_power_value(power_str) if power_str else None
                
                status = "OK" if power and power >= 1000 else "SKIPPED"
                print(f"  Row {row+1}: Power={power_str} ({status})")
            
            img.close()
            prev_img_path = img_path
        except Exception as e:
            print(f"  Error analyzing {img_name}: {e}")

if __name__ == "__main__":
    main()

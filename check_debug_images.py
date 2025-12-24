
import os
from PIL import Image
import pytesseract
from scraper.auto_scraper_tesseract import COORDS, preprocess_image

TESSERACT_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

def main():
    debug_dir = 'kingshot_data/debug_ocr'
    # Get all player_..._power_t130_center.png files
    files = sorted([f for f in os.listdir(debug_dir) if '_power_t130_center.png' in f])
    
    # Check the last 10 files
    print(f"Checking last 10 power crops in {debug_dir}...")
    for f in files[-10:]:
        path = os.path.join(debug_dir, f)
        img = Image.open(path)
        # The image is already preprocessed (binarized/inverted)
        text = pytesseract.image_to_string(img, config='--psm 7').strip()
        print(f"File: {f} | OCR: {text}")

if __name__ == "__main__":
    main()

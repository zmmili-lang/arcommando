
import os
import sys
import argparse
import time
from PIL import Image, ImageOps, ImageFilter
import pytesseract
import numpy as np

# Use Tesseract from Program Files if available
TESSERACT_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
if os.path.exists(TESSERACT_PATH):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

DEBUG_DIR = 'kingshot_data/debug_ocr'

# Standard Coordinates (must match scraper)
# These are relative to the FULL ROW image (1080xRowHeight)
# Scraper uses X1=777, X2=997. Let's use similar, but maybe allow adjustments.
POWER_X1 = 777
POWER_X2 = 997

def preprocess_image(img, mode='baseline', threshold=130):
    """Apply various image processing techniques"""
    img = img.convert('L') # Grayscale
    
    if mode == 'baseline':
        # Standard: 2x scale, threshold, denoise
        img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
        img = img.point(lambda p: 255 if p > threshold else 0)
        img = img.filter(ImageFilter.MedianFilter(3))
        
    elif mode == 'scale_3x':
        img = img.resize((img.width * 3, img.height * 3), Image.LANCZOS)
        img = img.point(lambda p: 255 if p > threshold else 0)
        
    elif mode == 'binary_100':
        img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
        img = img.point(lambda p: 255 if p > 100 else 0)

    elif mode == 'binary_160':
        img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
        img = img.point(lambda p: 255 if p > 160 else 0)
        
    elif mode == 'otsu':
        import cv2
        img_np = np.array(img.resize((img.width * 2, img.height * 2), Image.LANCZOS))
        _, img_np = cv2.threshold(img_np, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        img = Image.fromarray(img_np)
        
    elif mode == 'invert':
        img = ImageOps.invert(img)
        img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
        # Auto contrast
        img = ImageOps.autocontrast(img)
        
    return img

def run_ocr(img, config='--psm 7 --oem 1 -c tessedit_char_whitelist=0123456789,'):
    try:
        text = pytesseract.image_to_string(img, config=config).strip()
        # Initial cleanup
        text = text.replace(' ', '').replace(',', '').replace('.', '')
        # Basic O/0 fix
        text = text.replace('O', '0').replace('o', '0')
        return ''.join(c for c in text if c.isdigit())
    except Exception:
        return ""

def analyze_full_rows(directory):
    if not os.path.exists(directory):
        print(f"❌ Directory not found: {directory}")
        return

    files = [f for f in os.listdir(directory) if f.endswith('_full.png')]
    files.sort()
    
    if not files:
        print(f"⚠️ No full row debug images found in {directory}")
        return

    print(f"🔍 Analyzing {len(files)} full row images...")
    print(f"{'FILENAME':<40} | {'BASELINE':<12} | {'SCALE 3X':<12} | {'TH 100':<12} | {'TH 160':<12} | {'INVERT':<12}")
    print("-" * 110)

    for filename in files:
        try:
            path = os.path.join(directory, filename)
            full_row = Image.open(path)
            
            # Crop Power Region (Standard)
            # Full row is 0-1080, height ~201
            # Scraper power X: 777-997
            power_crop = full_row.crop((POWER_X1, 0, POWER_X2, full_row.height))
            
            results = {}
            modes = ['baseline', 'scale_3x', 'binary_100', 'binary_160', 'invert']
            
            for mode in modes:
                processed = preprocess_image(power_crop, mode=mode)
                val = run_ocr(processed)
                results[mode] = val if val else "-"
            
            print(f"{filename:<40} | {results['baseline']:<12} | {results['scale_3x']:<12} | {results['binary_100']:<12} | {results['binary_160']:<12} | {results['invert']:<12}")
            
        except Exception as e:
            print(f"{filename:<40} | ERROR: {e}")

if __name__ == "__main__":
    analyze_full_rows(DEBUG_DIR)

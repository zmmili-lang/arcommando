import io
import json
import re
from google.cloud import vision

def detect_text(image_path, service_account_key_path):
    """
    Uses the Google Cloud Vision API to detect text in an image.
    Returns the full extracted text as a string.
    """
    # Initialize the client with your service account key
    client = vision.ImageAnnotatorClient.from_service_account_file(
        service_account_key_path
    )
    
    # Load the image
    with io.open(image_path, 'rb') as image_file:
        content = image_file.read()
    
    image = vision.Image(content=content)
    
    # Perform text detection
    response = client.text_detection(image=image)
    texts = response.text_annotations
    
    if texts:
        return texts[0].description  # First item contains all text
    else:
        return ""

def parse_leaderboard_data(full_text):
    """
    Parses the extracted text to create a list of leaderboard entries.
    Each entry contains rank, governor, and power.
    """
    leaderboard_data = []
    lines = full_text.strip().split('\n')
    
    for line in lines:
        line = line.strip()
        # Skip empty lines or header lines (don't start with a number)
        if not line or not re.match(r'^\d', line):
            continue
            
        # Split on any whitespace, but be careful with governor names
        parts = re.split(r'\s+', line)
        
        # We expect at least 3 parts: rank, governor, power
        if len(parts) >= 3:
            rank = parts[0]
            power = parts[-1].replace(',', '')  # Remove commas from power
            
            # Governor could be one or multiple parts between rank and power
            governor_parts = parts[1:-1]
            governor = ' '.join(governor_parts)
            
            # Validate that power is actually a number (not a header)
            if not power.replace(',', '').isdigit():
                continue
                
            try:
                leaderboard_data.append({
                    "rank": int(rank),
                    "governor": governor,
                    "power": int(power.replace(',', ''))
                })
            except ValueError:
                # Skip if conversion fails
                continue
    
    return leaderboard_data

def save_to_json(data, output_path):
    """Saves the parsed data to a JSON file."""
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Data saved to {output_path}")

def main():
    # ========== CONFIGURATION ==========
    # 1. Path to your image file
    IMAGE_PATH = "leaderboard_scroll_000.png"
    
    # 2. Path to your Google Cloud service account JSON key file
    #    Download this from Google Cloud Console
    SERVICE_ACCOUNT_KEY_PATH = "path/to/your/service-account-key.json"
    
    # 3. Output JSON file path
    OUTPUT_JSON_PATH = "leaderboard_data.json"
    # ===================================
    
    try:
        print("Step 1: Extracting text from image using Vision API...")
        extracted_text = detect_text(IMAGE_PATH, SERVICE_ACCOUNT_KEY_PATH)
        
        if not extracted_text:
            print("No text found in the image.")
            return
        
        print(f"Extracted text preview:\n{extracted_text[:200]}...\n")
        
        print("Step 2: Parsing leaderboard data...")
        leaderboard_entries = parse_leaderboard_data(extracted_text)
        
        print(f"Successfully parsed {len(leaderboard_entries)} entries.\n")
        
        print("Step 3: Saving to JSON file...")
        save_to_json(leaderboard_entries, OUTPUT_JSON_PATH)
        
        # Show first few entries as a preview
        print("\nPreview of extracted data (first 5 entries):")
        for i, entry in enumerate(leaderboard_entries[:5]):
            print(f"  {entry['rank']:>5}. {entry['governor'][:20]:<20} {entry['power']:,}")
            
    except FileNotFoundError as e:
        print(f"Error: File not found - {e}")
        print("Please check your file paths.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
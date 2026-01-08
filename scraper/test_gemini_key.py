import requests
import json
import time

API_KEY = "AIzaSyAjs5rCA4fdmLCVlAcZmsifPcOyYyF7ezY"

def print_clean(msg):
    # Print and flush to avoid garbling
    print(msg, flush=True)
    time.sleep(0.1)

def test_list_models():
    # Try v1beta
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"
    print_clean(f"Testing List Models (v1beta): {url.replace(API_KEY, 'API_KEY')}")
    
    try:
        resp = requests.get(url)
        if resp.status_code == 200:
            print_clean("✅ Success (v1beta)!")
            for m in resp.json().get('models', []):
                if 'generateContent' in m['supportedGenerationMethods']:
                    print_clean(f"   Model: {m['name']}")
        else:
            print_clean(f"❌ Failed (v1beta): {resp.status_code}")
            print_clean(json.dumps(resp.json(), indent=2))
    except Exception as e:
        print_clean(f"❌ Exception: {e}")

def test_generate():
    # Try gemini-1.5-flash
    models = ["gemini-1.5-flash", "gemini-pro", "gemini-1.0-pro"]
    
    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}"
        print_clean(f"\nTesting Generation with {model}...")
        
        payload = {
            "contents": [{"parts": [{"text": "Hello"}]}]
        }
        
        try:
            resp = requests.post(url, json=payload)
            if resp.status_code == 200:
                print_clean(f"✅ Success with {model}!")
                return # Found working model
            else:
                print_clean(f"❌ Failed: {resp.status_code}")
                # Only print error once
                if model == "gemini-1.5-flash":
                     print_clean(json.dumps(resp.json(), indent=2))
        except Exception as e:
            print_clean(f"❌ Exception: {e}")

if __name__ == "__main__":
    test_list_models()
    test_generate()

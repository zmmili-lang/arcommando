"""
Network Traffic Capture for Kingshot Game Analysis
Captures logcat output to find HTTP/API endpoints and data structures
"""

import subprocess
import re
import json
from datetime import datetime
import time

def capture_logcat(duration_seconds=60, filter_keywords=None):
    """
    Capture Android logcat and filter for network-related activity
    
    Args:
        duration_seconds: How long to capture (default: 60 seconds)
        filter_keywords: List of keywords to filter for (default: HTTP-related)
    """
    if filter_keywords is None:
        filter_keywords = ['http', 'url', 'api', 'request', 'response', 'json', 'endpoint', 'server']
    
    print("=" * 70)
    print("KINGSHOT NETWORK TRAFFIC CAPTURE")
    print("=" * 70)
    print(f"Duration: {duration_seconds} seconds")
    print(f"Filtering for: {', '.join(filter_keywords)}")
    print("\nInstructions:")
    print("  1. Make sure your phone is connected via ADB")
    print("  2. Open the Kingshot game")
    print("  3. Navigate through different screens (leaderboard, profile, alliance, etc.)")
    print("  4. This script will capture network-related log entries")
    print("\nPress Ctrl+C to stop early\n")
    print("=" * 70)
    
    # Clear logcat buffer first
    subprocess.run(['adb', 'logcat', '-c'], capture_output=True)
    
    print(f"\n>> Starting capture... (will run for {duration_seconds} seconds)\n")
    
    # Start logcat capture
    process = subprocess.Popen(
        ['adb', 'logcat'],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    
    captured_lines = []
    found_urls = set()
    found_endpoints = set()
    start_time = time.time()
    
    try:
        while time.time() - start_time < duration_seconds:
            line = process.stdout.readline()
            if not line:
                break
            
            # Check if line contains any of our filter keywords
            line_lower = line.lower()
            if any(keyword in line_lower for keyword in filter_keywords):
                captured_lines.append(line.strip())
                print(f"[+] {line.strip()}")
                
                # Extract URLs
                url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
                urls = re.findall(url_pattern, line)
                for url in urls:
                    found_urls.add(url)
                    print(f"   |-- URL: {url}")
                
                # Extract JSON-like patterns
                if '{' in line and '}' in line:
                    try:
                        # Try to extract JSON
                        json_match = re.search(r'\{.*\}', line)
                        if json_match:
                            json_str = json_match.group()
                            # Try to parse it
                            try:
                                data = json.loads(json_str)
                                print(f"   |-- JSON DATA: {json.dumps(data, indent=2)}")
                            except:
                                pass
                    except:
                        pass
    
    except KeyboardInterrupt:
        print("\n\n[!] Capture stopped by user")
    finally:
        process.terminate()
    
    # Save results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"traffic_capture_{timestamp}.txt"
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("KINGSHOT NETWORK TRAFFIC CAPTURE\n")
        f.write(f"Captured at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Duration: {int(time.time() - start_time)} seconds\n")
        f.write("=" * 70 + "\n\n")
        
        if found_urls:
            f.write("DISCOVERED URLs:\n")
            f.write("-" * 70 + "\n")
            for url in sorted(found_urls):
                f.write(f"  - {url}\n")
            f.write("\n")
        
        f.write("FULL CAPTURE LOG:\n")
        f.write("-" * 70 + "\n")
        for line in captured_lines:
            f.write(line + "\n")
    
    # Summary
    print("\n" + "=" * 70)
    print("CAPTURE SUMMARY")
    print("=" * 70)
    print(f"Total filtered lines captured: {len(captured_lines)}")
    print(f"Unique URLs discovered: {len(found_urls)}")
    
    if found_urls:
        print("\n>> DISCOVERED URLs:")
        for url in sorted(found_urls):
            print(f"  • {url}")
            
            # Try to identify the base domain and API path
            match = re.match(r'(https?://[^/]+)(.*)', url)
            if match:
                base_url, path = match.groups()
                if path and path != '/':
                    found_endpoints.add(f"{base_url} → {path}")
    
    if found_endpoints:
        print("\n>> API ENDPOINTS:")
        for endpoint in sorted(found_endpoints):
            print(f"  • {endpoint}")
    
    print(f"\n[*] Full results saved to: {output_file}")
    print("=" * 70)
    
    return captured_lines, found_urls

if __name__ == "__main__":
    import sys
    
    # Check if ADB is available
    try:
        result = subprocess.run(['adb', 'devices'], capture_output=True, text=True)
        if 'device' not in result.stdout:
            print("❌ No ADB devices connected!")
            print("Please connect your phone via USB and enable USB debugging.")
            sys.exit(1)
    except FileNotFoundError:
        print("❌ ADB not found!")
        print("Please install Android Platform Tools (adb).")
        sys.exit(1)
    
    # Get duration from command line argument
    duration = 60
    if len(sys.argv) > 1:
        try:
            duration = int(sys.argv[1])
        except:
            print(f"Invalid duration: {sys.argv[1]}, using default (60 seconds)")
    
    # Run capture
    capture_logcat(duration_seconds=duration)

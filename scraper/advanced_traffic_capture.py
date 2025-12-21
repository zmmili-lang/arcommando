"""
Advanced Network Traffic Capture using TCPDump
Captures raw network packets for detailed analysis
"""

import subprocess
import time
from datetime import datetime
import os

def capture_with_tcpdump(duration_seconds=60, output_file=None):
    """
    Capture network traffic using tcpdump via ADB
    
    Args:
        duration_seconds: How long to capture
        output_file: Optional output PCAP file name
    """
    if output_file is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"game_traffic_{timestamp}.pcap"
    
    remote_pcap = f"/sdcard/{output_file}"
    
    print("=" * 70)
    print("ADVANCED NETWORK TRAFFIC CAPTURE - TCPDump")
    print("=" * 70)
    print(f"Duration: {duration_seconds} seconds")
    print(f"Output: {output_file}")
    print("\nInstructions:")
    print("  1. Make sure your phone is connected via ADB")
    print("  2. Open the Kingshot game")
    print("  3. Navigate through the game (leaderboard, profiles, etc.)")
    print("  4. This will capture ALL network packets")
    print("\nPress Ctrl+C to stop early\n")
    print("=" * 70)
    
    # Check if phone is rooted (tcpdump requires root usually)
    # But we can try anyway
    print("\n>> Starting packet capture...")
    print(f">> Remote file: {remote_pcap}")
    
    # Start tcpdump on the device
    # Filter for game traffic only (port 443 for HTTPS, 80 for HTTP)
    tcpdump_cmd = [
        'adb', 'shell',
        'su', '-c',
        f'tcpdump -i any -s 0 -w {remote_pcap}'
    ]
    
    print(f"\n>> Command: {' '.join(tcpdump_cmd)}")
    print(">> If this fails with 'su: not found', your device is not rooted")
    print(">> Attempting without root (may have limited capabilities)...\n")
    
    # Try without root first
    tcpdump_cmd_noroot = [
        'adb', 'shell',
        f'tcpdump -i any -s 0 -w {remote_pcap}'
    ]
    
    try:
        print(">> Attempting capture (no root)...")
        process = subprocess.Popen(
            tcpdump_cmd_noroot,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Let it run for specified duration
        start_time = time.time()
        try:
            while time.time() - start_time < duration_seconds:
                time.sleep(1)
                print(f">> Capturing... {int(time.time() - start_time)}s / {duration_seconds}s", end='\r')
        except KeyboardInterrupt:
            print("\n\n>> Capture stopped by user")
        
        # Stop tcpdump
        process.terminate()
        time.sleep(2)
        
        # Pull the file
        print(f"\n\n>> Pulling capture file from device...")
        pull_cmd = ['adb', 'pull', remote_pcap, '.']
        result = subprocess.run(pull_cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f">> Successfully saved to: {output_file}")
            
            # Get file size
            if os.path.exists(output_file):
                size = os.path.getsize(output_file)
                print(f">> File size: {size:,} bytes")
                
                if size > 0:
                    print("\n" + "=" * 70)
                    print("NEXT STEPS:")
                    print("=" * 70)
                    print(f"1. Open {output_file} in Wireshark")
                    print("2. Filter by:")
                    print("   - 'tcp.port == 443' (HTTPS traffic)")
                    print("   - 'tcp.port == 80' (HTTP traffic)")
                    print("   - 'dns' (DNS queries)")
                    print("3. Look for game server domains")
                    print("4. Analyze packet patterns and timing")
                    print("=" * 70)
                else:
                    print("\n>> WARNING: Capture file is empty!")
                    print(">> This usually means:")
                    print("   - tcpdump doesn't have permission (need root)")
                    print("   - No network activity during capture")
        else:
            print(f">> Failed to pull file: {result.stderr}")
        
        # Cleanup remote file
        subprocess.run(['adb', 'shell', 'rm', remote_pcap], capture_output=True)
        
    except Exception as e:
        print(f"\n>> Error: {e}")
        print("\n>> TCPDump capture failed. Possible reasons:")
        print("   1. Device is not rooted")
        print("   2. tcpdump is not installed on device")
        print("   3. Insufficient permissions")
        print("\n>> Alternative: Try logcat-based capture (which we already did)")
        print(">> Or: Use mitmproxy with SSL certificate")

def analyze_pcap(pcap_file):
    """
    Analyze PCAP file (requires Wireshark/tshark)
    """
    print(f"\nAnalyzing {pcap_file}...")
    
    # Check if tshark is available
    try:
        # Extract HTTP requests
        cmd = ['tshark', '-r', pcap_file, '-Y', 'http.request', '-T', 'fields', '-e', 'http.request.full_uri']
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0 and result.stdout:
            print("\n>> HTTP Requests Found:")
            for url in result.stdout.strip().split('\n'):
                print(f"   {url}")
        else:
            print(">> No HTTP requests found (all HTTPS probably)")
        
        # Extract DNS queries
        cmd = ['tshark', '-r', pcap_file, '-Y', 'dns.qry.name', '-T', 'fields', '-e', 'dns.qry.name']
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0 and result.stdout:
            print("\n>> DNS Queries Found:")
            domains = set(result.stdout.strip().split('\n'))
            for domain in sorted(domains):
                if domain:
                    print(f"   {domain}")
        
    except FileNotFoundError:
        print("\n>> tshark not found. Install Wireshark to analyze PCAP files.")
        print(f">> Or open {pcap_file} manually in Wireshark")

if __name__ == "__main__":
    import sys
    
    # Check ADB connection
    try:
        result = subprocess.run(['adb', 'devices'], capture_output=True, text=True)
        if 'device' not in result.stdout:
            print(">> No ADB devices connected!")
            print(">> Please connect your phone via USB")
            sys.exit(1)
    except FileNotFoundError:
        print(">> ADB not found!")
        sys.exit(1)
    
    # Get duration from command line
    duration = 60
    if len(sys.argv) > 1:
        try:
            duration = int(sys.argv[1])
        except:
            print(f"Invalid duration: {sys.argv[1]}, using default (60 seconds)")
    
    # Run capture
    capture_with_tcpdump(duration_seconds=duration)

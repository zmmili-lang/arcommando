"""
WiFi Proxy Setup Helper for Network Sniffing
Automates mitmproxy setup and provides configuration instructions
"""

import subprocess
import socket
import sys
import time

def get_local_ip():
    """Get PC's local IP address on WiFi network"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Connect to a public DNS server to determine local IP
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    finally:
        s.close()
    return ip

def check_mitmproxy_installed():
    """Check if mitmproxy is installed"""
    try:
        result = subprocess.run(['mitmweb', '--version'], capture_output=True, text=True)
        return True
    except FileNotFoundError:
        return False

def start_mitmproxy():
    """Start mitmproxy web interface"""
    print("\n>> Starting mitmproxy web interface...")
    print(">> This will open a web UI at http://localhost:8081")
    
    # Start mitmweb in a subprocess
    process = subprocess.Popen(
        ['mitmweb', '--listen-host', '0.0.0.0', '--listen-port', '8080', '--web-port', '8081'],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    # Give it time to start
    time.sleep(3)
    
    return process

def print_instructions(pc_ip):
    """Print step-by-step instructions"""
    print("\n" + "="*70)
    print("WiFi PROXY SETUP - STEP BY STEP INSTRUCTIONS")
    print("="*70)
    
    print(f"\n📱 CONFIGURE YOUR PHONE:")
    print(f"   1. Go to WiFi Settings")
    print(f"   2. Long-press your current WiFi network")
    print(f"   3. Select 'Modify network' or 'Advanced'")
    print(f"   4. Set Proxy to 'Manual'")
    print(f"   5. Proxy hostname: {pc_ip}")
    print(f"   6. Proxy port: 8080")
    print(f"   7. Save")
    
    print(f"\n🔐 INSTALL CERTIFICATE (REQUIRED FOR HTTPS):")
    print(f"   1. On your phone, open browser")
    print(f"   2. Go to: http://mitm.it")
    print(f"   3. Download 'Android' certificate")
    print(f"   4. Install it:")
    print(f"      - Settings → Security → Install from storage")
    print(f"      - Name it 'mitmproxy'")
    print(f"      - Select 'VPN and apps' or 'WiFi'")
    
    print(f"\n🎮 START CAPTURING:")
    print(f"   1. Open the Kingshot game")
    print(f"   2. Navigate through different screens")
    print(f"   3. Watch traffic in web UI: http://localhost:8081")
    
    print(f"\n💻 WHAT TO LOOK FOR:")
    print(f"   - Domain names (e.g., api.game.com)")
    print(f"   - Request URLs (e.g., /api/leaderboard)")
    print(f"   - JSON responses with player data")
    print(f"   - Authentication tokens/headers")
    
    print(f"\n⚠️  IF NO TRAFFIC APPEARS:")
    print(f"   - Game uses certificate pinning (blocks MITM)")
    print(f"   - Try Option 2: PCAPdroid app (see implementation plan)")
    print(f"   - Or Option 3: Frida SSL unpinning (advanced)")
    
    print("\n" + "="*70)

def main():
    print("="*70)
    print("WIFI PROXY NETWORK SNIFFER SETUP")
    print("="*70)
    
    # Check if mitmproxy is installed
    if not check_mitmproxy_installed():
        print("\n❌ mitmproxy not found!")
        print("\nPlease install mitmproxy first:")
        print("  Option 1: pip install mitmproxy")
        print("  Option 2: Download from https://mitmproxy.org/")
        sys.exit(1)
    
    print("\n✅ mitmproxy is installed")
    
    # Get local IP
    try:
        pc_ip = get_local_ip()
        print(f"✅ Your PC IP address: {pc_ip}")
    except Exception as e:
        print(f"\n❌ Could not determine local IP: {e}")
        print("\nPlease find your WiFi IP manually:")
        print("  Windows: ipconfig")
        print("  Look for 'Wireless LAN adapter WiFi' → IPv4 Address")
        sys.exit(1)
    
    # Print instructions
    print_instructions(pc_ip)
    
    # Confirm before starting
    print("\n" + "="*70)
    response = input("Ready to start mitmproxy? (yes/no): ").lower()
    
    if response != 'yes':
        print("\nSetup cancelled.")
        sys.exit(0)
    
    # Start mitmproxy
    try:
        process = start_mitmproxy()
        
        print("\n✅ mitmproxy is running!")
        print(f"\n📊 Web Interface: http://localhost:8081")
        print(f"🔌 Proxy Address: {pc_ip}:8080")
        print("\nPress Ctrl+C to stop capturing...")
        
        # Keep running until interrupted
        try:
            process.wait()
        except KeyboardInterrupt:
            print("\n\n>> Stopping mitmproxy...")
            process.terminate()
            time.sleep(2)
            
            print("\n>> Capture stopped!")
            print(">> To remove proxy from phone:")
            print("   WiFi Settings → Long-press network → Modify → Proxy: None")
            
    except Exception as e:
        print(f"\n❌ Error starting mitmproxy: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

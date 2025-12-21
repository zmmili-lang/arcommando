"""
Test WebSocket/TCP Connection to Game Gateway Servers
"""

import socket
import ssl
import asyncio
import websockets
import json

# Gateway servers from API discovery
GATEWAYS = [
    "got-formal-gateway-ga.chosenonegames.com",
    "got-formal-gateway-cf.chosenonegames.com",
    "got-formal-gateway-nlb.chosenonegames.com",
    "34.218.200.229"
]
PORT = 30101

def test_tcp_connection(host, port):
    """Test raw TCP connection"""
    print(f"\n[TCP] Testing connection to {host}:{port}")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, port))
        print(f"  ✅ TCP connection successful!")
        
        # Try to receive any initial data
        sock.settimeout(2)
        try:
            data = sock.recv(1024)
            if data:
                print(f"  📦 Received data: {data[:100]}")
        except socket.timeout:
            print(f"  ⏰ No initial data received (timeout)")
        
        sock.close()
        return True
    except Exception as e:
        print(f"  ❌ Failed: {e}")
        return False

def test_tls_connection(host, port):
    """Test TLS/SSL connection"""
    print(f"\n[TLS] Testing TLS connection to {host}:{port}")
    try:
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        
        tls_sock = context.wrap_socket(sock, server_hostname=host)
        tls_sock.connect((host, port))
        
        print(f"  ✅ TLS connection successful!")
        print(f"  🔐 Cipher: {tls_sock.cipher()}")
        
        # Try to receive data
        tls_sock.settimeout(2)
        try:
            data = tls_sock.recv(1024)
            if data:
                print(f"  📦 Received data: {data[:100]}")
        except socket.timeout:
            print(f"  ⏰ No initial data received (timeout)")
        
        tls_sock.close()
        return True
    except Exception as e:
        print(f"  ❌ Failed: {e}")
        return False

async def test_websocket_connection(host, port):
    """Test WebSocket connection"""
    ws_url = f"ws://{host}:{port}"
    wss_url = f"wss://{host}:{port}"
    
    # Try plain WebSocket first
    print(f"\n[WS] Testing WebSocket connection to {ws_url}")
    try:
        async with websockets.connect(ws_url, timeout=5) as websocket:
            print(f"  ✅ WebSocket connection successful!")
            
            # Try to receive any initial message
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=2)
                print(f"  📦 Received message: {message[:100]}")
            except asyncio.TimeoutError:
                print(f"  ⏰ No initial message received (timeout)")
            
            return True
    except Exception as e:
        print(f"  ❌ WS Failed: {e}")
    
    # Try secure WebSocket
    print(f"\n[WSS] Testing secure WebSocket to {wss_url}")
    try:
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        async with websockets.connect(wss_url, ssl=ssl_context, timeout=5) as websocket:
            print(f"  ✅ Secure WebSocket connection successful!")
            
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=2)
                print(f"  📦 Received message: {message[:100]}")
            except asyncio.TimeoutError:
                print(f"  ⏰ No initial message received (timeout)")
            
            return True
    except Exception as e:
        print(f"  ❌ WSS Failed: {e}")
    
    return False

def main():
    print("="*70)
    print("GAME GATEWAY SERVER CONNECTION TESTING")
    print("="*70)
    print("\nTesting multiple protocols: TCP, TLS, WebSocket, WSS")
    print("This will help us understand how the game communicates.\n")
    
    for gateway in GATEWAYS[:2]:  # Test first 2 to save time
        print("\n" + "="*70)
        print(f"Testing: {gateway}")
        print("="*70)
        
        # Test TCP
        tcp_works = test_tcp_connection(gateway, PORT)
        
        # Test TLS
        tls_works = test_tls_connection(gateway, PORT)
        
        # Test WebSocket
        try:
            ws_works = asyncio.run(test_websocket_connection(gateway, PORT))
        except Exception as e:
            print(f"\n[WS] WebSocket test failed: {e}")
            ws_works = False
        
        print(f"\n📊 Results for {gateway}:")
        print(f"  TCP: {'✅' if tcp_works else '❌'}")
        print(f"  TLS: {'✅' if tls_works else '❌'}")
        print(f"  WebSocket: {'✅' if ws_works else '❌'}")
    
    print("\n" + "="*70)
    print("CONCLUSION")
    print("="*70)
    print("""
If TCP works: Game uses raw TCP protocol (likely binary)
If TLS works: Game uses encrypted TCP (likely binary Protocol Buffers)
If WebSocket works: Game uses WebSocket (might be readable)

The game data is likely NOT going through mitmproxy because:
- mitmproxy is an HTTP/HTTPS proxy
- Raw TCP/TLS connections bypass HTTP proxies
- Only HTTP Upgrade → WebSocket would be visible in mitmproxy
    """)

if __name__ == "__main__":
    main()

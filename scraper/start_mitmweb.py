#!/usr/bin/env python3
"""
Simple wrapper to start mitmweb
"""
import sys
from mitmproxy.tools import main

if __name__ == "__main__":
    # Start mitmweb with the specified arguments
    sys.argv = [
        'mitmweb',
        '--listen-host', '0.0.0.0',
        '--listen-port', '8080',
        '--web-port', '8081'
    ]
    
    # Run mitmweb
    main.mitmweb()

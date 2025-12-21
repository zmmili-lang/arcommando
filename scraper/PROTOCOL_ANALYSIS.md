# Gateway Protocol Analysis - CONFIRMED

## Test Results ✅

**Protocol Testing Completed**: 2025-12-20

### Results Summary

| Protocol | Status | Notes |
|----------|--------|-------|
| **TCP** | ✅ **WORKING** | Raw TCP connection successful |
| **TLS/SSL** | ❌ Failed | Handshake timeout (not using encryption) |
| **WebSocket** | ❌ Failed | Not using WebSocket protocol |
| **WSS** | ❌ Failed | Not using secure WebSocket |

## Conclusion

### The Game Uses: Raw TCP Binary Protocol

**Gateway Communication:**
- **Port**: 30101
- **Protocol**: Raw TCP (not HTTP, not WebSocket)
- **Data Format**: Binary (likely Protocol Buffers or custom binary format)
- **Encryption**: None at TCP level (may have application-layer encryption)

### Why mitmproxy Can't Capture Game Data

```
┌─────────────┐
│   PHONE     │
└──────┬──────┘
       │
       ├──> HTTP/HTTPS (port 443) ──> API Server ──> ✅ mitmproxy SEES this
       │     (version check only)
       │
       └──> Raw TCP (port 30101) ──> Gateway ──> ❌ mitmproxy BYPASSED
            (all game data: leaderboard, player info, etc.)
```

**mitmproxy is an HTTP/HTTPS proxy**:
- ✅ Can intercept HTTP REST APIs
- ✅ Can intercept WebSocket (if HTTP Upgrade used)
- ❌ **Cannot intercept raw TCP connections**

The game makes ONE HTTP request (version check), then switches to direct TCP connection for all actual gameplay data.

## What This Means

### Captured via mitmproxy:
- ✅ Version check API
- ✅ Domain names (`got-gm-api-formal.chosenonegames.com`)
- ✅ Gateway server addresses
- ✅ Your kingdom ID (716)
- ❌ **No leaderboard data**
- ❌ **No player profiles**
- ❌ **No game state**

### To Capture Game Data, Would Need:

#### Option 1: Packet Capture (Wireshark/tcpdump)
**What it provides:**
- Raw TCP packets to/from gateways
- Binary data (encrypted/encoded)
- Packet timing and sizes

**What it DOESN'T provide:**
- Readable player names
- Readable power scores
- Decoded leaderboard JSON

**Next steps:**
- Capture packets with Wireshark filtering `tcp.port == 30101`
- Attempt to decode binary protocol
- Reverse engineer the data format

#### Option 2: Protocol Reverse Engineering
**Requirements:**
- Deep packet inspection
- Binary protocol analysis
- Possibly decompile game client
- Decode Protocol Buffers or custom binary format

**Difficulty**: ⭐⭐⭐⭐⭐ (Expert level)
**Time**: Days to weeks
**Risk**: High (may violate ToS)

#### Option 3: Memory Inspection (Frida/Cheat Engine)
**What it provides:**
- Direct access to game memory
- Decoded player data before encryption
- Real-time game state

**Requirements:**
- Root access or Frida
- Game memory layout knowledge
- Hooking/injection skills

**Difficulty**: ⭐⭐⭐⭐⭐ (Expert level)
**Risk**: Very high (anti-cheat, ban risk)

## Final Recommendation

### ✅ Stick with OCR-Based Scraping

**Reasoning:**
1. **Already working** - Captures 100+ players successfully
2. **Safe** - No ToS violations, no ban risk
3. **Reliable** - Gets all visible data (name, power)
4. **Simple** - No complex reverse engineering needed

**Why network capture won't help:**
- Game data is in **binary TCP protocol**
- Would require **protocol reverse engineering**
- Even with packet data, it's **encrypted/encoded**
- **Weeks of work** for same data OCR already provides

### What We Learned from Network Analysis

**Valuable discoveries:**
- ✅ Game server infrastructure
- ✅ Gateway addresses (for monitoring uptime)
- ✅ Kingdom system (ID: 716)
- ✅ API domain for version checks
- ✅ Confirmed custom TCP protocol (explains why no public API docs)

**For leaderboard tracking:**
- OCR scraping remains the best solution
- Database storage already implemented
- Web UI already created
- No further network analysis needed

---

## Technical Deep Dive (For Reference)

### Packet Capture Example

If you wanted to try capturing the binary protocol anyway:

```bash
# Start Wireshark
# Filter: tcp.port == 30101

# Or use tcpdump
adb shell tcpdump -i any -w /sdcard/game.pcap port 30101
adb pull /sdcard/game.pcap
```

You'd see bytes like:
```
00 01 02 03 0A 1F 3C ...  (binary data)
```

### Decoding Steps (Advanced)
1. Capture packets during known actions (open leaderboard)
2. Analyze packet patterns
3. Identify message delimiters
4. Attempt to match to Protocol Buffer schemas
5. Reverse engineer data structures

**Estimated effort**: 40-80 hours minimum

---

## Conclusion

The network sniffing investigation was successful! We now understand the game architecture:

- **HTTP API** (mitmproxy ✅): Version checks, possibly shop/events
- **TCP Gateway** (mitmproxy ❌): All main game data (binary protocol)

For your leaderboard tracking needs, **OCR scraping is the optimal solution**. The binary TCP protocol would require significant reverse engineering effort for data that OCR already provides in a simpler, safer manner.

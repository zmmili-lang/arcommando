# Network Traffic Analysis Report - Kingshot Game

## Summary
Analysis of captured network traffic from the Kingshot game (`com.run.tower.defense`) to identify potential API endpoints and data structures.

## Capture Method 1: Logcat (Completed)
**Duration**: 60 seconds  
**File**: `traffic_capture_20251220_201527.txt`

### Key Findings

#### 1. Game Network Activity Confirmed
The game actively makes network requests:
- **Line 52**: `DNS Requested by 144, 10045(com.run.tower.defense), SUCCESS, 17ms`
- **Line 437**: `DNS Requested by 144, 10045(com.run.tower.defense), SUCCESS, 46ms`
- **Line 528**: `DNS Requested by 144, 10045(com.run.tower.defense), SUCCESS, 19ms`

#### 2. Traffic is Encrypted
- **No HTTP URLs found** - All game communication appears to be HTTPS
- **No plain JSON data** - All payloads are encrypted
- This confirms the game uses proper security practices

#### 3. Non-Game URLs Discovered
**Amazon Devices Metrics** (Lines 8, 348-349):
```
https://d7ae3d206ce5366b0f0105dc74e8b013274baf9c15fd9588c12a576fa3ac95c.us-east-1.prod.service.minerva.devices.a2z.com:443/metric-batch
```
- This is Amazon device telemetry, not game data
- Confirms phone is making successful HTTPS connections

#### 4. Game Package Namespace
Confirmed: `com.run.tower.defense`

### Limitations of Logcat Method
- ✅ Can see DNS requests (confirms game is online)
- ✅ Can see connection events
- ❌ Cannot see HTTPS payload data (encrypted)
- ❌ Cannot see server domain names (only sees that DNS succeeded)
- ❌ Cannot see API endpoints or routes

## Next Steps: Advanced Capture Methods

### Method 2: TCPDump (Recommended Next)
**What it captures**:
- Raw network packets
- Can see destination IPs and ports
- Can see TLS handshakes (but not decrypt)
- Can analyze timing and patterns

**Requirements**:
- ADB access (✅ already have)
- May require root (device-dependent)
- Wireshark for analysis

**Output**: PCAP file for detailed analysis

### Method 3: MitmProxy (Most Powerful, Most Complex)
**What it captures**:
- Decrypted HTTPS traffic
- Full request/response bodies
- All API endpoints and data structures

**Requirements**:
- Install mitmproxy CA certificate on device
- Configure phone to use proxy
- **Will fail if game uses certificate pinning** (likely does)

**Risk**: May be blocked by the game

### Method 4: Frida (Advanced)
**What it can do**:
- Hook into game code directly
- Intercept data before encryption
- Bypass certificate pinning

**Requirements**:
- Root or Frida server
- Reverse engineering knowledge
- More complex setup

## Analysis of DNS Patterns

From the capture, we see the game makes DNS requests approximately:
- Every ~30 seconds during active play
- Suggests regular API polling (possibly for leaderboard updates)
- 17-46ms response times indicate fast servers

## Game Architecture Hypothesis

Based on the traffic patterns:
1. **Client-Server Model**: Game communicates with remote servers
2. **HTTPS Only**: All communication is encrypted
3. **Regular Polling**: Periodic network activity suggests API calls
4. **Low Latency**: Fast DNS responses indicate nearby or optimized servers

## Recommendations

### For Reliable Data Collection
**Current OCR Method** (Recommended):
- ✅ Already working
- ✅ Captures 100+ players successfully
- ✅ No risk of ban
- ✅ No complex setup
- ❌ Manual/automated scraping required
- ❌ No real-time updates

### For Enhanced Data Collection
**Hybrid Approach**:
1. **Continue OCR** for leaderboard data
2. **Use TCPDump** to identify:
   - Game server IP addresses
   - Connection patterns
   - API call frequency
3. **Document patterns** but don't try to decrypt

### Why Not Decrypt?
1. **Technical**: Certificate pinning likely blocks MITM
2. **Legal**: Terms of Service may prohibit
3. **Practical**: OCR already provides needed data
4. **Risk**: Could result in account ban

## Discovered Game Data (Non-API)

### From OCR Scraping
- Player names
- Power levels
- Limited alliance info (visible in names like `[AVN]`, `[ARC]`)

### Missing UIDs
- **Problem**: In-game UIDs not visible in UI
- **Impact**: Cannot track player name changes
- **Solution**: Manual merge database feature (already planned)

## Conclusion

The game uses modern security practices with encrypted HTTPS traffic. While we can confirm network activity, accessing the actual API data would require:
- Breaking encryption (MITM with certificate pinning bypass)
- Code injection (Frida hooking)
- Both carry risks and may violate ToS

**Recommendation**: Stick with OCR-based scraping for the general leaderboard, but for **high-fidelity data (UIDs, alliance IDs)**, we need to target the **GZipped JSON synchronization packets**.

### Data Access Roadmap
1.  **System CA Certificate**: Mandatory for Android 7+ to see HTTPS game data. Requires Root.
2.  **GZip Decoding**: Intercept requests to `got-gm-api-formal.chosenonegames.com` and decompress the responses.
3.  **Synchronization Packet**: Target the login sync which contains the "hidden" player parameters (UID, furnace level, etc.).

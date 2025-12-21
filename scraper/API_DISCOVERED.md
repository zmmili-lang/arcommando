# Game API Traffic Analysis - Captured Data

## Successfully Captured! ✅

### Game API Infrastructure Discovered

**Primary API Domain**: `got-gm-api-formal.chosenonegames.com`

**CDN Domain**: `got-global-cdn.akamaized.net` (Akamai CDN)

### Endpoints Discovered

#### 1. Version Check Endpoint
```
GET /api/version/info?platform=android&version=1.8.12&kingdom=716&language=en
Host: got-gm-api-formal.chosenonegames.com
```

**Query Parameters**:
- `platform`: android
- `version`: 1.8.12
- `kingdom`: **716** (YOUR KINGDOM ID!)
- `language`: en

**Response Data**:
```json
{
  "code": 1,
  "data": {
    "appVersion": "1.8.12",
    "weakVersion": "",
    "switch": 0,
    "hotFix": {
      "resVersion": "4",
      "url": "https://got-global-cdn.akamaized.net/RELEASE/1_8_12/android",
      "url_origin": "https://got-global-cdn.chosenonegames.com/RELEASE/1_8_12/android"
    },
    "maintain_data": [],
    "ip": [
      "got-formal-gateway-ga.chosenonegames.com:30101",
      "got-formal-gateway-cf.chosenonegames.com:30101",
      "got-formal-gateway-ipa.chosenonegames.com:30101",
      "got-formal-gateway-nlb.chosenonegames.com:30101",
      "34.218.200.229:30101"
    ],
    "ip_tag": [],
    "timestamp": 1766261521,
    "specator_ip": [
      "got-formal-spectator-nlb.chosenonegames.com:31601",
      "got-formal-spectator-ga.chosenonegames.com:31601",
      "52.25.169.149:31601"
    ]
  },
  "msg": "success"
}
```

### Gateway Servers (Port 30101)
These handle actual game traffic:
1. `got-formal-gateway-ga.chosenonegames.com:30101`
2. `got-formal-gateway-cf.chosenonegames.com:30101`
3. `got-formal-gateway-ipa.chosenonegames.com:30101`
4. `got-formal-gateway-nlb.chosenonegames.com:30101`
5. `34.218.200.229:30101` (Direct IP)

### Spectator Servers (Port 31601)
For watching gameplay:
1. `got-formal-spectator-nlb.chosenonegames.com:31601`
2. `got-formal-spectator-ga.chosenonegames.com:31601`
3. `52.25.169.149:31601`

## Analysis

### Why Only Version Check Appears

The game likely uses **TCP/WebSocket connections** to the gateway servers for actual gameplay data, not HTTP REST APIs. This is common for real-time games.

**Gateway Port 30101** suggests:
- Custom TCP protocol
- Possibly Protocol Buffers or similar binary protocol
- Not standard HTTP/HTTPS

### Your Kingdom ID: 716

This is visible in the version check request as `kingdom=716`. This might be useful for:
- Filtering leaderboard by kingdom
- Understanding server architecture

## Next Steps to Capture More Data

### Option 1: Check for WebSocket Connections
Look in mitmweb for:
- `ws://` or `wss://` protocol requests
- Upgrade headers
- WebSocket traffic to gateway servers

### Option 2: Navigate More in Game
Try these actions and watch mitmweb:
- **Open leaderboard** (might trigger API call)
- **Search for a player**
- **View player profile**
- **Check alliance list**
- **Open shop/events**
- **Claim rewards**

Any of these might trigger HTTP API calls.

### Option 3: Filter mitmweb by Domain
In mitmweb interface:
- Filter by: `~d chosenonegames.com`
- This will show ONLY game-related traffic
- Ignore Google/Facebook/ads

### Option 4: Capture TCP Traffic to Gateway
The gateway servers (port 30101) might use binary protocols. To capture:
- Use Wireshark
- Filter: `tcp.port == 30101`
- But data will likely be encrypted/binary

## Discovered Information Summary

| Item | Value |
|------|-------|
| **API Domain** | got-gm-api-formal.chosenonegames.com |
| **CDN** | got-global-cdn.akamaized.net (Akamai) |
| **Your Kingdom** | 716 |
| **Game Version** | 1.8.12 |
| **Gateway Port** | 30101 (TCP) |
| **Spectator Port** | 31601 (TCP) |
| **Protocol** | Likely custom TCP/binary, not HTTP REST |

## Recommendations

1. **Try more game actions** - Open leaderboard, profiles, alliance
2. **Look for WebSocket** connections in mitmweb
3. **Filter by domain** to see only game traffic
4. **Check if leaderboard data** comes via HTTP or TCP gateway

The fact we captured the version endpoint means the MITM is working! Keep exploring the game while watching mitmweb.

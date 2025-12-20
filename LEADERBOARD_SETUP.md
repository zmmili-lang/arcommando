# Leaderboard System - Setup Guide

## Quick Start

### 1. Install Python Dependencies

```bash
cd scraper
pip install -r requirements.txt
```

### 2. Configure Database Connection

Create a `.env` file in the `scraper/` directory:

```bash
cd scraper
cp .env.example .env
```

Edit `.env` and add your Neon database URL:

```env
DATABASE_URL=postgresql://[user]:[password]@[host]/[database]?sslmode=require
```

**Where to find your DATABASE_URL:**
- **Netlify Dashboard**: Settings → Environment Variables → Look for `NETLIFY_DATABASE_URL` or `DATABASE_URL`
- **Neon Dashboard**: Your project → Connection Details → Copy the connection string

### 3. Initialize Database Tables

The database tables will be created automatically when you first run the dev server:

```bash
# From project root
npm run netlify
```

This will trigger `ensureSchema()` which creates the new leaderboard tables.

### 4. Run the Scraper

```bash
cd scraper

# Run in auto mode
python auto_scraper.py
```

The scraper will:
- Launch the game on your phone
- Navigate to the leaderboard
- Scrape player data
- Save directly to the Neon database

**Output**: You should see a message like `💾 Saved 120 players to database`

### 5. View the Leaderboard

1. Open your app: `http://localhost:8888` (if using `npm run netlify`)
2. Login with admin password: `LFGARC`
3. Click **🏆 Leaderboard** in the sidebar
4. Search for players and click to view their profiles

---

## Usage

### Running the Scraper Regularly

To track power changes over time, run the scraper on a schedule:

```bash
# Windows Task Scheduler or manually
cd C:\Users\draga\Documents\Projects\ARCommando\scraper
python auto_scraper.py
```

**Recommendation**: Run 1-2 times per day to track daily power progression.

### Viewing Player History

1. Navigate to Leaderboard
2. Click on any player row
3. View:
   - Current rank and power
   - 24h and 7d power changes
   - Power progression chart
   - Complete history table

---

## Troubleshooting

### Database Connection Issues

**Error**: `❌ Database connection error`

**Solution**:
1. Check your `.env` file exists in `scraper/` directory
2. Verify `DATABASE_URL` is correct
3. Test connection from Node.js side by running `npm run netlify`

### No Data in Leaderboard

**Possible causes**:
1. Scraper hasn't run yet → Run `python auto_scraper.py`
2. Database URL not configured → Check `.env` file
3. Database tables not created → Run `npm run netlify` to trigger schema creation

### Scraper Falls Back to JSON

If you see: `⚠️ Database save failed, falling back to JSON file...`

**This means**:
- Database connection failed
- Data was saved to `scraper/kingshot_data/players.json` instead
- Fix the database connection and run scraper again

---

## API Endpoints

For reference, the leaderboard system provides:

- `GET /.netlify/functions/leaderboard-list` - All players with current power
- `GET /.netlify/functions/leaderboard-search?q=PlayerName` - Search players
- `GET /.netlify/functions/leaderboard-player?name=PlayerName` - Player profile with history

All endpoints require `x-admin-pass: LFGARC` header.

---

## Future Enhancements

### Duplicate Player Handling

Since the scraper only captures player names (no UID), players who change their in-game name will create duplicate entries.

**Current workaround**: Manual cleanup in database
**Future feature**: Admin UI to merge duplicate players (preserving all power history)

### Alliance Tracking

The game shows alliance info on the leaderboard. This could be captured in a future scraper enhancement to:
- Track alliance changes
- Show alliance power rankings
- Detect suspicious name changes (same power + alliance = likely same player)

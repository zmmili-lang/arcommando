# Cron Service Configuration Guide

## Quick Fix - Two Authentication Options

The scraper supports **two ways** to authenticate:

### Option 1: Header (Recommended)
Add header: `x-cron-secret: f0f7dcef970dc295a49287b80f955197c2732c7c1faed5c17b17215299f20528`

### Option 2: Query Parameter (Easier for some cron services)
Use URL: `https://resonant-seahorse-7d6217.netlify.app/.netlify/functions/scrape-codes?secret=f0f7dcef970dc295a49287b80f955197c2732c7c1faed5c17b17215299f20528`

## Cron-Job.org Setup (Step-by-Step)

### Using Header Method:

1. Go to https://cron-job.org and sign in
2. Click "Create cronjob"
3. Fill in:
   - **Title**: Kingshot Code Scraper
   - **URL**: `https://resonant-seahorse-7d6217.netlify.app/.netlify/functions/scrape-codes`
   - **Schedule**: Choose "Every 10 minutes"
   - **Request method**: `POST`
4. Click "Headers" tab
5. Click "Add header"
6. Enter:
   - **Name**: `x-cron-secret`
   - **Value**: `f0f7dcef970dc295a49287b80f955197c2732c7c1faed5c17b17215299f20528`
7. Save and Enable

### Using Query Parameter Method (If headers don't work):

1. Go to https://cron-job.org and sign in
2. Click "Create cronjob"
3. Fill in:
   - **Title**: Kingshot Code Scraper  
   - **URL**: `https://resonant-seahorse-7d6217.netlify.app/.netlify/functions/scrape-codes?secret=f0f7dcef970dc295a49287b80f955197c2732c7c1faed5c17b17215299f20528`
   - **Schedule**: Choose "Every 10 minutes"
   - **Request method**: `POST`
4. Save and Enable

## Alternative: EasyCron.com

If cron-job.org doesn't work, try EasyCron:

1. Sign up at https://www.easycron.com (free tier available)
2. Create new cron job
3. URL: `https://resonant-seahorse-7d6217.netlify.app/.netlify/functions/scrape-codes?secret=f0f7dcef970dc295a49287b80f955197c2732c7c1faed5c17b17215299f20528`
4. Cron Expression: `*/10 * * * *` (every 10 minutes)
5. HTTP Method: POST
6. Save

## Test Manually

Test with curl to verify it's working:

```bash
# With header
curl -X POST https://resonant-seahorse-7d6217.netlify.app/.netlify/functions/scrape-codes \
  -H "x-cron-secret: f0f7dcef970dc295a49287b80f955197c2732c7c1faed5c17b17215299f20528"

# With query parameter
curl -X POST "https://resonant-seahorse-7d6217.netlify.app/.netlify/functions/scrape-codes?secret=f0f7dcef970dc295a49287b80f955197c2732c7c1faed5c17b17215299f20528"
```

Both should return `{"message":"No new codes","added":0}` (since active codes are already in DB).

## Troubleshooting 401 Errors

If you still get 401:
1. Double-check the secret matches exactly (no extra spaces)
2. Try the query parameter method instead
3. Check Netlify logs to see what secret was received
4. Verify `CRON_SECRET` environment variable is set in Netlify

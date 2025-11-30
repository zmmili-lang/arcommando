# Automated Code Scraper - Setup Guide

## Overview
The automated code scraper periodically checks https://kingshot.net/gift-codes for new gift codes and automatically:
1. Adds them to the database
2. Triggers redemption for all players

## Setup Steps

### 1. Deploy to Netlify
```bash
git add .
git commit -m "feat: add automated gift code scraper"
git push
```

### 2. Set Environment Variable
In Netlify dashboard → Site settings → Environment variables:
- **Name**: `CRON_SECRET`
- **Value**: Generate a random secret (e.g., `openssl rand -hex 32`)

### 3. Configure Cron-Job.org

1. Sign up at https://cron-job.org (free account)
2. Create new cron job:
   - **Title**: "Kingshot Code Scraper"
   - **URL**: `https://your-site.netlify.app/.netlify/functions/scrape-codes`
   - **Schedule**: Every 10 minutes
   - **Request Method**: POST
   - **Headers**: 
     - Name: `x-cron-secret`
     - Value: (your CRON_SECRET from step 2)
3. Save and enable

## How It Works

1. Cron service calls webhook every 10 minutes
2. Webhook validates secret token
3. Puppeteer scrapes Kingshot portal for active codes
4. New codes are identified and added to database
5. Redemption is automatically triggered for all players
6. Results are logged

## Monitoring

Check Netlify function logs to see:
- When scraper runs
- How many codes found/added
- Any errors

## Troubleshooting

**No codes found:**
- Kingshot page structure may have changed
- Check scraper selectors in `_lib/scraper.mjs`

**Unauthorized errors:**
- Verify CRON_SECRET matches in Netlify and cron-job.org

**Timeout errors:**
- Puppeteer may need longer timeout
- Consider increasing waitUntil timeout in scraper

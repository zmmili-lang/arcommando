import { cors, ensureSchema, getSql, requireAdmin } from './_lib/_utils.js'
import { scrapeGiftCodes } from './_lib/scraper.mjs'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})

    // Check authentication: header or query parameter
    const secret = event.headers['x-cron-secret'] || event.queryStringParameters?.secret
    if (secret !== process.env.CRON_SECRET) {
        console.error('[SCRAPER] Unauthorized attempt. Expected:', process.env.CRON_SECRET?.substring(0, 8) + '...', 'Got:', secret?.substring(0, 8) + '...')
        return cors({ error: 'Unauthorized' }, 401)
    }

    await ensureSchema()
    const sql = getSql()

    try {
        console.log('[SCRAPER] Starting code scrape...')

        // Scrape codes from Kingshot portal
        const scrapedCodes = await scrapeGiftCodes()
        console.log(`[SCRAPER] Found ${scrapedCodes.length} codes`)

        if (scrapedCodes.length === 0) {
            return cors({ message: 'No codes found on website', added: 0, foundCodes: [] })
        }

        // Get existing codes from database
        const existingCodes = await sql`SELECT code FROM codes`
        const existingCodeSet = new Set(existingCodes.map(c => c.code))

        // Filter for new codes only (case-sensitive)
        const newCodes = scrapedCodes.filter(c => !existingCodeSet.has(c.code))

        console.log(`[SCRAPER] ${newCodes.length} new codes to add`)

        if (newCodes.length === 0) {
            return cors({
                message: 'No new codes (all already in database)',
                added: 0,
                foundCodes: scrapedCodes.map(c => c.code),
                totalFound: scrapedCodes.length
            })
        }

        // Do NOT add to database automatically.
        // Just notify via Webhook (e.g. Discord)
        const newCodesList = newCodes.map(c => c.code)

        if (newCodesList.length > 0) {
            console.log(`[SCRAPER] Found ${newCodesList.length} new codes: ${newCodesList.join(', ')}`)

            const webhookUrl = process.env.DISCORD_WEBHOOK_URL
            if (webhookUrl) {
                try {
                    const content = `🎁 **New Kingshot Gift Codes Found!**\n\n${newCodesList.map(c => `\`${c}\``).join('\n')}\n\nPlease add them manually in the dashboard.`

                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content })
                    })
                    console.log('[SCRAPER] Sent Discord webhook notification')
                } catch (e) {
                    console.error('[SCRAPER] Failed to send webhook:', e)
                }
            } else {
                console.log('[SCRAPER] No DISCORD_WEBHOOK_URL configured. Skipping notification.')
            }
        }

        return cors({
            message: `Found ${newCodesList.length} new codes (notified via webhook)`,
            added: 0,
            newCodes: newCodesList,
            foundCodes: scrapedCodes.map(c => c.code),
            totalFound: scrapedCodes.length
        })
    } catch (error) {
        console.error('[SCRAPER] Error:', error)
        return cors({ error: error.message }, 500)
    }
}

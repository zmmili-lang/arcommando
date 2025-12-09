import { cors, ensureSchema, getSql, requireAdmin } from './_lib/_utils.js'
import { scrapeGiftCodes } from './_lib/scraper.mjs'
import { sendEmail } from './_lib/email.mjs'

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

        // Add new codes to database as INACTIVE
        const addedCodes = []
        for (const { code } of newCodes) {
            try {
                // Insert as active=false so it doesn't trigger auto-redemption if we had it, 
                // and so the user has to manually approve it.
                await sql`INSERT INTO codes (code, active, added_at) VALUES (${code}, ${false}, ${Date.now()})`
                addedCodes.push(code)
                console.log(`[SCRAPER] Added inactive code: ${code}`)
            } catch (e) {
                console.error(`[SCRAPER] Failed to add code ${code}:`, e.message)
            }
        }

        // Send email notification
        if (addedCodes.length > 0) {
            const subject = `[ARCommando] Found ${addedCodes.length} New Gift Codes`
            const text = `Found the following new gift codes:\n\n${addedCodes.join('\n')}\n\nThey have been added to the database as INACTIVE. Please log in to activate/redeem them.`
            const html = `
                <h2>New Gift Codes Found</h2>
                <ul>
                    ${addedCodes.map(c => `<li><strong>${c}</strong></li>`).join('')}
                </ul>
                <p>These codes have been added to the database as <strong>INACTIVE</strong>.</p>
                <p>Please <a href="https://arcommando.netlify.app/codes">log in to the dashboard</a> to activate and redeem them.</p>
            `

            await sendEmail({ subject, text, html })
        }

        return cors({
            message: `Found ${addedCodes.length} new codes (added as inactive, emailed)`,
            added: addedCodes.length,
            newCodes: addedCodes,
            foundCodes: scrapedCodes.map(c => c.code),
            totalFound: scrapedCodes.length
        })
    } catch (error) {
        console.error('[SCRAPER] Error:', error)
        return cors({ error: error.message }, 500)
    }
}

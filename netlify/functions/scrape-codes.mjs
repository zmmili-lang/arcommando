import { cors, ensureSchema, getSql, requireAdmin } from './_lib/_utils.js'
import { scrapeGiftCodes } from './_lib/scraper.mjs'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})

    // Optional: Add basic auth or secret token check
    const secret = event.headers['x-cron-secret']
    if (secret !== process.env.CRON_SECRET) {
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
            return cors({ message: 'No codes found', added: 0 })
        }

        // Get existing codes from database
        const existingCodes = await sql`SELECT code FROM codes`
        const existingCodeSet = new Set(existingCodes.map(c => c.code))

        // Filter for new codes only (case-sensitive)
        const newCodes = scrapedCodes.filter(c => !existingCodeSet.has(c.code))

        console.log(`[SCRAPER] ${newCodes.length} new codes to add`)

        if (newCodes.length === 0) {
            return cors({ message: 'No new codes', added: 0 })
        }

        // Add new codes to database
        const addedCodes = []
        for (const { code } of newCodes) {
            try {
                await sql`INSERT INTO codes (code, added_at) VALUES (${code}, ${Date.now()})`
                addedCodes.push(code)
                console.log(`[SCRAPER] Added code: ${code}`)
            } catch (e) {
                console.error(`[SCRAPER] Failed to add code ${code}:`, e.message)
            }
        }

        // Trigger redemption for all players if codes were added
        if (addedCodes.length > 0) {
            const players = await sql`SELECT id FROM players`
            console.log(`[SCRAPER] Triggering redemption for ${players.length} players with ${addedCodes.length} new codes`)

            // Get the base URL from request or use default
            const baseUrl = process.env.URL || 'https://resonant-seahorse-7d6217.netlify.app'

            // Call redeem-start for each player
            for (const player of players) {
                try {
                    console.log(`[SCRAPER] Triggering redeem for player: ${player.id}`)
                    const response = await fetch(`${baseUrl}/.netlify/functions/redeem-start`, {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            'x-admin-pass': process.env.ADMIN_PASS || '',
                        },
                        body: JSON.stringify({ id: player.id }),
                    })

                    if (!response.ok) {
                        const errorText = await response.text()
                        console.error(`[SCRAPER] Redeem failed for ${player.id}: ${response.status} - ${errorText}`)
                    } else {
                        const result = await response.json()
                        console.log(`[SCRAPER] Redeem started for ${player.id}:`, result.message || 'Success')
                    }
                } catch (e) {
                    console.error(`[SCRAPER] Failed to trigger redeem for ${player.id}:`, e.message)
                }
            }
        }

        return cors({
            message: `Added ${addedCodes.length} new codes`,
            added: addedCodes.length,
            codes: addedCodes,
        })
    } catch (error) {
        console.error('[SCRAPER] Error:', error)
        return cors({ error: error.message }, 500)
    }
}

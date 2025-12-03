import { cors, ensureSchema, getSql, parseBody } from './_utils.js'
import { fetchPlayerProfile, redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})

    await ensureSchema()
    const sql = getSql()

    // Handle GET: Lookup player by ID (slug)
    if (event.httpMethod === 'GET') {
        const id = event.queryStringParameters?.id
        if (!id) return cors({ error: 'Missing id parameter' }, 400)

        const rows = await sql`SELECT id, nickname, avatar_image FROM players WHERE id = ${id}`
        if (rows.length === 0) {
            return cors({ error: 'Player not found' }, 404)
        }
        return cors({ player: rows[0] })
    }

    // Handle POST: Add player if not exists, or return existing
    if (event.httpMethod === 'POST') {
        const body = parseBody(event)
        const playerId = String(body.playerId || '').trim()
        if (!playerId) return cors({ error: 'playerId required' }, 400)

        // Check if exists first
        const existing = await sql`SELECT id, nickname, avatar_image FROM players WHERE id = ${playerId}`
        if (existing.length > 0) {
            return cors({ player: existing[0], message: 'Player already exists' })
        }

        // Check limit
        const cnt = await sql`SELECT COUNT(*) as c FROM players`
        if (Number(cnt[0].c) >= 100) return cors({ error: 'Player limit reached (100)' }, 400)

        // Fetch from Kingshot
        let profile
        try {
            profile = await fetchPlayerProfile(playerId)
            if (!profile || !profile.nickname) {
                return cors({ error: 'Player not found in Kingshot system' }, 404)
            }
        } catch (error) {
            console.error(`Failed to fetch player ${playerId}:`, error.message)
            return cors({ error: 'Player not found in Kingshot system' }, 404)
        }

        // Insert
        const now = Date.now()
        await sql`INSERT INTO players (id, nickname, avatar_image, added_at, last_redeemed_at)
                VALUES (${playerId}, ${profile.nickname}, ${profile.avatar_image || ''}, ${now}, ${null})`

        // Auto-redeem active codes
        const activeCodes = await sql`SELECT code FROM codes WHERE active = true`
        const limit = 5
        const chunks = []
        for (let i = 0; i < activeCodes.length; i += limit) {
            chunks.push(activeCodes.slice(i, i + limit))
        }

        const redemptionResults = []
        // We need to import appendHistory if not already imported, but let's check imports
        // It seems appendHistory is not imported in public-player.mjs yet.
        // I will add the import in a separate edit or assume I can add it here if I replace the whole file or top part.
        // Since I'm using replace_file_content on a block, I should be careful about imports.
        // I'll use the logic but I need to make sure appendHistory is available.
        // Let's do the redemption loop here.

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async (c) => {
                try {
                    const res = await redeemGiftCode({ playerId, code: c.code })
                    // We need to log history too
                    await sql`INSERT INTO history (ts, player_id, code, status, message, raw)
                        VALUES (${Date.now()}, ${playerId}, ${c.code}, ${res.status}, ${res.message}, ${JSON.stringify(res.raw || {})})`
                    redemptionResults.push({ code: c.code, status: res.status, message: res.message })
                } catch (e) {
                    console.error(`Failed to redeem ${c.code} for ${playerId}:`, e)
                    redemptionResults.push({ code: c.code, status: 'error', message: String(e.message || e) })
                }
            }))
        }

        return cors({
            player: { id: playerId, nickname: profile.nickname, avatar_image: profile.avatar_image },
            created: true,
            redemptionResults
        })
    }

    return cors({ error: 'Method not allowed' }, 405)
}

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

        // Trigger background redemption (optional, but good to have consistency)
        // We won't wait for it to keep the UI snappy, or maybe we should?
        // The user said "add him", usually implies full onboarding. 
        // Let's do a quick redemption of active codes but not block too long if possible.
        // Actually, for the "Spinny" page, the user just wants to see the avatar.
        // We can trigger redemption asynchronously if Netlify functions allowed it easily (fire and forget),
        // but they don't really without background functions.
        // For now, let's just add the player. The cron job or admin panel can handle redemptions later,
        // OR we can do what players-add does.
        // Let's stick to just adding the player to be fast.

        return cors({
            player: { id: playerId, nickname: profile.nickname, avatar_image: profile.avatar_image },
            created: true
        })
    }

    return cors({ error: 'Method not allowed' }, 405)
}

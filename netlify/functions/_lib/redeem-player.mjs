import { appendHistory, cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'
import { redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})
    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res
    await ensureSchema()
    const sql = getSql()
    const body = parseBody(event)
    const playerId = String(body.playerId || '').trim()
    if (!playerId) return cors({ error: 'playerId required' }, 400)

    // Verify player exists
    const exists = await sql`SELECT 1 FROM players WHERE id = ${playerId}`
    if (!exists.length) return cors({ error: 'Player not found' }, 404)

    // Fetch active codes not yet redeemed or blocked for this player
    const activeCodes = await sql`
        SELECT c.code 
        FROM codes c
        LEFT JOIN player_codes pc ON c.code = pc.code AND pc.player_id = ${playerId}
        WHERE c.active = true 
        AND (pc.player_id IS NULL OR (pc.redeemed_at IS NULL AND pc.blocked_reason IS NULL))
    `
    console.log(`🚀 Checking ${activeCodes.length} active codes for player ${playerId}`)

    const limit = 5
    const chunks = []
    for (let i = 0; i < activeCodes.length; i += limit) {
        chunks.push(activeCodes.slice(i, i + limit))
    }
    let rateLimited = false
    const redemptionResults = []
    for (const chunk of chunks) {
        if (rateLimited) break
        await Promise.all(chunk.map(async (c) => {
            try {
                const res = await redeemGiftCode({ playerId, code: c.code })
                await appendHistory(sql, { ts: Date.now(), playerId, code: c.code, status: res.status, message: res.message, raw: res.raw })
                redemptionResults.push({ code: c.code, status: res.status, message: res.message })
                if (res.status === 'rate_limited' || res.message === 'No response') rateLimited = true
            } catch (e) {
                console.error(`Failed to redeem ${c.code} for ${playerId}:`, e)
                redemptionResults.push({ code: c.code, status: 'error', message: String(e.message || e) })
            }
        }))
        if (rateLimited) break
        // Add a small delay between chunks to avoid rate limiting
        if (chunks.indexOf(chunk) < chunks.length - 1) {
            await new Promise(r => setTimeout(r, 1000))
        }
    }

    return cors({ ok: true, redemptionResults })
}

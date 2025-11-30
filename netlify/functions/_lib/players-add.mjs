import { appendHistory, cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'
import { fetchPlayerProfile, redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})
    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res
    await ensureSchema()
    const sql = getSql()
    const body = parseBody(event)
    const playerId = String(body.playerId || '').trim()
    if (!playerId) return cors({ error: 'playerId required' }, 400)

    const exists = await sql`SELECT 1 FROM players WHERE id = ${playerId}`
    if (exists.length) return cors({ error: 'duplicate' }, 409)
    const cnt = await sql`SELECT COUNT(*) as c FROM players`
    if (Number(cnt[0].c) >= 100) return cors({ error: 'limit 100 players' }, 400)

    let profile = { nickname: '', avatar_image: '' }
    try { profile = await fetchPlayerProfile(playerId) } catch { }

    const now = Date.now()
    await sql`INSERT INTO players (id, nickname, avatar_image, added_at, last_redeemed_at)
            VALUES (${playerId}, ${profile.nickname || ''}, ${profile.avatar_image || ''}, ${now}, ${null})`

    const rows = await sql`SELECT id, nickname, avatar_image, added_at, last_redeemed_at FROM players ORDER BY added_at NULLS LAST, id`
    const players = rows.map(r => ({ id: r.id, nickname: r.nickname || '', avatar_image: r.avatar_image || '', addedAt: r.added_at ? Number(r.added_at) : null, lastRedeemedAt: r.last_redeemed_at ? Number(r.last_redeemed_at) : null }))

    // Synchronous redemption
    const activeCodes = await sql`SELECT code FROM codes WHERE active = true`
    const limit = 5
    const chunks = []
    for (let i = 0; i < activeCodes.length; i += limit) {
        chunks.push(activeCodes.slice(i, i + limit))
    }

    const redemptionResults = []
    for (const chunk of chunks) {
        await Promise.all(chunk.map(async (c) => {
            try {
                const res = await redeemGiftCode({ playerId, code: c.code })
                await appendHistory(sql, { ts: Date.now(), playerId, code: c.code, status: res.status, message: res.message, raw: res.raw })
                redemptionResults.push({ code: c.code, status: res.status, message: res.message })
            } catch (e) {
                console.error(`Failed to redeem ${c.code} for ${playerId}:`, e)
                redemptionResults.push({ code: c.code, status: 'error', message: String(e.message || e) })
            }
        }))
    }

    return cors({ ok: true, players, redemptionResults })
}

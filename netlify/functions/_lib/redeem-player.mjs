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

    // Fetch active codes
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

    return cors({ ok: true, redemptionResults })
}

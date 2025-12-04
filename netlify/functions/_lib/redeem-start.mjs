import { appendHistory, cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'
import { redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})
    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res
    await ensureSchema()
    const sql = getSql()
    const body = parseBody(event)

    const onlyCode = body?.onlyCode ? String(body.onlyCode).trim() : null
    const onlyPlayer = body?.onlyPlayer ? String(body.onlyPlayer).trim() : null

    if (!onlyCode && !onlyPlayer) {
        return cors({ error: 'Must provide onlyCode or onlyPlayer for synchronous redemption to avoid timeout' }, 400)
    }

    const results = []

    if (onlyPlayer) {
        // Redeem all active codes for this player
        const activeCodes = await sql`SELECT code FROM codes WHERE active = true`
        // Use concurrency
        const limit = 5
        const chunks = []
        for (let i = 0; i < activeCodes.length; i += limit) chunks.push(activeCodes.slice(i, i + limit))

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async (c) => {
                try {
                    const res = await redeemGiftCode({ playerId: onlyPlayer, code: c.code })
                    await appendHistory(sql, { ts: Date.now(), playerId: onlyPlayer, code: c.code, status: res.status, message: res.message, raw: res.raw })
                    results.push({ code: c.code, playerId: onlyPlayer, status: res.status, message: res.message })
                } catch (e) {
                    results.push({ code: c.code, playerId: onlyPlayer, status: 'error', message: String(e.message || e) })
                }
            }))
        }
    } else if (onlyCode) {
        // Redeem this code for all players
        const players = await sql`SELECT id FROM players`
        const limit = 5
        const chunks = []
        for (let i = 0; i < players.length; i += limit) chunks.push(players.slice(i, i + limit))

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async (p) => {
                try {
                    const res = await redeemGiftCode({ playerId: p.id, code: onlyCode })
                    await appendHistory(sql, { ts: Date.now(), playerId: p.id, code: onlyCode, status: res.status, message: res.message, raw: res.raw })
                    results.push({ code: onlyCode, playerId: p.id, status: res.status, message: res.message })
                } catch (e) {
                    results.push({ code: onlyCode, playerId: p.id, status: 'error', message: String(e.message || e) })
                }
            }))
        }
    }

    return cors({ ok: true, results })
}

import { appendHistory, cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'
import { redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return cors({})
        const auth = requireAdmin(event)
        if (!auth.ok) return auth.res
        await ensureSchema()
        const sql = getSql()
        const body = parseBody(event)

        const onlyCode = body?.onlyCode ? String(body.onlyCode).trim() : null
        const onlyPlayer = body?.onlyPlayer ? String(body.onlyPlayer).trim() : null

        if (!onlyCode && !onlyPlayer) {
            return cors({ error: 'Must provide onlyCode or onlyPlayer for synchronous redemption' }, 400)
        }

        const results = []

        if (onlyPlayer) {
            const activeCodes = await sql`
                SELECT c.code 
                FROM codes c
                LEFT JOIN player_codes pc ON c.code = pc.code AND pc.player_id = ${onlyPlayer}
                WHERE c.active = true 
                AND (pc.player_id IS NULL OR (pc.redeemed_at IS NULL AND pc.blocked_reason IS NULL))
            `
            console.log(`🚀 Checking ${activeCodes.length} active codes for player ${onlyPlayer}`)
            const limit = 5
            const chunks = []
            for (let i = 0; i < activeCodes.length; i += limit) chunks.push(activeCodes.slice(i, i + limit))

            let rateLimited = false
            for (let i = 0; i < chunks.length; i++) {
                if (rateLimited) break
                const chunk = chunks[i]
                await Promise.all(chunk.map(async (c) => {
                    try {
                        const res = await redeemGiftCode({ playerId: onlyPlayer, code: c.code })
                        await appendHistory(sql, { ts: Date.now(), playerId: onlyPlayer, code: c.code, status: res.status, message: res.message, raw: res.raw })
                        results.push({ code: c.code, playerId: onlyPlayer, status: res.status, message: res.message })
                        if (res.status === 'rate_limited' || res.message === 'No response') rateLimited = true
                    } catch (e) {
                        results.push({ code: c.code, playerId: onlyPlayer, status: 'error', message: String(e.message || e) })
                    }
                }))
                if (rateLimited) break
                if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1000))
            }
        } else if (onlyCode) {
            const players = await sql`
                SELECT p.id 
                FROM players p
                LEFT JOIN player_codes pc ON p.id = pc.player_id AND pc.code = ${onlyCode}
                WHERE pc.player_id IS NULL OR (pc.redeemed_at IS NULL AND pc.blocked_reason IS NULL)
            `
            console.log(`🚀 Triggering redemption for ${onlyCode} for ${players.length} players`)

            const limit = 5
            const chunks = []
            for (let i = 0; i < players.length; i += limit) chunks.push(players.slice(i, i + limit))

            let rateLimited = false
            for (let i = 0; i < chunks.length; i++) {
                if (rateLimited) break
                const chunk = chunks[i]
                await Promise.all(chunk.map(async (p) => {
                    try {
                        const res = await redeemGiftCode({ playerId: p.id, code: onlyCode })
                        await appendHistory(sql, { ts: Date.now(), playerId: p.id, code: onlyCode, status: res.status, message: res.message, raw: res.raw })
                        results.push({ code: onlyCode, playerId: p.id, status: res.status, message: res.message })
                        if (res.status === 'rate_limited' || res.message === 'No response') rateLimited = true
                    } catch (e) {
                        results.push({ code: onlyCode, playerId: p.id, status: 'error', message: String(e.message || e) })
                    }
                }))
                if (rateLimited) break
                if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1000))
            }
        }

        return cors({ ok: true, results })
    } catch (err) {
        console.error('❌ redeem-start error:', err)
        return cors({ error: String(err.message || err) }, 500)
    }
}

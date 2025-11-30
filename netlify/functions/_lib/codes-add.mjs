import { appendHistory, cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'
import { redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})
    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res
    const sql = getSql()
    await ensureSchema()
    const body = parseBody(event)
    const code = String(body.code || '').trim()
    const note = String(body.note || '')
    if (!code) return cors({ error: 'code required' }, 400)
    const exists = await sql`SELECT 1 FROM codes WHERE code = ${code}`
    if (exists.length) return cors({ error: 'duplicate' }, 409)
    await sql`INSERT INTO codes (code, note, active, added_at, last_tried_at) VALUES (${code}, ${note}, ${true}, ${Date.now()}, ${null})`
    const codes = await sql`SELECT code, note, active, added_at, last_tried_at FROM codes ORDER BY added_at NULLS LAST, code`
    const out = codes.map(c => ({ code: c.code, note: c.note || '', active: !!c.active, addedAt: c.added_at ? Number(c.added_at) : null, lastTriedAt: c.last_tried_at ? Number(c.last_tried_at) : null }))

    // Synchronous redemption
    const players = await sql`SELECT id FROM players`
    const limit = 5
    const chunks = []
    for (let i = 0; i < players.length; i += limit) {
        chunks.push(players.slice(i, i + limit))
    }

    for (const chunk of chunks) {
        await Promise.all(chunk.map(async (p) => {
            try {
                const res = await redeemGiftCode({ playerId: p.id, code })
                await appendHistory(sql, { ts: Date.now(), playerId: p.id, code, status: res.status, message: res.message, raw: res.raw })
            } catch (e) {
                console.error(`Failed to redeem ${code} for ${p.id}:`, e)
            }
        }))
    }

    return cors({ ok: true, codes: out })
}

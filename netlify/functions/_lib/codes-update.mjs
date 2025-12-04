import { cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})
    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res
    const sql = getSql()
    await ensureSchema()
    const body = parseBody(event)
    const code = String(body.code || '').trim()
    if (!code) return cors({ error: 'code required' }, 400)

    const exists = await sql`SELECT 1 FROM codes WHERE code = ${code}`
    if (!exists.length) return cors({ error: 'not found' }, 404)

    const sets = []
    const vals = []
    if ('active' in body) { sets.push('active = $1'); vals.push(!!body.active) }
    if ('note' in body) { sets.push(`note = $${vals.length + 1}`); vals.push(String(body.note || '')) }
    if ('lastTriedAt' in body) { sets.push(`last_tried_at = $${vals.length + 1}`); vals.push(body.lastTriedAt) }
    if (sets.length) {
        const q = `UPDATE codes SET ${sets.join(', ')} WHERE code = $${vals.length + 1}`
        await sql(q, [...vals, code])
    }
    const codesRows = await sql`SELECT code, note, active, added_at, last_tried_at FROM codes ORDER BY added_at NULLS LAST, code`
    const totalPlayersRes = await sql`SELECT COUNT(*) AS c FROM players`
    const redeemedCounts = await sql`SELECT code, COUNT(*)::int AS cnt FROM player_codes WHERE redeemed_at IS NOT NULL GROUP BY code`
    const rmap = new Map(redeemedCounts.map(r => [r.code, Number(r.cnt)]))
    const totalPlayers = Number(totalPlayersRes[0].c)
    const codes = codesRows.map(c => ({ code: c.code, note: c.note || '', active: !!c.active, addedAt: c.added_at ? Number(c.added_at) : null, lastTriedAt: c.last_tried_at ? Number(c.last_tried_at) : null, stats: { redeemedCount: rmap.get(c.code) || 0, totalPlayers } }))
    return cors({ ok: true, codes })
}

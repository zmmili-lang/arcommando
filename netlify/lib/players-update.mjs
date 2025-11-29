import { cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  await ensureSchema()
  const sql = getSql()
  const body = parseBody(event)
  const id = String(body.id || '').trim()
  if (!id) return cors({ error: 'id required' }, 400)

  const exists = await sql`SELECT 1 FROM players WHERE id = ${id}`
  if (!exists.length) return cors({ error: 'not found' }, 404)

  const sets = []
  const vals = []
  if ('avatar_image' in body) { sets.push('avatar_image = $1'); vals.push(body.avatar_image) }
  if ('lastRedeemedAt' in body) { sets.push(`last_redeemed_at = $${vals.length+1}`); vals.push(body.lastRedeemedAt) }
  if (sets.length) {
    const q = `UPDATE players SET ${sets.join(', ')} WHERE id = $${vals.length+1}`
    await sql(q, [...vals, id])
  }
  const rows = await sql`SELECT id, nickname, avatar_image, added_at, last_redeemed_at FROM players ORDER BY added_at NULLS LAST, id`
  const players = rows.map(r => ({ id: r.id, nickname: r.nickname || '', avatar_image: r.avatar_image || '', addedAt: r.added_at || null, lastRedeemedAt: r.last_redeemed_at || null }))
  return cors({ ok: true, players })
}

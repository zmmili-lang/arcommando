import { cors, ensureSchema, getSql, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  await ensureSchema()
  const sql = getSql()
  const rows = await sql`SELECT id, nickname, avatar_image, added_at, last_redeemed_at FROM players ORDER BY added_at NULLS LAST, id`
  const players = rows.map(r => ({ id: r.id, nickname: r.nickname || '', avatar_image: r.avatar_image || '', addedAt: r.added_at ? Number(r.added_at) : null, lastRedeemedAt: r.last_redeemed_at ? Number(r.last_redeemed_at) : null }))
  return cors({ players })
}

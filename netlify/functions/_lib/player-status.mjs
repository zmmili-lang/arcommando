import { cors, ensureSchema, getSql, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const id = (event.queryStringParameters?.id || '').trim()
  if (!id) return cors({ error: 'id required' }, 400)
  try {
    const sql = getSql()
    await ensureSchema()
    const codes = await sql`SELECT code, active FROM codes ORDER BY code`
    const redeemedRows = await sql`SELECT code FROM player_codes WHERE player_id = ${id} AND redeemed_at IS NOT NULL`
    const blockedRows = await sql`SELECT code, blocked_reason FROM player_codes WHERE player_id = ${id} AND blocked_reason IS NOT NULL`
    const redeemed = redeemedRows.map(r => r.code)
    const blocked = Object.fromEntries(blockedRows.map(r => [r.code, r.blocked_reason]))
    return cors({
      codes: codes.map(c => ({ code: c.code, active: !!c.active })),
      redeemed,
      blocked
    })
  } catch (e) {
    return cors({ codes: [], redeemed: [], blocked: {}, error: String(e?.message || e) })
  }
}

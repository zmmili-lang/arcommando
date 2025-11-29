import { cors, ensureSchema, getSql, requireAdmin, todayYMD } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  await ensureSchema()
  const sql = getSql()
  const date = (event.queryStringParameters?.date || todayYMD()).slice(0,10)
  const start = Date.parse(`${date}T00:00:00.000Z`)
  const end = start + 24*60*60*1000
  const rows = await sql`SELECT h.ts, h.player_id, h.code, h.status, h.message, p.nickname FROM history h LEFT JOIN players p ON p.id = h.player_id WHERE h.ts >= ${start} AND h.ts < ${end}`
  const entries = rows.map(r => ({ ts: r.ts ? Number(r.ts) : null, playerId: r.player_id, nickname: r.nickname || '', code: r.code, status: r.status, message: r.message }))
  entries.sort((a,b) => b.ts - a.ts)
  const summary = entries.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc }, { success: 0, already_redeemed: 0, error: 0 })
  return cors({ entries, summary })
}

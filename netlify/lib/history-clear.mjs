import { cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  await ensureSchema()
  const sql = getSql()
  const body = parseBody(event)
  const date = (body?.date || '').slice(0,10)
  if (!date) return cors({ error: 'date required (YYYY-MM-DD)' }, 400)
  const start = Date.parse(`${date}T00:00:00.000Z`)
  const end = start + 24*60*60*1000
  await sql`DELETE FROM history WHERE ts >= ${start} AND ts < ${end}`
  return cors({ ok: true })
}

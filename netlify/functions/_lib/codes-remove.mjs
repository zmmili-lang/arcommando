import { cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const sql = getSql()
  await ensureSchema()
  const body = parseBody(event)
  const code = String(body.code || '').trim().toUpperCase()
  if (!code) return cors({ error: 'code required' }, 400)
  await sql`DELETE FROM codes WHERE code = ${code}`
  const codes = await sql`SELECT code, note, active, added_at, last_tried_at FROM codes ORDER BY added_at NULLS LAST, code`
  const out = codes.map(c => ({ code: c.code, note: c.note || '', active: !!c.active, addedAt: c.added_at ? Number(c.added_at) : null, lastTriedAt: c.last_tried_at ? Number(c.last_tried_at) : null }))
  return cors({ ok: true, codes: out })
}

import { appendHistory, cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'
import { redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  await ensureSchema()
  const sql = getSql()
  const body = parseBody(event)
  const id = String(body.id || '').trim()
  const code = String(body.code || '').trim()
  if (!id || !code) return cors({ error: 'id and code required' }, 400)

  const ts = Date.now()
  const res = await redeemGiftCode({ playerId: id, code })
  await appendHistory(sql, { ts, playerId: id, code, status: res.status, message: res.message, raw: res.raw })
  if (res.status === 'success' || res.status === 'already_redeemed') {
    await sql`UPDATE players SET last_redeemed_at = ${ts} WHERE id = ${id}`
  }
  await sql`UPDATE codes SET last_tried_at = ${ts} WHERE code = ${code}`
  return cors({ ok: true, ...res })
}

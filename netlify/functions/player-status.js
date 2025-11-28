import { cors, getJSON, getStoreFromEvent, CODES_KEY, HISTORY_PREFIX, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const id = (event.queryStringParameters?.id || '').trim()
  if (!id) return cors({ error: 'id required' }, 400)

  const codes = (await getJSON(store, CODES_KEY, [])) || []

  // aggregate redeemed and blocked codes across all history files for this player
  const redeemedSet = new Set()
  const lastByCode = new Map() // code -> { ts, status, message, rawMsg }
  for await (const page of store.list({ prefix: HISTORY_PREFIX, paginate: true })) {
    for (const item of page.blobs) {
      const entries = await store.get(item.key, { type: 'json' })
      if (!Array.isArray(entries)) continue
      for (const e of entries) {
        if (String(e.playerId) !== String(id)) continue
        if (e.status === 'success' || e.status === 'already_redeemed') redeemedSet.add(e.code)
        const cur = lastByCode.get(e.code)
        if (!cur || (e.ts && e.ts > cur.ts)) {
          lastByCode.set(e.code, { ts: e.ts || 0, status: e.status, message: e.message, rawMsg: e?.raw?.msg || '' })
        }
      }
    }
  }

  // determine blocked reasons based on last status
  const blocked = {}
  for (const [code, v] of lastByCode.entries()) {
    const raw = (v.rawMsg || '').toUpperCase()
    const msg = (v.message || '').toUpperCase()
    if (raw === 'TIME ERROR' || msg.includes('EXPIRED')) blocked[code] = 'expired'
    else if (raw === 'USED' || msg.includes('CLAIM LIMIT')) blocked[code] = 'limit'
  }

  return cors({
    codes: codes.map(c => ({ code: c.code, active: !!c.active })),
    redeemed: Array.from(redeemedSet),
    blocked
  })
}

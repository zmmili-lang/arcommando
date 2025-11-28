import { cors, getJSON, getStoreFromEvent, CODES_KEY, HISTORY_PREFIX, requireAdmin, getStatusIndex } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const id = (event.queryStringParameters?.id || '').trim()
  if (!id) return cors({ error: 'id required' }, 400)

  const codes = (await getJSON(store, CODES_KEY, [])) || []

  // primary: status index
  const idx = await getStatusIndex(store)
  const pentry = idx.players?.[String(id)] || { redeemed: {}, blocked: {} }
  const redeemedSet = new Set(Object.keys(pentry.redeemed || {}))
  const blocked = pentry.blocked || {}

  // fallback: scan history if index is empty
  if (redeemedSet.size === 0) {
    for await (const page of store.list({ prefix: HISTORY_PREFIX, paginate: true })) {
      for (const item of page.blobs) {
        const entries = await store.get(item.key, { type: 'json' })
        if (!Array.isArray(entries)) continue
        for (const e of entries) {
          if (String(e.playerId) === String(id)) {
            if (e.status === 'success' || e.status === 'already_redeemed') redeemedSet.add(e.code)
          }
        }
      }
    }
  }

  return cors({
    codes: codes.map(c => ({ code: c.code, active: !!c.active })),
    redeemed: Array.from(redeemedSet),
    blocked
  })
}
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

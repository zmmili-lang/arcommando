import { cors, getJSON, getStoreFromEvent, CODES_KEY, HISTORY_PREFIX, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const id = (event.queryStringParameters?.id || '').trim()
  if (!id) return cors({ error: 'id required' }, 400)

  const codes = (await getJSON(store, CODES_KEY, [])) || []

  // aggregate redeemed codes across all history files
  const redeemedSet = new Set()
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

  return cors({
    codes: codes.map(c => ({ code: c.code, active: !!c.active })),
    redeemed: Array.from(redeemedSet)
  })
}

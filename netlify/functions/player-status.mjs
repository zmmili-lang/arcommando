import { cors, getJSON, getStoreFromEvent, CODES_KEY, requireAdmin, getStatusIndex } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const id = (event.queryStringParameters?.id || '').trim()
  if (!id) return cors({ error: 'id required' }, 400)
  try {
    const store = getStoreFromEvent(event)
    const codes = (await getJSON(store, CODES_KEY, [])) || []

    // primary: status index only
    const idx = await getStatusIndex(store)
    const pentry = idx.players?.[String(id)] || { redeemed: {}, blocked: {} }
    const redeemedSet = new Set(Object.keys(pentry.redeemed || {}))
    const blocked = pentry.blocked || {}

    return cors({
      codes: codes.map(c => ({ code: c.code, active: !!c.active })),
      redeemed: Array.from(redeemedSet),
      blocked
    })
  } catch (e) {
    // Fail-open with an empty but valid payload so UI can render, and include an error string
    return cors({ codes: [], redeemed: [], blocked: {}, error: String(e?.message || e) })
  }
}

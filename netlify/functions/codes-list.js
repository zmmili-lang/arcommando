import { cors, getJSON, getStoreFromEvent, CODES_KEY, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const codes = await getJSON(store, CODES_KEY, [])
  return cors({ codes })
}

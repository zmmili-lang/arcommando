import { cors, getJSON, getStoreFromEvent, PLAYERS_KEY, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const players = await getJSON(store, PLAYERS_KEY, [])
  return cors({ players })
}

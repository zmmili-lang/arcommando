import { cors, getJSON, getStoreFromEvent, parseBody, PLAYERS_KEY, requireAdmin, setJSON } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const body = parseBody(event)
  const id = String(body.id || '').trim()
  if (!id) return cors({ error: 'id required' }, 400)

  const players = (await getJSON(store, PLAYERS_KEY, [])) || []
  const next = players.filter(p => String(p.id) !== id)
  await setJSON(store, PLAYERS_KEY, next)
  return cors({ ok: true, players: next })
}

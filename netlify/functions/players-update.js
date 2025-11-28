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
  const idx = players.findIndex(p => String(p.id) === id)
  if (idx === -1) return cors({ error: 'not found' }, 404)

  const editable = ['nickname', 'avatar_image', 'disabled', 'lastRedeemedAt']
  const patch = {}
  for (const k of editable) if (k in body) patch[k] = body[k]

  players[idx] = { ...players[idx], ...patch }
  await setJSON(store, PLAYERS_KEY, players)
  return cors({ ok: true })
}

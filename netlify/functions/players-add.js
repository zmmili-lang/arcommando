import { cors, getJSON, getStoreFromEvent, parseBody, PLAYERS_KEY, requireAdmin, setJSON } from './_utils.js'
import { fetchPlayerProfile } from './ks-api.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const body = parseBody(event)
  const playerId = String(body.playerId || '').trim()
  if (!playerId) return cors({ error: 'playerId required' }, 400)

  const players = (await getJSON(store, PLAYERS_KEY, [])) || []
  if (players.find(p => String(p.id) === playerId)) return cors({ error: 'duplicate' }, 409)
  if (players.length >= 100) return cors({ error: 'limit 100 players' }, 400)

  let profile = { nickname: '', avatar_image: '' }
  try {
    profile = await fetchPlayerProfile(playerId)
  } catch (e) {
    // allow add even if profile fetch failed
  }

  const next = [
    ...players,
    { id: playerId, nickname: profile.nickname || '', avatar_image: profile.avatar_image || '', addedAt: Date.now(), lastRedeemedAt: null, disabled: false }
  ]
  await setJSON(store, PLAYERS_KEY, next)
  return cors({ ok: true, players: next })
}

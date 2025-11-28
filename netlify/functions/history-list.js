import { cors, getJSON, getStoreFromEvent, HISTORY_PREFIX, PLAYERS_KEY, requireAdmin, todayYMD } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const date = (event.queryStringParameters?.date || todayYMD()).slice(0,10)
  const key = `${HISTORY_PREFIX}${date}.json`
  const entries = (await getJSON(store, key, [])) || []
  const players = (await getJSON(store, PLAYERS_KEY, [])) || []
  const pmap = new Map(players.map(p => [String(p.id), p.nickname || '']))

  const summary = entries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1
    return acc
  }, { success: 0, already_redeemed: 0, error: 0 })

  // map to a lightweight list
  const out = entries.map(e => ({ ts: e.ts, playerId: e.playerId, nickname: pmap.get(String(e.playerId)) || '', code: e.code, status: e.status, message: e.message }))
  out.sort((a,b) => b.ts - a.ts)

  return cors({ entries: out, summary })
}

import { cors, getJSON, getStoreFromEvent, CODES_KEY, PLAYERS_KEY, requireAdmin, getStatusIndex } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const codes = (await getJSON(store, CODES_KEY, [])) || []
  const players = (await getJSON(store, PLAYERS_KEY, [])) || []
  const enabledPlayers = players.filter(p => !p.disabled)

  const idx = await getStatusIndex(store)
  const withStats = codes.map(c => {
    let redeemedCount = 0
    for (const pid of Object.keys(idx.players || {})) {
      const red = idx.players[pid]?.redeemed || {}
      if (red[c.code]) redeemedCount++
    }
    return { ...c, stats: { redeemedCount, totalPlayers: enabledPlayers.length } }
  })

  return cors({ codes: withStats })
}

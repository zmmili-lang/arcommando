import { cors, getJSON, getStoreFromEvent, CODES_KEY, HISTORY_PREFIX, PLAYERS_KEY, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const codes = (await getJSON(store, CODES_KEY, [])) || []
  const players = (await getJSON(store, PLAYERS_KEY, [])) || []
  const enabledPlayers = players.filter(p => !p.disabled)

  // Build redeemed sets per code from all history
  const redeemedMap = new Map()
  for (const c of codes) redeemedMap.set(c.code, new Set())
  for await (const page of store.list({ prefix: HISTORY_PREFIX, paginate: true })) {
    for (const item of page.blobs) {
      const entries = await store.get(item.key, { type: 'json' })
      if (!Array.isArray(entries)) continue
      for (const e of entries) {
        if (e.status === 'success' || e.status === 'already_redeemed') {
          if (redeemedMap.has(e.code)) redeemedMap.get(e.code).add(String(e.playerId))
        }
      }
    }
  }

  const withStats = codes.map(c => ({
    ...c,
    stats: { redeemedCount: (redeemedMap.get(c.code) || new Set()).size, totalPlayers: enabledPlayers.length }
  }))

  return cors({ codes: withStats })
}

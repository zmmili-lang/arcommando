import { cors, getJSON, getStoreFromEvent, requireAdmin, PLAYERS_KEY, CODES_KEY, HISTORY_PREFIX, JOBS_PREFIX } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)

  const players = (await getJSON(store, PLAYERS_KEY, [])) || []
  const codes = (await getJSON(store, CODES_KEY, [])) || []

  // Jobs: read all
  const jobs = []
  const jobKeys = []
  for await (const page of store.list({ prefix: JOBS_PREFIX, paginate: true })) {
    for (const b of page.blobs) jobKeys.push(b.key)
  }
  jobKeys.sort().reverse()
  for (const key of jobKeys) {
    const j = await store.get(key, { type: 'json' })
    jobs.push({ key, ...j })
  }

  // History: read all files and include all entries
  const history = []
  const histKeys = []
  for await (const page of store.list({ prefix: HISTORY_PREFIX, paginate: true })) {
    for (const b of page.blobs) histKeys.push(b.key)
  }
  histKeys.sort()
  for (const key of histKeys) {
    const arr = await store.get(key, { type: 'json' })
    if (Array.isArray(arr)) {
      for (const e of arr) history.push({ key, ...e })
    }
  }

  // Summary across all history
  const summary = history.reduce((acc, e) => {
    const k = e.status || 'unknown'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

  const server = {
    ks: {
      loginUrl: 'https://kingshot-giftcode.centurygame.com/api/player',
      redeemUrl: 'https://kingshot-giftcode.centurygame.com/api/gift_code',
      requestContentType: 'application/json',
      sign: 'md5(sorted key=value joined with & + secret)'
    },
    retries: { maxRetries: 3, retryDelayMs: 2000 },
    redeemDelayMs: { min: 1000, max: 1000 }
  }

  return cors({
    meta: {
      playersCount: players.length,
      codesCount: codes.length,
      jobsCount: jobKeys.length,
      historyFiles: histKeys,
    },
    server,
    players,
    codes,
    jobs,
    history,
    summary
  })
}

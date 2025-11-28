import { cors, getJSON, getStoreFromEvent, requireAdmin, PLAYERS_KEY, CODES_KEY, HISTORY_PREFIX, JOBS_PREFIX } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)

  const players = (await getJSON(store, PLAYERS_KEY, [])) || []
  const codes = (await getJSON(store, CODES_KEY, [])) || []

  // Jobs: read latest 5
  const jobs = []
  const jobKeys = []
  for await (const page of store.list({ prefix: JOBS_PREFIX, paginate: true })) {
    for (const b of page.blobs) jobKeys.push(b.key)
  }
  jobKeys.sort().reverse()
  for (const key of jobKeys.slice(0,5)) {
    const j = await store.get(key, { type: 'json' })
    jobs.push({ key, ...j })
  }

  // History sample: last 2 days, up to 200 entries
  const history = []
  const histKeys = []
  for await (const page of store.list({ prefix: HISTORY_PREFIX, paginate: true })) {
    for (const b of page.blobs) histKeys.push(b.key)
  }
  histKeys.sort().reverse()
  for (const key of histKeys.slice(0,2)) {
    const arr = await store.get(key, { type: 'json' })
    if (Array.isArray(arr)) {
      for (const e of arr.slice(-200)) history.push({ key, ...e })
    }
  }

  return cors({
    meta: {
      playersCount: players.length,
      codesCount: codes.length,
      jobsCount: jobKeys.length,
      historyFiles: histKeys.slice(0,2),
    },
    players,
    codes,
    jobs,
    history
  })
}

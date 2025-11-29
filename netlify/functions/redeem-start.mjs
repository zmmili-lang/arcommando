import { cors, getJSON, getStoreFromEvent, JOBS_PREFIX, parseBody, PLAYERS_KEY, CODES_KEY, requireAdmin, setJSON, getStatusIndex } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const body = parseBody(event)

  const players = (await getJSON(store, PLAYERS_KEY, [])) || []
  const codes = (await getJSON(store, CODES_KEY, [])) || []
  const onlyCode = body?.onlyCode ? String(body.onlyCode).trim() : null
  const activeCodes = onlyCode ? codes.filter(c => c.code === onlyCode) : codes.filter(c => !!c.active)

  // Precompute skip sets from status index so totalTasks counts only actual attempts
  let attempts = 0
  try {
    const idx = await getStatusIndex(store)
    const redeemedPairs = new Set()
    const expiredCodes = new Set()
    const usedCodes = new Set()
    for (const [pid, data] of Object.entries(idx.players || {})) {
      for (const code of Object.keys(data.redeemed || {})) redeemedPairs.add(`${pid}:${code}`)
      for (const [code, reason] of Object.entries(data.blocked || {})) {
        if (reason === 'expired') expiredCodes.add(code)
        if (reason === 'limit') usedCodes.add(code)
      }
    }
    for (const c of activeCodes) {
      if (expiredCodes.has(c.code) || usedCodes.has(c.code)) continue
      for (const p of players) {
        if (!redeemedPairs.has(`${p.id}:${c.code}`)) attempts++
      }
    }
  } catch {
    // fall back to naive count if index missing
    attempts = players.length * activeCodes.length
  }

  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
  const job = {
    id: jobId,
    status: 'queued',
    startedAt: Date.now(),
    finishedAt: null,
    totalTasks: attempts,
    done: 0,
    successes: 0,
    failures: 0,
    lastEvent: null,
    onlyCode: onlyCode || undefined
  }
  await setJSON(store, `${JOBS_PREFIX}${jobId}.json`, job)
  return cors({ jobId })
}

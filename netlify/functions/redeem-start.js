import { cors, getJSON, getStoreFromEvent, JOBS_PREFIX, parseBody, PLAYERS_KEY, CODES_KEY, requireAdmin, setJSON } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const body = parseBody(event)

  const players = (await getJSON(store, PLAYERS_KEY, [])) || []
  const codes = (await getJSON(store, CODES_KEY, [])) || []
  const enabledPlayers = players.filter(p => !p.disabled)
  const onlyCode = body?.onlyCode ? String(body.onlyCode).trim() : null
  const activeCodes = onlyCode ? codes.filter(c => c.code === onlyCode) : codes.filter(c => !!c.active)

  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
  const job = {
    id: jobId,
    status: 'queued',
    startedAt: Date.now(),
    finishedAt: null,
    totalTasks: enabledPlayers.length * activeCodes.length,
    done: 0,
    successes: 0,
    failures: 0,
    lastEvent: null,
    onlyCode: onlyCode || undefined
  }
  await setJSON(store, `${JOBS_PREFIX}${jobId}.json`, job)
  return cors({ jobId })
}

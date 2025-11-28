import { appendHistory, cors, getJSON, getStoreFromEvent, JOBS_PREFIX, parseBody, PLAYERS_KEY, CODES_KEY, readJob, requireAdmin, setJSON, sleep, updateJob } from './_utils.js'
import { redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)

  const jobId = (event.queryStringParameters?.jobId || '').trim()
  if (!jobId) return cors({ error: 'jobId required' }, 400)

  const players = (await getJSON(store, PLAYERS_KEY, [])) || []
  const codes = (await getJSON(store, CODES_KEY, [])) || []
  const enabledPlayers = players.filter(p => !p.disabled)
  const activeCodes = codes.filter(c => !!c.active)

  await updateJob(store, jobId, { status: 'running' })

  const minDelayMs = 1000, maxDelayMs = 1000 // mirror python (1s)

  for (const c of activeCodes) {
    for (const p of enabledPlayers) {
      const ts = Date.now()
      try {
        const res = await redeemGiftCode({ playerId: p.id, code: c.code })
        await appendHistory(store, { ts, playerId: p.id, code: c.code, status: res.status, message: res.message, raw: res.raw })
        if (res.status === 'success') {
          // mark player lastRedeemedAt and code lastTriedAt
          const playersNow = await getJSON(store, PLAYERS_KEY, [])
          const idx = playersNow.findIndex(x => String(x.id) === String(p.id))
          if (idx !== -1) { playersNow[idx].lastRedeemedAt = ts; await setJSON(store, PLAYERS_KEY, playersNow) }
        }
        const codesNow = await getJSON(store, CODES_KEY, [])
        const cidx = codesNow.findIndex(x => x.code === c.code)
        if (cidx !== -1) { codesNow[cidx].lastTriedAt = ts; await setJSON(store, CODES_KEY, codesNow) }

        const curJob = await readJob(store, jobId) || {}
        const job = await updateJob(store, jobId, {
          done: (curJob.done || 0) + 1,
          successes: (res.status === 'success' || res.status === 'already_redeemed') ? (curJob.successes || 0) + 1 : (curJob.successes || 0),
          failures: res.status === 'error' ? (curJob.failures || 0) + 1 : (curJob.failures || 0),
          lastEvent: `${new Date(ts).toISOString()} ${p.id} ${c.code} => ${res.status} (${res.message})`
        })

        if (res.raw?.msg === 'TIME ERROR' || res.raw?.msg === 'USED') {
          await updateJob(store, jobId, { status: 'complete', finishedAt: Date.now(), lastEvent: `Stopping early due to ${res.raw.msg}` })
          return cors({ ok: true })
        }
      } catch (e) {
        await appendHistory(store, { ts, playerId: p.id, code: c.code, status: 'error', message: String(e.message || e), raw: null })
        const curJob = await readJob(store, jobId) || {}
        await updateJob(store, jobId, {
          done: (curJob.done || 0) + 1,
          failures: (curJob.failures || 0) + 1,
          lastEvent: `${new Date(ts).toISOString()} ${p.id} ${c.code} => error (${String(e.message || e)})`
        })
      }

      const delay = minDelayMs + Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1))
      await sleep(delay)
    }
  }

  await updateJob(store, jobId, { status: 'complete', finishedAt: Date.now() })
  return cors({ ok: true })
}

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

  const jobMeta = await readJob(store, jobId)
  const activeCodes = jobMeta?.onlyCode ? codes.filter(c => c.code === jobMeta.onlyCode) : codes.filter(c => !!c.active)

  // Build skip maps from status index (avoid duplicate attempts and known expired/limit codes)
  const redeemedPairs = new Set() // `${playerId}:${code}`
  const expiredCodes = new Set()
  const usedCodes = new Set()
  try {
    const idx = (await (await import('./_utils.js')).getStatusIndex(store))
    for (const [pid, data] of Object.entries(idx.players || {})) {
      for (const code of Object.keys(data.redeemed || {})) {
        redeemedPairs.add(`${pid}:${code}`)
      }
      for (const [code, reason] of Object.entries(data.blocked || {})) {
        if (reason === 'expired') expiredCodes.add(code)
        if (reason === 'limit') usedCodes.add(code)
      }
    }
  } catch {}

  await updateJob(store, jobId, { status: 'running' })

  const minDelayMs = 1000, maxDelayMs = 1000 // mirror python (1s)

  for (const c of activeCodes) {
    for (const p of enabledPlayers) {
      const ts = Date.now()

      // Skip rules
      const pair = `${p.id}:${c.code}`
      let skippedReason = null
      if (redeemedPairs.has(pair)) skippedReason = 'already redeemed (skip)'
      else if (expiredCodes.has(c.code)) skippedReason = 'expired (skip)'
      else if (usedCodes.has(c.code)) skippedReason = 'claim limit reached (skip)'

      if (skippedReason) {
        const curJob = await readJob(store, jobId) || {}
        const lastEventObj = { ts, playerId: p.id, nickname: p.nickname || '', code: c.code, status: 'skipped', message: skippedReason }
        await updateJob(store, jobId, {
          done: (curJob.done || 0) + 1,
          lastEvent: `${new Date(ts).toISOString()} ${p.id} ${c.code} => skipped (${skippedReason})`,
          lastEventObj
        })
        // persist skip reason in status index so UI hides the Redeem button for remaining players too
        try {
          const { applyStatusToIndex } = await import('./_utils.js')
          const entry = { ts, playerId: p.id, code: c.code }
          if (skippedReason.includes('already')) {
            entry.status = 'already_redeemed'; entry.message = 'Already redeemed'; entry.raw = { msg: 'RECEIVED' }
          } else if (skippedReason.includes('expired')) {
            entry.status = 'error'; entry.message = 'Code has expired'; entry.raw = { msg: 'TIME ERROR' }
          } else if (skippedReason.includes('claim limit')) {
            entry.status = 'error'; entry.message = 'Claim limit reached'; entry.raw = { msg: 'USED' }
          }
          await applyStatusToIndex(store, entry)
        } catch {}
        continue
      }

      try {
        const res = await redeemGiftCode({ playerId: p.id, code: c.code })
        await appendHistory(store, { ts, playerId: p.id, code: c.code, status: res.status, message: res.message, raw: res.raw })
        if (res.status === 'success' || res.status === 'already_redeemed') {
          // mark player lastRedeemedAt and code lastTriedAt, and update in-memory skip set
          redeemedPairs.add(`${p.id}:${c.code}`)
          const playersNow = await getJSON(store, PLAYERS_KEY, [])
          const idx = playersNow.findIndex(x => String(x.id) === String(p.id))
          if (idx !== -1) { playersNow[idx].lastRedeemedAt = ts; await setJSON(store, PLAYERS_KEY, playersNow) }
        }
        const codesNow = await getJSON(store, CODES_KEY, [])
        const cidx = codesNow.findIndex(x => x.code === c.code)
        if (cidx !== -1) { codesNow[cidx].lastTriedAt = ts; await setJSON(store, CODES_KEY, codesNow) }

        const curJob = await readJob(store, jobId) || {}
        const lastEventObj = { ts, playerId: p.id, nickname: p.nickname || '', code: c.code, status: res.status, message: res.message }
        await updateJob(store, jobId, {
          done: (curJob.done || 0) + 1,
          successes: (res.status === 'success' || res.status === 'already_redeemed') ? (curJob.successes || 0) + 1 : (curJob.successes || 0),
          failures: res.status === 'error' ? (curJob.failures || 0) + 1 : (curJob.failures || 0),
          lastEvent: `${new Date(ts).toISOString()} ${p.id} ${c.code} => ${res.status} (${res.message})`,
          lastEventObj
        })

        // If we learn mid-run that this code is expired or claim-limited, mark it so subsequent players are skipped
        if (res.raw?.msg === 'TIME ERROR') {
          expiredCodes.add(c.code)
        } else if (res.raw?.msg === 'USED') {
          usedCodes.add(c.code)
        }
      } catch (e) {
        await appendHistory(store, { ts, playerId: p.id, code: c.code, status: 'error', message: String(e.message || e), raw: null })
        const curJob = await readJob(store, jobId) || {}
        const lastEventObj = { ts, playerId: p.id, nickname: p.nickname || '', code: c.code, status: 'error', message: String(e.message || e) }
        await updateJob(store, jobId, {
          done: (curJob.done || 0) + 1,
          failures: (curJob.failures || 0) + 1,
          lastEvent: `${new Date(ts).toISOString()} ${p.id} ${c.code} => error (${String(e.message || e)})`,
          lastEventObj
        })
      }

      const delay = minDelayMs + Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1))
      await sleep(delay)
    }
  }

  await updateJob(store, jobId, { status: 'complete', finishedAt: Date.now() })
  return cors({ ok: true })
}

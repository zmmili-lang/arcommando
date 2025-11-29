import { appendHistory, applyStatusToIndex, cors, ensureSchema, getSql, readJob, requireAdmin, sleep, updateJob } from './_utils.js'
import { redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  await ensureSchema()
  const sql = getSql()

  const jobId = (event.queryStringParameters?.jobId || '').trim()
  if (!jobId) return cors({ error: 'jobId required' }, 400)

  const players = await sql`SELECT id, nickname FROM players`
  const codes = await sql`SELECT code, active FROM codes`

  const jobMeta = await readJob(sql, jobId)
  const activeCodes = jobMeta?.onlyCode ? codes.filter(c => c.code === jobMeta.onlyCode) : codes.filter(c => !!c.active)

  const redeemedPairsRows = await sql`SELECT player_id, code FROM player_codes WHERE redeemed_at IS NOT NULL`
  const redeemedPairs = new Set(redeemedPairsRows.map(r => `${r.player_id}:${r.code}`))
  const blockedRows = await sql`SELECT code, blocked_reason FROM player_codes WHERE blocked_reason IS NOT NULL`
  const expiredCodes = new Set(blockedRows.filter(r => r.blocked_reason === 'expired').map(r => r.code))
  const usedCodes = new Set(blockedRows.filter(r => r.blocked_reason === 'limit').map(r => r.code))

  await updateJob(sql, jobId, { status: 'running' })

  const minDelayMs = 1000, maxDelayMs = 1000

  for (const c of activeCodes) {
    for (const p of players) {
      const ts = Date.now()

      const pair = `${p.id}:${c.code}`
      let skippedReason = null
      if (redeemedPairs.has(pair)) skippedReason = 'already redeemed (skip)'
      else if (expiredCodes.has(c.code)) skippedReason = 'expired (skip)'
      else if (usedCodes.has(c.code)) skippedReason = 'claim limit reached (skip)'

      if (skippedReason) {
        const curJob = await readJob(sql, jobId) || {}
        const lastEventObj = { ts, playerId: p.id, nickname: p.nickname || '', code: c.code, status: 'skipped', message: skippedReason }
        await updateJob(sql, jobId, {
          lastEvent: `${new Date(ts).toISOString()} ${p.id} ${c.code} => skipped (${skippedReason})`,
          lastEventObj
        })
        try {
          const entry = { ts, playerId: p.id, code: c.code }
          if (skippedReason.includes('already')) {
            entry.status = 'already_redeemed'; entry.message = 'Already redeemed'; entry.raw = { msg: 'RECEIVED' }
          } else if (skippedReason.includes('expired')) {
            entry.status = 'error'; entry.message = 'Code has expired'; entry.raw = { msg: 'TIME ERROR' }
          } else if (skippedReason.includes('claim limit')) {
            entry.status = 'error'; entry.message = 'Claim limit reached'; entry.raw = { msg: 'USED' }
          }
          await applyStatusToIndex(sql, entry)
        } catch {}
        continue
      }

      try {
        const res = await redeemGiftCode({ playerId: p.id, code: c.code })
        await appendHistory(sql, { ts, playerId: p.id, code: c.code, status: res.status, message: res.message, raw: res.raw })
        if (res.status === 'success' || res.status === 'already_redeemed') {
          redeemedPairs.add(`${p.id}:${c.code}`)
          await sql`UPDATE players SET last_redeemed_at = ${ts} WHERE id = ${p.id}`
        }
        await sql`UPDATE codes SET last_tried_at = ${ts} WHERE code = ${c.code}`

        const curJob = await readJob(sql, jobId) || {}
        const lastEventObj = { ts, playerId: p.id, nickname: p.nickname || '', code: c.code, status: res.status, message: res.message }
        await updateJob(sql, jobId, {
          done: (curJob.done || 0) + 1,
          successes: (res.status === 'success' || res.status === 'already_redeemed') ? (curJob.successes || 0) + 1 : (curJob.successes || 0),
          failures: res.status === 'error' ? (curJob.failures || 0) + 1 : (curJob.failures || 0),
          lastEvent: `${new Date(ts).toISOString()} ${p.id} ${c.code} => ${res.status} (${res.message})`,
          lastEventObj
        })

        if (res.raw?.msg === 'TIME ERROR') {
          expiredCodes.add(c.code)
        } else if (res.raw?.msg === 'USED') {
          usedCodes.add(c.code)
        }
      } catch (e) {
        await appendHistory(sql, { ts, playerId: p.id, code: c.code, status: 'error', message: String(e.message || e), raw: null })
        const curJob = await readJob(sql, jobId) || {}
        const lastEventObj = { ts, playerId: p.id, nickname: p.nickname || '', code: c.code, status: 'error', message: String(e.message || e) }
        await updateJob(sql, jobId, {
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

  await updateJob(sql, jobId, { status: 'complete', finishedAt: Date.now() })
  return cors({ ok: true })
}

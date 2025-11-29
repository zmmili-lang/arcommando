import { cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  await ensureSchema()
  const sql = getSql()
  const body = parseBody(event)

  const allPlayers = await sql`SELECT id FROM players`
  const codesRows = await sql`SELECT code, active FROM codes`
  const onlyCode = body?.onlyCode ? String(body.onlyCode).trim().toUpperCase() : null
  const onlyPlayer = body?.onlyPlayer ? String(body.onlyPlayer).trim() : null
  const players = onlyPlayer ? allPlayers.filter(p => String(p.id) === onlyPlayer) : allPlayers
  const activeCodes = onlyCode ? codesRows.filter(c => c.code === onlyCode) : codesRows.filter(c => !!c.active)

  const redeemedPairsRows = await sql`SELECT player_id, code FROM player_codes WHERE redeemed_at IS NOT NULL`
  const redeemedPairs = new Set(redeemedPairsRows.map(r => `${r.player_id}:${r.code}`))
  const blockedCodesRows = await sql`SELECT code, blocked_reason FROM player_codes WHERE blocked_reason IS NOT NULL`
  const expiredCodes = new Set(blockedCodesRows.filter(r => r.blocked_reason === 'expired').map(r => r.code))
  const usedCodes = new Set(blockedCodesRows.filter(r => r.blocked_reason === 'limit').map(r => r.code))

  let attempts = 0
  for (const c of activeCodes) {
    if (expiredCodes.has(c.code) || usedCodes.has(c.code)) continue
    for (const p of players) {
      if (!redeemedPairs.has(`${p.id}:${c.code}`)) attempts++
    }
  }

  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
  await sql`INSERT INTO jobs (id, status, started_at, finished_at, total_tasks, done, successes, failures, last_event, last_event_obj, only_code, only_player)
            VALUES (${jobId}, ${'queued'}, ${Date.now()}, ${null}, ${attempts}, ${0}, ${0}, ${0}, ${null}, ${null}, ${onlyCode || null}, ${onlyPlayer || null})`
  return cors({ jobId })
}

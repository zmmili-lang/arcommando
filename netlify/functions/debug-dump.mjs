import { cors, ensureSchema, getSql, requireAdmin, todayYMD } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  await ensureSchema()
  const sql = getSql()

  const players = (await sql`SELECT id, nickname, avatar_image, added_at, last_redeemed_at FROM players`).map(r => ({ id: r.id, nickname: r.nickname || '', avatar_image: r.avatar_image || '', addedAt: r.added_at || null, lastRedeemedAt: r.last_redeemed_at || null }))
  const codes = (await sql`SELECT code, note, active, added_at, last_tried_at FROM codes`).map(r => ({ code: r.code, note: r.note || '', active: !!r.active, addedAt: r.added_at || null, lastTriedAt: r.last_tried_at || null }))
  const jobs = await sql`SELECT id, status, started_at, finished_at, total_tasks, done, successes, failures, last_event, last_event_obj, only_code FROM jobs ORDER BY started_at DESC LIMIT 20`

  const date = todayYMD()
  const start = Date.parse(`${date}T00:00:00.000Z`)
  const end = start + 24*60*60*1000
  const historyRows = await sql`SELECT ts, player_id, code, status, message FROM history WHERE ts >= ${start} AND ts < ${end}`
  const history = historyRows.map(r => ({ ts: r.ts, playerId: r.player_id, code: r.code, status: r.status, message: r.message }))
  const summary = history.reduce((acc, e) => { const k = e.status || 'unknown'; acc[k] = (acc[k] || 0) + 1; return acc }, {})

  // Derive list of days with data (like history files)
  const days = await sql`SELECT DISTINCT to_char(to_timestamp(ts/1000) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d FROM history ORDER BY d`
  const historyFiles = days.map(d => `history/${d.d}.json`)

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
      jobsCount: jobs.length,
      historyFiles,
    },
    server,
    players,
    codes,
    jobs: jobs.map(j => ({ key: `jobs/${j.id}.json`, ...j })),
    history,
    summary
  })
}

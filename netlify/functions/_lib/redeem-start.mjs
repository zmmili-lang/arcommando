import { cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})
    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res
    await ensureSchema()
    const sql = getSql()
    const body = parseBody(event)

    const onlyCode = body?.onlyCode ? String(body.onlyCode).trim().toUpperCase() : null
    const onlyPlayer = body?.onlyPlayer ? String(body.onlyPlayer).trim() : null

    const countResult = await sql`
    SELECT count(*) as count
    FROM players p
    CROSS JOIN codes c
    WHERE c.active = true
      AND (${onlyCode}::text IS NULL OR c.code = ${onlyCode})
      AND (${onlyPlayer}::text IS NULL OR p.id = ${onlyPlayer})
      AND NOT EXISTS (
        SELECT 1 FROM player_codes pc 
        WHERE pc.code = c.code 
        AND pc.blocked_reason IN ('expired', 'limit')
      )
      AND NOT EXISTS (
        SELECT 1 FROM player_codes pc 
        WHERE pc.player_id = p.id 
        AND pc.code = c.code 
        AND pc.redeemed_at IS NOT NULL
      )
  `
    const attempts = parseInt(countResult[0].count)

    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await sql`INSERT INTO jobs (id, status, started_at, finished_at, total_tasks, done, successes, failures, last_event, last_event_obj, only_code, only_player)
            VALUES (${jobId}, ${'queued'}, ${Date.now()}, ${null}, ${attempts}, ${0}, ${0}, ${0}, ${null}, ${null}, ${onlyCode || null}, ${onlyPlayer || null})`
    return cors({ jobId })
}

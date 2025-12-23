import { appendHistory, cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'
import { redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})
    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res
    await ensureSchema()
    const sql = getSql()
    const body = parseBody(event)
    const playerId = String(body.playerId || '').trim()
    if (!playerId) return cors({ error: 'playerId required' }, 400)

    const running = await sql`SELECT id FROM jobs WHERE status = 'running' LIMIT 1`;
    if (running.length) return cors({ error: 'A redemption job is already running' }, 409);

    // Verify player exists
    const exists = await sql`SELECT nickname FROM players WHERE id = ${playerId}`
    if (!exists.length) return cors({ error: 'Player not found' }, 404)
    const nickname = exists[0].nickname || playerId

    // Fetch active codes not yet redeemed or blocked for this player
    const activeCodes = await sql`
        SELECT c.code 
        FROM codes c
        LEFT JOIN player_codes pc ON c.code = pc.code AND pc.player_id = ${playerId}
        WHERE c.active = true 
        AND (pc.player_id IS NULL OR (pc.redeemed_at IS NULL AND pc.blocked_reason IS NULL))
    `
    const jobId = `redeem-player-${playerId}-${Date.now()}`
    const totalTasks = activeCodes.length

    // Initial job record
    await sql`INSERT INTO jobs (id, status, started_at, total_tasks, done, successes, failures, only_player)
              VALUES (${jobId}, 'running', ${Date.now()}, ${totalTasks}, 0, 0, 0, ${playerId});`;

    // Start background processing (non-blocking return)
    (async () => {
        let done = 0, successes = 0, failures = 0
        for (let i = 0; i < activeCodes.length; i++) {
            const c = activeCodes[i]
            try {
                const res = await redeemGiftCode({ playerId, code: c.code })
                await appendHistory(sql, { ts: Date.now(), playerId, code: c.code, status: res.status, message: res.message, raw: res.raw })

                if (res.status === 'success') successes++
                else failures++

                done++
                const display = `Player: ${nickname} | Code: ${c.code}`
                await sql`UPDATE jobs SET done = ${done}, successes = ${successes}, failures = ${failures}, last_event = ${display} WHERE id = ${jobId}`

                if (res.status === 'rate_limited' || res.message === 'No response') {
                    await sql`UPDATE jobs SET status = 'rate_limited', finished_at = ${Date.now()} WHERE id = ${jobId}`
                    break
                }
            } catch (e) {
                failures++
                console.error(`Failed to redeem ${c.code} for ${playerId}:`, e)
                await sql`UPDATE jobs SET done = ${i + 1}, failures = ${failures} WHERE id = ${jobId}`
            }
            // Throttling
            if (i < activeCodes.length - 1) await new Promise(r => setTimeout(r, 2300))
        }
        await sql`UPDATE jobs SET status = 'finished', finished_at = ${Date.now()} WHERE id = ${jobId}`;
    })().catch(err => console.error('Background redemption failed:', err));
    ;

    return cors({ ok: true, jobId })
}

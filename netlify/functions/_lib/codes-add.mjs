import { appendHistory, cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'
import { redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})
    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res
    const sql = getSql()
    await ensureSchema()
    const body = parseBody(event)
    const code = String(body.code || '').trim()
    const note = String(body.note || '')
    if (!code) return cors({ error: 'code required' }, 400)
    const exists = await sql`SELECT 1 FROM codes WHERE code = ${code}`
    if (exists.length) return cors({ error: 'duplicate' }, 409)
    await sql`INSERT INTO codes (code, note, active, added_at, last_tried_at) VALUES (${code}, ${note}, ${true}, ${Date.now()}, ${null})`
    const codes = await sql`SELECT code, note, active, added_at, last_tried_at FROM codes ORDER BY added_at NULLS LAST, code`
    const out = codes.map(c => ({ code: c.code, note: c.note || '', active: !!c.active, addedAt: c.added_at ? Number(c.added_at) : null, lastTriedAt: c.last_tried_at ? Number(c.last_tried_at) : null }))

    const running = await sql`SELECT id FROM jobs WHERE status = 'running' LIMIT 1`;
    if (running.length) return cors({ error: 'A redemption job is already running' }, 409);

    // Background redemption job
    const players = await sql`SELECT id, nickname FROM players`
    const jobId = `add-code-${code}-${Date.now()}`
    const totalTasks = players.length

    // Initial job record
    await sql`INSERT INTO jobs (id, status, started_at, total_tasks, done, successes, failures, only_code)
              VALUES (${jobId}, 'running', ${Date.now()}, ${totalTasks}, 0, 0, 0, ${code});`;

    // Start background processing (non-blocking return)
    (async () => {
        let done = 0, successes = 0, failures = 0
        for (let i = 0; i < players.length; i++) {
            const p = players[i]
            const pName = p.nickname || p.id
            try {
                const res = await redeemGiftCode({ playerId: p.id, code })
                await appendHistory(sql, { ts: Date.now(), playerId: p.id, code, status: res.status, message: res.message, raw: res.raw })

                if (res.status === 'success') successes++
                else failures++

                done++
                const display = `Player: ${pName} | Code: ${code}`
                await sql`UPDATE jobs SET done = ${done}, successes = ${successes}, failures = ${failures}, last_event = ${display} WHERE id = ${jobId}`

                if (res.status === 'rate_limited' || res.message === 'No response') {
                    await sql`UPDATE jobs SET status = 'rate_limited', finished_at = ${Date.now()} WHERE id = ${jobId}`
                    break
                }
            } catch (e) {
                failures++
                console.error(`Failed to redeem ${code} for ${p.id}:`, e)
                await sql`UPDATE jobs SET done = ${i + 1}, failures = ${failures} WHERE id = ${jobId}`
            }
            // Throttling
            if (i < players.length - 1) await new Promise(r => setTimeout(r, 2300))
        }
        await sql`UPDATE jobs SET status = 'finished', finished_at = ${Date.now()} WHERE id = ${jobId}`;
    })().catch(err => console.error('Background redemption failed:', err));

    return cors({ ok: true, codes: out, jobId })
}

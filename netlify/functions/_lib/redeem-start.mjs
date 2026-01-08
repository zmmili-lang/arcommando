import { appendHistory, cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'
import { redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return cors({})
        const auth = requireAdmin(event)
        if (!auth.ok) return auth.res
        await ensureSchema()
        const sql = getSql()
        const body = parseBody(event)

        const onlyCode = body?.onlyCode ? String(body.onlyCode).trim() : null
        const onlyPlayer = body?.onlyPlayer ? String(body.onlyPlayer).trim() : null

        if (!onlyCode && !onlyPlayer) {
            return cors({ error: 'Must provide onlyCode or onlyPlayer for synchronous redemption' }, 400)
        }

        const running = await sql`SELECT id FROM jobs WHERE status = 'running' LIMIT 1`;
        if (running.length) return cors({ error: 'A redemption job is already running' }, 409);

        const results = []
        const jobId = `redeem-${Date.now()}`

        let activeCodes = []
        let players = []
        let targetNickname = ''

        if (onlyPlayer) {
            const pInfo = await sql`SELECT nickname FROM players WHERE id = ${onlyPlayer}`;
            targetNickname = pInfo[0]?.nickname || onlyPlayer;
            activeCodes = await sql`
                SELECT c.code 
                FROM codes c
                LEFT JOIN player_codes pc ON c.code = pc.code AND pc.player_id = ${onlyPlayer}
                WHERE c.active = true 
                AND (pc.player_id IS NULL OR (pc.redeemed_at IS NULL AND pc.blocked_reason IS NULL))
            `;
        } else if (onlyCode) {
            players = await sql`
                SELECT p.id, p.nickname
                FROM players p
                LEFT JOIN player_codes pc ON p.id = pc.player_id AND pc.code = ${onlyCode}
                WHERE pc.player_id IS NULL OR (pc.redeemed_at IS NULL AND pc.blocked_reason IS NULL)
            `;
        }

        const totalTasks = onlyPlayer ? activeCodes.length : players.length

        await sql`INSERT INTO jobs (id, status, started_at, total_tasks, done, successes, failures, only_code, only_player)
                  VALUES (${jobId}, 'running', ${Date.now()}, ${totalTasks}, 0, 0, 0, ${onlyCode}, ${onlyPlayer});`;

        // Start background processing (non-blocking return)
        (async () => {
            if (onlyPlayer) {
                console.log(`🚀 Checking ${activeCodes.length} active codes for player ${onlyPlayer}`)
                let done = 0, successes = 0, failures = 0

                for (let i = 0; i < activeCodes.length; i++) {
                    const c = activeCodes[i]
                    try {
                        const res = await redeemGiftCode({ playerId: onlyPlayer, code: c.code })
                        await appendHistory(sql, { ts: Date.now(), playerId: onlyPlayer, code: c.code, status: res.status, message: res.message, raw: res.raw })

                        if (res.profile && res.profile.kid) {
                            await sql`UPDATE players SET 
                                kid = COALESCE(${Number(res.profile.kid) || null}, kid),
                                stove_lv = COALESCE(${Number(res.profile.stove_lv) || null}, stove_lv),
                                stove_lv_content = COALESCE(${res.profile.stove_lv_content || ''}, stove_lv_content)
                                WHERE id = ${onlyPlayer}`
                        }

                        if (res.status === 'success') successes++
                        else failures++

                        results.push({ code: c.code, playerId: onlyPlayer, status: res.status, message: res.message })

                        done++
                        const display = `Player: ${targetNickname} | Code: ${c.code}`
                        await sql`UPDATE jobs SET done = ${done}, successes = ${successes}, failures = ${failures}, last_event = ${display} WHERE id = ${jobId}`

                        if (res.status === 'rate_limited' || res.message === 'No response') {
                            await sql`UPDATE jobs SET status = 'rate_limited', finished_at = ${Date.now()} WHERE id = ${jobId}`
                            break
                        }
                    } catch (e) {
                        failures++
                        results.push({ code: c.code, playerId: onlyPlayer, status: 'error', message: String(e.message || e) })
                        await sql`UPDATE jobs SET done = ${i + 1}, failures = ${failures} WHERE id = ${jobId}`
                    }

                    if (i < activeCodes.length - 1) await new Promise(r => setTimeout(r, 2300))
                }
            } else if (onlyCode) {
                console.log(`🚀 Triggering redemption for ${onlyCode} for ${players.length} players`)
                let done = 0, successes = 0, failures = 0

                for (let i = 0; i < players.length; i++) {
                    const p = players[i]
                    const pName = p.nickname || p.id
                    try {
                        const res = await redeemGiftCode({ playerId: p.id, code: onlyCode })
                        await appendHistory(sql, { ts: Date.now(), playerId: p.id, code: onlyCode, status: res.status, message: res.message, raw: res.raw })

                        if (res.profile && res.profile.kid) {
                            await sql`UPDATE players SET 
                                kid = COALESCE(${Number(res.profile.kid) || null}, kid),
                                stove_lv = COALESCE(${Number(res.profile.stove_lv) || null}, stove_lv),
                                stove_lv_content = COALESCE(${res.profile.stove_lv_content || ''}, stove_lv_content)
                                WHERE id = ${p.id}`
                        }

                        if (res.status === 'success') successes++
                        else failures++

                        results.push({ code: onlyCode, playerId: p.id, status: res.status, message: res.message })

                        done++
                        const display = `Player: ${pName} | Code: ${onlyCode}`
                        await sql`UPDATE jobs SET done = ${done}, successes = ${successes}, failures = ${failures}, last_event = ${display} WHERE id = ${jobId}`

                        if (res.status === 'rate_limited' || res.message === 'No response') {
                            await sql`UPDATE jobs SET status = 'rate_limited', finished_at = ${Date.now()} WHERE id = ${jobId}`
                            break
                        }
                    } catch (e) {
                        failures++
                        results.push({ code: onlyCode, playerId: p.id, status: 'error', message: String(e.message || e) })
                        await sql`UPDATE jobs SET done = ${i + 1}, failures = ${failures} WHERE id = ${jobId}`
                    }

                    if (i < players.length - 1) await new Promise(r => setTimeout(r, 2300))
                }
            }

            await sql`UPDATE jobs SET status = 'finished', finished_at = ${Date.now()} WHERE id = ${jobId}`;
        })().catch(err => console.error('Background redemption failed:', err));

        return cors({ ok: true, jobId })
    } catch (err) {
        console.error('❌ redeem-start error:', err)
        return cors({ error: String(err.message || err) }, 500)
    }
}

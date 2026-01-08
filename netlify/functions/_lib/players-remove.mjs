import { cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})
    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res
    await ensureSchema()
    const sql = getSql()
    const body = parseBody(event)
    const ids = body.ids || []
    const id = String(body.id || '').trim()

    let count = 0
    if (ids.length > 0) {
        const cleanIds = ids.map(x => String(x).trim())
        console.log(`[Delete] Attempting to delete ${cleanIds.length} IDs:`, cleanIds)

        // 1. Delete from players (main table)
        const res = await sql`DELETE FROM players WHERE id = ANY(${cleanIds})`
        count += res.count
        console.log(`[Delete] Deleted ${res.count} from players`)

        // 2. Also ensure deletion from leaderboard_players if it exists (for safety)
        try {
            const res2 = await sql`DELETE FROM leaderboard_players WHERE uid = ANY(${cleanIds})`
            console.log(`[Delete] Deleted ${res2.count} from leaderboard_players`)
        } catch (e) {
            console.warn('Failed to delete from leaderboard_players (table might not exist or verify failed):', e.message)
        }

    } else if (id) {
        const cleanId = String(id).trim()
        const res = await sql`DELETE FROM players WHERE id = ${cleanId} OR TRIM(id) = ${cleanId}`
        count += res.count

        try {
            await sql`DELETE FROM leaderboard_players WHERE uid = ${cleanId}`
        } catch (e) { }
    } else {
        return cors({ error: 'id or ids required' }, 400)
    }

    // Refresh list
    const rows = await sql`SELECT id, nickname, avatar_image, added_at, last_redeemed_at FROM players ORDER BY added_at NULLS LAST, id`
    const players = rows.map(r => ({ id: r.id, nickname: r.nickname || '', avatar_image: r.avatar_image || '', addedAt: r.added_at ? Number(r.added_at) : null, lastRedeemedAt: r.last_redeemed_at ? Number(r.last_redeemed_at) : null }))

    return cors({ ok: true, count, players })
}

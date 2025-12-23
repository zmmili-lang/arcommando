import { getSql, cors, requireAdmin, ensureSchema } from './_lib/_utils.js'

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return cors({})
    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res

    try {
        await ensureSchema()
        const sql = getSql()

        const [playersCount] = await sql`SELECT COUNT(*) as count FROM players`
        const [codesCount] = await sql`SELECT COUNT(*) as count FROM codes`
        const [historyCount] = await sql`SELECT COUNT(*) as count FROM history`
        const [lbRecords] = await sql`SELECT COUNT(*) as count FROM leaderboard_power_history`

        return cors({
            ok: true,
            serverTime: new Date().toISOString(),
            stats: {
                players: Number(playersCount.count),
                codes: Number(codesCount.count),
                historyEntries: Number(historyCount.count),
                powerHistoryRecords: Number(lbRecords.count)
            },
            env: {
                nodeVersion: process.version,
                platform: process.platform
            }
        })
    } catch (error) {
        console.error('debug-dump error:', error)
        return cors({ error: String(error) }, 500)
    }
}

import { getSql, cors, requireAdmin, ensureSchema } from './_lib/_utils.js'

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return cors({})

    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res

    try {
        await ensureSchema()
        const sql = getSql()

        // Get all players with their latest power reading
        const players = await sql`
      SELECT 
        lp.name,
        lp.first_seen,
        lp.last_seen,
        (
          SELECT power 
          FROM leaderboard_power_history 
          WHERE player_name = lp.name 
          ORDER BY scraped_at DESC 
          LIMIT 1
        ) as current_power,
        (
          SELECT scraped_at 
          FROM leaderboard_power_history 
          WHERE player_name = lp.name 
          ORDER BY scraped_at DESC 
          LIMIT 1
        ) as power_updated_at
      FROM leaderboard_players lp
      WHERE lp.merged_into IS NULL
      ORDER BY current_power DESC NULLS LAST
    `

        return cors({
            players: players.map(p => ({
                name: p.name,
                firstSeen: p.first_seen,
                lastSeen: p.last_seen,
                currentPower: p.current_power,
                powerUpdatedAt: p.power_updated_at
            }))
        })
    } catch (error) {
        console.error('leaderboard-list error:', error)
        return cors({ error: String(error) }, 500)
    }
}

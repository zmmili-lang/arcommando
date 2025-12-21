import { getSql, cors, requireAdmin, ensureSchema } from './_lib/_utils.js'

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return cors({})

    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res

    try {
        await ensureSchema()
        const sql = getSql()

        // Get all players from unified table with their latest power reading
        const players = await sql`
      SELECT 
        p.nickname as name,
        p.id as uid,
        p.first_seen,
        p.last_seen,
        p.kills,
        p.alliance_name,
        p.kingdom,
        p.kid,
        p.stove_lv,
        p.stove_lv_content,
        p.avatar_image,
        (
          SELECT power 
          FROM leaderboard_power_history 
          WHERE player_id = p.id
          ORDER BY scraped_at DESC 
          LIMIT 1
        ) as current_power,
        (
          SELECT scraped_at 
          FROM leaderboard_power_history 
          WHERE player_id = p.id
          ORDER BY scraped_at DESC 
          LIMIT 1
        ) as power_updated_at
      FROM players p
      ORDER BY current_power DESC NULLS LAST
    `

        return cors({
            players: players.map(p => ({
                name: p.name,
                uid: p.uid,
                firstSeen: p.first_seen ? Number(p.first_seen) : null,
                lastSeen: p.last_seen ? Number(p.last_seen) : null,
                kills: p.kills,
                allianceName: p.alliance_name,
                kingdom: p.kingdom,
                kid: p.kid,
                stoveLv: p.stove_lv,
                stoveLvContent: p.stove_lv_content,
                avatarImage: p.avatar_image,
                currentPower: p.current_power,
                powerUpdatedAt: p.power_updated_at ? Number(p.power_updated_at) : null
            }))
        })
    } catch (error) {
        console.error('leaderboard-list error:', error)
        return cors({ error: String(error) }, 500)
    }
}

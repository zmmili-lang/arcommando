import { getSql, cors, requireAdmin, ensureSchema } from './_lib/_utils.js'

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return cors({})

    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res

    try {
        await ensureSchema()
        const sql = getSql()

        // Get all players from unified table with their latest power reading
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000
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
        ) as power_updated_at,
        (
          SELECT power 
          FROM leaderboard_power_history 
          WHERE player_id = p.id
            AND scraped_at <= ${dayAgo}
          ORDER BY scraped_at DESC 
          LIMIT 1
        ) as power_24h_ago,
        (
          SELECT power 
          FROM leaderboard_power_history 
          WHERE player_id = p.id
          ORDER BY scraped_at ASC 
          LIMIT 1
        ) as power_first
      FROM players p
      ORDER BY name, last_seen DESC
    `

        // Deduplicate in JS or use DISTINCT ON in SQL. 
        // Postgres DISTINCT ON is clean:
        /*
         players = await sql`
           SELECT DISTINCT ON (p.nickname) 
             p.nickname as name,
             ...
           FROM players p
           ORDER BY p.nickname, current_power DESC NULLS LAST
         `
        */
        // But since we want global order by power, and DISTINCT ON requires ORDER BY to start with distinct columns...
        // We can do a subquery or just dedupe in JS. JS is easier for small datasets (50-100 players). 
        // If dataset is huge (thousands), SQL is better. Assuming < 1000 for now.

        // Let's rely on JS deduplication to ensure we keep the "best" entry for each name (e.g. highest power or latest seen)
        const uniquePlayers = []
        const seenNames = new Set()

        // Sort by power desc first effectively? No, the query order matters.
        // Let's sort by current_power DESC in SQL, but we might have duplicates. 
        // Actually, let's use DISTINCT ON (nickname) and assume we want the one with highest power.
        // But we can't ORDER BY current_power DESC first if we use DISTINCT ON (nickname).

        // Strategy: Fetch all, dedupe in JS.

        players.forEach(p => {
            if (!seenNames.has(p.name)) {
                seenNames.add(p.name)
                uniquePlayers.push(p)
            }
        })

        // Re-sort unique list by power
        uniquePlayers.sort((a, b) => (b.current_power || 0) - (a.current_power || 0))

        const debugPlayer = uniquePlayers.find(p => String(p.uid) === '108896694')
        if (debugPlayer) {
            console.log('[DEBUG] Player 108896694:', {
                id: debugPlayer.uid,
                current: debugPlayer.current_power,
                ago: debugPlayer.power_24h_ago
            })
        }

        return cors({
            players: uniquePlayers.map(p => ({
                name: p.name,
                uid: String(p.uid),
                firstSeen: p.first_seen ? Number(p.first_seen) : null,
                lastSeen: p.last_seen ? Number(p.last_seen) : null,
                kills: p.kills,
                allianceName: p.alliance_name,
                kingdom: p.kingdom,
                kid: p.kid ? String(p.kid) : null,
                stoveLv: p.stove_lv,
                stoveLvContent: p.stove_lv_content,
                avatarImage: p.avatar_image,
                currentPower: p.current_power,
                powerUpdatedAt: p.power_updated_at ? Number(p.power_updated_at) : null,
                power24hAgo: p.power_24h_ago ? Number(p.power_24h_ago) : null,
                powerFirst: p.power_first ? Number(p.power_first) : null
            }))
        })
    } catch (error) {
        console.error('leaderboard-list error:', error)
        return cors({ error: String(error) }, 500)
    }
}

import { getSql, cors, requireAdmin, ensureSchema } from './_lib/_utils.js'

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return cors({})

    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res

    try {
        await ensureSchema()
        const sql = getSql()

        const playerId = event.queryStringParameters?.id
        const playerName = event.queryStringParameters?.name

        if (!playerId && !playerName) {
            return cors({ error: 'Missing player id or name parameter' }, 400)
        }

        // Get player info (from unified table)
        // We use dynamic conditions based on what's provided
        // Construct the WHERE clause dynamically
        // Note: nesting sql`` inside sql`` works, but let's be explicit
        const playerRows = await (playerId
            ? sql`SELECT id as uid, nickname as name, first_seen, last_seen, kills, alliance_name, kingdom, kid, stove_lv, stove_lv_content, avatar_image
                  FROM players
                  WHERE id = ${playerId}`
            : sql`SELECT id as uid, nickname as name, first_seen, last_seen, kills, alliance_name, kingdom, kid, stove_lv, stove_lv_content, avatar_image
                  FROM players
                  WHERE nickname = ${playerName}`)

        console.log(`[leaderboard-player] Fetching player: ID=${playerId}, Name=${playerName}`)
        console.log(`[leaderboard-player] Found rows: ${playerRows.length}`)

        if (playerRows.length === 0) {
            return cors({ error: 'Player not found' }, 404)
        }

        const player = playerRows[0]

        // If player was merged, redirect to canonical name
        if (player.merged_into) {
            return cors({
                redirectTo: player.merged_into,
                message: 'Player was merged into another player'
            })
        }

        // Get complete power history (using stable UID)
        const history = await sql`
      SELECT id, power, scraped_at
      FROM leaderboard_power_history
      WHERE player_id = ${player.uid}
      ORDER BY scraped_at DESC
    `

        // Calculate stats
        const currentPower = history.length > 0 ? history[0].power : 0
        const oldestPower = history.length > 0 ? history[history.length - 1].power : 0
        const totalGain = currentPower - oldestPower

        // Get rank (using unified table)
        const rankResult = await sql`
      SELECT COUNT(*) + 1 as rank
      FROM players p
      WHERE (
          SELECT power 
          FROM leaderboard_power_history 
          WHERE player_id = p.id 
          ORDER BY scraped_at DESC 
          LIMIT 1
        ) > ${currentPower}
    `
        const rank = rankResult[0]?.rank || 0

        // Calculate 24h and 7d changes if available
        const now = Date.now()
        const dayAgo = now - 24 * 60 * 60 * 1000
        const weekAgo = now - 7 * 24 * 60 * 60 * 1000

        let powerChange24h = null
        let powerChange7d = null

        const dayAgoReading = history.find(h => h.scraped_at <= dayAgo)
        const weekAgoReading = history.find(h => h.scraped_at <= weekAgo)

        if (dayAgoReading) {
            powerChange24h = currentPower - dayAgoReading.power
        }

        if (weekAgoReading) {
            powerChange7d = currentPower - weekAgoReading.power
        }

        // Find peak power
        let peakPower = 0
        let peakPowerDate = null
        for (const h of history) {
            if (h.power > peakPower) {
                peakPower = h.power
                peakPowerDate = h.scraped_at
            }
        }

        // Calculate average daily growth
        const daysTracked = history.length > 1
            ? (history[0].scraped_at - history[history.length - 1].scraped_at) / (24 * 60 * 60 * 1000)
            : 0
        const avgDailyGrowth = daysTracked > 0 ? totalGain / daysTracked : 0

        return cors({
            player: {
                name: player.name,
                uid: String(player.uid),
                firstSeen: player.first_seen ? Number(player.first_seen) : null,
                lastSeen: player.last_seen ? Number(player.last_seen) : null,
                kills: player.kills,
                allianceName: player.alliance_name,
                kingdom: player.kingdom,
                kid: player.kid ? String(player.kid) : null,
                stoveLv: player.stove_lv,
                stoveLvContent: player.stove_lv_content,
                avatarImage: player.avatar_image,
                currentPower,
                rank: Number(rank)
            },
            stats: {
                totalGain: Number(totalGain),
                powerChange24h: powerChange24h !== null ? Number(powerChange24h) : null,
                powerChange7d: powerChange7d !== null ? Number(powerChange7d) : null,
                peakPower: Number(peakPower),
                peakPowerDate: peakPowerDate ? Number(peakPowerDate) : null,
                avgDailyGrowth: Number(avgDailyGrowth),
                daysTracked: Math.floor(daysTracked),
                totalReadings: history.length
            },
            history: history.map(h => ({
                id: String(h.id),
                power: Number(h.power),
                scrapedAt: h.scraped_at ? Number(h.scraped_at) : null
            }))
        })
    } catch (error) {
        console.error('leaderboard-player error:', error)
        return cors({ error: String(error) }, 500)
    }
}

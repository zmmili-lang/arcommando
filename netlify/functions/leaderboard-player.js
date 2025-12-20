import { getSql, cors, requireAdmin, ensureSchema } from './_lib/_utils.js'

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return cors({})

    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res

    try {
        await ensureSchema()
        const sql = getSql()

        const playerName = event.queryStringParameters?.name

        if (!playerName) {
            return cors({ error: 'Missing player name parameter' }, 400)
        }

        // Get player info
        const playerRows = await sql`
      SELECT name, first_seen, last_seen, merged_into
      FROM leaderboard_players
      WHERE name = ${playerName}
    `

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

        // Get complete power history
        const history = await sql`
      SELECT power, scraped_at
      FROM leaderboard_power_history
      WHERE player_name = ${playerName}
      ORDER BY scraped_at DESC
    `

        // Calculate stats
        const currentPower = history.length > 0 ? history[0].power : 0
        const oldestPower = history.length > 0 ? history[history.length - 1].power : 0
        const totalGain = currentPower - oldestPower

        // Get rank
        const rankResult = await sql`
      SELECT COUNT(*) + 1 as rank
      FROM leaderboard_players lp
      WHERE lp.merged_into IS NULL
        AND (
          SELECT power 
          FROM leaderboard_power_history 
          WHERE player_name = lp.name 
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
                firstSeen: player.first_seen,
                lastSeen: player.last_seen,
                currentPower,
                rank
            },
            stats: {
                totalGain,
                powerChange24h,
                powerChange7d,
                peakPower,
                peakPowerDate,
                avgDailyGrowth,
                daysTracked: Math.floor(daysTracked),
                totalReadings: history.length
            },
            history: history.map(h => ({
                power: h.power,
                scrapedAt: h.scraped_at
            }))
        })
    } catch (error) {
        console.error('leaderboard-player error:', error)
        return cors({ error: String(error) }, 500)
    }
}

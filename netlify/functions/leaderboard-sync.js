import { getSql, cors, requireAdmin, ensureSchema, sleep } from './_lib/_utils.js'
import { fetchPlayerProfile } from './_lib/ks-api.js'

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return cors({})

    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res

    try {
        await ensureSchema()
        const sql = getSql()

        // Get players with UID who are either not verified or haven't been checked recently
        // For a "one-time" cleanup or regular sync
        const players = await sql`
            SELECT name, uid 
            FROM leaderboard_players 
            WHERE uid IS NOT NULL 
            AND (is_verified = FALSE OR is_verified IS NULL)
        `

        console.log(`📡 Starting name sync for ${players.length} players...`)

        const results = {
            total: players.length,
            success: 0,
            failed: 0,
            updates: []
        }

        for (const player of players) {
            try {
                const profile = await fetchPlayerProfile(player.uid)
                const officialName = profile.nickname

                if (officialName && officialName !== player.name) {
                    console.log(`✅ Updating: "${player.name}" -> "${officialName}" (UID: ${player.uid})`)

                    // Update name and set as verified
                    // This will CASCADE to power_history thanks to our previous schema update
                    await sql`
                        UPDATE leaderboard_players 
                        SET name = ${officialName}, is_verified = TRUE 
                        WHERE uid = ${player.uid}
                    `
                    results.updates.push({ old: player.name, new: officialName, uid: player.uid })
                } else {
                    // Just mark as verified if name is correct
                    await sql`
                        UPDATE leaderboard_players 
                        SET is_verified = TRUE 
                        WHERE uid = ${player.uid}
                    `
                }

                results.success++
                // Rate limit slightly to be nice to the API
                await sleep(200)
            } catch (err) {
                console.error(`❌ Failed to sync player ${player.uid}:`, err.message)
                results.failed++
            }
        }

        return cors({
            message: 'Sync completed',
            results
        })

    } catch (error) {
        console.error('leaderboard-sync error:', error)
        return cors({ error: String(error) }, 500)
    }
}

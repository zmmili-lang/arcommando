import { getSql, cors } from './_lib/_utils.js'

export async function handler(event) {
    const sql = getSql()

    try {
        const kingdoms = [27, 28]

        // 1. Delete from players
        // Note: Parentheses around the expanded array are required
        const res1 = await sql`
            DELETE FROM players 
            WHERE kid IN (${sql(kingdoms)})
               OR kingdom IN (${sql(kingdoms)})
        `

        // 2. Delete from leaderboard_players
        try {
            var res2 = await sql`
                DELETE FROM leaderboard_players 
                WHERE kingdom IN (${sql(kingdoms)})
            `
        } catch (err) {
            var res2 = { count: 0, error: err.message }
        }

        return cors({
            deleted_players: res1.count,
            deleted_leaderboard: res2.count,
            kingdoms_targeted: kingdoms
        })
    } catch (e) {
        return cors({ error: e.message }, 500)
    }
}

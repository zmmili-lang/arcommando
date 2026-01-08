import { getSql, cors } from './_lib/_utils.js'

export async function handler(event) {
    const sql = getSql()

    try {
        const names = ['lord12120771', 'lord12170273']

        // 1. Delete Kingdoms 27 & 28 (Explicit logic to avoid array syntax issues)
        const res_kd = await sql`
            DELETE FROM players 
            WHERE kid = 27 OR kid = 28 OR kingdom = 27 OR kingdom = 28
        `

        // 2. Delete Specific Users
        const res_names = await sql`
            DELETE FROM players 
            WHERE nickname = ANY(${names}) OR nickname ILIKE ANY(ARRAY['lord12120771%', 'lord12170273%'])
        `

        // 4. Cleanup Leaderboard Players (Names)
        try {
            await sql`DELETE FROM leaderboard_players WHERE name = ANY(${names})`
        } catch (e) { }

        return cors({
            deleted_kingdoms_count: res_kd.count,
            deleted_names_count: res_names.count
        })
    } catch (e) {
        return cors({ error: e.message }, 500)
    }
}

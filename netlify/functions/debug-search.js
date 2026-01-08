import { getSql, cors } from './_lib/_utils.js'

export async function handler(event) {
    const sql = getSql()
    const name = event.queryStringParameters.name || 'Sortexlive'

    try {
        // Search by name
        const rows = await sql`
            SELECT *, encode(id::bytea, 'hex') as id_hex
            FROM players 
            WHERE nickname ILIKE ${'%' + name + '%'}
        `

        const lb_rows = await sql`
             SELECT * FROM leaderboard_players 
             WHERE name ILIKE ${'%' + name + '%'}
        `

        return cors({
            name_query: name,
            players_table: rows,
            leaderboard_players_table: lb_rows
        })
    } catch (e) {
        return cors({ error: e.message }, 500)
    }
}

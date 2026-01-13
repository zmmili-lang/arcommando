import { cors, ensureSchema, getSql, parseBody } from './_utils.js'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})

    await ensureSchema()
    const sql = getSql()

    if (event.httpMethod === 'GET') {
        try {
            // Get top 50 scores - distinct per player (max score per player)
            // Or just raw top scores? Usually leaderboards show one entry per player (their best).
            // Let's do MAX score per player for the leaderboard.

            const rows = await sql`
                SELECT DISTINCT ON (s.player_id)
                    s.player_id, 
                    s.score, 
                    s.created_at,
                    p.nickname, 
                    p.avatar_image
                FROM flappy_scores s
                JOIN players p ON s.player_id = p.id
                ORDER BY s.player_id, s.score DESC
            `

            // Now verify we have the best per player, but we want to sort globally by score DESC
            // The efficient way in SQL for "Top N players by their max score":

            const leaderboard = await sql`
                SELECT 
                    p.nickname, 
                    p.avatar_image,
                    sub.player_id,
                    sub.max_score as score,
                    sub.last_achieved
                FROM (
                    SELECT 
                        player_id, 
                        MAX(score) as max_score,
                        MAX(created_at) as last_achieved
                    FROM flappy_scores 
                    GROUP BY player_id
                ) sub
                JOIN players p ON sub.player_id = p.id
                ORDER BY sub.max_score DESC, sub.last_achieved ASC
                LIMIT 50
            `

            return cors({ leaderboard })
        } catch (e) {
            console.error('Flappy LB Error:', e)
            return cors({ error: e.message }, 500)
        }
    }

    if (event.httpMethod === 'POST') {
        const body = parseBody(event)
        const { playerId, score } = body

        if (!playerId || typeof score !== 'number') {
            return cors({ error: 'Missing playerId or score' }, 400)
        }

        try {
            await sql`
                INSERT INTO flappy_scores(player_id, score, created_at)
                VALUES(${playerId}, ${score}, ${Date.now()})
            `

            // Return user's best score
            const best = await sql`
                SELECT MAX(score) as best_score FROM flappy_scores WHERE player_id = ${playerId}
            `
            return cors({ success: true, best: best[0]?.best_score || score })
        } catch (e) {
            console.error('Flappy Save Error:', e)
            return cors({ error: e.message }, 500)
        }
    }

    return cors({ error: 'Method not allowed' }, 405)
}

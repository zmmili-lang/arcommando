
import { getSql, cors } from './_utils.js'

export const handler = async (event) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') return cors({ error: 'Method not allowed' }, 405)

    try {
        const sql = getSql()
        await sql`TRUNCATE TABLE flappy_scores`
        return cors({ success: true, message: 'Scores reset successfully' })
    } catch (e) {
        console.error(e)
        return cors({ error: e.message }, 500)
    }
}

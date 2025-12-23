import { getSql, cors, requireAdmin, parseBody, ensureSchema } from './_lib/_utils.js'

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return cors({})

    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res

    try {
        await ensureSchema()
        const sql = getSql()
        const { id } = parseBody(event)

        if (!id) {
            return cors({ error: 'Missing entry ID' }, 400)
        }

        const result = await sql`
            DELETE FROM leaderboard_power_history
            WHERE id = ${id}
            RETURNING id
        `

        if (result.length === 0) {
            return cors({ error: 'Entry not found' }, 404)
        }

        return cors({
            success: true,
            message: 'History entry removed',
            deletedId: id
        })
    } catch (error) {
        console.error('leaderboard-history-remove error:', error)
        return cors({ error: String(error) }, 500)
    }
}

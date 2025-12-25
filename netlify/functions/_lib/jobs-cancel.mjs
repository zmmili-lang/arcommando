import { cors, ensureSchema, getSql, parseBody, requireAdmin } from './_utils.js'

export const handler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return cors({})
        const auth = requireAdmin(event)
        if (!auth.ok) return auth.res
        await ensureSchema()
        const sql = getSql()
        const body = parseBody(event)

        const jobId = body?.jobId ? String(body.jobId).trim() : null

        if (jobId) {
            // Cancel specific job
            const result = await sql`
                UPDATE jobs 
                SET status = 'cancelled', finished_at = ${Date.now()} 
                WHERE id = ${jobId} AND status IN ('running', 'rate_limited')
                RETURNING *
            `

            if (result.length === 0) {
                return cors({ error: 'Job not found or already finished' }, 404)
            }

            return cors({
                ok: true,
                message: 'Job cancelled',
                job: {
                    id: result[0].id,
                    status: result[0].status,
                    finishedAt: result[0].finished_at
                }
            })
        } else {
            // Cancel all running/rate_limited jobs
            const result = await sql`
                UPDATE jobs 
                SET status = 'cancelled', finished_at = ${Date.now()} 
                WHERE status IN ('running', 'rate_limited')
                RETURNING id
            `

            return cors({
                ok: true,
                message: `Cancelled ${result.length} job(s)`,
                cancelledCount: result.length,
                jobIds: result.map(r => r.id)
            })
        }
    } catch (err) {
        console.error('❌ jobs-cancel error:', err)
        return cors({ error: String(err.message || err) }, 500)
    }
}

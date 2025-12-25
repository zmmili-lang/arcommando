import { cors, ensureSchema, getSql, requireAdmin } from './_utils.js'

export const handler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return cors({})
        const auth = requireAdmin(event)
        if (!auth.ok) return auth.res
        await ensureSchema()
        const sql = getSql()

        const status = event.queryStringParameters?.status || null
        const limit = parseInt(event.queryStringParameters?.limit || '50', 10)

        let jobs
        if (status) {
            jobs = await sql`
                SELECT * FROM jobs 
                WHERE status = ${status}
                ORDER BY started_at DESC 
                LIMIT ${limit}
            `
        } else {
            jobs = await sql`
                SELECT * FROM jobs 
                ORDER BY started_at DESC 
                LIMIT ${limit}
            `
        }

        const formatted = jobs.map(j => ({
            id: j.id,
            status: j.status,
            startedAt: j.started_at ? Number(j.started_at) : null,
            finishedAt: j.finished_at ? Number(j.finished_at) : null,
            totalTasks: j.total_tasks,
            done: j.done,
            successes: j.successes,
            failures: j.failures,
            lastEvent: j.last_event,
            onlyCode: j.only_code,
            onlyPlayer: j.only_player
        }))

        return cors({ jobs: formatted })
    } catch (err) {
        console.error('❌ jobs-list error:', err)
        return cors({ error: String(err.message || err) }, 500)
    }
}

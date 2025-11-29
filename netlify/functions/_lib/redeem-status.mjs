import { cors, ensureSchema, getSql, readJob, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  await ensureSchema()
  const jobId = (event.queryStringParameters?.jobId || '').trim()
  if (!jobId) return cors({ error: 'jobId required' }, 400)
  const job = await readJob(getSql(), jobId)
  return cors(job || { error: 'not found' })
}

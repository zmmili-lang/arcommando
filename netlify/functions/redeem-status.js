import { cors, getStoreFromEvent, readJob, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const jobId = (event.queryStringParameters?.jobId || '').trim()
  if (!jobId) return cors({ error: 'jobId required' }, 400)
  const job = await readJob(store, jobId)
  return cors(job || { error: 'not found' })
}

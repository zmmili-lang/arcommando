import { cors, getStoreFromEvent, HISTORY_PREFIX, parseBody, requireAdmin, setJSON } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const body = parseBody(event)
  const date = (body?.date || '').slice(0,10)
  if (!date) return cors({ error: 'date required (YYYY-MM-DD)' }, 400)
  const key = `${HISTORY_PREFIX}${date}.json`
  await setJSON(store, key, [])
  return cors({ ok: true })
}

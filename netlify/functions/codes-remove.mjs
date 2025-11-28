import { cors, getJSON, getStoreFromEvent, parseBody, CODES_KEY, requireAdmin, setJSON } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const body = parseBody(event)
  const code = String(body.code || '').trim()
  if (!code) return cors({ error: 'code required' }, 400)

  const codes = (await getJSON(store, CODES_KEY, [])) || []
  const next = codes.filter(c => c.code !== code)
  await setJSON(store, CODES_KEY, next)
  return cors({ ok: true, codes: next })
}

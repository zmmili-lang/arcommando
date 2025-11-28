import { cors, getJSON, getStoreFromEvent, parseBody, CODES_KEY, requireAdmin, setJSON } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const body = parseBody(event)
  const code = String(body.code || '').trim().toUpperCase()
  const note = String(body.note || '')
  if (!code) return cors({ error: 'code required' }, 400)

  const codes = (await getJSON(store, CODES_KEY, [])) || []
  if (codes.find(c => c.code === code)) return cors({ error: 'duplicate' }, 409)

  const next = [...codes, { code, note, active: true, addedAt: Date.now(), lastTriedAt: null }]
  await setJSON(store, CODES_KEY, next)
  return cors({ ok: true, codes: next })
}

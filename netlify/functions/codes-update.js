import { cors, getJSON, getStoreFromEvent, parseBody, CODES_KEY, requireAdmin, setJSON } from './_utils.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const body = parseBody(event)
  const code = String(body.code || '').trim().toUpperCase()
  if (!code) return cors({ error: 'code required' }, 400)

  const codes = (await getJSON(store, CODES_KEY, [])) || []
  const idx = codes.findIndex(c => c.code === code)
  if (idx === -1) return cors({ error: 'not found' }, 404)

  const editable = ['active', 'note', 'lastTriedAt']
  const patch = {}
  for (const k of editable) if (k in body) patch[k] = body[k]
  codes[idx] = { ...codes[idx], ...patch }
  await setJSON(store, CODES_KEY, codes)
  return cors({ ok: true, codes })
}

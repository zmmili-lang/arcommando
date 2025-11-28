import { appendHistory, cors, getJSON, getStoreFromEvent, CODES_KEY, parseBody, PLAYERS_KEY, requireAdmin, setJSON } from './_utils.js'
import { redeemGiftCode } from './ks-api.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAdmin(event)
  if (!auth.ok) return auth.res
  const store = getStoreFromEvent(event)
  const body = parseBody(event)
  const id = String(body.id || '').trim()
  const code = String(body.code || '').trim().toUpperCase()
  if (!id || !code) return cors({ error: 'id and code required' }, 400)

  const ts = Date.now()
  const res = await redeemGiftCode({ playerId: id, code })
  await appendHistory(store, { ts, playerId: id, code, status: res.status, message: res.message, raw: res.raw })

  const playersNow = (await getJSON(store, PLAYERS_KEY, [])) || []
  const idx = playersNow.findIndex(x => String(x.id) === String(id))
  if (idx !== -1 && (res.status === 'success' || res.status === 'already_redeemed')) {
    playersNow[idx].lastRedeemedAt = ts
    await setJSON(store, PLAYERS_KEY, playersNow)
  }

  const codesNow = (await getJSON(store, CODES_KEY, [])) || []
  const cidx = codesNow.findIndex(x => x.code === code)
  if (cidx !== -1) { codesNow[cidx].lastTriedAt = ts; await setJSON(store, CODES_KEY, codesNow) }

  return cors({ ok: true, ...res })
}

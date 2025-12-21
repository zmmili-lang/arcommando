import crypto from 'node:crypto'

const LOGIN_URL = 'https://kingshot-giftcode.centurygame.com/api/player'
const REDEEM_URL = 'https://kingshot-giftcode.centurygame.com/api/gift_code'
const SECRET = 'mN4!pQs6JrYwV9'

function md5(input) {
  return crypto.createHash('md5').update(input).digest('hex')
}

function encodeData(data) {
  const keys = Object.keys(data).sort()
  const encoded = keys.map(k => `${k}=${typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k]}`).join('&')
  const sign = md5(`${encoded}${SECRET}`)
  return { sign, ...data }
}

async function postJSON(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  return res
}

async function makeRequest(url, payload, { maxRetries = 3, retryDelayMs = 2000 } = {}) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await postJSON(url, payload)
    const status = res.status
    let data
    try { data = await res.json() } catch { data = null }

    if (status === 200 && data) {
      const msg = typeof data.msg === 'string' ? data.msg.replace(/\.$/, '') : ''
      if (msg === 'TIMEOUT RETRY' && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, retryDelayMs))
        continue
      }
      return { status, data }
    }
    if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, retryDelayMs))
  }
  return { status: 0, data: null }
}

export async function fetchPlayerProfile(fid) {
  const payload = encodeData({ fid: String(fid).trim(), time: Date.now() })
  const { status, data } = await makeRequest(LOGIN_URL, payload)
  if (status !== 200 || !data) throw new Error('Login request failed')
  if (data.code !== 0) {
    throw new Error(`Login failed: ${data.msg || 'Unknown'}`)
  }
  const d = data.data || {}
  return { 
    nickname: d.nickname, 
    avatar_image: d.avatar_image,
    kid: d.kid,
    stove_lv: d.stove_lv,
    stove_lv_content: d.stove_lv_content
  }
}

const RESULT_MESSAGES = {
  'SUCCESS': 'Successfully redeemed',
  'RECEIVED': 'Already redeemed',
  'SAME TYPE EXCHANGE': 'Successfully redeemed (same type)',
  'TIME ERROR': 'Code has expired',
  'TIMEOUT RETRY': 'Server requested retry',
  'USED': 'Claim limit reached, unable to claim'
}

export async function redeemGiftCode({ playerId, code }) {
  try { await fetchPlayerProfile(playerId) } catch (e) { /* proceed */ }
  const payload = encodeData({ fid: String(playerId).trim(), cdk: code, time: Date.now() })
  const { status, data } = await makeRequest(REDEEM_URL, payload)
  if (!data) return { ok: false, status: 'error', message: 'No response', httpStatus: status, raw: null }
  const rawMsg = (data.msg || 'Unknown error').replace(/\.$/, '')
  const friendly = RESULT_MESSAGES[rawMsg] || rawMsg

  const normalized = {
    ok: rawMsg === 'SUCCESS' || rawMsg === 'SAME TYPE EXCHANGE' || rawMsg === 'RECEIVED',
    status: rawMsg === 'RECEIVED' ? 'already_redeemed' : (rawMsg === 'SUCCESS' || rawMsg === 'SAME TYPE EXCHANGE') ? 'success' : 'error',
    message: friendly,
    httpStatus: status,
    raw: data
  }
  return normalized
}

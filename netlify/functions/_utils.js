import { connectLambda, getStore } from '@netlify/blobs'

export const ADMIN_PASS = 'LFGARC'
export const STORE_NAME = 'arcommando'
export const PLAYERS_KEY = 'players.json'
export const CODES_KEY = 'codes.json'
export const JOBS_PREFIX = 'jobs/'
export const HISTORY_PREFIX = 'history/'

export function cors(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }
}

export function noContent(statusCode = 204) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    }
  }
}

export function parseBody(event) {
  if (!event?.body) return {}
  try {
    return JSON.parse(event.body)
  } catch {
    return {}
  }
}

export function requireAdmin(event) {
  const pass = event.headers?.['x-admin-pass'] || event.headers?.['X-Admin-Pass'] || parseBody(event)?.adminPass
  if (pass !== ADMIN_PASS) return { ok: false, res: cors({ error: 'Unauthorized' }, 401) }
  return { ok: true }
}

export function getStoreFromEvent(event) {
  connectLambda(event)
  return getStore({ name: STORE_NAME })
}

export async function getJSON(store, key, fallback) {
  const data = await store.get(key, { type: 'json' })
  return data ?? fallback
}

export async function setJSON(store, key, value) {
  await store.setJSON(key, value)
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

export function todayYMD(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10)
}

export async function appendHistory(store, entry) {
  const key = `${HISTORY_PREFIX}${todayYMD(entry.ts || Date.now())}.json`
  const list = (await getJSON(store, key, [])) || []
  list.push(entry)
  await setJSON(store, key, list)
}

export async function updateJob(store, jobId, patch) {
  const key = `${JOBS_PREFIX}${jobId}.json`
  const cur = (await getJSON(store, key, {})) || {}
  const next = { ...cur, ...patch }
  await setJSON(store, key, next)
  return next
}

export async function readJob(store, jobId) {
  const key = `${JOBS_PREFIX}${jobId}.json`
  return (await getJSON(store, key, null))
}

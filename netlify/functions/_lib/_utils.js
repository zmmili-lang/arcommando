import { neon, neonConfig } from '@neondatabase/serverless'

export const ADMIN_PASS = 'LFGARC'

// cache HTTP connections across invocations
neonConfig.fetchConnectionCache = true

let _sql = null
export function getSql() {
    if (!_sql) {
        const url =
            process.env.NETLIFY_DATABASE_URL_UNPOOLED ||
            process.env.NETLIFY_DATABASE_URL ||
            process.env.DATABASE_URL ||
            process.env.NEON_DATABASE_URL

        if (!url) {
            const errorMsg = 'DATABASE_URL is not set. ' +
                'Please create a .env file in the project root with: DATABASE_URL=postgresql://... ' +
                'Or set it in Netlify Dashboard → Settings → Environment Variables'
            console.error(errorMsg)
            throw new Error(errorMsg)
        }
        _sql = neon(url)
    }
    return _sql
}

export async function ensureSchema() {
    const sql = getSql()
    await sql`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      nickname TEXT DEFAULT '',
      avatar_image TEXT DEFAULT '',
      added_at BIGINT,
      last_redeemed_at BIGINT,
      
      -- Leaderboard stats
      kills BIGINT DEFAULT 0,
      alliance_name TEXT,
      kingdom INTEGER,
      kid INTEGER,
      stove_lv INTEGER,
      stove_lv_content TEXT,
      first_seen BIGINT,
      last_seen BIGINT,
      is_verified BOOLEAN DEFAULT FALSE
    );
    `
    await sql`
    CREATE TABLE IF NOT EXISTS codes(
        code TEXT PRIMARY KEY,
        note TEXT DEFAULT '',
        active BOOLEAN DEFAULT TRUE,
        added_at BIGINT,
        last_tried_at BIGINT
    );
    `
    await sql`
    CREATE TABLE IF NOT EXISTS player_codes(
        player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
        code TEXT REFERENCES codes(code) ON DELETE CASCADE,
        redeemed_at BIGINT,
        blocked_reason TEXT,
        PRIMARY KEY(player_id, code)
    );
    `
    await sql`
    CREATE TABLE IF NOT EXISTS jobs(
        id TEXT PRIMARY KEY,
        status TEXT,
        started_at BIGINT,
        finished_at BIGINT,
        total_tasks INTEGER,
        done INTEGER,
        successes INTEGER,
        failures INTEGER,
        last_event TEXT,
        last_event_obj JSONB,
        only_code TEXT,
        only_player TEXT
    );
    `
    // Migration for jobs table columns
    try {
        const sql = getSql();
        await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS only_code TEXT;`
        await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS only_player TEXT;`
    } catch (e) { console.warn('Jobs migration ignored:', e.message); }

    await sql`
    CREATE TABLE IF NOT EXISTS history(
        id BIGSERIAL PRIMARY KEY,
        ts BIGINT,
        player_id TEXT,
        code TEXT,
        status TEXT,
        message TEXT,
        raw JSONB
    );
    `

    // Leaderboard tracking tables (separate from redemption players)
    // We will keep leaderboard_players temporarily for migration or backward compat
    // but the system will prefer the 'players' table
    await sql`
    CREATE TABLE IF NOT EXISTS leaderboard_players(
        name TEXT PRIMARY KEY,
        uid TEXT UNIQUE,
        first_seen BIGINT NOT NULL,
        last_seen BIGINT NOT NULL,
        kills BIGINT DEFAULT 0,
        alliance_name TEXT,
        kingdom INTEGER,
        is_verified BOOLEAN DEFAULT FALSE,
        merged_into TEXT REFERENCES leaderboard_players(name) ON DELETE SET NULL
    );
    `

    await sql`
    CREATE TABLE IF NOT EXISTS leaderboard_power_history(
        id BIGSERIAL PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        power BIGINT NOT NULL,
        scraped_at BIGINT NOT NULL,
        UNIQUE(player_id, scraped_at)
    );
    `

    await sql`
    CREATE INDEX IF NOT EXISTS idx_power_history_player 
    ON leaderboard_power_history(player_id, scraped_at DESC);
    `
}

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
    try { return JSON.parse(event.body) } catch { return {} }
}

export function requireAdmin(event) {
    const pass = event.headers?.['x-admin-pass'] || event.headers?.['X-Admin-Pass'] || parseBody(event)?.adminPass
    if (pass !== ADMIN_PASS) return { ok: false, res: cors({ error: 'Unauthorized' }, 401) }
    return { ok: true }
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
export function todayYMD(ts = Date.now()) { return new Date(ts).toISOString().slice(0, 10) }

export function deriveBlockedReason(entry) {
    const raw = (entry?.raw?.msg || '').toUpperCase()
    const msg = (entry?.message || '').toUpperCase()
    if (raw === 'TIME ERROR' || msg.includes('EXPIRED')) return 'expired'
    if (raw === 'USED' || msg.includes('CLAIM LIMIT')) return 'limit'
    return null
}

export async function applyStatusToIndex(sql, entry) {
    try {
        const pid = String(entry.playerId)
        if (entry.status === 'success' || entry.status === 'already_redeemed') {
            await sql`INSERT INTO player_codes(player_id, code, redeemed_at)
    VALUES(${pid}, ${entry.code}, ${entry.ts || Date.now()})
                ON CONFLICT(player_id, code)
                DO UPDATE SET redeemed_at = EXCLUDED.redeemed_at; `
        }
        const blocked = deriveBlockedReason(entry)
        if (blocked) {
            await sql`INSERT INTO player_codes(player_id, code, blocked_reason)
    VALUES(${pid}, ${entry.code}, ${blocked})
                ON CONFLICT(player_id, code)
                DO UPDATE SET blocked_reason = EXCLUDED.blocked_reason; `
        }
    } catch { }
}

export async function appendHistory(sql, entry) {
    await sql`INSERT INTO history(ts, player_id, code, status, message, raw)
    VALUES(${entry.ts || Date.now()}, ${String(entry.playerId)
        }, ${entry.code}, ${entry.status}, ${entry.message}, ${entry.raw || null}); `
    await applyStatusToIndex(sql, entry)
}

export async function updateJob(sql, jobId, patch) {
    const fields = []
    const values = []
    let i = 1
    for (const [k, v] of Object.entries(patch || {})) {
        const col = k === 'lastEvent' ? 'last_event' : k === 'lastEventObj' ? 'last_event_obj' : k
        fields.push(`${col} = $${i++} `)
        values.push(v)
    }
    if (!fields.length) {
        const rows = await sql`SELECT * FROM jobs WHERE id = ${jobId} `
        return rows[0] || null
    }
    const query = `UPDATE jobs SET ${fields.join(', ')} WHERE id = $${i} RETURNING * `
    const rows = await sql(query, [...values, jobId])
    return rows[0] || null
}

export async function readJob(sql, jobId) {
    const rows = await sql`SELECT * FROM jobs WHERE id = ${jobId} `
    const r = rows[0]
    if (!r) return null
    return {
        id: r.id,
        status: r.status,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        totalTasks: r.total_tasks,
        done: r.done,
        successes: r.successes,
        failures: r.failures,
        lastEvent: r.last_event,
        lastEventObj: r.last_event_obj,
        onlyCode: r.only_code || undefined,
        onlyPlayer: r.only_player || undefined
    }
}

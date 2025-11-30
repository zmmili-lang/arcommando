import React, { useEffect, useRef, useState } from 'react'

async function api(path, { adminPass, method = 'GET', body } = {}) {
    const res = await fetch(`/.netlify/functions/${path}`, {
        method,
        headers: {
            'content-type': 'application/json',
            'x-admin-pass': adminPass || ''
        },
        body: body ? JSON.stringify(body) : undefined
    })
    if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`)
    return res.json()
}

export default function Redeem({ adminPass }) {
    const [log, setLog] = useState([])
    const [loading, setLoading] = useState(false)
    const [players, setPlayers] = useState([])
    const [progress, setProgress] = useState({ done: 0, total: 0, successes: 0, failures: 0 })

    useEffect(() => {
        (async () => {
            try { const res = await api('players-list', { adminPass }); setPlayers(res.players || []) } catch { }
        })()
    }, [])

    const nameOf = (id) => {
        const p = players.find(x => String(x.id) === String(id))
        return p?.nickname || ''
    }

    const start = async () => {
        if (!players.length) return
        setLoading(true)
        setLog([])
        setProgress({ done: 0, total: players.length, successes: 0, failures: 0 })

        try {
            for (let i = 0; i < players.length; i++) {
                const p = players[i]
                try {
                    const res = await api('redeem-start', { adminPass, method: 'POST', body: { onlyPlayer: p.id } })
                    const results = res.results || []
                    const successCount = results.filter(r => r.status === 'success' || r.status === 'already_redeemed').length
                    const failCount = results.filter(r => r.status === 'error').length

                    results.forEach(r => {
                        setLog(prev => [{ ts: Date.now(), playerId: p.id, code: r.code, status: r.status, message: r.message }, ...prev].slice(0, 50))
                    })

                    setProgress(prev => ({
                        ...prev,
                        done: prev.done + 1,
                        successes: prev.successes + successCount,
                        failures: prev.failures + failCount
                    }))
                } catch (e) {
                    setLog(prev => [{ ts: Date.now(), playerId: p.id, code: 'ALL', status: 'error', message: String(e.message || e) }, ...prev].slice(0, 50))
                    setProgress(prev => ({ ...prev, done: prev.done + 1, failures: prev.failures + 1 }))
                }
            }
        } finally {
            setLoading(false)
        }
    }

    const progressPct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

    return (
        <section>
            <h2>Redeem</h2>
            <div className="d-flex gap-2 align-items-center">
                <button className="btn btn-primary" onClick={start} disabled={loading || !players.length}>
                    {loading ? 'Redeeming...' : 'Redeem All Active Codes for All Players'}
                </button>
                {loading && <span>Processing player {progress.done + 1} of {progress.total}...</span>}
            </div>
            {(loading || progress.done > 0) && (
                <div className="progress my-2" style={{ height: 10 }}>
                    <div className="progress-bar" role="progressbar" style={{ width: `${progressPct}%` }} aria-valuenow={progressPct} aria-valuemin="0" aria-valuemax="100">{progressPct}%</div>
                </div>
            )}
            <div className="mt-3">
                <h4>Live log</h4>
                <ul>
                    {log.map((l, idx) => (
                        <li key={idx}>
                            {l.playerId ? (
                                <code>{new Date(l.ts).toISOString()} {l.playerId} ({nameOf(l.playerId)}) {l.code}{' => '}{l.status} ({l.message})</code>
                            ) : (
                                <code>{typeof l === 'string' ? l : JSON.stringify(l)}</code>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    )
}

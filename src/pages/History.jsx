import React, { useEffect, useState } from 'react'

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

function today() {
    const d = new Date();
    return d.toISOString().slice(0, 10)
}

function fmtUTC(ts) { return ts ? new Date(ts).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC' : '-' }

export default function History({ adminPass }) {
    const [date, setDate] = useState(today())
    const [entries, setEntries] = useState([])
    const [summary, setSummary] = useState(null)
    const [loading, setLoading] = useState(false)

    const load = async () => {
        setLoading(true)
        try {
            const data = await api(`history-list?date=${date}`, { adminPass })
            setEntries(data.entries || [])
            setSummary(data.summary || null)
        } finally { setLoading(false) }
    }

    useEffect(() => { load() }, [date])

    const clearLogs = async () => {
        if (!confirm(`Clear logs for ${date}?`)) return
        await api('history-clear', { adminPass, method: 'POST', body: { date } })
        await load()
    }

    return (
        <section>
            <h2>History</h2>
            <div className="d-flex gap-2 align-items-center">
                <input className="form-control" style={{ maxWidth: 220 }} type="date" value={date} onChange={e => setDate(e.target.value)} />
                <button className="btn btn-outline-danger btn-sm" onClick={clearLogs}>Clear logs (day)</button>
            </div>
            {summary && (
                <p className="mt-2">Totals — success: {summary.success} | already: {summary.already_redeemed} | errors: {summary.errors}</p>
            )}
            {loading && <div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div>}
            {loading && <div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div>}
            <div className="table-responsive">
                <table className="table table-sm table-hover align-middle mt-2">
                    <thead className="table-light">
                        <tr>
                            <th>Time (UTC)</th>
                            <th>Player</th>
                            <th>Code</th>
                            <th>Status</th>
                            <th>Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((e, i) => (
                            <tr key={i}>
                                <td className="text-nowrap">{fmtUTC(e.ts)}</td>
                                <td>{e.playerId}{e.nickname ? ` (${e.nickname})` : ''}</td>
                                <td>{e.code}</td>
                                <td>{e.status}</td>
                                <td>{e.message}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

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
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="m-0">History</h2>
            </div>

            <div className="row g-2 mb-3">
                <div className="col-12 col-md-8">
                    <input
                        className="form-control"
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                    />
                </div>
                <div className="col-12 col-md-4">
                    <button className="btn btn-outline-danger w-100" onClick={clearLogs}>Clear logs (day)</button>
                </div>
            </div>

            {summary && (
                <div className="d-flex gap-2 mb-3 flex-wrap">
                    <span className="badge bg-success bg-opacity-10 text-success border border-success p-2">Success: {summary.success}</span>
                    <span className="badge bg-warning bg-opacity-10 text-warning border border-warning p-2">Already: {summary.already_redeemed}</span>
                    <span className="badge bg-danger bg-opacity-10 text-danger border border-danger p-2">Errors: {summary.errors}</span>
                </div>
            )}

            {loading && <div className="text-center py-3"><div className="spinner-border text-primary" role="status"></div></div>}

            <div className="table-responsive border rounded">
                <table className="table table-hover align-middle m-0">
                    <thead>
                        <tr>
                            <th style={{ width: 100 }}>Time</th>
                            <th>Player</th>
                            <th>Code</th>
                            <th style={{ width: 100 }}>Status</th>
                            <th className="d-none-mobile">Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((e, i) => (
                            <tr key={i}>
                                <td className="text-nowrap small text-muted">{e.ts ? new Date(e.ts).toLocaleTimeString('en-GB', { timeZone: 'UTC' }) : '-'}</td>
                                <td className="text-truncate" style={{ maxWidth: 120 }} title={e.playerId}>{e.nickname || e.playerId}</td>
                                <td className="fw-bold small">{e.code}</td>
                                <td>
                                    <span className={`badge ${e.status === 'success' ? 'bg-success' : e.status === 'already_redeemed' ? 'bg-warning text-dark' : 'bg-danger'}`}>
                                        {e.status === 'already_redeemed' ? 'Already' : e.status}
                                    </span>
                                </td>
                                <td className="d-none-mobile small text-muted text-truncate" style={{ maxWidth: 200 }} title={e.message}>{e.message}</td>
                            </tr>
                        ))}
                        {entries.length === 0 && !loading && (
                            <tr>
                                <td colSpan="5" className="text-center text-muted py-4">No logs for this date</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

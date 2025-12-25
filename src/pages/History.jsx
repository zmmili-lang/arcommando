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
    const [activeJob, setActiveJob] = useState(null)
    const [loading, setLoading] = useState(false)
    const [expanded, setExpanded] = useState(new Set())

    const load = async () => {
        if (!activeJob) setLoading(true)
        try {
            const data = await api(`history-list?date=${date}`, { adminPass })
            setEntries(data.entries || [])
            setSummary(data.summary || null)
            setActiveJob(data.activeJob || null)
        } finally { setLoading(false) }
    }

    useEffect(() => { load() }, [date])

    // Polling logic for active jobs
    useEffect(() => {
        if (activeJob && (activeJob.status === 'running' || activeJob.status === 'rate_limited')) {
            const timer = setTimeout(load, 3000)
            return () => clearTimeout(timer)
        }
    }, [activeJob])

    const clearLogs = async () => {
        if (!confirm(`Clear logs for ${date}?`)) return
        await api('history-clear', { adminPass, method: 'POST', body: { date } })
        await load()
    }

    const cancelJob = async () => {
        if (!activeJob) return
        if (!confirm(`Cancel the current redemption job?\n\nThis will stop the job immediately. Progress: ${activeJob.done}/${activeJob.total}`)) return
        try {
            await api('jobs-cancel', { adminPass, method: 'POST', body: { jobId: activeJob.id } })
            await load() // Refresh to show updated status
        } catch (e) {
            alert(`Failed to cancel job: ${e.message}`)
        }
    }

    const toggleExpand = (i) => {
        const newExpanded = new Set(expanded)
        if (newExpanded.has(i)) newExpanded.delete(i)
        else newExpanded.add(i)
        setExpanded(newExpanded)
    }

    return (
        <section>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="m-0">History</h2>
            </div>

            <div className="row mb-3">
                <div className="col-12">
                    <div className="input-group">
                        <input
                            className="form-control"
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                        />
                        <button className="btn btn-outline-danger" onClick={clearLogs}>Clear logs (day)</button>
                    </div>
                </div>
            </div>

            {activeJob && (
                <div className="card mb-3 border-primary bg-primary bg-opacity-10">
                    <div className="card-body">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <h5 className="card-title m-0">
                                {activeJob.status === 'running' ? '🚀 Redemption in Progress' : '⏳ Rate Limited - Waiting...'}
                            </h5>
                            <span className="badge bg-primary">
                                {Math.round((activeJob.done / activeJob.total) * 100)}%
                            </span>
                        </div>
                        <div className="progress mb-2" style={{ height: 10 }}>
                            <div
                                className={`progress-bar progress-bar-striped progress-bar-animated ${activeJob.status === 'rate_limited' ? 'bg-warning' : 'bg-primary'}`}
                                role="progressbar"
                                style={{ width: `${(activeJob.done / activeJob.total) * 100}%` }}
                            ></div>
                        </div>
                        <div className="d-flex justify-content-between small text-muted">
                            <div>
                                <strong>Progress:</strong> {activeJob.done} / {activeJob.total}
                                <span className="ms-3 text-success">✓ {activeJob.successes}</span>
                                <span className="ms-2 text-danger">✗ {activeJob.failures}</span>
                            </div>
                            <div className="d-flex align-items-center gap-2">
                                <div className="text-primary fw-bold">
                                    {activeJob.lastEvent || 'Starting...'}
                                </div>
                                <button
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={cancelJob}
                                    title="Cancel this job"
                                >
                                    <i className="bi bi-x-circle"></i> Cancel
                                </button>
                            </div>
                        </div>
                        {activeJob.status === 'rate_limited' && (
                            <div className="mt-2 p-2 bg-warning bg-opacity-25 rounded small border border-warning">
                                <strong>Rate Limit Alert:</strong> The Kingshot API is temporarily blocking requests. The script will automatically resume in about 1 minute.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {summary && (
                <div className="d-flex gap-2 mb-3 flex-wrap">
                    <span className="badge bg-success bg-opacity-10 border border-success p-2">Success: {summary.success || 0}</span>
                    <span className="badge bg-warning bg-opacity-10 text-warning border border-warning p-2">Already: {summary.already_redeemed || 0}</span>
                    <span className="badge bg-danger bg-opacity-10 text-danger border border-danger p-2">Errors: {summary.error || summary.errors || 0}</span>
                </div>
            )}

            {loading && <div className="text-center py-3"><div className="spinner-border text-primary" role="status"></div></div>}

            <div className="table-responsive border rounded">
                <table className="table table-hover align-middle m-0">
                    <thead>
                        <tr>
                            <th className="d-none-mobile" style={{ width: 100 }}>Time</th>
                            <th>Player</th>
                            <th>Code</th>
                            <th style={{ width: 100 }}>Status</th>
                            <th className="d-none-mobile">Message</th>
                            <th className="d-md-none" style={{ width: 40 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((e, i) => (
                            <React.Fragment key={i}>
                                <tr onClick={() => toggleExpand(i)} style={{ cursor: 'pointer' }}>
                                    <td className="text-nowrap small text-muted d-none-mobile">{e.ts ? new Date(e.ts).toLocaleTimeString('en-GB', { timeZone: 'UTC' }) : '-'}</td>
                                    <td className="text-break" style={{ minWidth: 100 }}>{e.nickname || e.playerId}</td>
                                    <td className="fw-bold small">{e.code}</td>
                                    <td>
                                        <span className={`badge ${e.status === 'success' ? 'bg-success' : e.status === 'already_redeemed' ? 'bg-warning text-dark' : 'bg-danger'}`}>
                                            {e.status === 'already_redeemed' ? 'Already Redeemed' : e.status}
                                        </span>
                                    </td>
                                    <td className="d-none-mobile small text-muted text-truncate" style={{ maxWidth: 200 }} title={e.message}>{e.message}</td>
                                    <td className="d-md-none text-end text-muted">
                                        <i className={`bi bi-chevron-${expanded.has(i) ? 'up' : 'down'}`}></i>
                                    </td>
                                </tr>
                                {
                                    expanded.has(i) && (
                                        <tr className="d-md-none bg-body-tertiary">
                                            <td colSpan="6" className="p-3">
                                                <div className="d-flex flex-column gap-2 small">
                                                    <div className="d-flex align-items-center gap-2">
                                                        {e.avatar && <img src={e.avatar} alt="avatar" style={{ width: 32, height: 32, borderRadius: '50%' }} />}
                                                        <div>
                                                            <strong>Player ID:</strong> <code className="text-break">{e.playerId}</code>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <strong>Message:</strong>
                                                        <div className="text-muted text-break" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{e.message}</div>
                                                    </div>
                                                    <div><strong>Full Timestamp:</strong> {fmtUTC(e.ts)}</div>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                }
                            </React.Fragment>
                        ))}
                        {entries.length === 0 && !loading && (
                            <tr>
                                <td colSpan="5" className="text-center text-muted py-4">No logs for this date</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section >
    )
}

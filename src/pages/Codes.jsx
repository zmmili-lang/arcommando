import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

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

function fmtUTC(ts) { return ts ? new Date(ts).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC' : '-' }

export default function Codes({ adminPass }) {
    const [codes, setCodes] = useState([])
    const [code, setCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const load = async () => {
        setLoading(true)
        setError('')
        try {
            const data = await api('codes-list', { adminPass })
            setCodes(data.codes || [])
        } catch (e) {
            setError(String(e.message || e))
        } finally { setLoading(false) }
    }

    useEffect(() => { load() }, [])

    const add = async () => {
        const c = code.trim().toUpperCase()
        if (!c) return
        setLoading(true)
        setError('')
        try {
            const data = await api('codes-add', { adminPass, method: 'POST', body: { code: c } })
            toast.success('Code added')
            setCode('')
            setCodes(data.codes || [])
            // auto-start redeem for this code across all players
            const start = await api('redeem-start', { adminPass, method: 'POST', body: { onlyCode: c } })
            await fetch(`/.netlify/functions/redeem-run-background?jobId=${encodeURIComponent(start.jobId)}`, { method: 'POST', headers: { 'x-admin-pass': adminPass } })
            toast('Auto-redeem started')
        } catch (e) { setError(String(e.message || e)); toast.error('Add failed') } finally { setLoading(false) }
    }

    const update = async (c, patch) => {
        setLoading(true)
        setError('')
        try {
            const data = await api('codes-update', { adminPass, method: 'POST', body: { code: c.code, ...patch } })
            toast.success('Updated')
            setCodes(data.codes || [])
        } catch (e) { setError(String(e.message || e)); toast.error('Update failed') } finally { setLoading(false) }
    }

    const remove = async (c) => {
        if (!confirm(`Remove code ${c.code}?`)) return
        setLoading(true)
        setError('')
        try {
            const data = await api('codes-remove', { adminPass, method: 'POST', body: { code: c.code } })
            toast.success('Removed')
            // Force table refresh by loading fresh data
            await load()
        } catch (e) { setError(String(e.message || e)); toast.error('Remove failed') } finally { setLoading(false) }
    }

    return (
        <section>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="m-0">Codes</h2>
            </div>

            <div className="row g-2 mb-3">
                <div className="col-12">
                    <div className="input-group">
                        <input
                            className="form-control"
                            placeholder="Gift code"
                            value={code}
                            onChange={e => setCode(e.target.value)}
                        />
                        <button className="btn btn-success" onClick={add} disabled={loading}>Add</button>
                    </div>
                </div>
            </div>

            {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}

            <div className="table-responsive border rounded">
                <table className="table table-hover align-middle m-0">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th style={{ width: 80 }}>Active</th>
                            <th className="d-none-mobile">Added (UTC)</th>
                            <th className="d-none-mobile">Redeemed</th>
                            <th className="text-end" style={{ width: 80 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {codes.map(c => (
                            <tr key={c.code}>
                                <td className="fw-bold">{c.code}</td>
                                <td>
                                    <div className="form-check form-switch">
                                        <input className="form-check-input" type="checkbox" role="switch" checked={!!c.active} onChange={e => update(c, { active: e.target.checked })} />
                                    </div>
                                </td>
                                <td className="text-nowrap small text-muted d-none-mobile">{fmtUTC(c.addedAt)}</td>
                                <td className="text-nowrap d-none-mobile">{c.stats ? `${c.stats.redeemedCount} / ${c.stats.totalPlayers}` : '-'}</td>
                                <td className="text-end"><button className="btn btn-sm btn-outline-danger" onClick={() => remove(c)} disabled={loading}><i className="bi bi-trash"></i></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

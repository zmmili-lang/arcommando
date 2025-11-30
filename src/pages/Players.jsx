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

function fmtUTC(ts) {
    return ts ? new Date(ts).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC' : '-'
}

export default function Players({ adminPass }) {
    const [players, setPlayers] = useState([])
    const [loading, setLoading] = useState(false)
    const [adding, setAdding] = useState(false)
    const [fid, setFid] = useState('')
    const [error, setError] = useState('')
    const [expanded, setExpanded] = useState(new Set())
    const [expandedInfo, setExpandedInfo] = useState(new Set())
    const [codeStatus, setCodeStatus] = useState({})

    const load = async () => {
        setLoading(true)
        setError('')
        try {
            const data = await api('players-list', { adminPass })
            setPlayers(data.players || [])
        } catch (e) {
            setError(String(e.message || e))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const add = async () => {
        if (!fid.trim()) return
        const playerIdToAdd = fid.trim()
        setAdding(true)
        setError('')
        try {
            const data = await api('players-add', { adminPass, method: 'POST', body: { playerId: playerIdToAdd } })
            toast.success('Player added')
            setFid('')
            setPlayers(data.players || [])

            if (data.redemptionResults && data.redemptionResults.length > 0) {
                const successes = data.redemptionResults.filter(r => r.status === 'success' || r.status === 'already_redeemed').length
                const failures = data.redemptionResults.filter(r => r.status === 'error').length
                toast(`Redeemed ${successes} codes (${failures} failed)`, { icon: '🎁', duration: 5000 })
            }
        } catch (e) { setError(String(e.message || e)); toast.error('Failed to add player') } finally { setAdding(false) }
    }


    const remove = async (p) => {
        if (!confirm(`Remove ${p.nickname || p.id}?`)) return
        setLoading(true)
        setError('')
        try {
            const data = await api('players-remove', { adminPass, method: 'POST', body: { id: p.id } })
            toast.success('Removed')
            setPlayers(data.players || [])
        } catch (e) { setError(String(e.message || e)); toast.error('Remove failed') } finally { setLoading(false) }
    }

    const toggleCodes = async (p) => {
        const newExpanded = new Set(expanded)
        if (newExpanded.has(p.id)) {
            newExpanded.delete(p.id)
            setExpanded(newExpanded)
            const newCodeStatus = { ...codeStatus }
            delete newCodeStatus[p.id]
            setCodeStatus(newCodeStatus)
            return
        }
        newExpanded.add(p.id)
        setExpanded(newExpanded)
        setCodeStatus({ ...codeStatus, [p.id]: { loading: true, data: null } })
        try {
            const data = await api(`player-status?id=${encodeURIComponent(p.id)}`, { adminPass })
            setCodeStatus(prev => ({ ...prev, [p.id]: { loading: false, data } }))
        } catch (e) {
            setCodeStatus(prev => ({ ...prev, [p.id]: { loading: false, data: null } }))
            toast.error('Failed to load code status')
        }
    }

    const toggleInfo = (id) => {
        const newExpandedInfo = new Set(expandedInfo)
        if (newExpandedInfo.has(id)) newExpandedInfo.delete(id)
        else newExpandedInfo.add(id)
        setExpandedInfo(newExpandedInfo)
    }

    const redeemOne = async (playerId, code) => {
        try {
            const res = await api('redeem-single', { adminPass, method: 'POST', body: { id: playerId, code } })
            toast[res.status === 'success' || res.status === 'already_redeemed' ? 'success' : 'error'](`${code}: ${res.message}`)
            // optimistic update: mark redeemed/blocked locally immediately
            setCodeStatus(prev => {
                const cur = prev[playerId]?.data || { codes: [], redeemed: [], blocked: {} }
                const next = { ...cur, redeemed: [...new Set([...(cur.redeemed || []), ...(res.status === 'success' || res.status === 'already_redeemed' ? [code] : [])])], blocked: { ...(cur.blocked || {}) } }
                const msg = (res.message || '').toUpperCase()
                if (msg.includes('EXPIRED')) next.blocked[code] = 'expired'
                if (msg.includes('CLAIM LIMIT')) next.blocked[code] = 'limit'
                return { ...prev, [playerId]: { loading: false, data: next } }
            })
            // then refresh from server history to be consistent
            const data = await api(`player-status?id=${encodeURIComponent(playerId)}`, { adminPass })
            setCodeStatus(prev => ({ ...prev, [playerId]: { loading: false, data } }))
        } catch (e) {
            toast.error(String(e.message || e))
        }
    }

    return (
        <section>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="m-0">Players</h2>
                <span className="text-muted small">Count: {players.length} / 100</span>
            </div>

            <div className="row g-2 mb-3">
                <div className="col-12">
                    <div className="input-group">
                        <input
                            className="form-control"
                            placeholder="Player ID (fid)"
                            value={fid}
                            onChange={e => setFid(e.target.value)}
                        />
                        <button className="btn btn-success" onClick={add} disabled={adding}>Add</button>
                    </div>
                </div>
            </div>

            {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}

            <div className="table-responsive border rounded">
                <table className="table table-hover align-middle m-0">
                    <thead>
                        <tr>
                            <th style={{ width: 80, textAlign: 'center' }}>Avatar</th>
                            <th>Nickname</th>
                            <th>FID</th>
                            <th className="d-none-mobile">Added (UTC)</th>
                            <th className="d-none-mobile">Codes</th>
                            <th className="text-end" style={{ width: 80 }}></th>
                            <th className="d-md-none" style={{ width: 40 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {players.map(p => (
                            <React.Fragment key={p.id}>
                                <tr onClick={() => toggleInfo(p.id)} style={{ cursor: 'pointer' }}>
                                    <td className="text-center">{p.avatar_image ? <img src={p.avatar_image} alt="avatar" style={{ width: 32, height: 32, borderRadius: '50%' }} /> : '-'}</td>
                                    <td className="fw-medium">{p.nickname || <span className="text-muted fst-italic">Unknown</span>}</td>
                                    <td><code className="small">{p.id.length > 10 ? p.id.substring(0, 10) + '...' : p.id}</code></td>
                                    <td className="text-nowrap small text-muted d-none-mobile">{fmtUTC(p.addedAt)}</td>
                                    <td className="d-none-mobile"><button className="btn btn-sm btn-outline-primary" onClick={(e) => { e.stopPropagation(); toggleCodes(p); }}>{expanded.has(p.id) ? 'Hide' : 'View'}</button></td>
                                    <td className="text-end" onClick={(e) => e.stopPropagation()}>
                                        <button className="btn btn-sm btn-outline-danger" onClick={() => remove(p)} disabled={loading}><i className="bi bi-trash"></i></button>
                                    </td>
                                    <td className="d-md-none text-end text-muted">
                                        <i className={`bi bi-chevron-${expandedInfo.has(p.id) ? 'up' : 'down'}`}></i>
                                    </td>
                                </tr>
                                {expandedInfo.has(p.id) && (
                                    <tr className="d-md-none bg-body-tertiary">
                                        <td colSpan="7" className="p-3">
                                            <div className="d-flex flex-column gap-2 small">
                                                <div>
                                                    <strong>Full Player ID:</strong>
                                                    <div><code className="text-break">{p.id}</code></div>
                                                </div>
                                                <div><strong>Added:</strong> {fmtUTC(p.addedAt)}</div>
                                                <div>
                                                    <button className="btn btn-sm btn-outline-primary w-100" onClick={(e) => { e.stopPropagation(); toggleCodes(p); }}>
                                                        {expanded.has(p.id) ? 'Hide Codes' : 'View Codes'}
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {expanded.has(p.id) && (
                                    <tr>
                                        <td colSpan="7" className="bg-body-tertiary">
                                            {codeStatus[p.id]?.loading && <div className="spinner-border spinner-border-sm text-secondary" role="status"></div>}
                                            {codeStatus[p.id]?.data && (
                                                <div className="d-flex gap-2 flex-wrap p-2">
                                                    {codeStatus[p.id].data.codes.map(c => {
                                                        const redeemed = codeStatus[p.id].data.redeemed.includes(c.code)
                                                        const blockedReason = codeStatus[p.id].data.blocked?.[c.code]
                                                        return (
                                                            <div key={c.code} className="d-flex align-items-center gap-2 border rounded px-2 py-1 bg-body">
                                                                <span className="fw-bold small">{c.code}</span>
                                                                {redeemed && <span className="badge bg-success">Redeemed</span>}
                                                                {!redeemed && blockedReason === 'expired' && <span className="badge bg-secondary">Expired</span>}
                                                                {!redeemed && blockedReason === 'limit' && <span className="badge bg-secondary">Limit</span>}
                                                                {!redeemed && !blockedReason && <button className="btn btn-xs btn-primary py-0" style={{ fontSize: 10 }} onClick={() => redeemOne(p.id, c.code)}>Redeem</button>}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

const load = async () => {
    setLoading(true)
    setError('')
    try {
        const data = await api('players-list', { adminPass })
        setPlayers(data.players || [])
    } catch (e) {
        setError(String(e.message || e))
    } finally {
        setLoading(false)
    }
}

useEffect(() => { load() }, [])

const add = async () => {
    if (!fid.trim()) return
    const playerIdToAdd = fid.trim()
    setAdding(true)
    setError('')
    try {
        const data = await api('players-add', { adminPass, method: 'POST', body: { playerId: playerIdToAdd } })
        toast.success('Player added')
        setFid('')
        setPlayers(data.players || [])

        if (data.redemptionResults && data.redemptionResults.length > 0) {
            const successes = data.redemptionResults.filter(r => r.status === 'success' || r.status === 'already_redeemed').length
            const failures = data.redemptionResults.filter(r => r.status === 'error').length
            toast(`Redeemed ${successes} codes (${failures} failed)`, { icon: '🎁', duration: 5000 })
        }
    } catch (e) { setError(String(e.message || e)); toast.error('Failed to add player') } finally { setAdding(false) }
}


const remove = async (p) => {
    if (!confirm(`Remove ${p.nickname || p.id}?`)) return
    setLoading(true)
    setError('')
    try {
        const data = await api('players-remove', { adminPass, method: 'POST', body: { id: p.id } })
        toast.success('Removed')
        setPlayers(data.players || [])
    } catch (e) { setError(String(e.message || e)); toast.error('Remove failed') } finally { setLoading(false) }
}

const toggleCodes = async (p) => {
    const newExpanded = new Set(expanded)
    if (newExpanded.has(p.id)) {
        newExpanded.delete(p.id)
        setExpanded(newExpanded)
        const newCodeStatus = { ...codeStatus }
        delete newCodeStatus[p.id]
        setCodeStatus(newCodeStatus)
        return
    }
    newExpanded.add(p.id)
    setExpanded(newExpanded)
    setCodeStatus({ ...codeStatus, [p.id]: { loading: true, data: null } })
    try {
        const data = await api(`player-status?id=${encodeURIComponent(p.id)}`, { adminPass })
        setCodeStatus(prev => ({ ...prev, [p.id]: { loading: false, data } }))
    } catch (e) {
        setCodeStatus(prev => ({ ...prev, [p.id]: { loading: false, data: null } }))
        toast.error('Failed to load code status')
    }
}

const redeemOne = async (playerId, code) => {
    try {
        const res = await api('redeem-single', { adminPass, method: 'POST', body: { id: playerId, code } })
        toast[res.status === 'success' || res.status === 'already_redeemed' ? 'success' : 'error'](`${code}: ${res.message}`)
        // optimistic update: mark redeemed/blocked locally immediately
        setCodeStatus(prev => {
            const cur = prev[playerId]?.data || { codes: [], redeemed: [], blocked: {} }
            const next = { ...cur, redeemed: [...new Set([...(cur.redeemed || []), ...(res.status === 'success' || res.status === 'already_redeemed' ? [code] : [])])], blocked: { ...(cur.blocked || {}) } }
            const msg = (res.message || '').toUpperCase()
            if (msg.includes('EXPIRED')) next.blocked[code] = 'expired'
            if (msg.includes('CLAIM LIMIT')) next.blocked[code] = 'limit'
            return { ...prev, [playerId]: { loading: false, data: next } }
        })
        // then refresh from server history to be consistent
        const data = await api(`player-status?id=${encodeURIComponent(playerId)}`, { adminPass })
        setCodeStatus(prev => ({ ...prev, [playerId]: { loading: false, data } }))
    } catch (e) {
        toast.error(String(e.message || e))
    }
}

return (
    <section>
        <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="m-0">Players</h2>
            <span className="text-muted small">Count: {players.length} / 100</span>
        </div>

        <div className="row g-2 mb-3">
            <div className="col-12">
                <div className="input-group">
                    <input
                        className="form-control"
                        placeholder="Player ID (fid)"
                        value={fid}
                        onChange={e => setFid(e.target.value)}
                    />
                    <button className="btn btn-success" onClick={add} disabled={adding}>Add</button>
                </div>
            </div>
        </div>

        {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}

        <div className="table-responsive border rounded">
            <table className="table table-hover align-middle m-0">
                <thead>
                    <tr>
                        <th style={{ width: 80, textAlign: 'center' }}>Avatar</th>
                        <th>Nickname</th>
                        <th>FID</th>
                        <th className="d-none-mobile">Added (UTC)</th>
                        <th className="d-none-mobile">Codes</th>
                        <th className="text-end" style={{ width: 80 }}></th>
                    </tr>
                </thead>
                <tbody>
                    {players.map(p => (
                        <React.Fragment key={p.id}>
                            <tr>
                                <td className="text-center">{p.avatar_image ? <img src={p.avatar_image} alt="avatar" style={{ width: 32, height: 32, borderRadius: '50%' }} /> : '-'}</td>
                                <td className="fw-medium">{p.nickname || <span className="text-muted fst-italic">Unknown</span>}</td>
                                <td><code>{p.id}</code></td>
                                <td className="text-nowrap small text-muted d-none-mobile">{fmtUTC(p.addedAt)}</td>
                                <td className="d-none-mobile"><button className="btn btn-sm btn-outline-primary" onClick={() => toggleCodes(p)}>{expanded.has(p.id) ? 'Hide' : 'View'}</button></td>
                                <td className="text-end">
                                    <button className="btn btn-sm btn-outline-danger" onClick={() => remove(p)} disabled={loading}><i className="bi bi-trash"></i></button>
                                </td>
                            </tr>
                            {expanded.has(p.id) && (
                                <tr>
                                    <td colSpan="6" className="bg-body-tertiary">
                                        {codeStatus[p.id]?.loading && <div className="spinner-border spinner-border-sm text-secondary" role="status"></div>}
                                        {codeStatus[p.id]?.data && (
                                            <div className="d-flex gap-2 flex-wrap p-2">
                                                {codeStatus[p.id].data.codes.map(c => {
                                                    const redeemed = codeStatus[p.id].data.redeemed.includes(c.code)
                                                    const blockedReason = codeStatus[p.id].data.blocked?.[c.code]
                                                    return (
                                                        <div key={c.code} className="d-flex align-items-center gap-2 border rounded px-2 py-1 bg-body">
                                                            <span className="fw-bold small">{c.code}</span>
                                                            {redeemed && <span className="badge bg-success">Redeemed</span>}
                                                            {!redeemed && blockedReason === 'expired' && <span className="badge bg-secondary">Expired</span>}
                                                            {!redeemed && blockedReason === 'limit' && <span className="badge bg-secondary">Limit</span>}
                                                            {!redeemed && !blockedReason && <button className="btn btn-xs btn-primary py-0" style={{ fontSize: 10 }} onClick={() => redeemOne(p.id, c.code)}>Redeem</button>}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    </section>
)
}

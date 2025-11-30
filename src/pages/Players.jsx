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
            <h2>Players</h2>
            <div className="d-flex gap-2 align-items-center">
                <input className="form-control" style={{ maxWidth: 300 }} placeholder="Player ID (fid)" value={fid} onChange={e => setFid(e.target.value)} />
                <button className="btn btn-success" onClick={add} disabled={adding}>Add</button>
                <button className="btn btn-outline-secondary" onClick={load} disabled={loading}>Refresh</button>
                <span className="text-muted">Count: {players.length} / 100</span>
            </div>
            {error && <div className="alert alert-danger py-1 my-2" role="alert">{error}</div>}
            <table className="table table-sm table-hover align-middle mt-2">
                <thead className="table-light">
                    <tr>
                        <th>Avatar</th>
                        <th>Nickname</th>
                        <th>FID</th>
                        <th>Added (UTC)</th>
                        <th>Last Redeemed (UTC)</th>
                        <th>Codes</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {players.map(p => (
                        <>
                            <tr key={p.id}>
                                <td>{p.avatar_image ? <img src={p.avatar_image} alt="avatar" style={{ width: 32, height: 32, borderRadius: 16 }} /> : '-'}</td>
                                <td>{p.nickname || ''}</td>
                                <td>{p.id}</td>
                                <td>{fmtUTC(p.addedAt)}</td>
                                <td>{fmtUTC(p.lastRedeemedAt)}</td>
                                <td><button className="btn btn-sm btn-outline-primary" onClick={() => toggleCodes(p)}>{expanded.has(p.id) ? 'Hide' : 'View'}</button></td>
                                <td>
                                    <button className="btn btn-sm btn-outline-danger" onClick={() => remove(p)} disabled={loading}>Remove</button>
                                </td>
                            </tr>
                            {expanded.has(p.id) && (
                                <tr>
                                    <td colSpan="7">
                                        {codeStatus[p.id]?.loading && <div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div>}
                                        {codeStatus[p.id]?.data && (
                                            <div className="d-flex gap-2 flex-wrap">
                                                {codeStatus[p.id].data.codes.map(c => {
                                                    const redeemed = codeStatus[p.id].data.redeemed.includes(c.code)
                                                    const blockedReason = codeStatus[p.id].data.blocked?.[c.code]
                                                    return (
                                                        <div key={c.code} className="d-flex align-items-center gap-2 border rounded px-2 py-1">
                                                            <span className={`badge ${redeemed ? 'bg-success' : blockedReason ? 'bg-secondary' : 'bg-secondary'}`}>{c.code}</span>
                                                            {redeemed && <span className="text-success small">Redeemed</span>}
                                                            {!redeemed && blockedReason === 'expired' && <span className="text-muted small">Expired</span>}
                                                            {!redeemed && blockedReason === 'limit' && <span className="text-muted small">Claim limit</span>}
                                                            {!redeemed && !blockedReason && <button className="btn btn-sm btn-outline-primary" onClick={() => redeemOne(p.id, c.code)}>Redeem</button>}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </>
                    ))}
                </tbody>
            </table>
        </section>
    )
}

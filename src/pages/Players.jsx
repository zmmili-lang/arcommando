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
  const [expanded, setExpanded] = useState(null)
  const [codeStatus, setCodeStatus] = useState({ loading: false, data: null })

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
    setAdding(true)
    setError('')
    try {
      const data = await api('players-add', { adminPass, method: 'POST', body: { playerId: fid.trim() } })
      toast.success('Player added')
      setFid('')
      setPlayers(data.players || [])
    } catch (e) { setError(String(e.message || e)); toast.error('Failed to add player') } finally { setAdding(false) }
  }

  const update = async (p, patch) => {
    setLoading(true)
    setError('')
    try {
      const data = await api('players-update', { adminPass, method: 'POST', body: { id: p.id, ...patch } })
      toast.success('Updated')
      setPlayers(data.players || [])
    } catch (e) { setError(String(e.message || e)); toast.error('Update failed') } finally { setLoading(false) }
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
    if (expanded === p.id) { setExpanded(null); setCodeStatus({ loading: false, data: null }); return }
    setExpanded(p.id)
    setCodeStatus({ loading: true, data: null })
    try {
      const data = await api(`player-status?id=${encodeURIComponent(p.id)}`, { adminPass })
      setCodeStatus({ loading: false, data })
    } catch (e) {
      setCodeStatus({ loading: false, data: null }); toast.error('Failed to load code status')
    }
  }

  const redeemOne = async (playerId, code) => {
    try {
      const res = await api('redeem-single', { adminPass, method: 'POST', body: { id: playerId, code } })
      toast[res.status === 'success' || res.status === 'already_redeemed' ? 'success' : 'error'](`${code}: ${res.message}`)
      // refresh status panel
      const data = await api(`player-status?id=${encodeURIComponent(playerId)}`, { adminPass })
      setCodeStatus({ loading: false, data })
    } catch (e) {
      toast.error(String(e.message || e))
    }
  }

  return (
    <section>
      <h2>Players</h2>
      <div className="d-flex gap-2 align-items-center">
        <input className="form-control" style={{maxWidth:300}} placeholder="Player ID (fid)" value={fid} onChange={e => setFid(e.target.value)} />
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
            <th>Disabled</th>
            <th>Last Redeemed (UTC)</th>
            <th>Codes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {players.map(p => (
            <>
            <tr key={p.id}>
              <td>{p.avatar_image ? <img src={p.avatar_image} alt="avatar" style={{width:32,height:32,borderRadius:16}}/> : '-'}</td>
              <td>
                <input className="form-control form-control-sm" value={p.nickname || ''} onChange={e => update(p, { nickname: e.target.value })} />
              </td>
              <td>{p.id}</td>
              <td>{fmtUTC(p.addedAt)}</td>
              <td>
                <input type="checkbox" checked={!!p.disabled} onChange={e => update(p, { disabled: e.target.checked })} />
              </td>
              <td>{fmtUTC(p.lastRedeemedAt)}</td>
              <td><button className="btn btn-sm btn-outline-primary" onClick={() => toggleCodes(p)}>{expanded === p.id ? 'Hide' : 'View'}</button></td>
              <td>
                <button className="btn btn-sm btn-outline-danger" onClick={() => remove(p)} disabled={loading}>Remove</button>
              </td>
            </tr>
            {expanded === p.id && (
              <tr>
                <td colSpan="8">
                  {codeStatus.loading && <div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div>}
                  {codeStatus.data && (
                    <div className="d-flex gap-2 flex-wrap">
                      {codeStatus.data.codes.map(c => {
                        const redeemed = codeStatus.data.redeemed.includes(c.code)
                        const blockedReason = codeStatus.data.blocked?.[c.code]
                        return (
                          <div key={c.code} className="d-flex align-items-center gap-2 border rounded px-2 py-1">
                            <span className={`badge ${redeemed? 'bg-success': blockedReason? 'bg-secondary':'bg-info'}`}>{c.code}</span>
                            {redeemed && <span className="text-success small">Redeemed</span>}
                            {!redeemed && blockedReason === 'expired' && <span className="text-muted small">Expired</span>}
                            {!redeemed && blockedReason === 'limit' && <span className="text-muted small">Claim limit</span>}
                            {!redeemed && !blockedReason && <button className="btn btn-sm btn-primary" onClick={() => redeemOne(p.id, c.code)}>Redeem</button>}
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

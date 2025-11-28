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
    const c = code.trim()
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
      setCodes(data.codes || [])
    } catch (e) { setError(String(e.message || e)); toast.error('Remove failed') } finally { setLoading(false) }
  }

  return (
    <section>
      <h2>Codes</h2>
      <div className="d-flex gap-2 align-items-center">
        <input className="form-control" style={{maxWidth:260}} placeholder="Gift code" value={code} onChange={e => setCode(e.target.value)} />
        <button className="btn btn-success" onClick={add} disabled={loading}>Add</button>
        <button className="btn btn-outline-secondary" onClick={load} disabled={loading}>Refresh</button>
      </div>
      {error && <div className="alert alert-danger py-1 my-2" role="alert">{error}</div>}
      <table className="table table-sm table-hover align-middle mt-2">
        <thead className="table-light">
          <tr>
            <th>Code</th>
            <th>Active</th>
            <th>Added (UTC)</th>
            <th>Last Tried (UTC)</th>
            <th>Redeemed</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {codes.map(c => (
            <tr key={c.code}>
              <td>{c.code}</td>
              <td><input type="checkbox" checked={!!c.active} onChange={e => update(c, { active: e.target.checked })} /></td>
              <td>{fmtUTC(c.addedAt)}</td>
              <td>{fmtUTC(c.lastTriedAt)}</td>
              <td>{c.stats ? `${c.stats.redeemedCount} / ${c.stats.totalPlayers}` : '-'}</td>
              <td><button className="btn btn-sm btn-outline-danger" onClick={() => remove(c)} disabled={loading}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

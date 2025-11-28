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

export default function Players({ adminPass }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [fid, setFid] = useState('')
  const [error, setError] = useState('')

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
    setLoading(true)
    setError('')
    try {
      await api('players-add', { adminPass, method: 'POST', body: { playerId: fid.trim() } })
      setFid('')
      await load()
    } catch (e) { setError(String(e.message || e)) } finally { setLoading(false) }
  }

  const update = async (p, patch) => {
    setLoading(true)
    setError('')
    try {
      await api('players-update', { adminPass, method: 'POST', body: { id: p.id, ...patch } })
      await load()
    } catch (e) { setError(String(e.message || e)) } finally { setLoading(false) }
  }

  const remove = async (p) => {
    if (!confirm(`Remove ${p.nickname || p.id}?`)) return
    setLoading(true)
    setError('')
    try {
      await api('players-remove', { adminPass, method: 'POST', body: { id: p.id } })
      await load()
    } catch (e) { setError(String(e.message || e)) } finally { setLoading(false) }
  }

  return (
    <section>
      <h2>Players</h2>
      <div className="row">
        <input placeholder="Player ID (fid)" value={fid} onChange={e => setFid(e.target.value)} />
        <button onClick={add} disabled={loading}>Add</button>
        <button onClick={load} disabled={loading}>Refresh</button>
        <span style={{opacity:0.7}}>Count: {players.length} / 100</span>
      </div>
      {error && <p className="badge err">{error}</p>}
      <table className="table" style={{marginTop: 12}}>
        <thead>
          <tr>
            <th>Avatar</th>
            <th>Nickname</th>
            <th>FID</th>
            <th>Added</th>
            <th>Disabled</th>
            <th>Last Redeemed</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {players.map(p => (
            <tr key={p.id}>
              <td>{p.avatar_image ? <img src={p.avatar_image} alt="avatar" style={{width:32,height:32,borderRadius:16}}/> : '-'}</td>
              <td>
                <input value={p.nickname || ''} onChange={e => update(p, { nickname: e.target.value })} />
              </td>
              <td>{p.id}</td>
              <td>{p.addedAt ? new Date(p.addedAt).toLocaleString() : '-'}</td>
              <td>
                <input type="checkbox" checked={!!p.disabled} onChange={e => update(p, { disabled: e.target.checked })} />
              </td>
              <td>{p.lastRedeemedAt ? new Date(p.lastRedeemedAt).toLocaleString() : '-'}</td>
              <td>
                <button onClick={() => remove(p)} disabled={loading}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

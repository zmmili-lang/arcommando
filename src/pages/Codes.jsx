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

export default function Codes({ adminPass }) {
  const [codes, setCodes] = useState([])
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
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
      await api('codes-add', { adminPass, method: 'POST', body: { code: c, note } })
      setCode(''); setNote('')
      await load()
    } catch (e) { setError(String(e.message || e)) } finally { setLoading(false) }
  }

  const update = async (c, patch) => {
    setLoading(true)
    setError('')
    try {
      await api('codes-update', { adminPass, method: 'POST', body: { code: c.code, ...patch } })
      await load()
    } catch (e) { setError(String(e.message || e)) } finally { setLoading(false) }
  }

  const remove = async (c) => {
    if (!confirm(`Remove code ${c.code}?`)) return
    setLoading(true)
    setError('')
    try {
      await api('codes-remove', { adminPass, method: 'POST', body: { code: c.code } })
      await load()
    } catch (e) { setError(String(e.message || e)) } finally { setLoading(false) }
  }

  return (
    <section>
      <h2>Codes</h2>
      <div className="row">
        <input placeholder="Gift code" value={code} onChange={e => setCode(e.target.value)} />
        <input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
        <button onClick={add} disabled={loading}>Add</button>
        <button onClick={load} disabled={loading}>Refresh</button>
      </div>
      {error && <p className="badge err">{error}</p>}
      <table className="table" style={{marginTop: 12}}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Active</th>
            <th>Added</th>
            <th>Last Tried</th>
            <th>Note</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {codes.map(c => (
            <tr key={c.code}>
              <td>{c.code}</td>
              <td><input type="checkbox" checked={!!c.active} onChange={e => update(c, { active: e.target.checked })} /></td>
              <td>{c.addedAt ? new Date(c.addedAt).toLocaleString() : '-'}</td>
              <td>{c.lastTriedAt ? new Date(c.lastTriedAt).toLocaleString() : '-'}</td>
              <td><input value={c.note || ''} onChange={e => update(c, { note: e.target.value })} /></td>
              <td><button onClick={() => remove(c)} disabled={loading}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

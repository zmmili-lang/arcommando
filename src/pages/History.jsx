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
  return d.toISOString().slice(0,10)
}

function fmtUTC(ts) { return ts ? new Date(ts).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC' : '-' }

export default function History({ adminPass }) {
  const [date, setDate] = useState(today())
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { (async () => {
    setLoading(true)
    try {
      const data = await api(`history-list?date=${date}`, { adminPass })
      setEntries(data.entries || [])
      setSummary(data.summary || null)
    } finally { setLoading(false) }
  })() }, [date])

  return (
    <section>
      <h2>History</h2>
      <div className="d-flex gap-2 align-items-center">
        <input className="form-control" style={{maxWidth:220}} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      {summary && (
        <p className="mt-2">Totals — success: {summary.success} | already: {summary.already_redeemed} | errors: {summary.errors}</p>
      )}
      {loading && <div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div>}
      <table className="table table-sm table-hover align-middle mt-2">
        <thead className="table-light">
          <tr>
            <th>Time (UTC)</th>
            <th>Player ID</th>
            <th>Code</th>
            <th>Status</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td>{fmtUTC(e.ts)}</td>
              <td>{e.playerId}</td>
              <td>{e.code}</td>
              <td>{e.status}</td>
              <td>{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

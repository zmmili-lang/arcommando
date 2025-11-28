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
      <div className="row">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      {summary && (
        <p>Totals — success: {summary.success} | already: {summary.already_redeemed} | errors: {summary.errors}</p>
      )}
      <table className="table" style={{marginTop: 12}}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Player ID</th>
            <th>Code</th>
            <th>Status</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td>{new Date(e.ts).toLocaleString()}</td>
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

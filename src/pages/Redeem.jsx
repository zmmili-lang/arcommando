import React, { useEffect, useRef, useState } from 'react'

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

export default function Redeem({ adminPass }) {
  const [job, setJob] = useState(null)
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(false)
  const pollRef = useRef(null)

  const start = async () => {
    setLoading(true)
    try {
      const { jobId } = await api('redeem-start', { adminPass, method: 'POST', body: {} })
      // kick off background run
      await fetch(`/.netlify/functions/redeem-run-background?jobId=${encodeURIComponent(jobId)}`, { method: 'POST', headers: { 'x-admin-pass': adminPass } })
      setJob({ id: jobId, status: 'queued' })
      // begin polling
      clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        const j = await api(`redeem-status?jobId=${encodeURIComponent(jobId)}`, { adminPass })
        setJob(j)
        if (j?.lastEvent) setLog(prev => [j.lastEvent, ...prev].slice(0, 50))
        if (j?.status === 'complete' || j?.status === 'failed') clearInterval(pollRef.current)
      }, 2000)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => () => clearInterval(pollRef.current), [])

  return (
    <section>
      <h2>Redeem</h2>
      <div className="row">
        <button onClick={start} disabled={loading || job?.status === 'running'}>Redeem All Active Codes for All Players</button>
        {job && <span>Job: {job.id} — Status: {job.status} — {job.done || 0}/{job.totalTasks || 0} — OK: {job.successes || 0} — Fail: {job.failures || 0}</span>}
      </div>
      <div style={{marginTop:12}}>
        <h4>Live log</h4>
        <ul>
          {log.map((l, idx) => (
            <li key={idx}><code>{typeof l === 'string' ? l : JSON.stringify(l)}</code></li>
          ))}
        </ul>
      </div>
    </section>
  )
}

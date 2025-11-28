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
  const [players, setPlayers] = useState([])
  const pollRef = useRef(null)

  useEffect(() => { (async () => {
    try { const res = await api('players-list', { adminPass }); setPlayers(res.players || []) } catch {}
  })() }, [])

  const nameOf = (id) => {
    const p = players.find(x => String(x.id) === String(id))
    return p?.nickname || ''
  }

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
        if (j?.lastEventObj || j?.lastEvent) {
          const evt = j.lastEventObj || { text: j.lastEvent }
          setLog(prev => [evt, ...prev].slice(0, 50))
        }
        if (j?.status === 'complete' || j?.status === 'failed') clearInterval(pollRef.current)
      }, 2000)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => () => clearInterval(pollRef.current), [])

  const progressPct = job?.totalTasks ? Math.round(((job.done||0) / job.totalTasks) * 100) : 0

  return (
    <section>
      <h2>Redeem</h2>
      <div className="d-flex gap-2 align-items-center">
        <button className="btn btn-primary" onClick={start} disabled={loading || job?.status === 'running'}>Redeem All Active Codes for All Players</button>
        {job && <span>Job: {job.id} — Status: {job.status} — {job.done || 0}/{job.totalTasks || 0} — OK: {job.successes || 0} — Fail: {job.failures || 0}</span>}
      </div>
      {job && (
        <div className="progress my-2" style={{height:10}}>
          <div className="progress-bar" role="progressbar" style={{width: `${progressPct}%`}} aria-valuenow={progressPct} aria-valuemin="0" aria-valuemax="100">{progressPct}%</div>
        </div>
      )}
      <div className="mt-3">
        <h4>Live log</h4>
        <ul>
          {log.map((l, idx) => (
            <li key={idx}>
              {l.playerId ? (
                <code>{new Date(l.ts).toISOString()} {l.playerId} ({nameOf(l.playerId)}) {l.code} => {l.status} ({l.message})</code>
              ) : (
                <code>{typeof l === 'string' ? l : JSON.stringify(l)}</code>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )}

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

export default function Debug({ adminPass }) {
  const [printed, setPrinted] = useState(false)

  const dump = async () => {
    const debug = await api('debug-dump', { adminPass })
    const client = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      time: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
    console.groupCollapsed('ARCommando Debug Dump')
    console.log('Client', client)
    console.log('Meta', debug.meta)
    console.log('Players (first 10)', debug.players.slice(0,10))
    console.log('Codes (first 20)', debug.codes.slice(0,20))
    console.log('Jobs', debug.jobs)
    console.log('History sample (first 50)', debug.history.slice(0,50))
    console.groupEnd()
    setPrinted(true)
  }

  useEffect(() => { dump() }, [])

  return (
    <section>
      <h2>Debug</h2>
      <p>Debug dump printed to browser console (press F12 → Console). This page is hidden from the menu. You can revisit by using #debug in the URL.</p>
      <button className="btn btn-outline-secondary" onClick={dump}>Print again</button>
      {printed && <span className="ms-2 text-success">Printed</span>}
    </section>
  )
}

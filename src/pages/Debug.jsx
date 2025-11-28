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
      locationHref: location.href,
    }
    const full = { client, ...debug }
    const json = JSON.stringify(full, null, 2)
    console.group('ARCommando Debug Dump (full)')
    console.log('FULL JSON (copy from next line if needed):')
    console.log(json)
    console.log('OBJECT:', full)
    console.groupEnd()
    setPrinted(true)
    return { full, json }
  }

  useEffect(() => { dump() }, [])

  const copyAll = async () => {
    const { json } = await dump()
    try { await navigator.clipboard.writeText(json) } catch {}
  }

  return (
    <section>
      <h2>Debug</h2>
      <p>Full debug JSON printed to console (F12 → Console). Also use Copy to clipboard if preferred.</p>
      <div className="d-flex gap-2">
        <button className="btn btn-outline-secondary" onClick={dump}>Print again</button>
        <button className="btn btn-outline-primary" onClick={copyAll}>Copy JSON to clipboard</button>
      </div>
      {printed && <span className="ms-2 text-success">Printed</span>}
    </section>
  )
}

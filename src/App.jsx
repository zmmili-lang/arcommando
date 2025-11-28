import React, { useEffect, useMemo, useState } from 'react'
import Players from './pages/Players.jsx'
import Codes from './pages/Codes.jsx'
import Redeem from './pages/Redeem.jsx'
import History from './pages/History.jsx'
import { Toaster, toast } from 'react-hot-toast'

const API_BASE = '' // same origin

function useAdminPass() {
  const [stored, setStored] = useState(localStorage.getItem('arc_admin_pass') || '')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const isAuthed = stored === 'LFGARC'
  useEffect(() => { if (stored) localStorage.setItem('arc_admin_pass', stored) }, [stored])
  function tryLogin() {
    if (typed === 'LFGARC') { setStored(typed); setError(''); toast.success('Logged in') }
    else { setError('Incorrect password'); }
  }
  function logout() { localStorage.removeItem('arc_admin_pass'); setStored(''); setTyped('') }
  return { pass: stored, setTyped, typed, tryLogin, logout, isAuthed, error }
}

function Nav({ page, setPage }) {
  return (
    <nav className="d-flex gap-2 align-items-center">
      {['Players', 'Codes', 'Redeem', 'History'].map(p => (
        <button className={`btn btn-sm ${page===p?'btn-primary':'btn-outline-primary'}`} key={p} onClick={() => setPage(p)} disabled={page === p}>{p}</button>
      ))}
      <span className="flex-grow-1" />
    </nav>
  )
}

export default function App() {
  const [page, setPage] = useState('Players')
  const { pass, setTyped, typed, tryLogin, logout, isAuthed, error } = useAdminPass()
  const common = useMemo(() => ({ API_BASE, adminPass: pass }), [pass])

  if (!isAuthed) {
    return (
      <main className="container py-4">
        <h1>ARCommando Admin</h1>
        <section className="mt-3">
          <p>Enter admin password to continue.</p>
          <div className="d-flex gap-2">
            <input className="form-control" type="password" placeholder="Password" value={typed} onChange={e => setTyped(e.target.value)} />
            <button className="btn btn-primary" onClick={tryLogin}>Login</button>
          </div>
          {error && <div className="alert alert-danger mt-2 py-1" role="alert">{error}</div>}
          <p className="mt-2" style={{fontSize:12, opacity:0.8}}>Hint: hardcoded password as requested.</p>
        </section>
        <Toaster position="top-right" />
      </main>
    )
  }

  return (
    <>
      <header className="border-bottom py-2 bg-light">
        <div className="container d-flex align-items-center gap-2">
          <h1 className="h5 m-0">ARCommando</h1>
          <Nav page={page} setPage={setPage} />
          <button className="btn btn-outline-danger btn-sm" onClick={logout}>Logout</button>
        </div>
      </header>
      <main className="container py-3">
        {page === 'Players' && <Players {...common} />}
        {page === 'Codes' && <Codes {...common} />}
        {page === 'Redeem' && <Redeem {...common} />}
        {page === 'History' && <History {...common} />}
      </main>
      <Toaster position="top-right" />
    </>
  )
}

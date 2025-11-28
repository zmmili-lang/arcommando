import React, { useEffect, useMemo, useState } from 'react'
import Players from './pages/Players.jsx'
import Codes from './pages/Codes.jsx'
import Redeem from './pages/Redeem.jsx'
import History from './pages/History.jsx'
import Debug from './pages/Debug.jsx'
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
  const items = [
    { key: 'Players', icon: 'people-fill', label: 'Players' },
    { key: 'Codes', icon: 'gift-fill', label: 'Codes' },
    { key: 'Redeem', icon: 'arrow-repeat', label: 'Redeem' },
    { key: 'History', icon: 'clock-history', label: 'History' },
  ]
  return (
    <div className="d-flex flex-column gap-2">
      {items.map(it => (
        <button
          key={it.key}
          className={`btn btn-sm w-100 text-start d-flex align-items-center gap-2 ${page===it.key?'btn-primary':'btn-outline-primary'}`}
          onClick={() => setPage(it.key)}
          disabled={page === it.key}
        >
          <i className={`bi bi-${it.icon}`}></i>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState('Players')
  const { pass, setTyped, typed, tryLogin, logout, isAuthed, error } = useAdminPass()
  const common = useMemo(() => ({ API_BASE, adminPass: pass }), [pass])

  // Hidden debug route: navigate to URL with #debug to open Debug console page
  useEffect(() => {
    if (location.hash === '#debug') setPage('Debug')
  }, [])

  if (!isAuthed) {
    return (
      <main className="container py-4">
        <div className="d-flex flex-column align-items-center">
          <img src="/logo.png" alt="App logo" className="app-logo-xl mb-3" />
          <h1>ARCommando Admin</h1>
        </div>
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
      <div className="d-flex" style={{minHeight:'100vh'}}>
        <aside className="border-end bg-body-tertiary" style={{width: 220}}>
          <div className="p-3 d-flex flex-column h-100">
            <div className="d-flex align-items-center gap-2 mb-3">
              <img src="/logo.png" alt="App logo" className="app-logo" />
              <strong>ARCommando</strong>
            </div>
            <Nav page={page} setPage={setPage} />
            <div className="mt-auto pt-3">
              <button className="btn btn-outline-danger btn-sm w-100" onClick={logout}><i className="bi bi-box-arrow-right me-1"></i>Logout</button>
            </div>
          </div>
        </aside>
        <main className="p-3 flex-grow-1">
          {page === 'Players' && <Players {...common} />}
          {page === 'Codes' && <Codes {...common} />}
          {page === 'Redeem' && <Redeem {...common} />}
          {page === 'History' && <History {...common} />}
          {page === 'Debug' && <Debug {...common} />}
        </main>
      </div>
      <Toaster position="top-right" />
    </>
  )
}

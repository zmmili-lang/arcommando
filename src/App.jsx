import React, { useEffect, useMemo, useState } from 'react'
import Players from './pages/Players.jsx'
import Codes from './pages/Codes.jsx'
import Redeem from './pages/Redeem.jsx'
import History from './pages/History.jsx'

const API_BASE = '' // same origin

function useAdminPass() {
  const [pass, setPass] = useState(localStorage.getItem('arc_admin_pass') || '')
  const isAuthed = pass === 'LFGARC'
  useEffect(() => { if (pass) localStorage.setItem('arc_admin_pass', pass) }, [pass])
  return { pass, setPass, isAuthed }
}

function Nav({ page, setPage }) {
  return (
    <nav>
      {['Players', 'Codes', 'Redeem', 'History'].map(p => (
        <button key={p} onClick={() => setPage(p)} disabled={page === p}>{p}</button>
      ))}
      <span style={{flex:1}} />
    </nav>
  )
}

export default function App() {
  const [page, setPage] = useState('Players')
  const { pass, setPass, isAuthed } = useAdminPass()
  const common = useMemo(() => ({ API_BASE, adminPass: pass }), [pass])

  if (!isAuthed) {
    return (
      <main>
        <h1>ARCommando Admin</h1>
        <section>
          <p>Enter admin password to continue.</p>
          <div className="row">
            <input type="password" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} />
          </div>
          <p style={{fontSize:12, opacity:0.8}}>Hint: hardcoded password as requested.</p>
        </section>
      </main>
    )
  }

  return (
    <>
      <header>
        <h1>ARCommando</h1>
        <Nav page={page} setPage={setPage} />
        <button onClick={() => { localStorage.removeItem('arc_admin_pass'); location.reload() }}>Logout</button>
      </header>
      <main>
        {page === 'Players' && <Players {...common} />}
        {page === 'Codes' && <Codes {...common} />}
        {page === 'Redeem' && <Redeem {...common} />}
        {page === 'History' && <History {...common} />}
      </main>
    </>
  )
}

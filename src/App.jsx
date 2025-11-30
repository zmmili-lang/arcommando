import React, { useEffect, useMemo, useState } from 'react'
import Players from './pages/Players.jsx'
import Codes from './pages/Codes.jsx'
import History from './pages/History.jsx'
import Debug from './pages/Debug.jsx'
import { Toaster, toast } from 'react-hot-toast'
import { HashRouter, Routes, Route, NavLink, Navigate, Outlet } from 'react-router-dom'

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

function SideNav() {
    const items = [
        { to: '/players', icon: 'people-fill', label: 'Players' },
        { to: '/codes', icon: 'gift-fill', label: 'Codes' },
        { to: '/history', icon: 'clock-history', label: 'History' },
    ]
    return (
        <div className="d-flex flex-column gap-2">
            {items.map(it => (
                <NavLink key={it.to} to={it.to} className={({ isActive }) => `btn w-100 text-start d-flex align-items-center gap-3 ${isActive ? 'btn-primary' : ''}`}>
                    <i className={`bi bi-${it.icon}`}></i>
                    <span>{it.label}</span>
                </NavLink>
            ))}
        </div>
    )
}

function Login({ setTyped, typed, tryLogin, error }) {
    return (
        <main className="container py-4">
            <div className="d-flex flex-column align-items-center">
                <img src="/logo.png" alt="App logo" className="app-logo-xl mb-3" />
                <h1>ARCommando Admin</h1>
            </div>
            <section className="mt-3">
                <p>Enter admin password to continue.</p>
                <div className="d-flex gap-2">
                    <input className="form-control" type="password" placeholder="Password" value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') tryLogin() }} />
                    <button className="btn btn-primary" onClick={tryLogin}>Login</button>
                </div>
                {error && <div className="alert alert-danger mt-2 py-1" role="alert">{error}</div>}
                <p className="mt-2" style={{ fontSize: 12, opacity: 0.8 }}>Hint: hardcoded password as requested.</p>
            </section>
            <Toaster position="top-right" />
        </main>
    )
}

function BottomNav() {
    const items = [
        { to: '/players', icon: 'people-fill', label: 'Players' },
        { to: '/codes', icon: 'gift-fill', label: 'Codes' },
        { to: '/history', icon: 'clock-history', label: 'History' },
    ]
    return (
        <nav className="mobile-bottom-nav">
            {items.map(it => (
                <NavLink key={it.to} to={it.to} className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
                    <i className={`bi bi-${it.icon}`}></i>
                    <span>{it.label}</span>
                </NavLink>
            ))}
        </nav>
    )
}

function Layout({ logout, common }) {
    return (
        <div className="d-flex main-layout" style={{ minHeight: '100vh' }}>
            <aside className="border-end bg-body-tertiary desktop-sidebar" style={{ width: 220 }}>
                <div className="p-3 d-flex flex-column h-100">
                    <div className="d-flex align-items-center gap-2 mb-3">
                        <img src="/logo.png" alt="App logo" className="app-logo" />
                        <strong>ARCommando</strong>
                    </div>
                    <SideNav />
                    <div className="mt-auto pt-3">
                        <button className="btn btn-outline-danger btn-sm w-100" onClick={logout}><i className="bi bi-box-arrow-right me-1"></i>Logout</button>
                    </div>
                </div>
            </aside>
            <main className="p-3 flex-grow-1 main-content">
                <div className="d-flex align-items-center gap-2 mb-3 d-md-none">
                    <img src="/logo.png" alt="App logo" className="app-logo" />
                    <strong>ARCommando</strong>
                    <button className="btn btn-sm btn-outline-danger ms-auto" onClick={logout}><i className="bi bi-box-arrow-right"></i></button>
                </div>
                <Outlet context={common} />
            </main>
            <BottomNav />
        </div>
    )
}

export default function App() {
    const { pass, setTyped, typed, tryLogin, logout, isAuthed, error } = useAdminPass()
    const common = useMemo(() => ({ API_BASE, adminPass: pass }), [pass])

    return (
        <HashRouter>
            {!isAuthed ? (
                <Login setTyped={setTyped} typed={typed} tryLogin={tryLogin} error={error} />
            ) : null}
            {isAuthed && (
                <Routes>
                    <Route path="/" element={<Layout logout={logout} common={common} />}>
                        <Route index element={<Navigate to="/players" replace />} />
                        <Route path="/players" element={<Players {...common} />} />
                        <Route path="/codes" element={<Codes {...common} />} />
                        <Route path="/history" element={<History {...common} />} />
                        <Route path="/debug" element={<Debug {...common} />} />
                    </Route>
                </Routes>
            )}
            <Toaster position="top-right" />
        </HashRouter>
    )
}

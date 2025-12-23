import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'

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

function fmtPower(power) {
    if (!power) return '-'
    if (power >= 1000000000) return `${(power / 1000000000).toFixed(2)}B`
    if (power >= 1000000) return `${(power / 1000000).toFixed(2)}M`
    if (power >= 1000) return `${(power / 1000).toFixed(2)}K`
    return power.toLocaleString()
}

function fmtTimeAgo(ts) {
    if (!ts) return '-'
    const now = Date.now()
    const diff = now - ts
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'just now'
}

function fmtDateUTC(ts) {
    if (!ts) return '-'
    return new Date(ts).toLocaleString('en-GB', {
        timeZone: 'UTC',
        dateStyle: 'short',
        timeStyle: 'short'
    }) + ' UTC'
}

function formatStoveLevel(stoveLv) {
    if (!stoveLv || stoveLv < 1) return null
    if (stoveLv <= 30) return `TC ${stoveLv}`
    const tgLevel = Math.floor((stoveLv - 30) / 1) // Just show the raw level above 30 as TG
    return `TG ${tgLevel}`
}

export default function Leaderboard({ adminPass }) {
    const navigate = useNavigate()
    const [players, setPlayers] = useState([])
    const [filteredPlayers, setFilteredPlayers] = useState([])
    const [loading, setLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState('rank') // rank, name, power, updated, change24h
    const [sortDir, setSortDir] = useState('desc')

    const load = async () => {
        setLoading(true)
        try {
            const data = await api('leaderboard-list', { adminPass })
            // Calculate rank on frontend to preserve it during filtering
            const playersWithRank = (data.players || []).map((p, i) => ({ ...p, rank: i + 1 }))
            setPlayers(playersWithRank)
            setFilteredPlayers(playersWithRank)
        } catch (e) {
            toast.error('Failed to load leaderboard: ' + String(e.message || e))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    useEffect(() => {
        // Filter players based on search query
        if (!searchQuery.trim()) {
            setFilteredPlayers(players)
            return
        }

        const query = searchQuery.toLowerCase()
        const filtered = players.filter(p =>
            p.name.toLowerCase().includes(query)
        )
        setFilteredPlayers(filtered)
    }, [searchQuery, players])

    const handleSort = (field) => {
        let newDir = 'desc'
        if (sortBy === field) {
            newDir = sortDir === 'desc' ? 'asc' : 'desc'
        }
        setSortBy(field)
        setSortDir(newDir)

        const sorted = [...filteredPlayers]
        const isAsc = newDir === 'asc'

        switch (field) {
            case 'rank':
                sorted.sort((a, b) => isAsc
                    ? (a.currentPower || 0) - (b.currentPower || 0)
                    : (b.currentPower || 0) - (a.currentPower || 0))
                break
            case 'name':
                sorted.sort((a, b) => isAsc
                    ? a.name.localeCompare(b.name)
                    : b.name.localeCompare(a.name))
                break
            case 'alliance':
                sorted.sort((a, b) => isAsc
                    ? (a.allianceName || '').localeCompare(b.allianceName || '')
                    : (b.allianceName || '').localeCompare(a.allianceName || ''))
                break
            case 'change24h':
                sorted.sort((a, b) => {
                    const valA = (a.currentPower || 0) - (a.power24hAgo || a.powerFirst || a.currentPower || 0)
                    const valB = (b.currentPower || 0) - (b.power24hAgo || b.powerFirst || b.currentPower || 0)
                    return isAsc ? valA - valB : valB - valA
                })
                break
            case 'power':
                sorted.sort((a, b) => isAsc
                    ? (a.currentPower || 0) - (b.currentPower || 0)
                    : (b.currentPower || 0) - (a.currentPower || 0))
                break
            case 'updated':
                sorted.sort((a, b) => isAsc
                    ? (a.powerUpdatedAt || 0) - (b.powerUpdatedAt || 0)
                    : (b.powerUpdatedAt || 0) - (a.powerUpdatedAt || 0))
                break
        }

        setFilteredPlayers(sorted)
    }

    return (
        <section>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="m-0">🏆 Leaderboard</h2>
                <span className="text-muted small">
                    {filteredPlayers.length} {searchQuery ? 'results' : 'players'}
                </span>
            </div>

            {/* Search Bar */}
            <div className="mb-3">
                <div className="input-group">
                    <span className="input-group-text">
                        <i className="bi bi-search"></i>
                    </span>
                    <input
                        className="form-control"
                        type="text"
                        placeholder="Search players by name..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            className="btn btn-outline-secondary"
                            onClick={() => setSearchQuery('')}
                        >
                            <i className="bi bi-x"></i>
                        </button>
                    )}
                </div>
            </div>

            {loading && (
                <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
            )}

            {!loading && filteredPlayers.length === 0 && (
                <div className="alert alert-info">
                    {searchQuery ? 'No players found matching your search.' : 'No leaderboard data yet. Run the scraper to populate data.'}
                </div>
            )}

            {!loading && filteredPlayers.length > 0 && (
                <div className="table-responsive border rounded">
                    <table className="table table-hover align-middle m-0">
                        <thead>
                            <tr>
                                <th style={{ width: 60, cursor: 'pointer' }} onClick={() => handleSort('rank')}>
                                    Rank {sortBy === 'rank' && (sortDir === 'asc' ? '▲' : '▼')}
                                </th>
                                <th style={{ width: '35%', cursor: 'pointer' }} onClick={() => handleSort('name')}>
                                    Player {sortBy === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                                </th>

                                <th className="d-none d-lg-table-cell" style={{ cursor: 'pointer' }} onClick={() => handleSort('alliance')}>
                                    Alliance {sortBy === 'alliance' && (sortDir === 'asc' ? '▲' : '▼')}
                                </th>
                                <th className="text-end d-none d-lg-table-cell" style={{ cursor: 'pointer' }} onClick={() => handleSort('change24h')}>
                                    24h change {sortBy === 'change24h' && (sortDir === 'asc' ? '▲' : '▼')}
                                </th>
                                <th className="text-end" style={{ cursor: 'pointer' }} onClick={() => handleSort('power')}>
                                    Power {sortBy === 'power' && (sortDir === 'asc' ? '▲' : '▼')}
                                </th>
                                <th className="text-end d-none d-md-table-cell" style={{ cursor: 'pointer' }} onClick={() => handleSort('updated')}>
                                    Updated {sortBy === 'updated' && (sortDir === 'asc' ? '▲' : '▼')}
                                </th>
                                <th style={{ width: 40 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPlayers.map((player, idx) => (
                                <tr
                                    key={player.uid}
                                    onClick={() => navigate(`/leaderboard/${player.uid}`)}
                                    style={{ cursor: 'pointer' }}
                                    className="player-row"
                                >
                                    <td className="text-center">
                                        {player.rank <= 3 ? (
                                            <span style={{ fontSize: '1.5rem' }}>
                                                {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : '🥉'}
                                            </span>
                                        ) : (
                                            <span className="text-muted">#{player.rank}</span>
                                        )}
                                    </td>
                                    <td>
                                        <div className="d-flex align-items-center gap-2">
                                            {player.avatarImage ? (
                                                <div style={{ position: 'relative' }}>
                                                    <img
                                                        src={player.avatarImage}
                                                        alt="avatar"
                                                        style={{
                                                            width: 40,
                                                            height: 40,
                                                            borderRadius: '50%',
                                                            objectFit: 'cover'
                                                        }}
                                                    />
                                                    {player.stoveLvContent && player.stoveLv > 30 && (
                                                        <div
                                                            style={{
                                                                position: 'absolute',
                                                                top: -6,
                                                                right: -6,
                                                                zIndex: 2,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                background: 'rgba(0,0,0,0.5)',
                                                                borderRadius: '4px',
                                                                padding: '1px'
                                                            }}
                                                            title={formatStoveLevel(player.stoveLv) || 'Stove Level'}
                                                        >
                                                            <img
                                                                src={player.stoveLvContent}
                                                                alt="stove level"
                                                                style={{
                                                                    height: 20,
                                                                    width: 'auto',
                                                                    filter: 'drop-shadow(0 0 2px black)'
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{
                                                    width: 40,
                                                    height: 40,
                                                    borderRadius: '50%',
                                                    background: 'var(--panel-2)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '1.2rem'
                                                }}>
                                                    👤
                                                </div>
                                            )}
                                            <div>
                                                <div className="fw-medium">{player.name}</div>
                                                <div className="text-muted extra-small d-lg-none">
                                                    {player.allianceName || 'No Alliance'}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    <td className="text-muted d-none d-lg-table-cell">
                                        {player.allianceName || '-'}
                                    </td>
                                    <td className="text-end d-none d-lg-table-cell">
                                        {(() => {
                                            const oldPower = player.power24hAgo || player.powerFirst
                                            if (!player.currentPower || !oldPower) return <span className="text-muted">-</span>
                                            const diff = player.currentPower - oldPower
                                            if (diff === 0) return <span className="text-muted">0</span>

                                            // Handle formatting manually here or reuse fmtPower but we want the sign
                                            const absDiff = Math.abs(diff)
                                            let formatted = absDiff.toLocaleString()
                                            if (absDiff >= 1000000000) formatted = (absDiff / 1000000000).toFixed(2) + 'B'
                                            else if (absDiff >= 1000000) formatted = (absDiff / 1000000).toFixed(2) + 'M'
                                            else if (absDiff >= 1000) formatted = (absDiff / 1000).toFixed(2) + 'K'

                                            return (
                                                <span className={diff > 0 ? 'text-success' : 'text-danger'}>
                                                    {diff > 0 ? '+' : '-'}{formatted}
                                                </span>
                                            )
                                        })()}
                                    </td>
                                    <td className="text-end">
                                        <span className="badge bg-success" style={{ fontSize: '0.9rem' }}>
                                            {fmtPower(player.currentPower)}
                                        </span>
                                    </td>
                                    <td className="text-end text-muted small d-none d-md-table-cell">
                                        {player.powerUpdatedAt ? fmtTimeAgo(player.powerUpdatedAt) : '-'}
                                    </td>
                                    <td className="text-end">
                                        <i className="bi bi-chevron-right text-muted"></i>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )
}

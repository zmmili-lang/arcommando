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
    const tgLevel = Math.floor((stoveLv - 30) / 5)
    return `TG${tgLevel}`
}

export default function Leaderboard({ adminPass }) {
    const navigate = useNavigate()
    const [players, setPlayers] = useState([])
    const [filteredPlayers, setFilteredPlayers] = useState([])
    const [loading, setLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState('rank') // rank, name, power, updated

    const load = async () => {
        setLoading(true)
        try {
            const data = await api('leaderboard-list', { adminPass })
            setPlayers(data.players || [])
            setFilteredPlayers(data.players || [])
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
        setSortBy(field)
        const sorted = [...filteredPlayers]

        switch (field) {
            case 'rank':
                sorted.sort((a, b) => (b.currentPower || 0) - (a.currentPower || 0))
                break
            case 'name':
                sorted.sort((a, b) => a.name.localeCompare(b.name))
                break
            case 'alliance':
                sorted.sort((a, b) => (a.allianceName || '').localeCompare(b.allianceName || ''))
                break
            case 'kills':
                sorted.sort((a, b) => (b.kills || 0) - (a.kills || 0))
                break
            case 'power':
                sorted.sort((a, b) => (b.currentPower || 0) - (a.currentPower || 0))
                break
            case 'updated':
                sorted.sort((a, b) => (b.powerUpdatedAt || 0) - (a.powerUpdatedAt || 0))
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
                                    Rank {sortBy === 'rank' && '▼'}
                                </th>
                                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                                    Player {sortBy === 'name' && '▼'}
                                </th>
                                <th className="d-none d-lg-table-cell" style={{ cursor: 'pointer' }} onClick={() => handleSort('alliance')}>
                                    Alliance {sortBy === 'alliance' && '▼'}
                                </th>
                                <th className="text-end d-none d-lg-table-cell" style={{ cursor: 'pointer' }} onClick={() => handleSort('kills')}>
                                    Kills {sortBy === 'kills' && '▼'}
                                </th>
                                <th className="text-end" style={{ cursor: 'pointer' }} onClick={() => handleSort('power')}>
                                    Power {sortBy === 'power' && '▼'}
                                </th>
                                <th className="text-end d-none d-md-table-cell" style={{ cursor: 'pointer' }} onClick={() => handleSort('updated')}>
                                    Updated {sortBy === 'updated' && '▼'}
                                </th>
                                <th style={{ width: 40 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPlayers.map((player, idx) => (
                                <tr
                                    key={player.name}
                                    onClick={() => navigate(`/leaderboard/${encodeURIComponent(player.name)}`)}
                                    style={{ cursor: 'pointer' }}
                                    className="player-row"
                                >
                                    <td className="text-center">
                                        {idx < 3 ? (
                                            <span style={{ fontSize: '1.5rem' }}>
                                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                                            </span>
                                        ) : (
                                            <span className="text-muted">#{idx + 1}</span>
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
                                                    {player.stoveLvContent && (
                                                        <span 
                                                            className="badge bg-danger"
                                                            style={{
                                                                position: 'absolute',
                                                                top: -4,
                                                                right: -4,
                                                                fontSize: '0.65rem',
                                                                padding: '2px 4px'
                                                            }}
                                                            title={formatStoveLevel(player.stoveLv) || player.stoveLvContent}
                                                        >
                                                            {player.stoveLvContent}
                                                        </span>
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
                                    <td className="text-end text-muted d-none d-lg-table-cell">
                                        {player.kills ? player.kills.toLocaleString() : '-'}
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

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
                                    <td className="fw-medium">
                                        {player.name}
                                    </td>
                                    <td className="text-end">
                                        <span className="badge bg-success" style={{ fontSize: '0.9rem' }}>
                                            {fmtPower(player.currentPower)}
                                        </span>
                                    </td>
                                    <td className="text-end text-muted small d-none d-md-table-cell">
                                        {fmtTimeAgo(player.powerUpdatedAt)}
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

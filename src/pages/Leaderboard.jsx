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
    const [kingdomFilter, setKingdomFilter] = useState('')
    const [availableKingdoms, setAvailableKingdoms] = useState([])
    const [adding, setAdding] = useState(false)
    const [fidToAdd, setFidToAdd] = useState('')

    const [sortBy, setSortBy] = useState('rank') // rank, name, power, updated, change24h
    const [sortDir, setSortDir] = useState('desc')

    // Bulk Actions
    const [selectedIds, setSelectedIds] = useState([])
    const [deleting, setDeleting] = useState(false)

    const toggleSelect = (uid) => {
        setSelectedIds(prev => prev.includes(uid)
            ? prev.filter(id => id !== uid)
            : [...prev, uid]
        )
    }

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredPlayers.length && filteredPlayers.length > 0) {
            setSelectedIds([])
        } else {
            setSelectedIds(filteredPlayers.map(p => p.uid))
        }
    }

    const deleteSelected = async () => {
        if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} players? This cannot be undone.`)) return
        setDeleting(true)
        try {
            await api('players-remove', { adminPass, method: 'POST', body: { ids: selectedIds } })
            toast.success(`Deleted ${selectedIds.length} players`)
            setSelectedIds([])
            load()
        } catch (e) {
            toast.error('Failed to delete: ' + String(e.message || e))
        } finally {
            setDeleting(false)
        }
    }

    const load = async () => {
        setLoading(true)
        try {
            const data = await api('leaderboard-list', { adminPass })
            // Calculate rank on frontend to preserve it during filtering
            const playersWithRank = (data.players || []).map((p, i) => ({ ...p, rank: i + 1 }))
            setPlayers(playersWithRank)
            setFilteredPlayers(playersWithRank)

            // Extract unique kingdoms for the filter dropdown
            // Use kid (Kingdom ID) if kingdom not set
            const kingdoms = [...new Set(playersWithRank.map(p => p.kingdom || p.kid).filter(k => k != null && k !== ''))].sort((a, b) => Number(a) - Number(b))
            setAvailableKingdoms(kingdoms)
        } catch (e) {
            toast.error('Failed to load leaderboard: ' + String(e.message || e))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    // Helper to parse "1.5M", "10k" etc
    const parseMetric = (val) => {
        if (!val) return 0
        const str = val.toLowerCase().replace(/,/g, '')
        const float = parseFloat(str)
        if (isNaN(float)) return 0
        if (str.includes('b')) return float * 1000000000
        if (str.includes('m')) return float * 1000000
        if (str.includes('k')) return float * 1000
        return float
    }

    useEffect(() => {
        // Filter players based on all criteria
        let result = players

        // 1. Text Search (Name)
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            result = result.filter(p => p.name.toLowerCase().includes(query))
        }

        // 2. Kingdom Filter
        if (kingdomFilter) {
            result = result.filter(p => String(p.kingdom || p.kid) === String(kingdomFilter))
        }

        setFilteredPlayers(result)
    }, [searchQuery, kingdomFilter, players])

    const addPlayer = async () => {
        if (!fidToAdd.trim()) return
        const playerIdToAdd = fidToAdd.trim()
        setAdding(true)
        try {
            const data = await api('players-add', { adminPass, method: 'POST', body: { playerId: playerIdToAdd } })
            toast.success('Player added')
            setFidToAdd('')
            load() // Reload list

            if (data.redemptionResults && data.redemptionResults.length > 0) {
                const newSuccess = data.redemptionResults.filter(r => r.status === 'success').length
                const failures = data.redemptionResults.filter(r => r.status === 'error').length
                let msg = `Redeemed ${newSuccess} new codes`
                if (failures > 0) msg += ` (${failures} failed)`
                toast(msg, { icon: '🎁', duration: 5000 })
            }
        } catch (e) {
            toast.error('Failed to add: ' + String(e.message || e))
        } finally {
            setAdding(false)
        }
    }

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
                <div className="d-flex align-items-center gap-3">
                    <div className="input-group input-group-sm" style={{ maxWidth: 250 }}>
                        <input
                            className="form-control bg-dark text-white border-secondary"
                            placeholder="Add Player ID..."
                            value={fidToAdd}
                            onChange={e => setFidToAdd(e.target.value)}
                        />
                        <button className="btn btn-success" onClick={addPlayer} disabled={adding}>
                            {adding ? <span className="spinner-border spinner-border-sm"></span> : 'Add'}
                        </button>
                    </div>
                    <div className="d-flex flex-column align-items-end">
                        <span className="text-muted small">
                            {filteredPlayers.length} / {players.length} players
                        </span>
                        {filteredPlayers.length > 0 && (
                            <span className="text-success small fw-bold">
                                Total Power: {fmtPower(filteredPlayers.reduce((acc, p) => acc + Number(p.currentPower || 0), 0))}
                            </span>
                        )}
                        {selectedIds.length > 0 && (
                            <button className="btn btn-sm btn-danger mt-1" onClick={deleteSelected} disabled={deleting}>
                                {deleting ? '...' : `Delete ${selectedIds.length} Selected`}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="card mb-4 bg-dark border-secondary">
                <div className="card-body">
                    <div className="row g-3">
                        {/* Search Name */}
                        <div className="col-sm">
                            <label className="form-label small text-secondary text-uppercase fw-bold">Player Name</label>
                            <div className="input-group">
                                <span className="input-group-text bg-dark text-white border-secondary"><i className="bi bi-search"></i></span>
                                <input
                                    className="form-control bg-dark text-white border-secondary"
                                    type="text"
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (
                                    <button className="btn btn-outline-secondary border-secondary text-white" onClick={() => setSearchQuery('')}>❌</button>
                                )}
                            </div>
                        </div>

                        {/* Kingdom Filter */}
                        <div className="col-sm">
                            <label className="form-label small text-secondary text-uppercase fw-bold">Kingdom</label>
                            <select
                                className="form-select bg-dark text-white border-secondary"
                                value={kingdomFilter}
                                onChange={e => setKingdomFilter(e.target.value)}
                            >
                                <option value="">All</option>
                                {availableKingdoms.map(k => (
                                    <option key={k} value={k}>#{k}</option>
                                ))}
                            </select>
                        </div>
                    </div>
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
                    {players.length > 0
                        ? 'No players match the selected filters.'
                        : 'No leaderboard data yet. Run the scraper to populate data.'}
                </div>
            )}

            {!loading && filteredPlayers.length > 0 && (
                <div className="table-responsive border border-secondary rounded bg-dark">
                    <table className="table table-dark table-hover align-middle m-0">
                        <thead className="table-dark">
                            <tr>
                                <th style={{ width: 40 }} className="text-center">
                                    <input
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={filteredPlayers.length > 0 && selectedIds.length === filteredPlayers.length}
                                        onChange={toggleSelectAll}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </th>
                                <th style={{ width: 60, cursor: 'pointer' }} onClick={() => handleSort('rank')}>
                                    Rank {sortBy === 'rank' && (sortDir === 'asc' ? '▲' : '▼')}
                                </th>
                                <th style={{ width: '23%', cursor: 'pointer' }} onClick={() => handleSort('name')}>
                                    Player {sortBy === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                                </th>
                                <th className="d-none d-lg-table-cell">FID</th>
                                <th className="d-none d-lg-table-cell">Kd</th>

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
                                    style={{ cursor: 'pointer' }}
                                    className={`player-row ${selectedIds.includes(player.uid) ? 'table-active' : ''}`}
                                    onClick={(e) => {
                                        // If clicking checkbox, don't navigate
                                        if (e.target.type === 'checkbox') return
                                        navigate(`/leaderboard/${player.uid}`)
                                    }}
                                >
                                    <td className="text-center">
                                        <input
                                            type="checkbox"
                                            className="form-check-input"
                                            checked={selectedIds.includes(player.uid)}
                                            onChange={() => toggleSelect(player.uid)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                    </td>
                                    <td className="text-center">
                                        {player.rank <= 3 ? (
                                            <span style={{ fontSize: '1.5rem' }}>
                                                {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : '🥉'}
                                            </span>
                                        ) : (
                                            <span className="text-white-50">#{player.rank}</span>
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

                                    <td className="d-none d-lg-table-cell">
                                        <code className="text-white-50 small">{player.uid}</code>
                                    </td>
                                    <td className="d-none d-lg-table-cell">
                                        {(player.kingdom || player.kid) && <span className="badge bg-secondary">#{player.kingdom || player.kid}</span>}
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

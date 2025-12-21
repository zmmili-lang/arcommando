import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
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

function fmtDate(ts) {
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

function PowerChart({ history }) {
    if (!history || history.length === 0) return null

    // Simple SVG line chart
    const width = 800
    const height = 200
    const padding = 40

    const powers = history.map(h => h.power)
    const maxPower = Math.max(...powers)
    const minPower = Math.min(...powers)
    const powerRange = maxPower - minPower || 1

    const times = history.map(h => h.scrapedAt)
    const maxTime = Math.max(...times)
    const minTime = Math.min(...times)
    const timeRange = maxTime - minTime || 1

    const points = history
        .map((h, i) => {
            const x = padding + ((h.scrapedAt - minTime) / timeRange) * (width - 2 * padding)
            const y = height - padding - ((h.power - minPower) / powerRange) * (height - 2 * padding)
            return `${x},${y}`
        })
        .join(' ')

    return (
        <div className="mb-4">
            <h3 className="mb-3">Power Progression</h3>
            <div style={{ overflowX: 'auto' }}>
                <svg width={width} height={height} style={{ background: 'var(--panel-2)', borderRadius: '8px' }}>
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map(percent => {
                        const y = height - padding - percent * (height - 2 * padding)
                        return (
                            <g key={percent}>
                                <line
                                    x1={padding}
                                    y1={y}
                                    x2={width - padding}
                                    y2={y}
                                    stroke="var(--border)"
                                    strokeWidth="1"
                                />
                                <text
                                    x={padding - 10}
                                    y={y + 5}
                                    fill="var(--text-muted)"
                                    fontSize="10"
                                    textAnchor="end"
                                >
                                    {fmtPower(minPower + percent * powerRange)}
                                </text>
                            </g>
                        )
                    })}

                    {/* Line */}
                    <polyline
                        points={points}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="3"
                    />

                    {/* Points */}
                    {history.map((h, i) => {
                        const x = padding + ((h.scrapedAt - minTime) / timeRange) * (width - 2 * padding)
                        const y = height - padding - ((h.power - minPower) / powerRange) * (height - 2 * padding)
                        return (
                            <circle
                                key={i}
                                cx={x}
                                cy={y}
                                r="4"
                                fill="var(--accent)"
                            >
                                <title>{h.scrapedAt ? fmtDate(h.scrapedAt) : '-'}: {fmtPower(h.power)}</title>
                            </circle>
                        )
                    })}
                </svg>
            </div>
        </div>
    )
}

export default function LeaderboardPlayer({ adminPass }) {
    const { playerName } = useParams()
    const navigate = useNavigate()
    const decodedName = decodeURIComponent(playerName)

    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)

    const load = async () => {
        setLoading(true)
        try {
            const result = await api(`leaderboard-player?name=${encodeURIComponent(decodedName)}`, { adminPass })

            // Handle merged players
            if (result.redirectTo) {
                toast('Player was merged, redirecting...', { icon: 'ℹ️' })
                navigate(`/leaderboard/${encodeURIComponent(result.redirectTo)}`)
                return
            }

            setData(result)
        } catch (e) {
            toast.error('Failed to load player: ' + String(e.message || e))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [playerName])

    if (loading) {
        return (
            <section>
                <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
            </section>
        )
    }

    if (!data) {
        return (
            <section>
                <div className="alert alert-warning">
                    Player not found.
                </div>
                <Link to="/leaderboard" className="btn btn-outline-primary">
                    ← Back to Leaderboard
                </Link>
            </section>
        )
    }

    const { player, stats, history } = data
    const isGrowing = stats.powerChange24h > 0

    return (
        <section>
            {/* Header */}
            <div className="mb-4">
                <Link to="/leaderboard" className="btn btn-sm btn-outline-secondary mb-3">
                    <i className="bi bi-arrow-left"></i> Back to Leaderboard
                </Link>

                <div className="d-flex justify-content-between align-items-start">
                    <div>
                        <div className="d-flex align-items-center gap-3 mb-2">
                            {player.avatarImage ? (
                                <div style={{ position: 'relative' }}>
                                    <img 
                                        src={player.avatarImage} 
                                        alt="avatar" 
                                        style={{ 
                                            width: 64, 
                                            height: 64, 
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
                                                fontSize: '0.7rem',
                                                padding: '3px 6px'
                                            }}
                                            title={formatStoveLevel(player.stoveLv) || player.stoveLvContent}
                                        >
                                            {player.stoveLvContent}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <div style={{ 
                                    width: 64, 
                                    height: 64, 
                                    borderRadius: '50%',
                                    background: 'var(--panel-2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '2rem'
                                }}>
                                    👤
                                </div>
                            )}
                            <div>
                                <h2 className="mb-0">
                                    {player.rank <= 3 && (
                                        <span className="me-2" style={{ fontSize: '2rem' }}>
                                            {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : '🥉'}
                                        </span>
                                    )}
                                    {player.name}
                                </h2>
                            </div>
                        </div>
                        <div className="d-flex flex-wrap gap-2 align-items-center mb-1">
                            {player.allianceName && (
                                <span className="badge bg-primary">[{player.allianceName}]</span>
                            )}
                            <span className="badge bg-secondary">Rank #{player.rank}</span>
                            {player.kingdom && (
                                <span className="badge bg-info text-dark">Kingdom #{player.kingdom}</span>
                            )}
                        </div>
                        <div className="text-muted extra-small">
                            UID: {player.uid || 'Not Scraped'} | First seen: {player.firstSeen ? fmtDate(player.firstSeen) : '-'}
                        </div>
                        {player.stoveLv && (
                            <div className="text-muted extra-small mt-1">
                                {formatStoveLevel(player.stoveLv)} {player.stoveLvContent && `(${player.stoveLvContent})`}
                            </div>
                        )}
                    </div>
                    <div className="text-end">
                        <div className="text-muted small mb-1">Current Power</div>
                        <h3 className="mb-0" style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                            {fmtPower(player.currentPower)}
                        </h3>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="row g-3 mb-4">
                <div className="col-md-3 col-6">
                    <div className="border rounded p-3" style={{ background: 'var(--panel-2)' }}>
                        <div className="text-muted small mb-1">Total Kills</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                            {player.kills ? player.kills.toLocaleString() : '-'}
                        </div>
                    </div>
                </div>

                <div className="col-md-3 col-6">
                    <div className="border rounded p-3" style={{ background: 'var(--panel-2)' }}>
                        <div className="text-muted small mb-1">24h Change</div>
                        <div className="d-flex align-items-center gap-2">
                            {stats.powerChange24h !== null ? (
                                <>
                                    <span style={{
                                        fontSize: '1.25rem',
                                        fontWeight: 'bold',
                                        color: stats.powerChange24h >= 0 ? 'var(--accent)' : 'var(--danger)'
                                    }}>
                                        {stats.powerChange24h >= 0 ? '+' : ''}{fmtPower(stats.powerChange24h)}
                                    </span>
                                    {isGrowing && (
                                        <i className="bi bi-arrow-up-circle-fill text-success"></i>
                                    )}
                                </>
                            ) : (
                                <span className="text-muted">-</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="col-md-3 col-6">
                    <div className="border rounded p-3" style={{ background: 'var(--panel-2)' }}>
                        <div className="text-muted small mb-1">7d Change</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                            {stats.powerChange7d !== null ? (
                                <span style={{ color: stats.powerChange7d >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                                    {stats.powerChange7d >= 0 ? '+' : ''}{fmtPower(stats.powerChange7d)}
                                </span>
                            ) : (
                                <span className="text-muted">-</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="col-md-3 col-6">
                    <div className="border rounded p-3" style={{ background: 'var(--panel-2)' }}>
                        <div className="text-muted small mb-1">Total Gain</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                            {fmtPower(stats.totalGain)}
                        </div>
                    </div>
                </div>

                <div className="col-md-3 col-6">
                    <div className="border rounded p-3" style={{ background: 'var(--panel-2)' }}>
                        <div className="text-muted small mb-1">Avg Daily Growth</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                            {fmtPower(Math.round(stats.avgDailyGrowth))}
                        </div>
                    </div>
                </div>

                <div className="col-md-3 col-6">
                    <div className="border rounded p-3" style={{ background: 'var(--panel-2)' }}>
                        <div className="text-muted small mb-1">Peak Power</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                            {fmtPower(stats.peakPower)}
                        </div>
                        {stats.peakPowerDate && (
                            <div className="text-muted small">{fmtDate(stats.peakPowerDate)}</div>
                        )}
                        {!stats.peakPowerDate && stats.peakPower > 0 && (
                            <div className="text-muted small">-</div>
                        )}
                    </div>
                </div>

                <div className="col-md-3 col-6">
                    <div className="border rounded p-3" style={{ background: 'var(--panel-2)' }}>
                        <div className="text-muted small mb-1">Days Tracked</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                            {stats.daysTracked}
                        </div>
                    </div>
                </div>

                <div className="col-md-3 col-6">
                    <div className="border rounded p-3" style={{ background: 'var(--panel-2)' }}>
                        <div className="text-muted small mb-1">Data Points</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                            {stats.totalReadings}
                        </div>
                    </div>
                </div>
            </div>

            {/* Power Chart */}
            {history.length > 1 && <PowerChart history={[...history].reverse()} />}

            {/* History Table */}
            <div>
                <h3 className="mb-3">Power History</h3>
                <div className="table-responsive border rounded">
                    <table className="table table-hover align-middle m-0">
                        <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th className="text-end">Power</th>
                                <th className="text-end d-none d-md-table-cell">Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((h, idx) => {
                                const prevPower = idx < history.length - 1 ? history[idx + 1].power : h.power
                                const change = h.power - prevPower

                                return (
                                    <tr key={idx}>
                                        <td className="text-muted small">{h.scrapedAt ? fmtDate(h.scrapedAt) : '-'}</td>
                                        <td className="text-end">
                                            <span className="badge bg-success">
                                                {fmtPower(h.power)}
                                            </span>
                                        </td>
                                        <td className="text-end d-none d-md-table-cell">
                                            {change !== 0 ? (
                                                <span style={{
                                                    color: change > 0 ? 'var(--accent)' : 'var(--danger)',
                                                    fontWeight: '500'
                                                }}>
                                                    {change > 0 ? '+' : ''}{fmtPower(change)}
                                                </span>
                                            ) : (
                                                <span className="text-muted">-</span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    )
}

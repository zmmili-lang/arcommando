import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import './Spinny.css'

// Sound effect
const SPIN_SOUND = "https://www.myinstants.com/media/sounds/o-ii-a-i-o-iii-a-i.mp3"

export default function Spinny({ API_BASE }) {
    const { slug } = useParams()
    const navigate = useNavigate()
    const [player, setPlayer] = useState(null)
    const [loading, setLoading] = useState(!!slug)
    const [inputId, setInputId] = useState('')
    const [isSpinning, setIsSpinning] = useState(false)
    const audioRef = useRef(new Audio(SPIN_SOUND))

    useEffect(() => {
        if (slug) {
            fetchPlayer(slug)
        } else {
            setPlayer(null)
            setLoading(false)
        }
    }, [slug])

    const fetchPlayer = async (id) => {
        setLoading(true)
        try {
            const res = await fetch(`${API_BASE}/.netlify/functions/public-player?id=${encodeURIComponent(id)}`)
            const data = await res.json()
            if (res.ok && data.player) {
                setPlayer(data.player)
            } else {
                // If not found by slug, maybe redirect to home or show error?
                // For now, just show input screen
                setPlayer(null)
                if (slug) toast.error('Player not found')
            }
        } catch (e) {
            console.error(e)
            toast.error('Failed to load player')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!inputId.trim()) return

        setLoading(true)
        try {
            const res = await fetch(`${API_BASE}/.netlify/functions/public-player`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId: inputId.trim() })
            })
            const data = await res.json()
            if (res.ok && data.player) {
                setPlayer(data.player)
                navigate(`/spinny/${data.player.id}`)

                if (data.redemptionResults && data.redemptionResults.length > 0) {
                    const newSuccess = data.redemptionResults.filter(r => r.status === 'success').length
                    const alreadyRedeemed = data.redemptionResults.filter(r => r.status === 'already_redeemed').length
                    const failures = data.redemptionResults.filter(r => r.status === 'error').length

                    let msg = `Redeemed ${newSuccess} new codes`
                    if (alreadyRedeemed > 0) msg += `, ${alreadyRedeemed} already redeemed`
                    if (failures > 0) msg += ` (${failures} failed)`
                    toast.success(msg, { duration: 5000 })
                } else {
                    toast.success(data.created ? 'Player added!' : 'Player found!')
                }
            } else {
                toast.error(data.error || 'Failed to find/add player')
            }
        } catch (e) {
            console.error(e)
            toast.error('Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    const startSpin = () => {
        if (isSpinning) return
        setIsSpinning(true)
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(e => console.log('Audio play failed:', e))
    }

    const stopSpin = () => {
        setIsSpinning(false)
        audioRef.current.pause()
        audioRef.current.currentTime = 0
    }

    const copyUrl = () => {
        const url = window.location.href
        navigator.clipboard.writeText(url)
        toast.success('URL copied to clipboard!')
    }

    if (loading && !player) {
        return (
            <div className="spinny-container">
                <div className="spinner-border text-light" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        )
    }

    if (!player) {
        return (
            <div className="spinny-container">
                <div className="player-input-card">
                    <h1>Enter Player ID</h1>
                    <form onSubmit={handleSubmit}>
                        <div className="input-group input-group-dark mb-3">
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Player ID (e.g. 12345678)"
                                value={inputId}
                                onChange={e => setInputId(e.target.value)}
                                autoFocus
                            />
                            <button className="btn btn-primary" type="submit" disabled={loading}>
                                {loading ? 'Checking...' : 'Go'}
                            </button>
                        </div>
                        <p className="text-muted small">
                            If you exist in Kingshot, we'll find you. If not, we'll add you.
                        </p>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="spinny-container">
            <div className="spinny-content">
                <div className="avatar-wrapper">
                    <div className="avatar-mask">
                        <img
                            src={player.avatar_image || 'https://i.imgur.com/BbbgFxP.png'}
                            alt={player.nickname}
                            className={`avatar-image ${isSpinning ? 'spinning' : ''}`}
                        />
                    </div>
                    {/* Decoration frame - using the one from the fiddle */}
                    <img
                        src="https://i.imgur.com/jTeSEEM.png"
                        alt=""
                        className="avatar-decoration"
                    />
                </div>

                <div className="text-center">
                    <h2 className="mb-1">{player.nickname}</h2>
                    <div className="share-url" onClick={copyUrl} title="Click to copy">
                        {window.location.href} <i className="bi bi-clipboard ms-1"></i>
                    </div>
                </div>

                <button
                    className="rotate-button"
                    onMouseDown={startSpin}
                    onMouseUp={stopSpin}
                    onMouseLeave={stopSpin}
                    onTouchStart={(e) => { e.preventDefault(); startSpin() }}
                    onTouchEnd={(e) => { e.preventDefault(); stopSpin() }}
                    onTouchCancel={stopSpin}
                >
                    Touch me, daddy
                </button>

                <button
                    className="btn btn-link text-muted text-decoration-none mt-3"
                    onClick={() => navigate('/spinny')}
                    style={{ fontSize: '0.9rem' }}
                >
                    Spin yourself too <i className="bi bi-arrow-right"></i>
                </button>
            </div>
        </div>
    )
}

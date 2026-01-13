import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import './Flappy.css'

// Physics Tweaks
// Original Jump: -7. Reduced by 40% -> -4.2. Increased by 30% -> -5.5. Increased by 30% -> -7.2
const JUMP_FORCE = -7
const GRAVITY = 0.35 // Reduced gravity to match lower jump, making it "floaty" but controllable
const BASE_SPEED = 3
const BIRD_SIZE = 30
const INITIAL_GAP = 180

// Expanded motivational messages
const MESSAGES = [
    "Harder, Daddy! 🥵", "Spank me! 👋", "Choke me! 🧣", "Good boy! 🐶",
    "Deeper! 🕳️", "Oh yes! 💦", "Just like that! 🔥", "Don't stop! 🛑",
    "Punish me! 😈", "Fill me up! 🍺", "Make me scream! 😱",
    "Who's your daddy? 🥸", "Obey me! 🛐", "Naughty! 😈", "Dominate me! ⛓️",
    "Beg for it! 🛐", "Use me! 🛠️", "Too big! 🍆", "So wet! 🌊", "Explosion! 💥",
    "Good girl! 🎀", "Daddy's watching! 👀", "Be a good girl! 💅", "Take it! 💥",
    "Choke on it! 🧣", "Spank me harder! 👋", "Daddy likes that! 👍", "Naughty girl! 😈"
]

// Level Gradients (Sky colors)
const LEVEL_SKIES = [
    ['#5D9CEC', '#4A89DC'], // Lvl 1: Blue
    ['#48CFAE', '#37BC9B'], // Lvl 2: Teal
    ['#AC92EC', '#967ADC'], // Lvl 3: Purple
    ['#EC87C0', '#D770AD'], // Lvl 4: Pink
    ['#FC6E51', '#E9573F'], // Lvl 5: Orange
    ['#DA4453', '#d62d2d'], // Lvl 6: Red/Danger
]

export default function Flappy({ API_BASE }) {
    const { slug } = useParams()
    const navigate = useNavigate()
    const [player, setPlayer] = useState(null)
    const [loading, setLoading] = useState(!!slug)
    const [inputId, setInputId] = useState('')

    // React State for UI (Menu, Game Over)
    const [gameState, setGameState] = useState('MENU')
    const [highScore, setHighScore] = useState(0)
    const [finalScore, setFinalScore] = useState(0) // For Game Over screen
    const [leaderboardState, setLeaderboardState] = useState([]) // For Game Over list
    const [msg, setMsg] = useState(null) // Current motivational message (React controlled)

    // ----------------------------------------------------------------
    // GAME LOOP STATE (Mutable Refs for 60fps performance)
    // ----------------------------------------------------------------
    const canvasRef = useRef(null)
    const frameIdRef = useRef(null)

    // Refs for real-time tracking inside loop
    const scoreRef = useRef(0)
    const levelRef = useRef(1)
    const distanceRef = useRef(0)
    const speedRef = useRef(BASE_SPEED)
    const gameStateRef = useRef('MENU') // Sync with state for loop checks
    const leaderboardRef = useRef([])   // For real-time rank calc

    // Game Entities
    const birdRef = useRef({ y: 300, vy: 0, x: 80, rotation: 0 })
    const pipesRef = useRef([])
    const ghostsRef = useRef([])
    const frameCountRef = useRef(0)

    const birdImgRef = useRef(null)

    // Helpers
    const loadImg = (src) => {
        const img = new Image()
        img.src = src
        return img
    }

    // Update Ref when State changes (for initial loading)
    useEffect(() => {
        gameStateRef.current = gameState
    }, [gameState])

    // Load Player
    useEffect(() => {
        if (slug) fetchPlayer(slug)
        else {
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
                birdImgRef.current = loadImg(data.player.avatar_image || 'https://i.imgur.com/BbbgFxP.png')
                await fetchLeaderboard(data.player.id)
            } else {
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
                navigate(`/flappy/${data.player.id}`)
                birdImgRef.current = loadImg(data.player.avatar_image || 'https://i.imgur.com/BbbgFxP.png')
                fetchLeaderboard(data.player.id)
            } else {
                toast.error(data.error || 'Failed to find/add player')
            }
        } catch (e) {
            toast.error('Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    const fetchLeaderboard = async (pid) => {
        try {
            const res = await fetch(`${API_BASE}/.netlify/functions/flappy-scores`)
            const data = await res.json()
            if (data.leaderboard) {
                setLeaderboardState(data.leaderboard)
                leaderboardRef.current = data.leaderboard // Update Ref for loop

                // Set Ghosts
                const g = data.leaderboard
                    .filter(p => p.player_id !== pid)
                    .slice(0, 15) // Take top 15

                // Preload ghost images
                ghostsRef.current = g.map(ghost => ({
                    ...ghost,
                    img: loadImg(ghost.avatar_image),
                    // Stable X position: Score * 250 + offset
                    targetX: ghost.score * 250 + 400
                }))

                // Determine high score
                const myEntry = data.leaderboard.find(p => p.player_id === pid)
                if (myEntry) setHighScore(myEntry.score)
            }
        } catch (e) { console.error("LB error", e) }
    }

    const saveScore = async (finalS) => {
        if (!player) return
        // Optimistic update
        if (finalS > highScore) setHighScore(finalS)

        try {
            const res = await fetch(`${API_BASE}/.netlify/functions/flappy-scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId: player.id, score: finalS })
            })
            const data = await res.json()
            if (data.success) {
                if (data.best > highScore) setHighScore(data.best)
                fetchLeaderboard(player.id)
            }
        } catch (e) { console.error(e) }
    }

    // ----------------------
    // Game Loop
    // ----------------------
    const prepareGame = () => {
        setGameState('READY')
        scoreRef.current = 0
        levelRef.current = 1
        distanceRef.current = 0
        speedRef.current = BASE_SPEED
        setMsg(null)

        resetEntities()
        requestAnimationFrame(renderOnly)
    }

    const startGame = () => {
        setGameState('PLAYING')
        birdRef.current.vy = JUMP_FORCE
        loop()
    }

    const showRandomMsg = () => {
        const m = MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
        setMsg(null)
        setTimeout(() => setMsg(m), 50)
        setTimeout(() => setMsg(null), 2500)
    }

    const resetEntities = () => {
        birdRef.current = { y: 300, vy: 0, x: 80, rotation: 0 }
        pipesRef.current = []
        frameCountRef.current = 0
    }

    const renderOnly = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        // Draw Scene with 0 progress
        drawScene(ctx, canvas.width, canvas.height)
    }

    const drawScene = (ctx, width, height) => {
        const currentLevel = levelRef.current
        const currentScore = scoreRef.current
        const currentDist = distanceRef.current

        // Sky with gradient based on Level
        const skyColors = LEVEL_SKIES[(currentLevel - 1) % LEVEL_SKIES.length] || LEVEL_SKIES[0]
        const grad = ctx.createLinearGradient(0, 0, 0, height)
        grad.addColorStop(0, skyColors[0])
        grad.addColorStop(1, skyColors[1])
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, width, height)

        // Pipes
        pipesRef.current.forEach(p => {
            ctx.fillStyle = '#2c3e50'
            ctx.fillRect(p.x, 0, p.w, p.topH)
            ctx.fillStyle = '#f1c40f'
            ctx.fillRect(p.x - 2, p.topH - 20, p.w + 4, 20)

            ctx.fillStyle = '#2c3e50'
            ctx.fillRect(p.x, p.topH + p.gap, p.w, height - (p.topH + p.gap))
            ctx.fillStyle = '#f1c40f'
            ctx.fillRect(p.x - 2, p.topH + p.gap, p.w + 4, 20)
        })

        // Ghosts
        ghostsRef.current.forEach(g => {
            const screenX = g.targetX - currentDist + birdRef.current.x
            // Draw if visible
            if (screenX > -50 && screenX < width + 50) {
                const ghostY = getHeightForGhost(g.score)

                // Ghost Glow REMOVED for mobile performance
                ctx.globalAlpha = 0.8;

                // Vertical line
                ctx.strokeStyle = 'rgba(255,255,255,0.6)'
                ctx.setLineDash([5, 5])
                ctx.lineWidth = 1;
                ctx.beginPath()
                ctx.moveTo(screenX + 15, 0)
                ctx.lineTo(screenX + 15, height)
                ctx.stroke()
                ctx.setLineDash([])

                // Image
                try {
                    ctx.drawImage(g.img, screenX, ghostY, 40, 40)
                } catch (e) {
                    // Fallback
                    ctx.fillStyle = 'purple'
                    ctx.beginPath()
                    ctx.arc(screenX + 20, ghostY + 20, 20, 0, Math.PI * 2)
                    ctx.fill()
                }

                // Name & Score
                ctx.fillStyle = '#fff'
                ctx.font = 'bold 12px sans-serif'
                ctx.textAlign = 'center'
                ctx.strokeStyle = 'black'
                ctx.lineWidth = 3

                const nameTxt = g.nickname.substring(0, 8)
                const scoreTxt = `${g.score}`

                ctx.strokeText(nameTxt, screenX + 20, ghostY - 10)
                ctx.fillText(nameTxt, screenX + 20, ghostY - 10)

                ctx.font = 'bold 14px sans-serif'
                ctx.strokeText(scoreTxt, screenX + 20, ghostY + 60)
                ctx.fillText(scoreTxt, screenX + 20, ghostY + 60)

                ctx.globalAlpha = 1.0
            }
        })

        // Bird
        const bird = birdRef.current
        ctx.save()
        ctx.translate(bird.x, bird.y)
        ctx.rotate(bird.rotation)
        if (birdImgRef.current && birdImgRef.current.complete) {
            ctx.beginPath()
            ctx.arc(0, 0, BIRD_SIZE / 2, 0, Math.PI * 2)
            ctx.save()
            ctx.clip()
            ctx.drawImage(birdImgRef.current, -BIRD_SIZE / 2, -BIRD_SIZE / 2, BIRD_SIZE, BIRD_SIZE)
            ctx.restore()
            ctx.strokeStyle = '#fff'
            ctx.lineWidth = 2
            ctx.stroke()
        } else {
            ctx.fillStyle = 'yellow'
            ctx.fillRect(-BIRD_SIZE / 2, -BIRD_SIZE / 2, BIRD_SIZE, BIRD_SIZE)
        }
        ctx.restore()

        // Ground
        ctx.fillStyle = '#ecf0f1'
        ctx.fillRect(0, height - 20, width, 20)
        ctx.fillStyle = '#bdc3c7'
        ctx.fillRect(0, height - 20, width, 4)

        // Draw In-Game HUD (Canvas Only)
        if (gameStateRef.current === 'PLAYING') {
            drawHUD(ctx, width, height, currentScore, currentDist)
        }
    }

    const drawHUD = (ctx, width, height, currentScore, dist) => {
        // Distance (Top Right)
        const displayDist = Math.floor(dist / 10) + 'm'
        ctx.textAlign = 'right'
        ctx.font = 'bold 24px sans-serif'
        ctx.fillStyle = '#ffd700'
        ctx.strokeStyle = 'black'
        ctx.lineWidth = 4
        ctx.strokeText(displayDist, width - 20, 40)
        ctx.fillText(displayDist, width - 20, 40)

        // Center Score
        ctx.textAlign = 'center'
        ctx.font = '900 60px Arial Black'
        ctx.fillStyle = 'white'
        ctx.strokeText(currentScore, width / 2, 80)
        ctx.fillText(currentScore, width / 2, 80)

        // Real-time Leaderboard (Top Left)
        const lb = leaderboardRef.current || []
        const rank = lb.filter(p => p.score > currentScore).length + 1

        ctx.textAlign = 'left'
        ctx.font = 'bold 12px sans-serif'

        let y = 30
        const top3 = lb.slice(0, 3)

        // Draw Top 3
        top3.forEach((p, i) => {
            const isMe = rank === i + 1
            const color = isMe ? '#ffd700' : 'white'

            ctx.strokeStyle = 'black'
            ctx.lineWidth = 3
            ctx.fillStyle = color

            const txt = `#${i + 1} ${p.nickname.substring(0, 8)}: ${p.score}`
            ctx.strokeText(txt, 20, y)
            ctx.fillText(txt, 20, y)
            y += 20
        })

        // Draw Me if not in top 3
        if (rank > 3) {
            y += 5
            ctx.fillStyle = '#ffd700'
            const txt = `#${rank} You: ${currentScore}`
            ctx.strokeText(txt, 20, y)
            ctx.fillText(txt, 20, y)
        }
    }

    const getHeightForGhost = (s) => 100 + ((s * 1337) % 350)

    const loop = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const width = canvas.width
        const height = canvas.height

        // Update Physics
        const bird = birdRef.current
        bird.vy += GRAVITY
        bird.y += bird.vy
        bird.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (bird.vy * 0.1)))

        distanceRef.current += speedRef.current
        const currentScore = scoreRef.current

        // Level / Difficulty Update
        const currentLevel = 1 + Math.floor(currentScore / 5)
        if (currentLevel !== levelRef.current) {
            levelRef.current = currentLevel
            speedRef.current = BASE_SPEED + (currentLevel * 0.4)
        }

        // Pipe Spawning
        const pipeIntervalFrames = Math.floor(250 / speedRef.current)

        frameCountRef.current++
        if (frameCountRef.current >= pipeIntervalFrames) {
            frameCountRef.current = 0
            const gapSize = Math.max(110, INITIAL_GAP - (currentLevel * 4))
            const minPipeH = 50
            const maxPipeH = height - gapSize - minPipeH - 20
            const topH = Math.floor(Math.random() * (maxPipeH - minPipeH + 1)) + minPipeH

            pipesRef.current.push({
                x: width,
                w: 60,
                topH: topH,
                gap: gapSize,
                passed: false
            })
        }

        pipesRef.current.forEach(p => p.x -= speedRef.current)
        if (pipesRef.current.length > 0 && pipesRef.current[0].x < -100) pipesRef.current.shift()

        // Collision Check
        let collision = false
        if (bird.y + BIRD_SIZE / 2 >= height - 20 || bird.y - BIRD_SIZE / 2 <= 0) collision = true

        pipesRef.current.forEach(p => {
            const bx = bird.x - BIRD_SIZE / 2 + 4
            const by = bird.y - BIRD_SIZE / 2 + 4
            const bs = BIRD_SIZE - 8

            if (
                bird.x + bs / 2 > p.x &&
                bird.x - bs / 2 < p.x + p.w &&
                (bird.y - bs / 2 < p.topH || bird.y + bs / 2 > p.topH + p.gap)
            ) {
                collision = true
            }

            if (!p.passed && bird.x > p.x + p.w) {
                p.passed = true
                scoreRef.current += 1

                // Motivation
                if (scoreRef.current > 0 && scoreRef.current % 50 === 0) showRandomMsg()
            }
        })

        // Draw Frame
        drawScene(ctx, width, height)

        if (collision) {
            setGameState('GAMEOVER') // Triggers React re-render
            setFinalScore(scoreRef.current)
            return
        }

        frameIdRef.current = requestAnimationFrame(loop)
    }

    // Input
    const handleAction = () => {
        if (gameStateRef.current === 'READY') {
            startGame()
            return
        }
        if (gameStateRef.current === 'PLAYING') {
            birdRef.current.vy = JUMP_FORCE
        }
    }

    // Bind Keys
    useEffect(() => {
        const handleKd = (e) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') handleAction()
        }
        window.addEventListener('keydown', handleKd)
        return () => window.removeEventListener('keydown', handleKd)
    }, [])

    // Cleanup loop
    useEffect(() => {
        return () => cancelAnimationFrame(frameIdRef.current)
    }, [])

    const handleLogout = (e) => {
        if (e) e.stopPropagation()
        setPlayer(null)
        navigate('/flappy')
    }

    const handleShare = async (e) => {
        if (e) e.stopPropagation()
        const text = `I just scored ${finalScore} in Flappy Kingshot! Can you beat me?`
        const url = window.location.href

        if (navigator.share) {
            try {
                await navigator.share({ title: 'Flappy Kingshot', text, url })
            } catch (err) { console.error(err) }
        } else {
            navigator.clipboard.writeText(`${text} ${url}`)
            toast.success('Score copied to clipboard!')
        }
    }

    // Loading State
    if (loading && !player) return <div className="flappy-container">Loading...</div>

    // Login State
    if (!player) {
        return (
            <div className="flappy-container">
                <div className="flappy-overlay">
                    <img src="/logo.png" alt="ARCommando" style={{ width: 80, marginBottom: 20 }} />
                    <h2 className="mb-4">Flappy Kingshot</h2>
                    <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
                        <input
                            type="text"
                            className="form-control form-control-lg text-center"
                            placeholder="Enter Player ID"
                            value={inputId}
                            onChange={e => setInputId(e.target.value)}
                            style={{ background: 'rgba(255,255,255,0.9)', border: 'none', color: '#000' }}
                        />
                        <button className="btn-start" type="submit">ENTER GAME</button>
                    </form>
                    <div className="mt-3 small text-white-50">Use your game avatar to play!</div>
                </div>
            </div>
        )
    }

    // Game UI
    return (
        <div className="flappy-container"
            onMouseDown={handleAction}
            onTouchStart={(e) => { e.preventDefault(); handleAction() }}
        >
            <div className="flappy-canvas-wrapper">
                <canvas ref={canvasRef} width={window.innerWidth > 480 ? 400 : 320} height={600} />

                {/* React UI Overlays (Menu/GameOver only) */}

                {gameState === 'PLAYING' && (
                    <>
                        {/* Only Messages here, HUD is canvas now */}
                        {msg && <div className="motivational-msg">{msg}</div>}
                    </>
                )}

                {gameState === 'MENU' && (
                    <div className="flappy-ui-layer">
                        <div className="flappy-overlay">
                            <h3>Welcome, {player.nickname}!</h3>
                            <div className="py-4">
                                <img src={player.avatar_image || '/logo.png'} style={{ width: 80, height: 80, borderRadius: '50%', border: '3px solid gold' }} />
                            </div>
                            <button className="btn-start" onClick={(e) => {
                                e.stopPropagation();
                                prepareGame()
                            }}>PLAY</button>

                            <button className="btn-link mt-3" onClick={handleLogout}>
                                Switch Player
                            </button>
                            <div className="leaderboard-mini mt-3">
                                <small>Current High Score: {highScore}</small>
                            </div>
                        </div>
                    </div>
                )}

                {gameState === 'READY' && (
                    <div className="flappy-ui-layer">
                        <div className="pulsate-text" style={{ fontSize: '2rem', fontWeight: 'bold', textShadow: '0 0 10px black' }}>
                            TAP TO FLY
                        </div>
                        <div className="mt-2 text-white-50 small">Avoid pipes & beat high scores!</div>
                    </div>
                )}

                {gameState === 'GAMEOVER' && (
                    <div className="flappy-ui-layer">
                        <div className="flappy-overlay">
                            <h2 className="text-danger mb-3">CRASHED!</h2>
                            <div className="d-flex justify-content-center gap-4 mb-3">
                                <div>
                                    <small className="text-white-50 d-block">SCORE</small>
                                    <span className="display-4 fw-bold">{finalScore}</span>
                                </div>
                                <div>
                                    <small className="text-white-50 d-block">BEST</small>
                                    <span className="display-4 fw-bold text-warning">{Math.max(finalScore, highScore)}</span>
                                </div>
                            </div>

                            <button className="btn-start" onClick={(e) => {
                                e.stopPropagation();
                                saveScore(finalScore);
                                prepareGame();
                            }}>RETRY</button>

                            <div className="d-flex gap-2 justify-content-center mt-3">
                                <button className="btn btn-sm btn-outline-warning" onClick={handleShare}>
                                    Share Score
                                </button>
                                <button className="btn btn-outline-light btn-sm" onClick={(e) => {
                                    e.stopPropagation();
                                    saveScore(finalScore);
                                    setGameState('MENU');
                                }}>Exit</button>
                            </div>

                            <div className="leaderboard-mini mt-3">
                                <h6 className="text-start mb-2">🏆 Global Top 50</h6>
                                {leaderboardState.slice(0, 15).map((p, i) => (
                                    <div key={i} className={`lb-row ${p.player_id === player.id ? 'bg-primary' : ''}`}>
                                        <div className="d-flex align-items-center gap-2">
                                            <span>#{i + 1}</span>
                                            <img src={p.avatar_image || 'https://i.imgur.com/BbbgFxP.png'} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />
                                            <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nickname}</span>
                                        </div>
                                        <strong className="text-warning">{p.score}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

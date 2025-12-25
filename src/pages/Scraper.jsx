import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { useOutletContext } from 'react-router-dom'

export default function Scraper() {
    const { API_BASE, adminPass } = useOutletContext()
    const [players, setPlayers] = useState(110)
    const [fast, setFast] = useState(true)
    const [noApi, setNoApi] = useState(false)
    const [debugImages, setDebugImages] = useState(false)
    const [savePowerAttempts, setSavePowerAttempts] = useState(false)
    const [autoYes, setAutoYes] = useState(true)
    const [retryLast, setRetryLast] = useState(false)
    const [loading, setLoading] = useState(false)

    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

    async function handleStart() {
        if (!isLocal) {
            toast.error('The scraper requires a local physical connection to your phone.')
            return
        }
        if (!window.confirm('Start the scraper with these settings?')) return

        setLoading(true)
        try {
            const res = await fetch(`${API_BASE}/.netlify/functions/scrape-run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminPass, players, fast, noApi, debugImages, savePowerAttempts, autoYes, retryLast })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to start scraper')

            toast.success('Scraper started in background!')
        } catch (err) {
            console.error(err)
            toast.error(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="container-fluid py-4">
            <div className="d-flex align-items-center gap-3 mb-4">
                <i className="bi bi-robot fs-2 text-primary"></i>
                <h2 className="mb-0">Auto Scraper</h2>
            </div>

            <div className="card shadow-sm mb-4" style={{ maxWidth: 600 }}>
                <div className="card-header">
                    <h5 className="mb-0">Configuration</h5>
                </div>
                <div className="card-body">
                    {!isLocal && (
                        <div className="alert alert-warning mb-4">
                            <h6 className="alert-heading d-flex align-items-center gap-2">
                                <i className="bi bi-exclamation-triangle-fill"></i>
                                Local Connection Required
                            </h6>
                            <p className="mb-0 small">
                                This scraper uses ADB and Tesseract to read data from a phone connected via USB.
                                Since you are on the live site, it cannot reach your local device.
                                To use this, run the app locally using <code>npm run netlify</code>.
                            </p>
                        </div>
                    )}
                    <p className="text-muted small mb-4">
                        Tesseract-based OCR scraper. Runs locally on the server/device.
                    </p>

                    {/* Retry Option */}
                    <div className="alert alert-secondary mb-4">
                        <div className="form-check form-switch">
                            <input
                                className="form-check-input"
                                type="checkbox"
                                id="retryLast"
                                checked={retryLast}
                                onChange={e => setRetryLast(e.target.checked)}
                            />
                            <label className="form-check-label fw-bold" htmlFor="retryLast">
                                Retry Failed Players (Last Session)
                            </label>
                        </div>
                        <div className="form-text mt-1">
                            Only retry players that failed in the previous run. Ignores other settings.
                        </div>
                    </div>

                    {!retryLast && (
                        <>
                            <div className="mb-3">
                                <label className="form-label">Players to Scrape</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={players}
                                    onChange={e => setPlayers(parseInt(e.target.value) || 0)}
                                    min="1"
                                    max="1000"
                                />
                                <div className="form-text">Recommended: 50-200. No hard limit.</div>
                            </div>

                            <div className="form-check form-switch mb-3">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id="fastMode"
                                    checked={fast}
                                    onChange={e => setFast(e.target.checked)}
                                />
                                <label className="form-check-label" htmlFor="fastMode">
                                    <strong>Fast Mode</strong> (Skip game launch/navigation)
                                </label>
                                <div className="form-text">Assumes game is already on the leaderboard screen.</div>
                            </div>

                            <div className="form-check form-switch mb-4">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id="noApi"
                                    checked={noApi}
                                    onChange={e => setNoApi(e.target.checked)}
                                />
                                <label className="form-check-label" htmlFor="noApi">
                                    <strong>Speed Optimization</strong> (Skip Player API fetch)
                                </label>
                                <div className="form-text text-danger">Warning: Won't fetch nicknames/avatars. Only Power and FID.</div>
                            </div>

                            <div className="form-check form-switch mb-4">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id="debugImages"
                                    checked={debugImages}
                                    onChange={e => setDebugImages(e.target.checked)}
                                />
                                <label className="form-check-label" htmlFor="debugImages">
                                    <strong>Save Debug Images</strong>
                                </label>
                                <div className="form-text">Save cropped images for OCR debugging (clears old images on start).</div>
                            </div>

                            <div className="form-check form-switch mb-4">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id="savePowerAttempts"
                                    checked={savePowerAttempts}
                                    onChange={e => setSavePowerAttempts(e.target.checked)}
                                />
                                <label className="form-check-label" htmlFor="savePowerAttempts">
                                    <strong>Save All Power OCR Trials</strong>
                                </label>
                                <div className="form-text">Save all threshold/jitter crops for review (very useful for debugging skips).</div>
                            </div>

                            <div className="form-check form-switch mb-4">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id="autoYes"
                                    checked={autoYes}
                                    onChange={e => setAutoYes(e.target.checked)}
                                />
                                <label className="form-check-label" htmlFor="autoYes">
                                    <strong>Auto-Confirm</strong> (Skip prompts)
                                </label>
                                <div className="form-text">Automatically answer "yes" to confirmation prompts.</div>
                            </div>
                        </>
                    )}

                    <button
                        className="btn btn-primary w-100 py-2 d-flex align-items-center justify-content-center gap-2"
                        onClick={handleStart}
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        ) : (
                            <i className="bi bi-play-fill text-white fs-5"></i>
                        )}
                        <span>{loading ? 'Starting...' : (retryLast ? 'Start Retry Job' : 'Start Scraper Job')}</span>
                    </button>
                </div>
            </div>

            <div className="card shadow-sm mb-4" style={{ maxWidth: 600 }}>
                <div className="card-header d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Command Preview</h5>
                    <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => {
                            let cmd = 'python scraper/auto_scraper_tesseract.py'
                            if (retryLast) {
                                cmd += ' --retry-last'
                            } else {
                                cmd += ` --players ${players}${fast ? ' --fast' : ''}${noApi ? ' --no-api' : ''}${debugImages ? ' --debug-images' : ''}${savePowerAttempts ? ' --save-power-attempts' : ''}${autoYes ? ' --yes' : ''}`
                            }
                            navigator.clipboard.writeText(cmd)
                            toast.success('Copied to clipboard!')
                        }}
                    >
                        <i className="bi bi-clipboard me-1"></i> Copy
                    </button>
                </div>
                <div className="card-body">
                    <code className="d-block text-break user-select-all p-3 rounded" style={{ background: '#1e1e1e', color: '#e0e0e0', fontFamily: 'monospace' }}>
                        python scraper/auto_scraper_tesseract.py
                        {retryLast ? (
                            ' --retry-last'
                        ) : (
                            <>
                                {' --players ' + players}
                                {fast && ' --fast'}
                                {noApi && ' --no-api'}
                                {debugImages && ' --debug-images'}
                                {savePowerAttempts && ' --save-power-attempts'}
                                {autoYes && ' --yes'}
                            </>
                        )}
                    </code>
                </div>
            </div>

            <div className="alert alert-info" style={{ maxWidth: 600 }}>
                <h6 className="alert-heading d-flex align-items-center gap-2">
                    <i className="bi bi-info-circle-fill"></i>
                    How it works
                </h6>
                <p className="mb-0 small">
                    The scraper runs as a background process. You won't see live logs here, but you can monitor progress by refreshing the <strong>Leaderboard</strong> page.
                </p>
            </div>
        </div>
    )
}

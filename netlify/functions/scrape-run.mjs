import { cors, requireAdmin, parseBody } from './_lib/_utils.js'
import { spawn } from 'child_process'
import path from 'path'

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({})

    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res

    const body = parseBody(event)
    const { players = 50, fast = false, noApi = false, debugImages = false, savePowerAttempts = false, autoYes = true } = body

    try {
        const fs = await import('fs')
        const scraperDir = path.resolve(process.cwd(), 'scraper')
        const scraperPath = path.resolve(scraperDir, 'auto_scraper_tesseract.py')
        const logPath = path.resolve(scraperDir, 'scrape_log.txt')

        // Pre-flight check: ensure scraper directory and script exist
        // Netlify production won't have the "scraper/" folder bundled usually, 
        // and certainly won't have ADB/Python set up for physical USB.
        if (!fs.existsSync(scraperDir) || !fs.existsSync(scraperPath)) {
            return cors({
                error: 'Local Scraper Not Found',
                message: 'The physical device scraper can only be run on a local machine with ADB and your phone connected. It is not supported on cloud/production servers.'
            }, 400)
        }

        const out = fs.openSync(logPath, 'a')
        const err = fs.openSync(logPath, 'a')

        const args = [scraperPath]
        if (autoYes) args.push('--yes')
        if (players) args.push('--players', players.toString())
        if (fast) args.push('--fast')
        if (noApi) args.push('--no-api')
        if (debugImages) args.push('--debug-images')
        if (savePowerAttempts) args.push('--save-power-attempts')

        console.log('[SCRAPE-RUN] Spawning python in:', scraperDir)

        const python = spawn('python', ['-u', ...args], {
            cwd: scraperDir,
            detached: true,
            stdio: ['ignore', out, err],
            shell: true
        })

        python.unref()

        return cors({
            message: 'Scraper started in background',
            command: `python ${args.join(' ')}`,
            fast,
            noApi,
            debugImages,
            savePowerAttempts
        })
    } catch (error) {
        console.error('[SCRAPE-RUN] Error:', error)
        return cors({ error: error.message }, 500)
    }
}

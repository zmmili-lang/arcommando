/**
 * Local Sync Script for Leaderboard Names
 * Run with: node sync_leaderboard_names.js
 */
import 'dotenv/config'
import postgres from 'postgres'
import crypto from 'node:crypto'

// Minimal re-implementation of required libs to avoid complex imports
const DATABASE_URL = process.env.DATABASE_URL
const SECRET = 'mN4!pQs6JrYwV9' // from ks-api.js
const LOGIN_URL = 'https://kingshot-giftcode.centurygame.com/api/player'

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in .env')
    process.exit(1)
}

const sql = postgres(DATABASE_URL, { ssl: 'require' })

function md5(input) {
    return crypto.createHash('md5').update(input).digest('hex')
}

function encodeData(data) {
    const keys = Object.keys(data).sort()
    const encoded = keys.map(k => `${k}=${typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k]}`).join('&')
    const sign = md5(`${encoded}${SECRET}`)
    return { sign, ...data }
}

async function fetchPlayerName(uid) {
    const payload = encodeData({ fid: String(uid).trim(), time: Date.now() })
    const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    const data = await res.json()
    if (data.code !== 0) return null
    return data.data?.nickname
}

async function run() {
    console.log('🚀 Starting deep sync of player names via Game API...')

    try {
        const players = await sql`
            SELECT name, uid 
            FROM leaderboard_players 
            WHERE uid IS NOT NULL 
            AND (is_verified = FALSE OR is_verified IS NULL)
        `

        console.log(f`🔍 Found ${players.length} players to verify.`)

        let updated = 0
        let skipped = 0

        for (const player of players) {
            process.stdout.write(`  Checking UID ${player.uid} (${player.name})... `)

            try {
                const officialName = await fetchPlayerName(player.uid)

                if (officialName) {
                    if (officialName !== player.name) {
                        // The primary key UPDATE will cascade to power_history automatically
                        await sql`
                            UPDATE leaderboard_players 
                            SET name = ${officialName}, is_verified = TRUE 
                            WHERE uid = ${player.uid}
                        `
                        console.log(`✅ Fixed: -> "${officialName}"`)
                        updated++
                    } else {
                        await sql`
                            UPDATE leaderboard_players 
                            SET is_verified = TRUE 
                            WHERE uid = ${player.uid}
                        `
                        console.log(`✅ Correct.`)
                        skipped++
                    }
                } else {
                    console.log(`⚠️  API error (player not found?)`)
                }
            } catch (e) {
                console.log(`❌ Error: ${e.message}`)
            }

            // Be kind to the API
            await new Promise(r => setTimeout(r, 250))
        }

        console.log('\n✨ Sync Complete!')
        console.log(`✅ Names updated: ${updated}`)
        console.log(`✅ Names verified: ${skipped}`)

    } catch (err) {
        console.error('❌ Sync failed:', err)
    } finally {
        await sql.end()
    }
}

run()

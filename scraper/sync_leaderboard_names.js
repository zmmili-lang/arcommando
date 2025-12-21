/**
 * Local Sync Script for Leaderboard Names (Unified Table)
 * Uses @neondatabase/serverless (already in node_modules)
 */
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';

// Manual .env loading
function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            const env = fs.readFileSync(envPath, 'utf8');
            env.split('\n').forEach(line => {
                const [key, ...value] = line.split('=');
                if (key && value) process.env[key.trim()] = value.join('=').trim();
            });
        }
    } catch (e) { }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const SECRET = 'mN4!pQs6JrYwV9';
const LOGIN_URL = 'https://kingshot-giftcode.centurygame.com/api/player';

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found.');
    process.exit(1);
}

const sql = neon(DATABASE_URL);

function md5(input) {
    return crypto.createHash('md5').update(input).digest('hex');
}

function encodeData(data) {
    const keys = Object.keys(data).sort();
    const encoded = keys.map(k => `${k}=${typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k]}`).join('&');
    const sign = md5(`${encoded}${SECRET}`);
    return { sign, ...data };
}

async function fetchPlayerName(uid) {
    const payload = encodeData({ fid: String(uid).trim(), time: Date.now() });
    try {
        const res = await fetch(LOGIN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.code !== 0) return null;
        return data.data?.nickname;
    } catch (e) {
        return null;
    }
}

async function run() {
    console.log('🚀 Starting sync of player nicknames...');

    try {
        const players = await sql`
            SELECT id, nickname 
            FROM players 
            WHERE id IS NOT NULL 
            AND (is_verified = FALSE OR is_verified IS NULL)
        `;

        console.log(`🔍 Found ${players.length} players to verify.`);

        let updated = 0;
        let verified = 0;

        for (const player of players) {
            process.stdout.write(`  Checking ID ${player.id} (${player.nickname})... `);

            const officialName = await fetchPlayerName(player.id);

            if (officialName) {
                if (officialName !== player.nickname) {
                    // CRITICAL FIX: Use tagged template literal for proper parameterization
                    await sql`
                        UPDATE players 
                        SET nickname = ${officialName}, is_verified = TRUE 
                        WHERE id = ${String(player.id)}
                    `;
                    console.log(`✅ Fixed: -> "${officialName}"`);
                    updated++;
                } else {
                    await sql`
                        UPDATE players 
                        SET is_verified = TRUE 
                        WHERE id = ${String(player.id)}
                    `;
                    console.log(`✅ Correct.`);
                    verified++;
                }
            } else {
                console.log(`⚠️  API error.`);
            }

            await new Promise(r => setTimeout(r, 100));
        }

        console.log('\n✨ Sync Complete!');
        console.log(`✅ Updated: ${updated} | Already Correct: ${verified}`);

    } catch (err) {
        console.error('❌ Sync failed:', err);
    }
}

run();

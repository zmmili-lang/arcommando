/**
 * Migration & Merge Script (Fixed Standalone Version)
 * Unifies 'leaderboard_players' and legacy 'players' into a single entity.
 */
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

// Manual .env loading to avoid 'dotenv' dependency
function loadEnv() {
    try {
        const envPaths = [
            path.resolve(process.cwd(), '.env'),
            path.resolve(process.cwd(), 'scraper', '.env'),
            path.resolve(process.cwd(), '..', '.env')
        ];

        for (const envPath of envPaths) {
            if (fs.existsSync(envPath)) {
                console.log(`📖 Loading environment from ${envPath}`);
                const env = fs.readFileSync(envPath, 'utf8');
                env.split('\n').forEach(line => {
                    const parts = line.split('=');
                    if (parts.length >= 2) {
                        const key = parts[0].trim();
                        const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
                        if (key && value) process.env[key] = value;
                    }
                });
                return true;
            }
        }
    } catch (e) {
        console.log('ℹ️ Environment loading info:', e.message);
    }
    return false;
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NETLIFY_DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found. Run this from the root or scraper directory where .env exists.');
    process.exit(1);
}

const sql = neon(DATABASE_URL);

async function run() {
    console.log('🚀 Starting Database Unification & Merge...');

    try {
        // 1. Ensure columns exist in 'players'
        console.log('  1. Adding missing columns to "players" table...');
        await sql`
            ALTER TABLE players 
            ADD COLUMN IF NOT EXISTS kills BIGINT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS alliance_name TEXT,
            ADD COLUMN IF NOT EXISTS kingdom INTEGER,
            ADD COLUMN IF NOT EXISTS kid INTEGER,
            ADD COLUMN IF NOT EXISTS stove_lv INTEGER,
            ADD COLUMN IF NOT EXISTS stove_lv_content TEXT,
            ADD COLUMN IF NOT EXISTS first_seen BIGINT,
            ADD COLUMN IF NOT EXISTS last_seen BIGINT,
            ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE
        `;

        // 2. Prepare power history table
        console.log('  2. Converting leaderboard_power_history to use player_id...');

        // Add player_id column if not exists
        await sql`ALTER TABLE leaderboard_power_history ADD COLUMN IF NOT EXISTS player_id TEXT`;

        // Check columns in history table
        const historyCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'leaderboard_power_history'`;
        const hasPlayerName = historyCols.some(c => c.column_name === 'player_name');

        // Check leaderboard_players schema
        let lpTableInfo = [];
        try {
            lpTableInfo = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'leaderboard_players'`;
        } catch (e) {
            console.log('     ℹ️ leaderboard_players table access info:', e.message);
        }

        const hasId = lpTableInfo.some(c => c.column_name === 'id');
        const hasUid = lpTableInfo.some(c => c.column_name === 'uid');
        const uidColumn = hasUid ? 'uid' : (hasId ? 'id' : null);

        if (hasPlayerName) {
            if (uidColumn) {
                console.log(`     Updating history using column "${uidColumn}" from leaderboard_players...`);
                // Use tagged template literal for safer execution if possible, 
                // but since table/column names can't be parameterized easily in some drivers, 
                // we'll be careful with the mapping.
                await sql([
                    `UPDATE leaderboard_power_history h
                     SET player_id = lp.${uidColumn}
                     FROM leaderboard_players lp
                     WHERE h.player_name = lp.name AND lp.${uidColumn} IS NOT NULL`
                ]);
            } else {
                console.log('     ℹ️ No UID/ID column found in leaderboard_players. Attempting name-based link to existing "players" table as fallback...');
                await sql`
                    UPDATE leaderboard_power_history h
                    SET player_id = p.id
                    FROM players p
                    WHERE h.player_name = p.nickname AND h.player_id IS NULL
                `;
            }

            // Remove orphans (those that don't match a player with a UID)
            const orphansResult = await sql`SELECT COUNT(*) FROM leaderboard_power_history WHERE player_id IS NULL`;
            const orphanCount = parseInt(orphansResult[0].count);
            if (orphanCount > 0) {
                console.log(`     🗑️ Removing ${orphanCount} history records that couldn't be linked to a Player UID.`);
                await sql`DELETE FROM leaderboard_power_history WHERE player_id IS NULL`;
            }

            // Remove old column and clean up
            try {
                await sql`ALTER TABLE leaderboard_power_history DROP COLUMN IF EXISTS player_name CASCADE`;
            } catch (e) { /* already removed */ }
        } else {
            console.log('     ℹ️ "player_name" column already removed or history already updated.');
        }

        // Set NOT NULL constraint
        try {
            await sql`ALTER TABLE leaderboard_power_history ALTER COLUMN player_id SET NOT NULL`;
        } catch (e) {
            console.log('     ⚠️ Could not set player_id to NOT NULL (perhaps some NULLs remain?):', e.message);
        }

        // Ensure Foreign Key
        try {
            await sql`ALTER TABLE leaderboard_power_history ADD CONSTRAINT leaderboard_power_history_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE`;
        } catch (e) { /* constraint likely exists */ }

        // 3. Merge data
        console.log('  3. Merging records into main players table...');
        if (uidColumn) {
            const lpRows = await sql([`SELECT * FROM leaderboard_players WHERE ${uidColumn} IS NOT NULL`]);
            let merged = 0;
            for (const lp of lpRows) {
                const uid = String(lp[uidColumn]);
                await sql`
                    INSERT INTO players (id, nickname, kills, alliance_name, kingdom, first_seen, last_seen, is_verified)
                    VALUES (${uid}, ${lp.name}, ${lp.kills || 0}, ${lp.alliance_name || ''}, ${lp.kingdom || 0}, ${lp.first_seen || 0}, ${lp.last_seen || 0}, ${lp.is_verified || false})
                    ON CONFLICT (id) DO UPDATE SET
                        nickname = EXCLUDED.nickname,
                        kills = EXCLUDED.kills,
                        alliance_name = EXCLUDED.alliance_name,
                        kingdom = EXCLUDED.kingdom,
                        last_seen = EXCLUDED.last_seen,
                        is_verified = EXCLUDED.is_verified
                `;
                merged++;
            }
            console.log(`     ✅ Successfully merged/updated ${merged} players.`);
        } else {
            console.log('     ℹ️ Skipping merge: "leaderboard_players" has no UID column or is incompatible.');
        }

        console.log('  4. Migration complete! The "players" table is now the single canonical source.');

    } catch (err) {
        console.error('❌ Migration failed:', err);
    }
}

run();

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

function loadEnv() {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const env = fs.readFileSync(envPath, 'utf8');
        env.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
                if (key && value) process.env[key] = value;
            }
        });
    }
}

loadEnv();
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const sql = neon(DATABASE_URL);

async function check() {
    try {
        const tables = ['players', 'leaderboard_players', 'leaderboard_power_history'];
        for (const table of tables) {
            const columns = await sql`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = ${table}
            `;
            console.log(`\nColumns in ${table}:`);
            console.table(columns);

            const data = await sql([`SELECT * FROM ${table} LIMIT 5`]);
            console.log(`\nSample data from ${table}:`);
            console.table(data);
        }
    } catch (err) {
        console.error(err);
    }
}
check();

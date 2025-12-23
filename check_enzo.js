import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrlMatch = env.match(/DATABASE_URL=(.*)/);
const databaseUrl = dbUrlMatch ? dbUrlMatch[1].trim() : null;

async function checkPlayer() {
    if (!databaseUrl) {
        console.error('DATABASE_URL not found in .env');
        return;
    }
    const sql = neon(databaseUrl);
    const uid = '105718120';
    const players = await sql`SELECT * FROM players WHERE id = ${uid}`;
    console.log('Player Data:', JSON.stringify(players, null, 2));
}

checkPlayer().catch(console.error);

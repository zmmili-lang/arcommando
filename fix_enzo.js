
import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrlMatch = env.match(/DATABASE_URL=(.*)/);
const databaseUrl = dbUrlMatch ? dbUrlMatch[1].trim() : null;

async function fixPlayer() {
    if (!databaseUrl) {
        console.error('DATABASE_URL not found in .env');
        return;
    }
    const sql = neon(databaseUrl);
    const uid = '105718120';
    const newAlliance = '716';

    await sql`UPDATE players SET alliance_name = ${newAlliance} WHERE id = ${uid}`;
    console.log(`Updated player ${uid} alliance to ${newAlliance}`);
}

fixPlayer().catch(console.error);

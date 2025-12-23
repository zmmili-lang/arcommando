import { getSql } from './netlify/functions/_lib/_utils.js';

async function analyzeRateLimits() {
    const sql = getSql();

    console.log('--- Analyzing Recent History for Rate Limits ---');

    const recent = await sql`
        SELECT ts, status, player_id, code 
        FROM history 
        ORDER BY ts DESC 
        LIMIT 100
    `;

    let rateLimitCount = 0;
    for (let i = 0; i < recent.length; i++) {
        const entry = recent[i];
        const timeStr = new Date(Number(entry.ts)).toISOString();
        if (entry.status === 'rate_limited') {
            rateLimitCount++;
            console.log(`${timeStr} - RATE LIMITED - Player: ${entry.player_id} - Code: ${entry.code}`);

            // Look at the gap from the previous successful/unsuccessful request
            if (i < recent.length - 1) {
                const prev = recent[i + 1];
                const gap = (Number(entry.ts) - Number(prev.ts)) / 1000;
                console.log(`  (Gap from last request: ${gap.toFixed(2)}s)`);
            }
        }
    }

    console.log(`\nFound ${rateLimitCount} rate limit events in the last 100 entries.`);

    // Check average gap between requests in a run
    const lastRun = await sql`
        SELECT ts FROM history 
        WHERE ts > ${Date.now() - 300000} -- last 5 mins
        ORDER BY ts ASC
    `;

    if (lastRun.length > 1) {
        let totalGap = 0;
        for (let i = 1; i < lastRun.length; i++) {
            totalGap += (Number(lastRun[i].ts) - Number(lastRun[i - 1].ts));
        }
        console.log(`Average gap in last 5 mins: ${(totalGap / (lastRun.length - 1) / 1000).toFixed(2)}s (${lastRun.length} requests)`);
    }

    process.exit(0);
}

analyzeRateLimits().catch(err => {
    console.error(err);
    process.exit(1);
});

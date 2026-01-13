export async function handler(...args) {
    const mod = await import('./_lib/flappy-scores.mjs')
    return mod.handler(...args)
}

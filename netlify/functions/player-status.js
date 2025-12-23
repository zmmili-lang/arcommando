export async function handler(...args) {
    const mod = await import('./_lib/player-status.mjs')
    return mod.handler(...args)
}

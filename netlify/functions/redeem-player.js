export async function handler(...args) {
    const mod = await import('./_lib/redeem-player.mjs')
    return mod.handler(...args)
}

export async function handler(...args) {
    const mod = await import('./_lib/public-player.mjs')
    return mod.handler(...args)
}

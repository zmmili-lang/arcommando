export async function handler(...args) {
    const mod = await import('./_lib/players-update.mjs')
    return mod.handler(...args)
}

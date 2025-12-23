export async function handler(...args) {
    const mod = await import('./_lib/players-remove.mjs')
    return mod.handler(...args)
}

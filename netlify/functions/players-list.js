export async function handler(...args) {
    const mod = await import('./_lib/players-list.mjs')
    return mod.handler(...args)
}

export async function handler(...args) {
    const mod = await import('./_lib/players-add.mjs')
    return mod.handler(...args)
}

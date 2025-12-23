export async function handler(...args) {
    const mod = await import('./_lib/codes-update.mjs')
    return mod.handler(...args)
}

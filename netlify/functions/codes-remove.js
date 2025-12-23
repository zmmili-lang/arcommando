export async function handler(...args) {
    const mod = await import('./_lib/codes-remove.mjs')
    return mod.handler(...args)
}

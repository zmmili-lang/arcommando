export async function handler(...args) {
    const mod = await import('./_lib/codes-list.mjs')
    return mod.handler(...args)
}

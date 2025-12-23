export async function handler(...args) {
    const mod = await import('./_lib/redeem-start.mjs')
    return mod.handler(...args)
}

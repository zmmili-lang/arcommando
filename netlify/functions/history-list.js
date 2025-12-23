export async function handler(...args) {
    const mod = await import('./_lib/history-list.mjs')
    return mod.handler(...args)
}

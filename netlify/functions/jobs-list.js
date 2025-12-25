export async function handler(...args) {
    const mod = await import('./_lib/jobs-list.mjs')
    return mod.handler(...args)
}

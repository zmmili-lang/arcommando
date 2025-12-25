export async function handler(...args) {
    const mod = await import('./_lib/jobs-cancel.mjs')
    return mod.handler(...args)
}

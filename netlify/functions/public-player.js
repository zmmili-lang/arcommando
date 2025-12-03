module.exports.handler = async (...args) => {
    const mod = await import('./_lib/public-player.mjs')
    return mod.handler(...args)
}

module.exports.handler = async (...args) => {
    const mod = await import('./_lib/redeem-player.mjs')
    return mod.handler(...args)
}

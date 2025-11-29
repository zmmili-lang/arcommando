module.exports.handler = async (...args) => {
const mod = await import('./_lib/player-status.mjs')
  return mod.handler(...args)
}

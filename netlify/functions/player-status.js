module.exports.handler = async (...args) => {
  const mod = await import('./player-status.mjs')
  return mod.handler(...args)
}

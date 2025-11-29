module.exports.handler = async (...args) => {
  const mod = await import('./players-update.mjs')
  return mod.handler(...args)
}

module.exports.handler = async (...args) => {
  const mod = await import('./players-remove.mjs')
  return mod.handler(...args)
}

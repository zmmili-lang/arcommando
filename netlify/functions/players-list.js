module.exports.handler = async (...args) => {
  const mod = await import('./players-list.mjs')
  return mod.handler(...args)
}

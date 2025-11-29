module.exports.handler = async (...args) => {
  const mod = await import('./players-add.mjs')
  return mod.handler(...args)
}

module.exports.handler = async (...args) => {
  const mod = await import('./codes-update.mjs')
  return mod.handler(...args)
}

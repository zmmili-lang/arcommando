module.exports.handler = async (...args) => {
  const mod = await import('./codes-remove.mjs')
  return mod.handler(...args)
}

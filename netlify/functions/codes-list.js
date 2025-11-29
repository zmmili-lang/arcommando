module.exports.handler = async (...args) => {
  const mod = await import('./codes-list.mjs')
  return mod.handler(...args)
}

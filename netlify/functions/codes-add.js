module.exports.handler = async (...args) => {
  const mod = await import('./codes-add.mjs')
  return mod.handler(...args)
}

module.exports.handler = async (...args) => {
  const mod = await import('./history-clear.mjs')
  return mod.handler(...args)
}

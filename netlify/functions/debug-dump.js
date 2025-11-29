module.exports.handler = async (...args) => {
  const mod = await import('./debug-dump.mjs')
  return mod.handler(...args)
}

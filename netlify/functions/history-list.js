module.exports.handler = async (...args) => {
  const mod = await import('./history-list.mjs')
  return mod.handler(...args)
}

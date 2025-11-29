module.exports.handler = async (...args) => {
  const mod = await import('./redeem-start.mjs')
  return mod.handler(...args)
}

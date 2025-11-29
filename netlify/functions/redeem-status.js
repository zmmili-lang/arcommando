module.exports.handler = async (...args) => {
  const mod = await import('./redeem-status.mjs')
  return mod.handler(...args)
}

module.exports.handler = async (...args) => {
  const mod = await import('./redeem-run-background.mjs')
  return mod.handler(...args)
}

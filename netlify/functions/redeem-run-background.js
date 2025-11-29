module.exports.handler = async (...args) => {
const mod = await import('./_lib/redeem-run-background.mjs')
  return mod.handler(...args)
}

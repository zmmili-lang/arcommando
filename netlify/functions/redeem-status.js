module.exports.handler = async (...args) => {
const mod = await import('./_lib/redeem-status.mjs')
  return mod.handler(...args)
}

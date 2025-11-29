module.exports.handler = async (...args) => {
const mod = await import('./_lib/redeem-single.mjs')
  return mod.handler(...args)
}

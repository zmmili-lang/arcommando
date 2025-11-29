module.exports.handler = async (...args) => {
const mod = await import('./_lib/players-update.mjs')
  return mod.handler(...args)
}

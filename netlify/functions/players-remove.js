module.exports.handler = async (...args) => {
const mod = await import('./_lib/players-remove.mjs')
  return mod.handler(...args)
}

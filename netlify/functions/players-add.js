module.exports.handler = async (...args) => {
const mod = await import('./_lib/players-add.mjs')
  return mod.handler(...args)
}

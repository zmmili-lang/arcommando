module.exports.handler = async (...args) => {
const mod = await import('./_lib/codes-remove.mjs')
  return mod.handler(...args)
}

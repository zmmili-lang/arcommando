module.exports.handler = async (...args) => {
const mod = await import('./_lib/codes-add.mjs')
  return mod.handler(...args)
}

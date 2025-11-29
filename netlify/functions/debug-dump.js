module.exports.handler = async (...args) => {
const mod = await import('./_lib/debug-dump.mjs')
  return mod.handler(...args)
}

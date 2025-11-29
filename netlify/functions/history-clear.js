module.exports.handler = async (...args) => {
const mod = await import('./_lib/history-clear.mjs')
  return mod.handler(...args)
}

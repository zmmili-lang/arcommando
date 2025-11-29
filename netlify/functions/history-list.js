module.exports.handler = async (...args) => {
const mod = await import('./_lib/history-list.mjs')
  return mod.handler(...args)
}

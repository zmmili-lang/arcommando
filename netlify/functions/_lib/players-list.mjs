import { cors, ensureSchema, getSql, requireAdmin } from './_utils.js'

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return cors({})
    const auth = requireAdmin(event)
    if (!auth.ok) return auth.res
    
    await ensureSchema()
    const sql = getSql()
    
    // Use COALESCE to handle NULL values instead of NULLS LAST for better compatibility
    const rows = await sql`
      SELECT id, nickname, avatar_image, added_at, last_redeemed_at 
      FROM players 
      ORDER BY COALESCE(added_at, 0) DESC, id
    `
    
    const players = rows.map(r => ({ 
      id: r.id, 
      nickname: r.nickname || '', 
      avatar_image: r.avatar_image || '', 
      addedAt: r.added_at ? Number(r.added_at) : null, 
      lastRedeemedAt: r.last_redeemed_at ? Number(r.last_redeemed_at) : null 
    }))
    
    return cors({ players })
  } catch (error) {
    console.error('players-list error:', error)
    return cors({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500)
  }
}

#!/usr/bin/env node
/**
 * Helper script to create .env file for local development
 * Usage: node setup-env.js
 */

import { writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '.env')

if (existsSync(envPath)) {
    console.log('✅ .env file already exists at:', envPath)
    console.log('   If you need to update it, edit it manually.')
    process.exit(0)
}

console.log('📝 Creating .env file...')
console.log('')
console.log('Please provide your DATABASE_URL.')
console.log('You can find it in:')
console.log('  - Netlify Dashboard → Site Settings → Environment Variables')
console.log('  - Neon Dashboard → Connection Details')
console.log('')

// For now, create a template
const envTemplate = `# Database Connection
# Get this from Netlify Dashboard → Settings → Environment Variables
# Or from Neon Dashboard → Connection Details
DATABASE_URL=postgresql://[user]:[password]@[host]/[database]?sslmode=require

# Alternative names that Netlify Functions will check:
# NETLIFY_DATABASE_URL
# NETLIFY_DATABASE_URL_UNPOOLED
# NEON_DATABASE_URL
`

writeFileSync(envPath, envTemplate)
console.log('✅ Created .env file at:', envPath)
console.log('')
console.log('⚠️  IMPORTANT: Edit .env and replace [user], [password], [host], [database]')
console.log('   with your actual database connection string.')
console.log('')
console.log('After editing, restart your Netlify dev server:')
console.log('   npm run netlify')


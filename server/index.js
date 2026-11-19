// Entry point for the ERITAS container.
// Env: DATABASE_URL (PostgreSQL), PGSCHEMA (default field_team), DATA_DIR,
// DIST_DIR, PORT, and on first start SUPERADMIN_USERNAME + SUPERADMIN_PASSWORD
// to create the first Super Admin (only when there are no users yet).

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { makeDb } from './db.js'
import { createApp } from './app.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const env = process.env

const DATABASE_URL = env.DATABASE_URL || env.database_url
if (!DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1) }

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: env.PGSSL === '1' ? { rejectUnauthorized: env.PGSSL_VERIFY !== '0' } : undefined,
})
const db = makeDb(pool)
await db.migrate()

if ((await db.countUsers()) === 0) {
  const username = String(env.SUPERADMIN_USERNAME || '').trim().toLowerCase()
  const password = env.SUPERADMIN_PASSWORD || ''
  if (username && password.length >= 8) {
    await db.createUser({ username, name: 'Super Admin', password, role: 'superadmin' })
    console.log(`Created the first Super Admin: ${username}. Remove SUPERADMIN_PASSWORD from the environment now.`)
  } else {
    console.warn('No users yet: set SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD (8+ characters) and restart.')
  }
}

setInterval(() => db.purgeExpired().catch(() => {}), 6 * 3600e3)

const app = createApp({
  db,
  dataDir: env.DATA_DIR || path.join(here, '..', 'data'),
  distDir: env.DIST_DIR || path.join(here, '..', 'dist'),
})
const port = Number(env.PORT) || 80
app.listen(port, () => console.log(`Field Team Dashboard listening on ${port}`))

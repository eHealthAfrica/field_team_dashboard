// Recovery tool, run inside the container when a Super Admin is locked out:
//   NEW_PASSWORD='...' node manage.js set-password <username>
//   NEW_PASSWORD='...' node manage.js create-superadmin <username>
import pg from 'pg'
import { makeDb } from './db.js'

const [cmd, rawName] = process.argv.slice(2)
const username = String(rawName || '').trim().toLowerCase()
const password = process.env.NEW_PASSWORD || ''
if (!['set-password', 'create-superadmin'].includes(cmd) || !username || password.length < 8) {
  console.error("Usage: NEW_PASSWORD='8+ characters' node manage.js set-password|create-superadmin <username>")
  process.exit(1)
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: process.env.PGSSL_VERIFY !== '0' } : undefined })
const db = makeDb(pool)
await db.migrate()
const user = (await db.listUsers()).find(u => u.username === username)
if (cmd === 'set-password') {
  if (!user) { console.error('No such user'); process.exit(1) }
  await db.updateUser(user.id, { password, active: true })
  await db.deleteSessionsFor(user.id)
  console.log(`Password reset for ${username}`)
} else {
  if (user) { console.error('That username already exists - use set-password'); process.exit(1) }
  await db.createUser({ username, name: 'Super Admin', password, role: 'superadmin' })
  console.log(`Created Super Admin ${username}`)
}
await pool.end()

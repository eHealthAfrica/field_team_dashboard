// User accounts, roles and sessions in PostgreSQL. Raw SQL, no ORM.
// Tables live in their own schema (PGSCHEMA, default "field_team") so the
// app can share a database with other ERITAS apps.

import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'

export const ROLES = {
  sc: 'State Coordinator',          // one state
  supervisor: 'Senior Supervisor',  // the states assigned to them
  admin: 'Admin',                   // all states
  superadmin: 'Super Admin',        // all states + manages users
}
const SCOPED = new Set(['sc', 'supervisor'])
export const isScoped = role => SCOPED.has(role)

const ident = s => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`Invalid schema name: ${s}`)
  return s
}
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex')

export function makeDb(pool, { schema = process.env.PGSCHEMA || 'field_team', sessionHours = Number(process.env.SESSION_HOURS) || 24 * 7 } = {}) {
  const S = ident(schema)
  const U = `${S}.users`, SS = `${S}.sessions`
  const q = (text, params) => pool.query(text, params)

  const toUser = r => r && ({
    id: r.id, username: r.username, name: r.name, role: r.role,
    states: r.states ? r.states.split('|').filter(Boolean) : [],
    active: r.active, createdAt: r.created_at, lastLogin: r.last_login,
  })
  const COLS = 'id, username, name, role, states, active, created_at, last_login'

  return {
    async migrate() {
      if (S !== 'public') await q(`CREATE SCHEMA IF NOT EXISTS ${S}`)
      await q(`CREATE TABLE IF NOT EXISTS ${U} (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        states TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login TIMESTAMPTZ
      )`)
      await q(`CREATE TABLE IF NOT EXISTS ${SS} (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`)
    },

    async countUsers() {
      const { rows } = await q(`SELECT COUNT(*) AS n FROM ${U}`)
      return Number(rows[0].n)
    },
    async listUsers() {
      const { rows } = await q(`SELECT ${COLS} FROM ${U} ORDER BY username`)
      return rows.map(toUser)
    },
    async getUser(id) {
      const { rows } = await q(`SELECT ${COLS} FROM ${U} WHERE id = $1`, [id])
      return toUser(rows[0])
    },
    async createUser({ username, name = '', password, role, states = [] }) {
      const hash = await bcrypt.hash(password, 10)
      const { rows } = await q(
        `INSERT INTO ${U} (username, name, password_hash, role, states) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
        [username, name, hash, role, states.join('|')])
      return toUser(rows[0])
    },
    async updateUser(id, { name, role, states, active, password }) {
      const sets = [], vals = []
      const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`) }
      if (name !== undefined) add('name', name)
      if (role !== undefined) add('role', role)
      if (states !== undefined) add('states', states.join('|'))
      if (active !== undefined) add('active', active)
      if (password !== undefined) add('password_hash', await bcrypt.hash(password, 10))
      if (!sets.length) return this.getUser(id)
      vals.push(id)
      const { rows } = await q(`UPDATE ${U} SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING ${COLS}`, vals)
      return toUser(rows[0])
    },
    async deleteUser(id) {
      await q(`DELETE FROM ${SS} WHERE user_id = $1`, [id])
      await q(`DELETE FROM ${U} WHERE id = $1`, [id])
    },

    // Returns the user when the username/password match an active account.
    async checkPassword(username, password) {
      const { rows } = await q(`SELECT ${COLS}, password_hash FROM ${U} WHERE username = $1`, [username])
      const r = rows[0]
      // compare against a dummy hash when the user is unknown, so timing doesn't reveal usernames
      const ok = await bcrypt.compare(password, r ? r.password_hash : DUMMY_HASH)
      if (!r || !ok || !r.active) return null
      await q(`UPDATE ${U} SET last_login = NOW() WHERE id = $1`, [r.id])
      return toUser(r)
    },

    async createSession(userId) {
      const token = crypto.randomBytes(32).toString('base64url')
      const expires = new Date(Date.now() + sessionHours * 3600e3)
      await q(`INSERT INTO ${SS} (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [sha256(token), userId, expires])
      return { token, expires }
    },
    async userForSession(token) {
      if (!token) return null
      const { rows } = await q(
        `SELECT u.id, u.username, u.name, u.role, u.states, u.active, u.created_at, u.last_login, s.expires_at
           FROM ${SS} s JOIN ${U} u ON u.id = s.user_id WHERE s.token_hash = $1`, [sha256(token)])
      const r = rows[0]
      if (!r || !r.active || new Date(r.expires_at) < new Date()) return null
      return toUser(r)
    },
    async deleteSession(token) {
      if (token) await q(`DELETE FROM ${SS} WHERE token_hash = $1`, [sha256(token)])
    },
    async deleteSessionsFor(userId) {
      await q(`DELETE FROM ${SS} WHERE user_id = $1`, [userId])
    },
    async purgeExpired() {
      await q(`DELETE FROM ${SS} WHERE expires_at < NOW()`)
    },
  }
}

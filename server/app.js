// Express app: login, role-scoped data API, user management, and the built
// dashboard. Data is filtered on the server, so a State Coordinator's browser
// never receives other states' check-ins - clearing a filter shows nothing extra.

import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { ROLES, isScoped } from './db.js'

const COOKIE = 'ftd_session'
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/
const MIN_PASSWORD = 8

// ------------------------------------------------------------------ data files

function makeDataStore(dataDir) {
  const cache = {}
  const read = name => {
    const file = path.join(dataDir, name)
    let stat
    try { stat = fs.statSync(file) } catch { return null }
    const hit = cache[name]
    if (hit && hit.mtime === stat.mtimeMs) return hit.json
    const json = JSON.parse(fs.readFileSync(file, 'utf-8'))
    cache[name] = { mtime: stat.mtimeMs, json }
    return json
  }
  return {
    // Everything the user's role allows them to see.
    forUser(user) {
      const data = read('data.json') || { rows: [] }
      const roster = read('roster.json') || { staff: [] }
      const allowed = isScoped(user.role) ? new Set(user.states) : null
      const keep = x => !allowed || allowed.has(x.state)
      return {
        fetched_at: data.fetched_at || roster.fetched_at || '',
        rows: (data.rows || []).filter(keep),
        staff: (roster.staff || []).filter(keep),
      }
    },
    states() {
      const roster = read('roster.json') || { staff: [] }
      return [...new Set((roster.staff || []).map(s => s.state).filter(Boolean))].sort()
    },
  }
}

// ------------------------------------------------------------------ helpers

const parseCookies = header => Object.fromEntries((header || '').split(';').map(c => c.trim().split('=')).filter(([k, v]) => k && v)
  .map(([k, v]) => [k, decodeURIComponent(v)]))

// Brute-force guard: 10 failed logins per IP (or per username) in 15 minutes.
function makeLimiter({ max = 10, windowMs = 15 * 60e3 } = {}) {
  const hits = new Map()
  const live = k => { const h = hits.get(k); if (h && h.until < Date.now()) { hits.delete(k); return null } return h }
  return {
    blocked: keys => keys.some(k => (live(k)?.n || 0) >= max),
    fail: keys => keys.forEach(k => { const h = live(k) || { n: 0, until: Date.now() + windowMs }; h.n++; hits.set(k, h) }),
    clear: keys => keys.forEach(k => hits.delete(k)),
  }
}

const publicUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role, roleLabel: ROLES[u.role], states: u.states })

// ------------------------------------------------------------------ app

export function createApp({ db, dataDir, distDir, secureCookies = process.env.COOKIE_SECURE !== '0' }) {
  const app = express()
  const data = makeDataStore(dataDir)
  const limiter = makeLimiter()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)                     // ERITAS terminates HTTPS in front of the container
  app.use(express.json({ limit: '20kb' }))
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' })
    next()
  })

  const setCookie = (res, token, expires) => res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/', expires,
  })

  // Who is calling (or null)
  app.use(async (req, res, next) => {
    try {
      req.token = parseCookies(req.headers.cookie)[COOKIE]
      req.user = await db.userForSession(req.token)
      next()
    } catch (e) { next(e) }
  })

  // Changes must be JSON: a cross-site form cannot send that, which blocks CSRF
  // together with the SameSite cookie.
  app.use('/api', (req, res, next) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ error: 'Send JSON' })
    }
    next()
  })

  const needLogin = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in' }))
  const needSuper = (req, res, next) => (req.user?.role === 'superadmin' ? next() : res.status(403).json({ error: 'Super Admin only' }))
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

  // ---- session
  app.post('/api/login', wrap(async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const keys = [`ip:${req.ip}`, `u:${username}`]
    if (limiter.blocked(keys)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' })
    const user = username && password ? await db.checkPassword(username, password) : null
    if (!user) { limiter.fail(keys); return res.status(401).json({ error: 'Wrong username or password' }) }
    limiter.clear(keys)
    const { token, expires } = await db.createSession(user.id)
    setCookie(res, token, expires)
    res.json({ user: publicUser(user) })
  }))

  app.post('/api/logout', wrap(async (req, res) => {
    await db.deleteSession(req.token)
    res.clearCookie(COOKIE, { path: '/' })
    res.json({ ok: true })
  }))

  app.get('/api/me', needLogin, (req, res) => res.json({ user: publicUser(req.user) }))

  app.post('/api/me/password', needLogin, wrap(async (req, res) => {
    const { current, next: pw } = req.body || {}
    if (!(await db.checkPassword(req.user.username, String(current || '')))) return res.status(400).json({ error: 'Current password is wrong' })
    if (String(pw || '').length < MIN_PASSWORD) return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD} characters` })
    await db.updateUser(req.user.id, { password: String(pw) })
    await db.deleteSessionsFor(req.user.id)       // sign out everywhere else
    const { token, expires } = await db.createSession(req.user.id)
    setCookie(res, token, expires)
    res.json({ ok: true })
  }))

  // ---- data (scoped by role)
  app.get('/api/data', needLogin, (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ ...data.forUser(req.user), scope: isScoped(req.user.role) ? req.user.states : null })
  })

  // ---- user management (Super Admin)
  const validate = (body, { partial = false } = {}) => {
    const out = {}
    if (!partial || body.username !== undefined) {
      const u = String(body.username || '').trim().toLowerCase()
      if (!USERNAME_RE.test(u)) return { error: 'Username: 3-40 characters, letters, numbers, dot, dash or underscore' }
      out.username = u
    }
    if (body.name !== undefined) out.name = String(body.name).trim().slice(0, 120)
    if (!partial || body.password !== undefined) {
      if (String(body.password || '').length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters` }
      out.password = String(body.password)
    }
    if (!partial || body.role !== undefined) {
      if (!ROLES[body.role]) return { error: 'Choose a role' }
      out.role = body.role
    }
    if (body.active !== undefined) out.active = !!body.active
    if (body.states !== undefined || !partial) {
      const known = new Set(data.states())
      const states = [...new Set((Array.isArray(body.states) ? body.states : []).map(String))]
      if (known.size && states.some(s => !known.has(s))) return { error: 'Unknown state' }
      out.states = states
    }
    return { value: out }
  }
  const checkScope = (role, states) => {
    if (role === 'sc' && states.length !== 1) return 'A State Coordinator needs exactly one state'
    if (role === 'supervisor' && states.length < 1) return 'A Senior Supervisor needs at least one state'
    return null
  }

  app.get('/api/users', needLogin, needSuper, wrap(async (req, res) => {
    res.json({ users: await db.listUsers(), states: data.states(), roles: ROLES })
  }))

  app.post('/api/users', needLogin, needSuper, wrap(async (req, res) => {
    const { value, error } = validate(req.body || {})
    if (error) return res.status(400).json({ error })
    if (!isScoped(value.role)) value.states = []
    const scopeErr = checkScope(value.role, value.states)
    if (scopeErr) return res.status(400).json({ error: scopeErr })
    try {
      res.status(201).json({ user: await db.createUser(value) })
    } catch (e) {
      if (String(e.code) === '23505' || /unique|duplicate/i.test(e.message)) return res.status(409).json({ error: 'That username is taken' })
      throw e
    }
  }))

  app.patch('/api/users/:id', needLogin, needSuper, wrap(async (req, res) => {
    const id = Number(req.params.id)
    const target = await db.getUser(id)
    if (!target) return res.status(404).json({ error: 'User not found' })
    const body = { ...(req.body || {}) }
    delete body.username                           // usernames don't change; create a new user instead
    const { value, error } = validate(body, { partial: true })
    if (error) return res.status(400).json({ error })
    const self = id === req.user.id
    if (self && (value.active === false || (value.role && value.role !== 'superadmin'))) {
      return res.status(400).json({ error: 'You cannot deactivate yourself or remove your own Super Admin role' })
    }
    const role = value.role || target.role
    if (!isScoped(role)) value.states = []
    else if (value.states === undefined) value.states = target.states
    const scopeErr = checkScope(role, value.states)
    if (scopeErr) return res.status(400).json({ error: scopeErr })
    const user = await db.updateUser(id, value)
    // Role, scope, password or status changed: end their current sessions
    if (value.password || value.active === false || value.role || body.states !== undefined) {
      if (!self) await db.deleteSessionsFor(id)
    }
    res.json({ user })
  }))

  app.delete('/api/users/:id', needLogin, needSuper, wrap(async (req, res) => {
    const id = Number(req.params.id)
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself' })
    await db.deleteUser(id)
    res.json({ ok: true })
  }))

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

  // ---- the dashboard itself (the app shell holds no data)
  if (distDir && fs.existsSync(distDir)) {
    // Never serve data files directly - data only comes through /api/data after sign-in
    app.use('/data', (req, res) => res.status(404).end())
    app.use((req, res, next) => (/\.json$/i.test(req.path) ? res.status(404).end() : next()))
    app.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' }))
    app.use(express.static(distDir, { index: false, maxAge: 0 }))
    app.get('*', (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(distDir, 'index.html')) })
  }

  app.use((err, req, res, next) => {             // eslint-disable-line no-unused-vars
    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  })

  return app
}

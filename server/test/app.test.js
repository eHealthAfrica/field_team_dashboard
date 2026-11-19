// End-to-end API tests against an in-memory PostgreSQL (pg-mem).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { newDb } from 'pg-mem'
import { makeDb } from '../db.js'
import { createApp } from '../app.js'

let server, base, db
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftd-'))

before(async () => {
  fs.writeFileSync(path.join(dataDir, 'data.json'), JSON.stringify({
    fetched_at: 'now',
    rows: [{ id: 1, state: 'Kano' }, { id: 2, state: 'Kano' }, { id: 3, state: 'Borno' }, { id: 4, state: 'Yobe' }],
  }))
  fs.writeFileSync(path.join(dataDir, 'roster.json'), JSON.stringify({
    staff: [{ id: 'a', state: 'Kano' }, { id: 'b', state: 'Borno' }, { id: 'c', state: 'Yobe' }],
  }))
  const { Pool } = newDb().adapters.createPg()
  db = makeDb(new Pool(), { schema: 'public' })
  await db.migrate()
  await db.createUser({ username: 'boss', password: 'boss-pass-1', role: 'superadmin' })
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftd-dist-'))
  fs.writeFileSync(path.join(distDir, 'index.html'), '<html>shell</html>')
  fs.mkdirSync(path.join(distDir, 'data'))
  fs.writeFileSync(path.join(distDir, 'data', 'data.json'), '{"rows":[1]}')
  const app = createApp({ db, dataDir, distDir, secureCookies: false })
  await new Promise(r => { server = app.listen(0, r) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

// tiny client that keeps its own cookie
const client = () => {
  let cookie = ''
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  return { call, login: (username, password) => call('POST', '/api/login', { username, password }) }
}

test('data needs a login', async () => {
  const r = await client().call('GET', '/api/data')
  assert.equal(r.status, 401)
})

test('wrong password is refused', async () => {
  const r = await client().login('boss', 'nope-nope')
  assert.equal(r.status, 401)
})

test('super admin sees all states and can create scoped users', async () => {
  const c = client()
  assert.equal((await c.login('BOSS ', 'boss-pass-1')).status, 200)
  assert.equal((await c.call('GET', '/api/data')).body.rows.length, 4)

  const sc = await c.call('POST', '/api/users', { username: 'kano.sc', name: 'Kano SC', password: 'kano-pass-1', role: 'sc', states: ['Kano'] })
  assert.equal(sc.status, 201)
  assert.equal((await c.call('POST', '/api/users', { username: 'kano.sc', password: 'kano-pass-1', role: 'sc', states: ['Kano'] })).status, 409)
  assert.equal((await c.call('POST', '/api/users', { username: 'x.sc', password: 'xxxx-pass-1', role: 'sc', states: ['Kano', 'Yobe'] })).status, 400)
  assert.equal((await c.call('POST', '/api/users', { username: 'y.sc', password: 'yyyy-pass-1', role: 'sc', states: ['Atlantis'] })).status, 400)
  assert.equal((await c.call('POST', '/api/users', { username: 'sup', password: 'supe-pass-1', role: 'supervisor', states: ['Borno', 'Yobe'] })).status, 201)
  assert.equal((await c.call('POST', '/api/users', { username: 'adm', password: 'admi-pass-1', role: 'admin', states: ['Kano'] })).status, 201)
})

test('state coordinator only receives their own state', async () => {
  const c = client()
  assert.equal((await c.login('kano.sc', 'kano-pass-1')).status, 200)
  const d = (await c.call('GET', '/api/data')).body
  assert.deepEqual(d.rows.map(r => r.state), ['Kano', 'Kano'])
  assert.deepEqual(d.staff.map(s => s.state), ['Kano'])
  assert.deepEqual(d.scope, ['Kano'])
  assert.equal((await c.call('GET', '/api/users')).status, 403)
})

test('senior supervisor receives their assigned states; admin gets all', async () => {
  const s = client(); await s.login('sup', 'supe-pass-1')
  assert.deepEqual((await s.call('GET', '/api/data')).body.rows.map(r => r.state).sort(), ['Borno', 'Yobe'])
  const a = client(); await a.login('adm', 'admi-pass-1')
  const d = (await a.call('GET', '/api/data')).body
  assert.equal(d.rows.length, 4); assert.equal(d.scope, null)
  assert.equal((await a.call('GET', '/api/users')).status, 403)
})

test('changing a user signs them out; deactivated users cannot log in', async () => {
  const boss = client(); await boss.login('boss', 'boss-pass-1')
  const sc = client(); await sc.login('kano.sc', 'kano-pass-1')
  const id = (await boss.call('GET', '/api/users')).body.users.find(u => u.username === 'kano.sc').id
  assert.equal((await boss.call('PATCH', `/api/users/${id}`, { states: ['Borno'] })).status, 200)
  assert.equal((await sc.call('GET', '/api/data')).status, 401)
  await sc.login('kano.sc', 'kano-pass-1')
  assert.deepEqual((await sc.call('GET', '/api/data')).body.rows.map(r => r.state), ['Borno'])
  await boss.call('PATCH', `/api/users/${id}`, { active: false })
  assert.equal((await client().login('kano.sc', 'kano-pass-1')).status, 401)
})

test('super admin cannot lock themselves out', async () => {
  const boss = client(); await boss.login('boss', 'boss-pass-1')
  const me = (await boss.call('GET', '/api/me')).body.user
  assert.equal((await boss.call('PATCH', `/api/users/${me.id}`, { role: 'admin' })).status, 400)
  assert.equal((await boss.call('PATCH', `/api/users/${me.id}`, { active: false })).status, 400)
  assert.equal((await boss.call('DELETE', `/api/users/${me.id}`, {})).status, 400)
})

test('change own password, then logout ends the session', async () => {
  const c = client(); await c.login('sup', 'supe-pass-1')
  assert.equal((await c.call('POST', '/api/me/password', { current: 'wrong', next: 'new-pass-123' })).status, 400)
  assert.equal((await c.call('POST', '/api/me/password', { current: 'supe-pass-1', next: 'new-pass-123' })).status, 200)
  assert.equal((await c.call('GET', '/api/data')).status, 200)
  await c.call('POST', '/api/logout', {})
  assert.equal((await c.call('GET', '/api/data')).status, 401)
  assert.equal((await client().login('sup', 'new-pass-123')).status, 200)
})

test('non-JSON writes are refused (CSRF guard)', async () => {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=boss&password=x' })
  assert.equal(res.status, 415)
})

test('repeated failures are rate limited', async () => {
  const c = client()
  for (let i = 0; i < 10; i++) await c.login('adm', 'bad-password')
  assert.equal((await c.login('adm', 'admi-pass-1')).status, 429)
})

test('data files are never served as static files', async () => {
  for (const p of ['/data/data.json', '/data/roster.json', '/data.json']) {
    const res = await fetch(base + p)
    assert.equal(res.status, 404, p)
  }
  const shell = await fetch(`${base}/attendance`)
  assert.equal(shell.status, 200)
  assert.match(await shell.text(), /shell/)
})

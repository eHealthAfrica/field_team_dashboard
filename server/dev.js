// Local try-out only: runs the login version with an in-memory database
// (nothing is saved). Build first:  VITE_AUTH=1 BASE_PATH=/ npx vite build --outDir dist-auth
// then:  node server/dev.js   and open http://localhost:4180
// Demo accounts (local only): admin / local-admin-1 (Super Admin), kano.sc / local-kano-1 (Kano only)

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { newDb } from 'pg-mem'
import { makeDb } from './db.js'
import { createApp } from './app.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const { Pool } = newDb().adapters.createPg()
const db = makeDb(new Pool(), { schema: 'public' })
await db.migrate()
await db.createUser({ username: 'admin', name: 'Local Super Admin', password: 'local-admin-1', role: 'superadmin' })
await db.createUser({ username: 'kano.sc', name: 'Kano State Coordinator', password: 'local-kano-1', role: 'sc', states: ['Kano'] })

const app = createApp({ db, dataDir: path.join(here, '..', 'data'), distDir: path.join(here, '..', 'dist-auth'), secureCookies: false })
const port = Number(process.env.PORT) || 4180
app.listen(port, () => console.log(`Local login version on http://localhost:${port}`))

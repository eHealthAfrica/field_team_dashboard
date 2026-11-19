import { useEffect, useState } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import logo from '../assets/eha-logo-white.png'
import { api, SIGNED_OUT } from '../auth'

// Shows the sign-in page until the server confirms a session, then the dashboard.
export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined)     // undefined = checking, null = signed out

  useEffect(() => {
    api('GET', '/api/me').then(r => setUser(r.user)).catch(() => setUser(null))
    const out = () => setUser(null)
    window.addEventListener(SIGNED_OUT, out)
    return () => window.removeEventListener(SIGNED_OUT, out)
  }, [])

  const signOut = async () => { try { await api('POST', '/api/logout', {}) } catch { /* already out */ } setUser(null) }

  if (user === undefined) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}><Loader2 className="animate-spin" size={22} /></div>
  }
  if (!user) return <Login onSignedIn={setUser} />
  return children({ user, signOut })
}

function Login({ onSignedIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async e => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const r = await api('POST', '/api/login', { username, password })
      onSignedIn(r.user)
    } catch (e2) {
      setErr(e2.message); setPassword('')
    } finally { setBusy(false) }
  }

  const input = { width: '100%', padding: '9px 11px', fontSize: 14, border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      background: 'linear-gradient(160deg, #0090fc 0%, #0079d6 55%, #0064b3 100%)' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <img src={logo} alt="eHealth Africa" style={{ height: 40, display: 'block', margin: '0 auto 18px' }} />
        <form onSubmit={submit} className="card" style={{ padding: '24px 24px 20px', boxShadow: '0 24px 64px rgba(0,40,80,.35)', borderTop: '4px solid var(--eha-lime)' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Field Team Dashboard</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '3px 0 18px' }}>Sign in with the username and password you were given.</div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>Username
            <input style={{ ...input, marginTop: 5, marginBottom: 12 }} autoFocus autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>Password
            <input type="password" style={{ ...input, marginTop: 5 }} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
          {err && <div role="alert" style={{ fontSize: 12.5, color: 'var(--crit-ink)', marginTop: 10 }}>{err}</div>}
          <button className="btn-primary" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center', marginTop: 16, padding: '9px 0', fontSize: 14 }}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />} Sign in
          </button>
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 12, textAlign: 'center' }}>Forgot your password? Ask your dashboard administrator.</div>
        </form>
      </div>
    </div>
  )
}

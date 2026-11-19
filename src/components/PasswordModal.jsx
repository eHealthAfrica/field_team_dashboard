import { useState } from 'react'
import { X, Loader2, CheckCircle2 } from 'lucide-react'
import { api } from '../auth'

// Lets a signed-in user change their own password.
export default function PasswordModal({ onClose }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(false)

  const save = async e => {
    e.preventDefault()
    if (next !== confirm) { setErr('The new passwords do not match'); return }
    setBusy(true); setErr(null)
    try { await api('POST', '/api/me/password', { current, next }); setDone(true) } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  const label = { fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }
  const input = { width: '100%', boxSizing: 'border-box', marginBottom: 10 }
  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,32,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={save} className="card" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Change password</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '14px 18px' }}>
          {done
            ? <div style={{ fontSize: 13, color: 'var(--good-ink)', display: 'flex', gap: 6, alignItems: 'center' }}><CheckCircle2 size={15} /> Password changed. Other devices have been signed out.</div>
            : <>
                <label style={label}>Current password</label>
                <input type="password" className="filter-select" style={input} value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required />
                <label style={label}>New password (8+ characters)</label>
                <input type="password" className="filter-select" style={input} value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
                <label style={label}>Repeat new password</label>
                <input type="password" className="filter-select" style={input} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
                {err && <div role="alert" style={{ fontSize: 12.5, color: 'var(--crit-ink)' }}>{err}</div>}
              </>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button>
          {!done && <button type="submit" className="btn-primary" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} Change password</button>}
        </div>
      </form>
    </div>
  )
}

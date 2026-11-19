import { useEffect, useMemo, useState } from 'react'
import { UserPlus, Pencil, Trash2, Loader2, X, KeyRound } from 'lucide-react'
import { api } from '../auth'

const SCOPED = new Set(['sc', 'supervisor'])
const fdt = v => (v ? new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never')

// Super Admin only: create users with a username and password, set their role
// and states, reset passwords, deactivate or delete.
export default function Users({ me }) {
  const [list, setList] = useState(null)
  const [err, setErr] = useState(null)
  const [edit, setEdit] = useState(null)           // null | 'new' | user

  const load = () => api('GET', '/api/users').then(setList).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])

  if (err) return <div className="card" style={{ padding: 16, color: 'var(--crit-ink)' }}>{err}</div>
  if (!list) return <div className="card" style={{ padding: 16 }}><Loader2 size={16} className="animate-spin" /></div>

  const { users, states, roles } = list
  const remove = async u => {
    if (!window.confirm(`Delete ${u.username}? They will no longer be able to sign in.`)) return
    try { await api('DELETE', `/api/users/${u.id}`, {}); load() } catch (e) { window.alert(e.message) }
  }
  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)' }
  const td = { padding: '8px 10px', fontSize: 12.5, borderBottom: '1px solid var(--line-soft, #f0f1f3)', verticalAlign: 'top' }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{users.length} user{users.length === 1 ? '' : 's'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>State Coordinators see one state, Senior Supervisors their assigned states, Admins and Super Admins all states. Only Super Admins manage users.</div>
        </div>
        <button className="btn-primary" onClick={() => setEdit('new')}><UserPlus size={14} /> Add user</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Username', 'Name', 'Role', 'States', 'Status', 'Last sign-in', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                <td style={{ ...td, fontWeight: 600 }}>{u.username}{u.id === me.id && <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}> (you)</span>}</td>
                <td style={td}>{u.name || '-'}</td>
                <td style={td}>{roles[u.role]}</td>
                <td style={td}>{SCOPED.has(u.role) ? u.states.join(', ') : 'All states'}</td>
                <td style={td}>{u.active ? 'Active' : 'Deactivated'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{fdt(u.lastLogin)}</td>
                <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button className="btn-secondary" style={{ padding: '3px 8px' }} onClick={() => setEdit(u)} title="Edit"><Pencil size={13} /></button>{' '}
                  {u.id !== me.id && <button className="btn-secondary" style={{ padding: '3px 8px' }} onClick={() => remove(u)} title="Delete"><Trash2 size={13} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <UserForm user={edit === 'new' ? null : edit} me={me} states={states} roles={roles} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function UserForm({ user, me, states, roles, onClose, onSaved }) {
  const isNew = !user
  const self = user?.id === me.id
  const [f, setF] = useState({
    username: user?.username || '', name: user?.name || '', password: '',
    role: user?.role || 'sc', states: user?.states || [], active: user?.active ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const scoped = SCOPED.has(f.role)
  const toggleState = s => set('states', f.role === 'sc' ? [s] : f.states.includes(s) ? f.states.filter(x => x !== s) : [...f.states, s])
  const suggest = useMemo(() => () => {
    const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const r = crypto.getRandomValues(new Uint32Array(12))
    set('password', Array.from(r, x => abc[x % abc.length]).join(''))
  }, [])

  const save = async e => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const body = { name: f.name, role: f.role, states: scoped ? f.states : [], active: f.active }
      if (isNew) await api('POST', '/api/users', { ...body, username: f.username, password: f.password })
      else await api('PATCH', `/api/users/${user.id}`, { ...body, ...(f.password ? { password: f.password } : {}) })
      onSaved()
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  const label = { fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }
  const input = { width: '100%', boxSizing: 'border-box' }
  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,32,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={save} className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{isNew ? 'Add user' : `Edit ${user.username}`}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>Username</label>
              <input className="filter-select" style={input} value={f.username} disabled={!isNew} onChange={e => set('username', e.target.value)} placeholder="e.g. kano.sc" required={isNew} />
            </div>
            <div>
              <label style={label}>Name (optional)</label>
              <input className="filter-select" style={input} value={f.name} onChange={e => set('name', e.target.value)} />
            </div>
          </div>
          <div>
            <label style={label}>{isNew ? 'Password' : 'New password (leave blank to keep the current one)'}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="filter-select" style={input} value={f.password} onChange={e => set('password', e.target.value)} minLength={8} required={isNew} autoComplete="new-password" placeholder="At least 8 characters" />
              <button type="button" className="btn-secondary" onClick={suggest} title="Generate a strong password"><KeyRound size={13} /> Generate</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>Share it with the user privately. They can change it after signing in.</div>
          </div>
          <div>
            <label style={label}>Role</label>
            <select className="filter-select" style={input} value={f.role} disabled={self}
              onChange={e => { const r = e.target.value; setF(p => ({ ...p, role: r, states: r === 'sc' ? p.states.slice(0, 1) : p.states })) }}>
              {Object.entries(roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {scoped && (
            <div>
              <label style={label}>{f.role === 'sc' ? 'State (one)' : 'States (one or more)'}</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 4 }}>
                {states.map(s => (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                    <input type={f.role === 'sc' ? 'radio' : 'checkbox'} name="states" checked={f.states.includes(s)} onChange={() => toggleState(s)} /> {s}
                  </label>
                ))}
              </div>
            </div>
          )}
          {!isNew && !self && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} /> Active (untick to block sign-in without deleting)
            </label>
          )}
          {err && <div role="alert" style={{ fontSize: 12.5, color: 'var(--crit-ink)' }}>{err}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} {isNew ? 'Create user' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

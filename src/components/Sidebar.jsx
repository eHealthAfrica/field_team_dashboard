import { LayoutDashboard, UserCheck, Package, ShieldCheck, AlertTriangle, ChevronLeft, ChevronRight, Users, LogOut, KeyRound } from 'lucide-react'
import logo from '../assets/eha-logo-white.png'

export const NAV = [
  { id: 'overview',   label: 'Executive summary', short: 'Summary', icon: LayoutDashboard },
  { id: 'attendance', label: 'Attendance',        icon: UserCheck },
  { id: 'outputs',    label: 'Field outputs',     icon: Package },
  { id: 'quality',    label: 'Data quality',      icon: ShieldCheck },
  { id: 'issues',     label: 'Issues',            icon: AlertTriangle },
]

// Super Admins also get the user-management page (login mode only)
export const USERS_NAV = { id: 'users', label: 'Users', icon: Users }

export const SIDEBAR_W = 150
export const SIDEBAR_COLLAPSED = 56

export default function Sidebar({ page, onNavigate, collapsed, onToggle, rosterSize, stateCount, items = NAV, user, onSignOut, onPassword }) {
  return (
    <aside className="no-print" style={{
      position: 'fixed', inset: '0 auto 0 0', width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_W, zIndex: 50,
      background: 'linear-gradient(180deg, #0090fc 0%, #0079d6 55%, #0064b3 100%)',
      display: 'flex', flexDirection: 'column', transition: 'width .25s ease', overflow: 'hidden',
      boxShadow: '2px 0 16px rgba(0, 60, 110, .18)',
      borderRight: '3px solid var(--eha-lime)',  // same lime line as under the header
    }}>
      {/* Logo */}
      <div style={{ height: 62, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? 0 : '0 14px' }}>
        {collapsed
          ? <div style={{ width: 30, height: 30, overflow: 'hidden' }}>
              <img src={logo} alt="eHealth Africa" style={{ height: 30, display: 'block' }} />
            </div>
          : <img src={logo} alt="eHealth Africa" style={{ width: '100%', maxWidth: 118, height: 'auto', display: 'block' }} />}
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,.18)', margin: '0 12px' }} />

      {!collapsed && (
        <div style={{ padding: '14px 16px 6px', fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.75)' }}>
          Field Team
        </div>
      )}

      <nav style={{ flex: 1, padding: collapsed ? '12px 8px' : '0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(({ id, label, short, icon: Icon }) => {
          const active = page === id
          return (
            <button key={id} onClick={() => onNavigate(id)} title={label} aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', fontFamily: 'inherit',
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '10px 0' : '9px 9px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: active ? 'rgba(255,255,255,.2)' : 'transparent',
                boxShadow: active ? 'inset 3px 0 0 var(--eha-lime)' : 'none',
                color: '#fff', fontSize: 12.5, fontWeight: active ? 650 : 500, textAlign: 'left',
                transition: 'background .15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,.1)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <Icon size={15} style={{ flexShrink: 0, opacity: active ? 1 : .85 }} />
              {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{short || label}</span>}
            </button>
          )
        })}
      </nav>

      {user && (
        <div style={{ margin: collapsed ? '0 8px' : '0 10px', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,.18)', display: 'flex', flexDirection: collapsed ? 'column' : 'row', alignItems: 'center', gap: 6 }}>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0, color: '#fff', lineHeight: 1.3 }} title={`${user.username} · ${user.roleLabel}${user.states.length ? ` · ${user.states.join(', ')}` : ''}`}>
              <div style={{ fontSize: 11.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name || user.username}</div>
              <div style={{ fontSize: 10, opacity: .8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.roleLabel}</div>
            </div>
          )}
          {[[KeyRound, 'Change password', onPassword], [LogOut, 'Sign out', onSignOut]].map(([Icon, t, fn]) => (
            <button key={t} onClick={fn} title={t} aria-label={t} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer', flexShrink: 0, background: 'rgba(255,255,255,.16)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={13} />
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: collapsed ? '12px 0' : '10px 12px 14px', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', gap: 8 }}>
        {!collapsed && (
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.85)', lineHeight: 1.35 }}>
            {rosterSize} coordinators<br />{stateCount} states
          </span>
        )}
        <button onClick={onToggle} title={collapsed ? 'Expand menu' : 'Collapse menu'} style={{
          width: 26, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: 'rgba(255,255,255,.16)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>
    </aside>
  )
}

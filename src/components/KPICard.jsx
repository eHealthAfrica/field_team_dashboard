// Compact indicator tile used on the detail pages. `color` sets the small
// status marker only - the number itself always stays in ink.
const MARK = {
  green: 'var(--status-good)', amber: 'var(--status-warning)', red: 'var(--status-critical)',
  blue: 'var(--eha-blue)', teal: 'var(--ink-4)', purple: '#6250d6',
}

export default function KPICard({ label, desc, value, suffix = '', color = 'blue', icon: Icon }) {
  return (
    <div className="card animate-fade-up" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {Icon ? <Icon size={15} style={{ color: MARK[color] || MARK.blue, flexShrink: 0 }} />
              : <span style={{ width: 8, height: 8, borderRadius: 2, background: MARK[color] || MARK.blue }} />}
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 'auto' }}>
        <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {suffix && <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-3)' }}>{suffix}</span>}
      </div>
      {desc && <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.4 }}>{desc}</div>}
    </div>
  )
}

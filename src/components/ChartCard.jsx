export default function ChartCard({ title, desc, children, className = '', action, pad = true, style, fill = false }) {
  return (
    <section className={`card animate-fade-up ${className}`} style={{ overflow: 'hidden', ...(fill ? { display: 'flex', flexDirection: 'column', minHeight: 0 } : {}), ...style }}>
      <div style={{ padding: '10px 14px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 13.5, fontWeight: 650, letterSpacing: '-0.01em', margin: 0, color: 'var(--ink)' }}>{title}</h2>
          {desc && <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '1px 0 0', lineHeight: 1.4 }}>{desc}</p>}
        </div>
        {action && <div className="no-print" style={{ flexShrink: 0 }}>{action}</div>}
      </div>
      {fill
        ? <div style={{ flex: 1, position: 'relative', minHeight: 120 }}>
            <div className="scroll-box" style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: pad ? '4px 14px 8px' : 0 }}>{children}</div>
          </div>
        : <div style={{ padding: pad ? '8px 14px 10px' : '6px 0 0' }}>{children}</div>}
    </section>
  )
}

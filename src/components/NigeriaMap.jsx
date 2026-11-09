import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import geo from '../assets/nigeria-states.json'

// Sequential eHA-blue scale in 10-point bands: darker = higher check-in
// rate. No target is implied (none has been set by eHA). Validated:
// one hue, monotone lightness, visible steps, light end >= 2:1 on white.
export const RATE_BINS = [
  { min: 90, label: '90% +',     fill: '#00446f', text: '#fff' },
  { min: 80, label: '80–89%',    fill: '#0076d0', text: '#fff' },
  { min: 70, label: '70–79%',    fill: '#2ea2fd', text: 'var(--ink)' },
  { min: 0,  label: 'Below 70%', fill: '#6fbdfd', text: 'var(--ink)' },
]
const binFor = v => RATE_BINS.find(b => v >= b.min)
const key = s => s.toLowerCase().replace(/[^a-z]/g, '')

// Small label nudges where the representative point crowds a neighbour.
const NUDGE = {}  // label points are pre-computed poles of inaccessibility

// Bounding box of a set of SVG paths (only M/L/Z commands are used).
function bbox(paths) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  paths.forEach(d => {
    const n = d.match(/-?[\d.]+/g).map(Number)
    for (let i = 0; i < n.length; i += 2) {
      if (n[i] < x0) x0 = n[i]; if (n[i] > x1) x1 = n[i]
      if (n[i + 1] < y0) y0 = n[i + 1]; if (n[i + 1] > y1) y1 = n[i + 1]
    }
  })
  return { x0, y0, x1, y1 }
}

export default function NigeriaMap({ stats, selected, onSelect, metricLabel = 'Reporting rate' }) {
  const [hover, setHover] = useState(null)
  const byKey = Object.fromEntries(stats.map(s => [key(s.state), s]))

  // Whole of Nigeria; non-programme states stay grey for context.
  const view = useMemo(() => `-8 -8 ${geo.w + 16} ${geo.h + 16}`, [])

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={view} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'hidden', margin: '0 auto' }} role="img"
        aria-label={`Map of Nigeria: ${metricLabel.toLowerCase()} by programme state`}>
        {geo.states.map(g => {
          const s = byKey[key(g.name)]
          const bin = s && binFor(s.value)
          const isSel = s && selected === s.state
          return (
            <path key={g.name} d={g.d}
              fill={s ? bin.fill : '#e3e6ea'}
              stroke="#fff" strokeWidth={isSel ? 0 : 1.6} strokeLinejoin="round"
              style={{ cursor: s ? 'pointer' : 'default', transition: 'opacity .15s', opacity: hover && s && hover.state !== s.state ? 0.75 : 1 }}
              onMouseMove={e => s && setHover({ ...s, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
              onClick={() => s && onSelect?.(s.state)}
            />
          )
        })}
        {/* selection outline drawn on top */}
        {geo.states.filter(g => byKey[key(g.name)]?.state === selected).map(g => (
          <path key={`sel-${g.name}`} d={g.d} fill="none" stroke="var(--ink)" strokeWidth="3" pointerEvents="none" />
        ))}
        {geo.states.map(g => {
          const s = byKey[key(g.name)]
          if (!s) return null
          const bin = binFor(s.value)
          const [dx, dy] = NUDGE[key(g.name)] || [0, 0]
          return (
            <g key={`l-${g.name}`} pointerEvents="none" fontFamily="Inter, sans-serif" textAnchor="middle">
              <text x={g.cx + dx} y={g.cy + dy - 2} fontSize="14" fontWeight="500" fill={bin.text}
                stroke={bin.fill} strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">{s.state}</text>
              <text x={g.cx + dx} y={g.cy + dy + 14} fontSize="17" fontWeight="700" fill={bin.text}
                stroke={bin.fill} strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">{s.value}%</text>
            </g>
          )
        })}
      </svg>

      {/* Tooltip rendered on <body> so no panel can clip or cover it;
          flips left/up near the window edges. */}
      {hover && createPortal(
        <div style={{
          position: 'fixed', pointerEvents: 'none', zIndex: 1000,
          left: hover.x + 240 > window.innerWidth ? hover.x - 14 : hover.x + 14,
          top: hover.y + 110 > window.innerHeight ? hover.y - 14 : hover.y + 14,
          transform: `translate(${hover.x + 240 > window.innerWidth ? '-100%' : '0'}, ${hover.y + 110 > window.innerHeight ? '-100%' : '0'})`,
          background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 11px',
          boxShadow: '0 8px 24px rgba(15,23,32,.16)', fontSize: 12, minWidth: 180, fontFamily: 'Inter, sans-serif',
        }}>
          <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 3 }}>{hover.state}</div>
          <div style={{ color: 'var(--ink-2)' }}>{metricLabel}: <strong>{hover.value}%</strong></div>
          {hover.detail && <div style={{ color: 'var(--ink-3)', marginTop: 2 }}>{hover.detail}</div>}
        </div>,
        document.body,
      )}

      {/* Legend: always one line - shrinks rather than wraps */}
      <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 9, alignItems: 'center', marginTop: 2, fontSize: 10, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ color: 'var(--ink-3)' }}>{metricLabel}</span>
        {/* Only bands that appear on the map today, with how many states are in each */}
        {[...RATE_BINS].reverse().map(b => ({ b, n: stats.filter(s => binFor(s.value) === b).length }))
          .filter(({ n }) => n > 0)
          .map(({ b, n }) => (
            <span key={b.label} title={`${n} state${n === 1 ? '' : 's'}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{ width: 11, height: 8, borderRadius: 2, background: b.fill }} />{b.label}
              <span style={{ color: 'var(--ink-3)' }}>({n})</span>
            </span>
          ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{ width: 11, height: 8, borderRadius: 2, background: '#e3e6ea' }} />Not in programme
        </span>
      </div>
    </div>
  )
}

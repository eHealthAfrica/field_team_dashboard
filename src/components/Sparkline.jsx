// Minimal trend line: 2px stroke, faint area, dot on the latest value.
export default function Sparkline({ values, width = 120, height = 36, color = 'var(--eha-blue)', domain }) {
  const v = values.filter(x => x != null)
  if (v.length < 2) return <svg width={width} height={height} aria-hidden="true" />
  const [lo, hi] = domain || [Math.min(...v), Math.max(...v)]
  const span = hi - lo || 1
  const x = i => (i / (values.length - 1)) * (width - 6) + 3
  const y = val => height - 4 - ((val - lo) / span) * (height - 8)
  const pts = values.map((val, i) => (val == null ? null : [x(i), y(val)])).filter(Boolean)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('')
  const area = `${line}L${pts[pts.length - 1][0].toFixed(1)},${height}L${pts[0][0].toFixed(1)},${height}Z`
  const last = pts[pts.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <path d={area} fill={color} opacity="0.08" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={color} stroke="#fff" strokeWidth="1.5" />
    </svg>
  )
}

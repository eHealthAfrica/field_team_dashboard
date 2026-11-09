import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { STATUS, STATUS_ORDER } from '../utils/data'

const axis = { fontSize: 11.5, fill: 'var(--ink-muted)' }
const tooltipStyle = {
  contentStyle: { fontSize: 12, borderRadius: 10, border: '1px solid var(--line)', boxShadow: '0 8px 24px rgba(15,23,32,0.12)', padding: '10px 12px' },
  labelStyle: { fontWeight: 650, color: 'var(--ink)', marginBottom: 4 },
  itemStyle: { color: 'var(--ink-2)', padding: 0 },
}
const legendStyle = { fontSize: 12, color: 'var(--ink-2)', paddingTop: 10 }

export function EmptyChart({ height = 220, text = 'No check-ins in this period' }) {
  return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
      {text}
    </div>
  )
}

// % of expected staff who checked in, per day.
export function ReportingRateChart({ series, height = 220 }) {
  if (!series.some(d => d.staff)) return <EmptyChart height={height} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={series} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="label" tick={axis} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} minTickGap={16} />
        <YAxis domain={[0, 100]} tick={axis} axisLine={false} tickLine={false} unit="%" />
        <Tooltip {...tooltipStyle} cursor={{ stroke: 'var(--axis)' }}
          formatter={(v, _n, p) => [`${v}%  (${p.payload.staff} of ${p.payload.expected})`, 'Checked in']} />
        <Line isAnimationActive={false} type="linear" dataKey="rate" stroke="var(--series-1)" strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: 'var(--series-1)' }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Daily check-ins stacked by perimeter / redeployment status.
export function LocationStackChart({ series, height = 220 }) {
  if (!series.some(d => STATUS_ORDER.some(k => d[k]))) return <EmptyChart height={height} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={series} margin={{ top: 8, right: 12, left: -18, bottom: 0 }} barCategoryGap="25%">
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="label" tick={axis} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} minTickGap={16} />
        <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
        <Legend iconType="square" iconSize={9} wrapperStyle={legendStyle}
          formatter={v => <span style={{ color: 'var(--ink-2)', marginRight: 6 }}>{v}</span>} />
        {STATUS_ORDER.map((k, idx) => (
          <Bar isAnimationActive={false} key={k} dataKey={k} name={STATUS[k].label} stackId="s" fill={STATUS[k].color}
            stroke="#fff" strokeWidth={1}
            radius={idx === STATUS_ORDER.length - 1 ? [4, 4, 0, 0] : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// Check-ins by hour of day.
export function HourChart({ data, height = 200 }) {
  if (!data.some(d => d.n)) return <EmptyChart height={height} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }} barCategoryGap="12%">
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="label" tick={axis} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} interval={1} />
        <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} formatter={v => [v, 'Check-ins']} />
        <Bar isAnimationActive={false} dataKey="n" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Ranked horizontal bars in plain HTML - readable labels at any width.
export function BarList({ items, max, color = 'var(--series-1)', valueFmt = v => v.toLocaleString(), height, labelWidth = 190 }) {
  const m = max ?? Math.max(1, ...items.map(i => i.n))
  return (
    <div className={height ? 'scroll-box' : undefined} style={{ maxHeight: height, overflowY: height ? 'auto' : 'visible', paddingRight: 4 }}>
      {items.map(it => (
        <div key={it.key} title={`${it.label}: ${valueFmt(it.n, it)}`}
          style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5, marginBottom: 7 }}>
          <span style={{ width: labelWidth, flexShrink: 0, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {it.label}
          </span>
          <div style={{ flex: 1, height: 8, background: '#eef0f3', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(it.n / m) * 100}%`, background: it.color || color, borderRadius: 4, transition: 'width .4s' }} />
          </div>
          <span style={{ width: 70, textAlign: 'right', flexShrink: 0, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
            {valueFmt(it.n, it)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function StatusBadge({ status }) {
  const s = STATUS[status]
  if (!s) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap', color: 'var(--ink-2)' }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  )
}

// Rate pill: neutral - no pass/fail colouring, since no target is set.
export function RatePill({ value }) {
  return (
    <span style={{ background: '#f1f3f5', color: 'var(--ink)', fontSize: 12, fontWeight: 650, padding: '2px 9px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>
      {value}%
    </span>
  )
}

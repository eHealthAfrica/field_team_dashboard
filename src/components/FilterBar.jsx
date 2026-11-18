import { Eye, EyeOff } from 'lucide-react'
import { ROLES, fmtDate } from '../utils/data'

const RANGES = [
  { id: 'latest', label: 'Latest day' },
  { id: 'all',    label: 'All time' },
  { id: 'custom', label: 'Custom' },
]

const eyeBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit',
}

export function periodLabel(range) {
  return range.from === range.to ? fmtDate(range.from, true) : `${fmtDate(range.from)} – ${fmtDate(range.to, true)}`
}

// Slim bar shown when the filter panel is hidden: says what is still applied.
export function HiddenFilters({ filters, staff = [], range, onShow }) {
  const coord = filters.coord && filters.coord !== 'all' ? staff.find(s => s.id === filters.coord) : null
  const parts = [
    { latest: 'Latest day', all: 'All time', custom: 'Custom period' }[filters.range] || 'All time',
    filters.state === 'all' ? 'All 15 states' : filters.state,
    filters.role === 'all' ? 'All roles' : `${ROLES[filters.role]}s`,
    ...(coord ? [coord.who] : []),
  ]
  return (
    <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--ink-3)' }}>
      <button style={eyeBtn} onClick={onShow} title="Show filters" aria-label="Show filters">
        <Eye size={15} /> Show filters
      </button>
      <span>{parts.join(' · ')} · <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{periodLabel(range)}</strong></span>
    </div>
  )
}

export default function FilterBar({ filters, onChange, states, staff = [], range, bounds, onHide }) {
  const set = patch => onChange({ ...filters, ...patch })
  const period = periodLabel(range)
  return (
    <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      {/* Eye sits first, in the same spot as "Show filters" when hidden */}
      {onHide && (
        <button style={eyeBtn} onClick={onHide} title="Hide filters" aria-label="Hide filters">
          <EyeOff size={15} /> Hide filters
        </button>
      )}
      <div className="seg" role="group" aria-label="Period">
        {RANGES.map(r => (
          <button key={r.id} aria-pressed={filters.range === r.id} onClick={() => set({ range: r.id })}>{r.label}</button>
        ))}
      </div>

      {filters.range === 'custom' && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="date" className="filter-select" style={{ paddingRight: 10 }} value={filters.from || range.from}
            min={bounds.min} max={bounds.max} onChange={e => set({ from: e.target.value })} />
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>to</span>
          <input type="date" className="filter-select" style={{ paddingRight: 10 }} value={filters.to || range.to}
            min={bounds.min} max={bounds.max} onChange={e => set({ to: e.target.value })} />
        </span>
      )}

      <select className="filter-select" value={filters.state} onChange={e => set({ state: e.target.value, coord: 'all' })} aria-label="State">
        <option value="all">All 15 states</option>
        {states.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <select className="filter-select" value={filters.role} onChange={e => set({ role: e.target.value, coord: 'all' })} aria-label="Role">
        <option value="all">All roles</option>
        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}s</option>)}
      </select>

      {/* One coordinator (LC or SC), shown by post. Narrows every page. */}
      <select className="filter-select" value={filters.coord || 'all'} onChange={e => set({ coord: e.target.value })}
        aria-label="LGA or coordinator" style={{ maxWidth: 240 }}>
        <option value="all">All LGAs / coordinators</option>
        {(() => {
          const list = staff.filter(s => (filters.state === 'all' || s.state === filters.state) && (filters.role === 'all' || s.role === filters.role))
          const byState = {}
          list.forEach(s => { (byState[s.state] = byState[s.state] || []).push(s) })
          return Object.keys(byState).sort().map(st => (
            <optgroup key={st} label={st}>
              {byState[st].sort((a, b) => (a.role === 'sc' ? -1 : 1) - (b.role === 'sc' ? -1 : 1) || a.who.localeCompare(b.who))
                .map(s => <option key={s.id} value={s.id}>{s.who}</option>)}
            </optgroup>
          ))
        })()}
      </select>

      <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-3)' }}>
        Showing <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{period}</strong>
      </span>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { X, FileText, FileType2, Presentation, Loader2, CheckCircle2 } from 'lucide-react'
import { analyseCycle, cycleBounds, cycleName, cyclesInData, downloadReport } from '../utils/monthlyReport'
import { daysBetween } from '../utils/data'

const fd = d => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

const cycleLen = c => { const b = cycleBounds(c); return daysBetween(b.from, b.to).length }

const FORMATS = [
  { id: 'docx', label: 'Word', icon: FileText, primary: true },
  { id: 'pdf', label: 'PDF', icon: FileType2 },
  { id: 'pptx', label: 'PowerPoint', icon: Presentation },
]

// Month-end report download: the PM's "Field Consultants' Check-in & Field
// Performance Report" template, filled from the dashboard data for one
// reporting cycle (24th of the previous month to the 23rd). Word and PDF carry
// the full report; PowerPoint is a summary deck of the same figures.
export default function ReportModal({ rows, staff, fetchedAt, onClose }) {
  const cycles = useMemo(() => cyclesInData(rows), [rows])
  const states = useMemo(() => [...new Set(staff.map(s => s.state))].sort(), [staff])
  const dataFrom = useMemo(() => rows.reduce((m, r) => (!m || r.date < m ? r.date : m), ''), [rows])
  const dataTo = useMemo(() => rows.reduce((m, r) => (r.date > m ? r.date : m), ''), [rows])
  // Period: any From/To dates; each reporting cycle (24th-23rd) is a one-click preset.
  const first = cycles[0] ? cycleBounds(cycles[0]) : { from: dataFrom, to: dataTo }
  const [from, setFrom] = useState(first.from)
  const [to, setTo] = useState(first.to)
  const [state, setState] = useState('all')
  const setPeriod = (f, t) => { setFrom(f); setTo(t) }
  const activeCycle = cycles.find(c => { const b = cycleBounds(c); return b.from === from && b.to === to })
  const badRange = !from || !to || from > to
  const noData = !badRange && !rows.some(r => r.date >= from && r.date <= to)
  const [busy, setBusy] = useState(null)
  const [done, setDone] = useState(null)
  const [err, setErr] = useState(null)

  const preview = useMemo(() => (badRange || noData ? null : analyseCycle({ rows, staff, from, to, state })), [rows, staff, from, to, state, badRange, noData])

  const go = async format => {
    setBusy(format); setDone(null); setErr(null)
    try {
      const r = await downloadReport({ rows, staff, from, to, state, fetchedAt }, format)
      setDone(r.name)
    } catch (e) {
      console.error(e); setErr(e.message || String(e))
    } finally {
      setBusy(null)
    }
  }

  const label = { fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 5 }

  return (
    <div className="no-print" role="dialog" aria-modal="true" aria-label="Download month-end report"
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,32,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 540, boxShadow: '0 24px 64px rgba(15,23,32,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Download month-end report</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
              Full report in Word or PDF, or a summary deck in PowerPoint, filled from the dashboard data
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={label}>Report period</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 3 }}>From</div>
                <input type="date" className="filter-select" style={{ width: '100%', paddingRight: 10 }} value={from} max={to || undefined}
                  onChange={e => setPeriod(e.target.value, to)} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 3 }}>To</div>
                <input type="date" className="filter-select" style={{ width: '100%', paddingRight: 10 }} value={to} min={from || undefined}
                  onChange={e => setPeriod(from, e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11.5 }}>
              <span style={{ color: 'var(--ink-3)' }}>Quick pick:</span>
              {cycles.map(c => {
                const b = cycleBounds(c), on = activeCycle === c
                return (
                  <button key={c} type="button" onClick={() => setPeriod(b.from, b.to)}
                    title={`${fd(b.from)} – ${fd(b.to)} (${cycleLen(c)} days)`}
                    style={{ border: `1px solid ${on ? 'var(--eha-blue, #0090fc)' : 'var(--line)'}`, background: on ? '#e6f4ff' : '#fff', color: on ? '#0078d4' : 'var(--ink-2)', borderRadius: 999, padding: '3px 10px', cursor: 'pointer', fontSize: 11.5, fontWeight: on ? 600 : 500 }}>
                    {cycleName(c)} cycle (24th–23rd)
                  </button>
                )
              })}
              {dataFrom && (
                <button type="button" onClick={() => setPeriod(dataFrom, dataTo)}
                  style={{ border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-2)', borderRadius: 999, padding: '3px 10px', cursor: 'pointer', fontSize: 11.5 }}>
                  All data ({fd(dataFrom)} – {fd(dataTo)})
                </button>
              )}
            </div>
            {badRange && <div style={{ fontSize: 12, color: 'var(--crit-ink)', marginTop: 6 }}>Choose a From date on or before the To date.</div>}
            {noData && <div style={{ fontSize: 12, color: 'var(--warn-ink)', marginTop: 6 }}>No check-ins in this period. Data runs from {fd(dataFrom)} to {fd(dataTo)}.</div>}
          </div>
          <div>
            <div>
              <label style={label}>Scope</label>
              <select className="filter-select" style={{ width: '100%' }} value={state} onChange={e => setState(e.target.value)}>
                <option value="all">All {states.length} states</option>
                {states.map(s => <option key={s} value={s}>{s} State</option>)}
              </select>
            </div>
          </div>

          {preview && (
            <div style={{ background: '#f6f8fa', border: '1px solid var(--line-soft)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              {preview.partial && <div style={{ fontWeight: 600, color: 'var(--warn-ink)', marginBottom: 4 }}>
                Period runs past the latest data - this will be a draft with data to {fd(preview.periodEnd)}.</div>}
              <div><strong>{preview.total.toLocaleString()}</strong> submissions over {preview.liveDays.length} days · <strong>{preview.valid.toLocaleString()}</strong> valid ({Math.round(100 * preview.valid / Math.max(1, preview.total))}%)</div>
              <div><strong>{preview.met}</strong> of {preview.people.length} consultants met the expected valid days{preview.partial ? ' so far' : ''}
                <span style={{ color: 'var(--ink-3)' }}> ({preview.expected})</span></div>
              <div><strong>{preview.outside.length}</strong> outside-LGA exceptions · <strong>{preview.security.length}</strong> security · <strong>{preview.critical.length}</strong> critical</div>
            </div>
          )}

          {err && <div style={{ fontSize: 12, color: 'var(--crit-ink)' }}>Could not create the report: {err}</div>}
          {done && <div style={{ fontSize: 12, color: 'var(--good-ink)', display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} /> Downloaded {done}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
          <button className="btn-secondary" onClick={onClose} style={{ marginRight: 'auto' }}>Close</button>
          {FORMATS.map(f => {
            const Icon = busy === f.id ? Loader2 : f.icon
            return (
              <button key={f.id} className={f.primary ? 'btn-primary' : 'btn-secondary'} onClick={() => go(f.id)} disabled={!!busy || !preview}>
                <Icon size={14} className={busy === f.id ? 'animate-spin' : undefined} /> {busy === f.id ? 'Building…' : f.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

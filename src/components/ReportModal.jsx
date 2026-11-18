import { useMemo, useState } from 'react'
import { X, FileText, Loader2, CheckCircle2 } from 'lucide-react'
import { analyseCycle, cycleBounds, cycleName, cyclesInData, downloadMonthlyReport, DEFAULT_EXPECTED_DAYS } from '../utils/monthlyReport'

const fd = d => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// Month-end report download: the PM's "Field Consultants' Check-in & Field
// Performance Report" template, filled from the dashboard data for one
// reporting cycle (24th of the previous month to the 23rd).
export default function ReportModal({ rows, staff, fetchedAt, onClose }) {
  const cycles = useMemo(() => cyclesInData(rows), [rows])
  const states = useMemo(() => [...new Set(staff.map(s => s.state))].sort(), [staff])
  const [cycle, setCycle] = useState(cycles[0])
  const [state, setState] = useState('all')
  const [expectedDays, setExpectedDays] = useState(DEFAULT_EXPECTED_DAYS)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [err, setErr] = useState(null)

  const preview = useMemo(() => (cycle ? analyseCycle({ rows, staff, cycle, state, expectedDays }) : null), [rows, staff, cycle, state, expectedDays])

  const go = async () => {
    setBusy(true); setDone(null); setErr(null)
    try {
      const r = await downloadMonthlyReport({ rows, staff, cycle, state, expectedDays, fetchedAt })
      setDone(r.name)
    } catch (e) {
      console.error(e); setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const label = { fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 5 }

  return (
    <div className="no-print" role="dialog" aria-modal="true" aria-label="Download month-end report"
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,32,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 520, boxShadow: '0 24px 64px rgba(15,23,32,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Download month-end report</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
              Field Consultants’ Check-in & Field Performance Report (Word), filled from the dashboard data
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={label}>Reporting cycle (24th to 23rd)</label>
            <select className="filter-select" style={{ width: '100%' }} value={cycle} onChange={e => setCycle(e.target.value)}>
              {cycles.map(c => { const b = cycleBounds(c); return <option key={c} value={c}>{cycleName(c)} · {fd(b.from)} – {fd(b.to)}</option> })}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
            <div>
              <label style={label}>Scope</label>
              <select className="filter-select" style={{ width: '100%' }} value={state} onChange={e => setState(e.target.value)}>
                <option value="all">All {states.length} states</option>
                {states.map(s => <option key={s} value={s}>{s} State</option>)}
              </select>
            </div>
            <div>
              <label style={label} title="Standard used in the LC monthly reports">Expected valid days</label>
              <input type="number" min={1} max={31} className="filter-select" style={{ width: '100%', paddingRight: 10 }}
                value={expectedDays} onChange={e => setExpectedDays(Math.max(1, Math.min(31, Number(e.target.value) || DEFAULT_EXPECTED_DAYS)))} />
            </div>
          </div>

          {preview && (
            <div style={{ background: '#f6f8fa', border: '1px solid var(--line-soft)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              {preview.partial && <div style={{ fontWeight: 600, color: 'var(--warn-ink)', marginBottom: 4 }}>
                Cycle still running - this will be a draft with data to {fd(preview.periodEnd)}.</div>}
              <div><strong>{preview.total.toLocaleString()}</strong> submissions over {preview.liveDays.length} days · <strong>{preview.valid.toLocaleString()}</strong> valid ({Math.round(100 * preview.valid / Math.max(1, preview.total))}%)</div>
              <div><strong>{preview.met}</strong> of {preview.people.length} consultants met {preview.expected} valid days
                {preview.expected < expectedDays && <span style={{ color: 'var(--ink-3)' }}> (the {expectedDays}-day standard scaled to the {preview.liveDays.length} days with data)</span>}</div>
              <div><strong>{preview.outside.length}</strong> outside-LGA exceptions · <strong>{preview.security.length}</strong> security · <strong>{preview.critical.length}</strong> critical</div>
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            Follows the PM's template: executive summary, method and validity rules, KPI table, consultant compliance, state coverage,
            outside-LGA verification, activities, data quality, exceptions, action tracker and annexes. Figures are filled in;
            judgement fields (status, root causes, owners) are left marked <em>[To complete]</em>. Consultants are shown by post, not name.
          </div>
          {err && <div style={{ fontSize: 12, color: 'var(--crit-ink)' }}>Could not create the report: {err}</div>}
          {done && <div style={{ fontSize: 12, color: 'var(--good-ink)', display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} /> Downloaded {done}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={go} disabled={busy || !cycle}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} {busy ? 'Building…' : 'Download Word report'}
          </button>
        </div>
      </div>
    </div>
  )
}

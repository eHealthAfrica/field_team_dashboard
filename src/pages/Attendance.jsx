import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import ChartCard from '../components/ChartCard'
import Narrative from '../components/Narrative'
import { RatePill, StatusBadge } from '../components/Charts'
import { staffAttendance, fmtDate, ROLES, STATUS, toCSV, downloadCSV } from '../utils/data'

const MAX_GRID_DAYS = 31

export default function Attendance({ data, roster, range, intent }) {
  const [show, setShow] = useState(intent?.tab || 'all')
  const [q, setQ] = useState('')
  const { days, list, orphans } = useMemo(() => staffAttendance(data, roster, range), [data, roster, range])

  const lastDay = range.to
  const missingLast = list.filter(s => !s.byDay[lastDay]?.length)
  const neverIn = list.filter(s => s.daysIn === 0)
  // Same rule as 'silent for 3+ days' on the Executive summary: no check-in in the last 3 days of the period.
  const last3 = days.slice(-3)
  const isSilent3 = s => last3.length === 3 && last3.every(d => !s.byDay[d]?.length)
  const silent3 = list.filter(isSilent3)
  const gridDays = days.slice(-MAX_GRID_DAYS)

  const shown = list
    .filter(s => show === 'all' || (show === 'missing' && !s.byDay[lastDay]?.length) || (show === 'silent3' && isSilent3(s)) || (show === 'never' && s.daysIn === 0) || (show === 'low' && s.rate < 50))
    .filter(s => !q || `${s.who} ${s.state}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.rate - b.rate || a.state.localeCompare(b.state) || a.who.localeCompare(b.who))

  const exportMissing = () => {
    const csv = toCSV([
      { label: 'State', get: s => s.state },
      { label: 'Coordinator', get: s => s.who },
      { label: 'Role', get: s => ROLES[s.role] },
      { label: 'Days checked in', get: s => s.daysIn },
      { label: 'Days in period', get: () => days.length },
      { label: 'Last check-in', get: s => s.last ? `${s.last.date} ${s.last.time}` : 'never' },
    ], missingLast)
    downloadCSV(`not-checked-in-${lastDay}.csv`, csv)
  }

  const tabs = [
    ['all', `Everyone (${list.length})`],
    ['missing', `Not in on ${fmtDate(lastDay)} (${missingLast.length})`],
    ...(last3.length === 3 ? [['silent3', `Not in for 3+ days (${silent3.length})`]] : []),
    ['never', `No check-in in period (${neverIn.length})`],
    ['low', `Below 50% (${list.filter(s => s.rate < 50).length})`],
  ]

  // Narration
  const everyDay = list.filter(s => s.daysIn === days.length).length
  const silentByState = {}
  neverIn.forEach(s => { silentByState[s.state] = (silentByState[s.state] || 0) + 1 })
  const worst = Object.entries(silentByState).sort((a, b) => b[1] - a[1])[0]

  return (
    <div>
      {list.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <Narrative eyebrow={`${fmtDate(days[0])} – ${fmtDate(lastDay, true)}`}
            lead={`${everyDay} of ${list.length} coordinators checked in on every day of the period, and ${list.length - missingLast.length} checked in on ${fmtDate(lastDay)}.`}>
            {missingLast.length > 0 && <>{missingLast.length} did not check in on the latest day. </>}
            {neverIn.length > 0
              ? <>{neverIn.length} have not checked in at all in this period{worst ? `, most of them in ${worst[0]} (${worst[1]})` : ''} - use the list below to follow up.</>
              : <>Every coordinator checked in at least once.</>}
          </Narrative>
        </div>
      )}
      <ChartCard
        title={`Staff attendance · ${fmtDate(days[0])} – ${fmtDate(lastDay)}`}
        desc={`Lowest reporting rate first. Each square is a day${days.length > MAX_GRID_DAYS ? ` (last ${MAX_GRID_DAYS} shown)` : ''}: coloured = checked in, coloured by where; grey = no check-in.`}
        action={<button className="btn-secondary" onClick={exportMissing} style={{ fontSize: 12, padding: '5px 10px' }}>
          <Download size={12} /> Not checked in (CSV)
        </button>}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          {tabs.map(([id, label]) => (
            <button key={id} className="chip" aria-pressed={show === id} onClick={() => setShow(id)}>{label}</button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--line)', borderRadius: 8, padding: '3px 8px', background: '#fff' }}>
            <Search size={12} color="var(--ink-4)" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search LGA or state"
              style={{ border: 'none', outline: 'none', fontSize: 12, width: 160 }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: 'var(--ink-2)', marginBottom: 8 }}>
          {Object.entries(STATUS).map(([k, s]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />{s.label}
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--line)' }} />No check-in
          </span>
        </div>

        <div className="scroll-box" style={{ maxHeight: 'max(360px, calc(100vh - 340px))', overflow: 'auto', border: '1px solid var(--line-soft)', borderRadius: 8 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Coordinator</th><th>Role</th><th>State</th>
                <th className="num">Days in</th><th className="num">Rate</th>
                <th>Daily</th>
                <th>Last check-in</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{s.who}</td>
                  <td style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{s.role === 'sc' ? 'SC' : 'LC'}</td>
                  <td>{s.state}</td>
                  <td className="num">{s.daysIn}/{days.length}</td>
                  <td className="num"><RatePill value={s.rate} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {gridDays.map(d => {
                        const r = s.byDay[d]
                        const st = r?.length ? r[r.length - 1].status : null
                        return <span key={d}
                          title={`${fmtDate(d)}: ${r?.length ? `${r.map(x => x.time).join(', ')} · ${STATUS[st]?.label} · ${r[r.length - 1].work_lga}` : 'no check-in'}`}
                          style={{ width: 10, height: 14, borderRadius: 2, background: st ? STATUS[st].color : 'var(--line)' }} />
                      })}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {s.last
                      ? <span>{fmtDate(s.last.date)} {s.last.time} <span style={{ marginLeft: 6 }}><StatusBadge status={s.last.status} /></span></span>
                      : <span style={{ color: 'var(--crit-ink)' }}>None in period</span>}
                  </td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 20 }}>Nobody matches</td></tr>}
            </tbody>
          </table>
        </div>

        {orphans.length > 0 && (
          <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8 }}>
            {orphans.length} check-in{orphans.length > 1 ? 's' : ''} came from logins not on the current roster ({[...new Set(orphans.map(o => o.who))].slice(0, 5).join(', ')}{orphans.length > 5 ? '…' : ''}).
          </p>
        )}
      </ChartCard>
    </div>
  )
}

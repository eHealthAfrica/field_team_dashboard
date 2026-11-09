import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import ChartCard from '../components/ChartCard'
import Narrative from '../components/Narrative'
import { BarList, StatusBadge } from '../components/Charts'
import { ACTIVITIES, fmtDate, pct, toCSV, downloadCSV } from '../utils/data'

const TYPES = {
  security:  { label: 'Security / access incidents', badge: 'badge-red' },
  critical:  { label: 'Critical issues for the State team', badge: 'badge-red' },
  challenge: { label: 'Activity challenges', badge: 'badge-amber' },
  outside:   { label: 'Outside LGA, no verified redeployment', badge: 'badge-purple' },
}

export default function Issues({ data }) {
  const [type, setType] = useState('all')

  // One list of every issue raised, newest first.
  const items = useMemo(() => {
    const out = []
    data.forEach(r => {
      const base = { id: r.id, date: r.date, time: r.time, who: r.who, state: r.work_state, lga: r.work_lga, row: r }
      if (r.security) out.push({ ...base, type: 'security', what: 'Security incident', desc: r.security_desc })
      if (r.critical) out.push({ ...base, type: 'critical', what: 'Critical issue', desc: r.critical_desc })
      r.challenges.forEach(c => out.push({ ...base, type: 'challenge', what: ACTIVITIES[c.act], desc: c.desc }))
      if (r.status === 'outside_not_redeployed' || r.status === 'outside_old_form')
        out.push({ ...base, type: 'outside', what: r.found_lga ? `In ${r.found_lga}${r.dist_km ? `, ${r.dist_km} km out` : ''}` : `Outside programme area${r.dist_km ? `, ${r.dist_km} km out` : ''}`, desc: r.outside_reason })
    })
    return out.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  }, [data])

  const count = t => items.filter(i => i.type === t).length
  const byActivity = useMemo(() => {
    const c = {}
    data.forEach(r => r.challenges.forEach(x => { c[x.act] = (c[x.act] || 0) + 1 }))
    return Object.entries(c).map(([k, n]) => {
      const done = data.filter(r => r.acts.includes(k)).length
      return { key: k, label: ACTIVITIES[k], n, pct: pct(n, done) }
    }).sort((a, b) => b.n - a.n)
  }, [data])

  const byState = useMemo(() => {
    const c = {}
    items.filter(i => i.type === 'security' || i.type === 'critical').forEach(i => { c[i.state] = (c[i.state] || 0) + 1 })
    return Object.entries(c).map(([k, n]) => ({ key: k, label: k, n, color: 'var(--status-critical)' })).sort((a, b) => b.n - a.n)
  }, [items])

  const list = items.filter(i => type === 'all' || i.type === type)
  const exportCSV = () => downloadCSV('issues.csv', toCSV([
    { label: 'Date', get: i => i.date }, { label: 'Time', get: i => i.time }, { label: 'Type', get: i => TYPES[i.type].label },
    { label: 'Coordinator', get: i => i.who }, { label: 'Working in (state)', get: i => i.state }, { label: 'Working in (LGA)', get: i => i.lga },
    { label: 'About', get: i => i.what }, { label: 'Description', get: i => i.desc }, { label: 'Kobo ID', get: i => i.id },
  ], list))

  // Narration
  const nSec = count('security'), nCrit = count('critical')
  const secStates = byState.length ? byState[0] : null
  const topChallenge = [...byActivity].sort((a, b) => b.pct - a.pct).find(a => a.n >= 3)

  return (
    <div>
      {data.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <Narrative eyebrow="Field issues"
            lead={`${nSec} security or access incident${nSec === 1 ? '' : 's'} and ${nCrit} critical issue${nCrit === 1 ? '' : 's'} were raised in this period.`}>
            {secStates && <>{secStates.label} reported the most security and critical issues ({secStates.n}). </>}
            {topChallenge && <>Challenges were most frequent during {topChallenge.label.replace(/^([A-Z])(?=[a-z])/, c => c.toLowerCase())} ({topChallenge.pct}% of those check-ins). </>}
            Full descriptions are in the log below.
          </Narrative>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 10, marginBottom: 10 }}>
        <ChartCard title="Challenges by activity" desc="Times a challenge was reported, and the share of that activity's check-ins.">
          {byActivity.length
            ? <BarList items={byActivity} color="var(--status-warning)" height={250} valueFmt={(n, it) => `${n} · ${it.pct}%`} />
            : <div style={{ color: 'var(--ink-3)', fontSize: 12, padding: 20, textAlign: 'center' }}>No challenges reported</div>}
        </ChartCard>
        <ChartCard title="Security and critical issues by state" desc="Reports that need State or eHA follow-up.">
          {byState.length
            ? <BarList items={byState} height={250} />
            : <div style={{ color: 'var(--ink-3)', fontSize: 12, padding: 20, textAlign: 'center' }}>None reported</div>}
        </ChartCard>
      </div>

      <ChartCard
        title={`Issue log (${list.length})`}
        desc="Everything raised in the selected period, newest first."
        action={<button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={exportCSV}><Download size={12} /> CSV</button>}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {[['all', `All (${items.length})`], ...Object.entries(TYPES).map(([k, t]) => [k, `${t.label} (${count(k)})`])].map(([id, label]) => (
            <button key={id} className="chip" aria-pressed={type === id} onClick={() => setType(id)}>{label}</button>
          ))}
        </div>
        <div className="scroll-box" style={{ maxHeight: 400, overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Type</th><th>Coordinator</th><th>Working in</th><th>About</th><th style={{ width: '40%' }}>Description</th></tr></thead>
            <tbody>
              {list.slice(0, 400).map((i, n) => (
                <tr key={`${i.id}-${n}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(i.date)} {i.time}</td>
                  <td><span className={`badge ${TYPES[i.type].badge}`}>{TYPES[i.type].label.split(' ')[0]}</span></td>
                  <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{i.who}</td>
                  <td>{i.state} · {i.lga}</td>
                  <td>{i.type === 'outside' ? <><StatusBadge status={i.row.status} /><div style={{ color: 'var(--ink-3)', fontSize: 11 }}>{i.what}</div></> : i.what}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{i.desc || <span style={{ color: 'var(--ink-4)' }}>No description</span>}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 20 }}>Nothing raised in this period</td></tr>}
            </tbody>
          </table>
          {list.length > 400 && <p style={{ fontSize: 11, color: 'var(--ink-3)' }}>Showing 400 of {list.length}. Download the CSV for all.</p>}
        </div>
      </ChartCard>
    </div>
  )
}

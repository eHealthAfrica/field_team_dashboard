import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import ChartCard from '../components/ChartCard'
import Narrative from '../components/Narrative'
import KPICard from '../components/KPICard'
import { BarList, StatusBadge } from '../components/Charts'
import { FLAGS, flagCounts, fmtDate, pct, toCSV, downloadCSV } from '../utils/data'
import { ShieldCheck, Timer, Fingerprint, MapPinOff } from 'lucide-react'

export default function Quality({ data }) {
  const [flag, setFlag] = useState('all')
  const counts = useMemo(() => flagCounts(data), [data])
  const flagged = data.filter(r => r.flags.length)
  const inGroup = g => data.filter(r => r.flags.some(f => FLAGS[f]?.group === g)).length

  // Staff with the most flagged check-ins.
  const people = useMemo(() => {
    const m = new Map()
    data.forEach(r => {
      const k = r.uid || r.who
      if (!m.has(k)) m.set(k, { who: r.who, state: r.state, n: 0, flagged: 0, flags: 0 })
      const p = m.get(k)
      p.n++; if (r.flags.length) { p.flagged++; p.flags += r.flags.length }
    })
    return [...m.values()].filter(p => p.flagged).sort((a, b) => b.flagged - a.flagged || b.flags - a.flags).slice(0, 25)
  }, [data])

  const list = flagged.filter(r => flag === 'all' || r.flags.includes(flag))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))

  const exportFlagged = () => downloadCSV('flagged-check-ins.csv', toCSV([
    { label: 'Date', get: r => r.date }, { label: 'Time', get: r => r.time },
    { label: 'Coordinator', get: r => r.who }, { label: 'State', get: r => r.state }, { label: 'Working in', get: r => r.work_lga },
    { label: 'Flags', get: r => r.flags.map(f => FLAGS[f]?.label || f).join('; ') },
    { label: 'Kobo ID', get: r => r.id },
  ], list))

  // Narration
  const mostlyFlagged = people.filter(p => p.n >= 3 && p.flagged / p.n > 0.5).length
  const quote = c => `“${c.label.toLowerCase()}” (${c.n})`

  return (
    <div>
      {data.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <Narrative eyebrow="Automated checks"
            lead={`${pct(data.length - flagged.length, data.length)}% of check-ins passed every quality check built into the form.`}>
            {counts.length > 0 && <>The most frequent flags were {counts.slice(0, 2).map(quote).join(' and ')}. </>}
            {mostlyFlagged > 0 && <>{mostlyFlagged} coordinator{mostlyFlagged > 1 ? 's were' : ' was'} flagged on more than half of their check-ins - worth a spot check. </>}
            Flags mark a check-in for review; they are not proof of a problem.
          </Narrative>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 10 }}>
        <KPICard label="Clean check-ins" icon={ShieldCheck} color="green" value={pct(data.length - flagged.length, data.length)} suffix="%"
          desc={`${data.length - flagged.length} of ${data.length} with no flags`} />
        <KPICard label="Location flags" icon={MapPinOff} color="amber" value={inGroup('Location')} desc="Outside LGA, repeated or jumping GPS" delay={40} />
        <KPICard label="Timing flags" icon={Timer} color="amber" value={inGroup('Timing')} desc="Rushed, odd hours, back-dated" delay={80} />
        <KPICard label="Identity flags" icon={Fingerprint} color="red" value={inGroup('Identity')} desc="Shared phone or copied summary" delay={120} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 10, marginBottom: 10 }}>
        <ChartCard title="Flags raised" desc="Check-ins that triggered each automated check in the form. Click a flag to list those check-ins.">
          {counts.length ? (
            <div className="scroll-box" style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
              {counts.map(c => (
                <div key={c.key} onClick={() => setFlag(flag === c.key ? 'all' : c.key)} style={{ cursor: 'pointer', opacity: flag === 'all' || flag === c.key ? 1 : 0.45 }}>
                  <BarList items={[{ key: c.key, label: c.label, n: c.n }]} max={counts[0].n} labelWidth={270}
                    valueFmt={n => `${n} · ${pct(n, data.length)}%`} />
                </div>
              ))}
            </div>
          ) : <div style={{ color: 'var(--ink-3)', fontSize: 12, padding: 20, textAlign: 'center' }}>No flags in this period</div>}
        </ChartCard>
        <ChartCard title="Staff with most flagged check-ins" desc="Top 25. Worth a call or spot check, not proof of a problem.">
          <div className="scroll-box" style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Coordinator</th><th>State</th><th className="num">Flagged</th><th className="num">Flags</th></tr></thead>
              <tbody>
                {people.map(p => (
                  <tr key={p.who + p.state}>
                    <td style={{ fontWeight: 500 }}>{p.who}</td>
                    <td style={{ color: 'var(--ink-2)' }}>{p.state}</td>
                    <td className="num">{p.flagged}/{p.n}</td>
                    <td className="num">{p.flags}</td>
                  </tr>
                ))}
                {!people.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 20 }}>Nobody flagged</td></tr>}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title={flag === 'all' ? `Flagged check-ins (${list.length})` : `${FLAGS[flag]?.label} (${list.length})`}
        desc="Most recent first. Use the Kobo ID to find the submission and its photos in KoboToolbox."
        action={<div style={{ display: 'flex', gap: 6 }}>
          {flag !== 'all' && <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setFlag('all')}>Show all</button>}
          <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={exportFlagged}><Download size={12} /> CSV</button>
        </div>}
      >
        <div className="scroll-box" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Coordinator</th><th>Working in</th><th>Location</th><th>Flags</th><th className="num">Kobo ID</th></tr></thead>
            <tbody>
              {list.slice(0, 300).map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)} {r.time}</td>
                  <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{r.who}</td>
                  <td>{r.work_state} · {r.work_lga}</td>
                  <td><StatusBadge status={r.status} />{r.dist_km ? <span style={{ color: 'var(--ink-3)' }}> · {r.dist_km} km</span> : null}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {r.flags.map(f => <span key={f} className="badge badge-amber" style={{ fontWeight: 500 }}>{FLAGS[f]?.label || f}</span>)}
                    </div>
                  </td>
                  <td className="num" style={{ color: 'var(--ink-3)' }}>{r.id}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 20 }}>No flagged check-ins</td></tr>}
            </tbody>
          </table>
          {list.length > 300 && <p style={{ fontSize: 11, color: 'var(--ink-3)' }}>Showing 300 of {list.length}. Download the CSV for all.</p>}
        </div>
      </ChartCard>
    </div>
  )
}

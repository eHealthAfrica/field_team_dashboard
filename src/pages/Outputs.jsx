import { useMemo } from 'react'
import ChartCard from '../components/ChartCard'
import Sparkline from '../components/Sparkline'
import Narrative from '../components/Narrative'
import { OUTPUTS, ACTIVITIES, DIP_STATUS, sumOutputs, pct, daysBetween, fmtDate, lgaDayOutputs } from '../utils/data'

const fmt = n => (n || 0).toLocaleString()

// The four outputs that best summarise field delivery.
const HEADLINE = [
  { key: 'mdp_phones',       label: 'Phones deployed',        note: 'Morning deployment' },
  { key: 'csup_teams',       label: 'Teams supervised',       note: 'Campaign supervision' },
  { key: 'csup_settlements', label: 'Settlements visited',    note: 'Campaign supervision' },
  { key: 'pqc_checked',      label: 'Phones quality-checked', note: 'Phone QCs' },
]

function HeadlineTile({ label, note, value, spark, sub }) {
  return (
    <div className="card animate-fade-up" style={{ padding: '9px 14px', display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{fmt(value)}</span>
        <Sparkline values={spark} width={100} height={30} />
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{sub} · {note}</div>
    </div>
  )
}

const DIP_COLORS = { progress: 'var(--series-4)', completed: 'var(--series-1)', validated: 'var(--status-good)' }

export default function Outputs({ data, range }) {
  const days = daysBetween(range.from, range.to)

  // The form asks for TODAY's counts, and the same phones go out every day,
  // so outputs are never added up across days. Instead:
  //  - one report per coordinator per day (their latest), and
  //  - one figure per LGA per day (the highest, when several coordinators -
  //    e.g. redeployed staff - report the same LGA's phones and teams).
  // Tiles show the latest day and the peak day; tables show the latest day.
  const perDay = useMemo(() => {
    const m = new Map()
    ;[...data].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .forEach(r => m.set(`${r.uid || r.who}|${r.date}`, r))
    return [...m.values()]
  }, [data])
  const lgaDays = useMemo(() => lgaDayOutputs(perDay), [perDay])
  const totals = useMemo(() => sumOutputs(lgaDays), [lgaDays])   // period totals: ratios only

  const daily = useMemo(() => {
    const m = Object.fromEntries(days.map(d => [d, {}]))
    lgaDays.forEach(r => { const o = m[r.date]; if (o) for (const k in r.out) o[k] = (o[k] || 0) + r.out[k] })
    return m
  }, [lgaDays, range])
  const day = range.to
  const latest = daily[day] || {}
  const peak = k => days.reduce((best, d) => ((daily[d]?.[k] || 0) > best.v ? { d, v: daily[d][k] } : best), { d: null, v: 0 })
  const single = days.length === 1

  // One row per activity: how often it was logged, what it delivered, how often it hit problems.
  const scorecard = useMemo(() => Object.keys(ACTIVITIES).map(a => {
    const rs = perDay.filter(r => r.acts.includes(a))
    return {
      key: a, label: ACTIVITIES[a], n: rs.length,
      challengePct: pct(rs.filter(r => r.challenges.some(c => c.act === a)).length, rs.length),
      outputs: OUTPUTS.filter(o => o.act === a).map(o => ({ ...o, v: latest[o.key] || 0 })),
    }
  }).sort((a, b) => b.n - a.n), [perDay, latest])
  const maxN = Math.max(1, ...scorecard.map(s => s.n))

  const ratios = [
    { label: 'Phones with issues at QC', a: totals.pqc_issues, b: totals.pqc_checked },
    { label: 'Devices that could not be charged', a: totals.chg_not, b: totals.chg_charged + totals.chg_not },
    { label: 'Deployed phones with tracks uploaded', a: totals.trk_num, b: totals.mdp_phones },
    { label: 'Phones retrieved vs issued', a: totals.plog_retrieved, b: totals.plog_issued },
    { label: 'New settlements per validated', a: totals.mlos_new, b: totals.mlos_validated },
  ]

  const dip = useMemo(() => {
    const latest = new Map()
    data.filter(r => r.dip_status).forEach(r => latest.set(`${r.work_state}|${r.work_lga}`, r))
    const c = Object.fromEntries(Object.keys(DIP_STATUS).map(k => [k, 0]))
    latest.forEach(r => { c[r.dip_status] = (c[r.dip_status] || 0) + 1 })
    return { total: latest.size, c }
  }, [data])

  const cols = ['mdp_phones', 'csup_teams', 'csup_wards', 'csup_settlements', 'pqc_checked', 'trk_num', 'chg_charged', 'stk_num']
  const byState = useMemo(() => {
    const m = new Map()
    // latest day, grouped by the state where the work happened
    lgaDays.filter(r => r.date === day).forEach(r => {
      if (!m.has(r.state)) m.set(r.state, Object.fromEntries(cols.map(c => [c, 0])))
      const o = m.get(r.state); cols.forEach(c => { o[c] += r.out[c] || 0 })
    })
    return [...m.entries()].sort((a, b) => b[1].mdp_phones - a[1].mdp_phones)
  }, [lgaDays, day])
  const colMax = Object.fromEntries(cols.map(c => [c, Math.max(1, ...byState.map(([, o]) => o[c]))]))

  // Narration
  const top = scorecard.filter(s => s.n).slice(0, 3)
  const trackPct = pct(totals.trk_num, totals.mdp_phones)
  const qcPct = pct(totals.pqc_issues, totals.pqc_checked)
  const validatedPct = pct(dip.c.validated || 0, dip.total)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.length > 0 && (
        <Narrative eyebrow={`${fmtDate(range.from)} – ${fmtDate(range.to, true)}`}
          lead={`On ${fmtDate(day)}, ${fmt(latest.mdp_phones)} phones were deployed and ${fmt(latest.csup_teams)} teams supervised across ${fmt(latest.csup_settlements)} settlements.`}>
          {!single && peak('mdp_phones').d && peak('mdp_phones').d !== day && <>Phone deployment peaked at {fmt(peak('mdp_phones').v)} on {fmtDate(peak('mdp_phones').d)}. </>}
          {top.length > 0 && <>The most common activities were {top.map(t => t.label.replace(/^([A-Z])(?=[a-z])/, c => c.toLowerCase())).join(', ').replace(/, ([^,]*)$/, ' and $1')}. </>}
          {totals.mdp_phones > 0 && <>Across the period, tracks were uploaded for {trackPct}% of deployed phones{totals.pqc_checked ? `, and ${qcPct}% of phones checked had a fault` : ''}. </>}
          {dip.total > 0 && <>{validatedPct}% of reporting LGAs have a validated DIP.</>}
        </Narrative>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {HEADLINE.map(h => (
          <HeadlineTile key={h.key} label={h.label} note={h.note} value={latest[h.key] || 0}
            sub={single || !peak(h.key).d ? `On ${fmtDate(day)}` : `On ${fmtDate(day)} · peak ${fmt(peak(h.key).v)} on ${fmtDate(peak(h.key).d)}`}
            spark={days.map(d => daily[d]?.[h.key] || 0)} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.75fr) minmax(300px, 1fr)', gap: 10, alignItems: 'start' }}>
        <ChartCard title="Activity scorecard" pad={false}
          desc={`Check-ins: one per coordinator per day over the period. Delivered: ${fmtDate(day)}, each LGA counted once.`}>
          <div className="scroll-box" style={{ maxHeight: 440, overflow: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr><th>Activity</th><th style={{ width: 150 }}>Check-ins</th><th>Delivered · {fmtDate(day)}</th><th className="num">Challenges</th></tr>
              </thead>
              <tbody>
                {scorecard.map(s => (
                  <tr key={s.key} style={{ opacity: s.n ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{s.label}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: '#eef0f3', borderRadius: 3 }}>
                          <div style={{ width: `${(s.n / maxN) * 100}%`, height: '100%', background: 'var(--eha-blue)', borderRadius: 3 }} />
                        </div>
                        <span style={{ width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{s.n}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--ink-2)' }}>
                      {s.outputs.length
                        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 14px' }}>
                            {s.outputs.map(o => (
                              <span key={o.key} style={{ whiteSpace: 'nowrap' }}>
                                <strong style={{ color: 'var(--ink)', fontWeight: 650 }}>{fmt(o.v)}</strong> {o.label.replace(/^([A-Z])(?=[a-z])/, c => c.toLowerCase())}
                              </span>))}
                          </div>
                        : <span style={{ color: 'var(--ink-4)' }}>Narrative report only</span>}
                    </td>
                    <td className="num">
                      {s.n ? <span className="badge badge-gray">{s.challengePct}%</span> : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ChartCard title="Key ratios" desc="Across the period, each LGA counted once per day. Over 100% points to reporting errors.">
            {ratios.map((r, i) => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderTop: i ? '1px solid var(--line-soft)' : 'none' }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                  {r.label}
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-4)' }}>{fmt(r.a)} of {fmt(r.b)}</span>
                </span>
                <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: r.b && r.a > r.b ? 'var(--crit-ink)' : 'var(--ink)' }}>
                  {r.b ? `${pct(r.a, r.b)}%` : '–'}
                </span>
              </div>
            ))}
          </ChartCard>

          <ChartCard title="LGA DIP status" desc={`Latest status reported for ${dip.total} LGAs.`}>
            <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', gap: 2, background: '#eef0f3' }}>
              {Object.keys(DIP_STATUS).map(k => dip.c[k] ? (
                <div key={k} title={`${DIP_STATUS[k]}: ${dip.c[k]}`} style={{ flex: dip.c[k], background: DIP_COLORS[k] }} />
              ) : null)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {Object.entries(DIP_STATUS).map(([k, label]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: DIP_COLORS[k] }} />
                  <span style={{ flex: 1, color: 'var(--ink-2)' }}>{label}</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{dip.c[k] || 0}</strong>
                  <span style={{ width: 38, textAlign: 'right', color: 'var(--ink-3)' }}>{pct(dip.c[k] || 0, dip.total)}%</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      </div>

      <ChartCard title="Outputs by state" pad={false} desc={`${fmtDate(day)}, by the state where the work happened, each LGA counted once. Darker cells are closer to the highest value in the column.`}>
        <div className="scroll-box" style={{ overflow: 'auto', maxHeight: 340 }}>
          <table className="tbl">
            <thead>
              <tr><th>State</th>{cols.map(c => <th key={c} className="num">{OUTPUTS.find(o => o.key === c).label}</th>)}</tr>
            </thead>
            <tbody>
              {byState.map(([state, o]) => (
                <tr key={state}>
                  <td style={{ fontWeight: 600 }}>{state}</td>
                  {cols.map(c => (
                    <td key={c} className="num" style={{ background: o[c] ? `rgba(0, 144, 252, ${0.04 + 0.18 * (o[c] / colMax[c])})` : undefined }}>
                      {o[c] ? fmt(o[c]) : '–'}
                    </td>
                  ))}
                </tr>
              ))}
              {!byState.length && <tr><td colSpan={cols.length + 1} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 20 }}>No check-ins in this period</td></tr>}
            </tbody>
            {byState.length > 0 && (
              <tfoot>
                {/* Total across states - pinned to the bottom while the table scrolls */}
                <tr>
                  <td style={{ fontWeight: 700, position: 'sticky', bottom: 0, background: '#f4f6f8', borderTop: '2px solid var(--line)' }}>Total</td>
                  {cols.map(c => (
                    <td key={c} className="num" style={{ fontWeight: 700, position: 'sticky', bottom: 0, background: '#f4f6f8', borderTop: '2px solid var(--line)' }}>
                      {fmt(byState.reduce((n, [, o]) => n + (o[c] || 0), 0))}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </ChartCard>
    </div>
  )
}

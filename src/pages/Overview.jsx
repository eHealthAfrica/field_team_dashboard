import { useMemo } from 'react'
import { ArrowUpRight, ArrowDownRight, Minus, AlertOctagon, AlertTriangle, Info, ChevronRight } from 'lucide-react'
import ChartCard from '../components/ChartCard'
import Narrative from '../components/Narrative'
import HelpTh from '../components/HelpTh'
import Sparkline from '../components/Sparkline'
import NigeriaMap, { RATE_BINS } from '../components/NigeriaMap'
import { ReportingRateChart, LocationStackChart } from '../components/Charts'
import {
  addDays, daysBetween, fmtDate, fmtDay, pct, filterRows, staffDays, FLAGS, STATUS,
} from '../utils/data'

const AT_POST = new Set(['home_lga', 'within_state', 'interstate'])

// Day-level indicators for one slice of rows + roster.
function dayStats(rows, roster) {
  const people = new Set(rows.map(r => r.uid || r.who))
  const atPost = rows.filter(r => AT_POST.has(r.status)).length
  return {
    checkedIn: people.size,
    rate: pct(people.size, roster.length),
    checkins: rows.length,
    atPostPct: pct(atPost, rows.length),
    unverified: rows.filter(r => r.status === 'outside_not_redeployed').length,
    oldFormOutside: rows.filter(r => r.status === 'outside_old_form').length,
    cleanPct: pct(rows.filter(r => !r.flags.length).length, rows.length),
  }
}

// Period-level indicators: rate = days checked in / (coordinators x days),
// each coordinator counted once per day.
function periodStats(rows, roster, nDays) {
  const sd = staffDays(rows).size
  const atPost = rows.filter(r => AT_POST.has(r.status)).length
  return {
    checkedIn: sd,
    expected: roster.length * nDays,
    rate: pct(sd, roster.length * nDays),
    checkins: rows.length,
    atPostPct: pct(atPost, rows.length),
    unverified: rows.filter(r => r.status === 'outside_not_redeployed').length,
    oldFormOutside: rows.filter(r => r.status === 'outside_old_form').length,
    cleanPct: pct(rows.filter(r => !r.flags.length).length, rows.length),
  }
}

function Delta({ now, prev, unit = 'pts', invert = false }) {
  if (prev == null || now == null) return null
  const d = now - prev
  const good = invert ? d < 0 : d > 0
  const Icon = d === 0 ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight
  const color = d === 0 ? 'var(--ink-3)' : good ? 'var(--good-ink)' : 'var(--crit-ink)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 600, color }}>
      <Icon size={14} />{d > 0 ? '+' : ''}{d}{unit === 'pts' ? ' pts' : ''}
      <span style={{ color: 'var(--ink-3)', fontWeight: 400, marginLeft: 4, fontSize: 11 }}>vs previous day</span>
    </span>
  )
}

function HeroStat({ label, value, suffix, delta, spark, sparkDomain, note, periodNote }) {
  return (
    <div className="card animate-fade-up" style={{ padding: '9px 14px 9px', display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.05 }}>{value}</span>
          {suffix && <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-3)' }}>{suffix}</span>}
        </div>
        {spark && <Sparkline values={spark} domain={sparkDomain} width={96} height={26} />}
      </div>
      <div style={{ minHeight: 15, fontSize: 11.5 }}>{periodNote ? <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>{periodNote}</span> : delta}</div>
      {note && <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{note}</div>}
    </div>
  )
}

const SEV = {
  critical: { icon: AlertOctagon, color: 'var(--status-critical)', label: 'Act now' },
  warning:  { icon: AlertTriangle, color: 'var(--status-warning)', label: 'Watch' },
  info:     { icon: Info, color: 'var(--eha-blue)', label: 'Note' },
}

function Attention({ items, navigate }) {
  return (
    // Fills the panel height and shares it equally between items, so the list
    // is spread evenly rather than bunched at the top.
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {items.map((it, i) => {
        const s = SEV[it.sev]
        return (
          <button key={i} onClick={() => it.page && navigate(it.page, it.tab ? { tab: it.tab } : null)} style={{
            display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', width: '100%', flex: '1 0 auto',
            padding: '8px 0', border: 'none', borderTop: i ? '1px solid var(--line-soft)' : 'none',
            background: 'none', cursor: it.page ? 'pointer' : 'default', fontFamily: 'inherit',
          }}>
            <s.icon size={18} style={{ color: s.color, flexShrink: 0 }} aria-label={s.label} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.35 }}>{it.title}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)', marginTop: 1, lineHeight: 1.4 }}>{it.body}</span>
            </span>
            {it.page && <ChevronRight size={16} className="no-print" style={{ color: 'var(--ink-4)', flexShrink: 0, marginTop: 2 }} />}
          </button>
        )
      })}
      {!items.length && <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '12px 0' }}>Nothing needs attention in this period.</div>}
    </div>
  )
}

function RateBar({ value }) {
  const color = RATE_BINS.find(b => value >= b.min).fill  // same scale as the map
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 170 }}>
      <div style={{ position: 'relative', flex: 1, height: 8, background: '#eef0f3', borderRadius: 4 }}>
        <div style={{ position: 'absolute', inset: 0, width: `${Math.min(value, 100)}%`, background: color, borderRadius: 4 }} />
      </div>
      <span style={{ width: 38, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}%</span>
    </div>
  )
}

export default function Overview({ rows, data, roster, range, filters, setFilters, navigate }) {
  const day = range.to
  const prevDay = addDays(day, -1)
  const days = daysBetween(range.from, range.to)

  const scope = useMemo(() => ({ state: filters.state, role: filters.role }), [filters.state, filters.role])
  const rowsOn = d => filterRows(rows, scope, { from: d, to: d })

  // A single day shows that day (with change vs the day before); a longer
  // period shows the whole period.
  const isPeriod = range.from !== range.to
  const periodLabel = isPeriod ? `${fmtDate(range.from)} – ${fmtDate(range.to)}` : fmtDate(day)
  const today = useMemo(() => isPeriod ? periodStats(data, roster, days.length) : dayStats(rowsOn(day), roster),
    [rows, data, roster, range, scope])
  const yday = useMemo(() => {
    if (isPeriod) return null
    const r = rowsOn(prevDay); return r.length ? dayStats(r, roster) : null
  }, [rows, roster, prevDay, scope, isPeriod])
  const series = useMemo(() => days.map(d => ({ date: d, ...dayStats(rowsOn(d), roster) })), [rows, roster, range, scope])

  // Per-state view for the map and table (selected period, or the single day).
  const states = useMemo(() => {
    const names = [...new Set(roster.map(s => s.state))].sort()
    return names.map(state => {
      const ro = roster.filter(s => s.state === state)
      const period = data.filter(r => r.state === state)
      const d = isPeriod ? periodStats(period, ro, days.length) : dayStats(rowsOn(day).filter(r => r.state === state), ro)
      const trend = days.map(dd => pct(new Set(rowsOn(dd).filter(r => r.state === state).map(r => r.uid || r.who)).size, ro.length))
      return {
        state, coordinators: ro.length, ...d, trend,
        latestRate: pct(new Set(rowsOn(day).filter(r => r.state === state).map(r => r.uid || r.who)).size, ro.length),
        issues: period.filter(r => r.security || r.critical).length,
        flaggedPct: pct(period.filter(r => r.flags.length).length, period.length),
      }
    })
  }, [rows, roster, data, range, scope])


  // Daily trend series for the charts.
  const chartSeries = useMemo(() => days.map(d => {
    const r = rowsOn(d)
    const o = { date: d, label: fmtDate(d), expected: roster.length }
    Object.keys(STATUS).forEach(k => { o[k] = r.filter(x => x.status === k).length })
    o.staff = new Set(r.map(x => x.uid || x.who)).size
    o.rate = pct(o.staff, roster.length)
    return o
  }), [rows, roster, range, scope])

  // Auto-generated "needs attention" list, most severe first.
  const attention = useMemo(() => {
    const out = []
    const lastDays = days.slice(-3)
    if (lastDays.length === 3) {
      const recent = new Set(filterRows(rows, scope, { from: lastDays[0], to: day }).map(r => r.uid))
      const silent = roster.filter(s => !recent.has(s.id))
      if (silent.length) out.push({
        sev: 'warning', page: 'attendance', tab: 'silent3',
        title: `${silent.length} coordinator${silent.length > 1 ? 's' : ''} silent for 3+ days`,
        body: silent.slice(0, 4).map(s => `${s.who} (${s.state})`).join(' · ') + (silent.length > 4 ? ` · +${silent.length - 4} more` : ''),
      })
    }
    const sec = data.filter(r => r.security), crit = data.filter(r => r.critical)
    if (sec.length) out.push({
      sev: 'critical', page: 'issues',
      title: `${sec.length} security or access incident${sec.length > 1 ? 's' : ''} reported`,
      body: `In ${[...new Set(sec.map(r => r.work_state))].join(', ')}. Latest: ${fmtDate(sec[sec.length - 1].date)}, ${sec[sec.length - 1].work_lga}.`,
    })
    if (crit.length) out.push({
      sev: 'warning', page: 'issues',
      title: `${crit.length} critical issue${crit.length > 1 ? 's' : ''} escalated to State teams`,
      body: `Across ${new Set(crit.map(r => r.work_state)).size} states in this period.`,
    })
    if (today.unverified) out.push({
      sev: 'warning', page: 'issues',
      title: `${today.unverified} check-in${today.unverified > 1 ? 's' : ''} outside the LGA without redeployment`,
      body: `${isPeriod ? `Between ${periodLabel}` : `On ${fmtDate(day)}`}. Reasons given are listed under Issues.`,
    })
    // Count people, not check-ins (some coordinators submit more than once a day).
    // Always the latest day: it is about who still needs to update the form now.
    const oldToday = [...new Set(rowsOn(day).filter(r => r.old_form).map(r => r.uid || r.who))]
    if (oldToday.length) out.push({
      sev: 'info', page: null,
      title: `${oldToday.length} coordinator${oldToday.length > 1 ? 's' : ''} still on an old form version (${fmtDate(day)})`,
      body: 'Old versions cannot record redeployment. Ask them to update the form in Kobo Collect.',
    })
    const flagCounts = {}
    data.forEach(r => r.flags.forEach(f => { flagCounts[f] = (flagCounts[f] || 0) + 1 }))
    const top = Object.entries(flagCounts).sort((a, b) => b[1] - a[1])[0]
    if (top) out.push({
      sev: 'info', page: 'quality',
      title: `${100 - pct(data.filter(r => !r.flags.length).length, data.length)}% of check-ins triggered a quality check`,
      body: `Most common: “${FLAGS[top[0]]?.label || top[0]}” (${top[1]}).`,
    })
    const low = [...states].filter(s => s.coordinators).sort((a, b) => a.rate - b.rate).slice(0, 3)
    if (low.length > 1) out.push({
      sev: 'info', page: 'attendance',
      title: isPeriod ? 'Lowest check-in rates in this period' : `Lowest check-in rates on ${fmtDate(day)}`,
      body: low.map(s => `${s.state} ${s.rate}%`).join(' · '),
    })
    return out
  }, [states, rows, data, roster, range, scope, today])

  const rateSpark = series.map(s => s.rate)
  const nStates = states.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Headline narration */}
      <Narrative eyebrow={isPeriod ? `${fmtDate(range.from)} – ${fmtDate(range.to, true)} · ${days.length} days` : fmtDay(day)}
        lead={isPeriod
          ? `Coordinators checked in on ${today.rate}% of expected days (${today.checkedIn.toLocaleString()} of ${today.expected.toLocaleString()}).`
          : `${today.rate}% of field coordinators checked in (${today.checkedIn} of ${roster.length}).`}>
        {nStates > 1 && (() => {
          const sorted = [...states].sort((a, b) => a.rate - b.rate)
          const lo = sorted[0], hi = sorted[sorted.length - 1]
          return <>State rates ranged from {lo.rate}% in {lo.state} to {hi.rate}% in {hi.state}. </>
        })()}
        {today.checkins > 0 && <>{today.atPostPct}% of check-ins were inside the assigned LGA or on a verified redeployment{yday ? `, ${today.atPostPct >= yday.atPostPct ? 'up' : 'down'} from ${yday.atPostPct}% the day before` : ''}. </>}
        {attention.filter(a => a.sev === 'critical').length > 0 && <>{attention.filter(a => a.sev === 'critical').length} item{attention.filter(a => a.sev === 'critical').length > 1 ? 's need' : ' needs'} immediate attention.</>}
      </Narrative>

      {/* Hero indicators */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <HeroStat periodNote={isPeriod ? `Across ${periodLabel} · daily trend` : null} label={isPeriod ? 'Check-in rate (period)' : 'Coordinators checked in'} value={today.rate} suffix="%"
          delta={<Delta now={today.rate} prev={yday?.rate} />} spark={rateSpark} sparkDomain={[0, 100]}
          note={isPeriod ? `${today.checkedIn.toLocaleString()} of ${today.expected.toLocaleString()} coordinator-days` : `${today.checkedIn} of ${roster.length} coordinators`} />
        <HeroStat periodNote={isPeriod ? `Across ${periodLabel} · daily trend` : null} label="At assigned post" value={today.atPostPct} suffix="%"
          delta={<Delta now={today.atPostPct} prev={yday?.atPostPct} />} spark={series.map(s => s.checkins ? s.atPostPct : null)} sparkDomain={[0, 100]}
          note="Inside own LGA or verified redeployment" />
        <HeroStat periodNote={isPeriod ? `Across ${periodLabel} · daily trend` : null} label="Outside LGA, not redeployed" value={today.unverified}
          delta={<Delta now={today.unverified} prev={yday?.unverified} unit="" invert />} spark={series.map(s => s.unverified)}
          note={`${isPeriod ? 'Check-ins in period' : 'No release code entered'}${today.oldFormOutside ? ` · +${today.oldFormOutside} on old form` : ''}`} />
        <HeroStat periodNote={isPeriod ? `Across ${periodLabel} · daily trend` : null} label="Passing quality checks" value={today.cleanPct} suffix="%"
          delta={<Delta now={today.cleanPct} prev={yday?.cleanPct} />} spark={series.map(s => s.checkins ? s.cleanPct : null)} sparkDomain={[0, 100]}
          note="24 automated checks built into the form" />
      </div>

      {/* Map + attention */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.08fr) minmax(320px, 1fr)', gap: 10, alignItems: 'stretch' }}>
        <ChartCard title="Check-in rate by state" desc={`${isPeriod ? `${periodLabel} (days checked in ÷ expected)` : fmtDate(day, true)} · click a state to focus the dashboard on it.`}>
          <NigeriaMap
            stats={states.map(s => ({ state: s.state, value: s.rate, detail: isPeriod ? `${s.checkedIn} of ${s.expected} coordinator-days · ${s.atPostPct}% at post` : `${s.checkedIn} of ${s.coordinators} coordinators · ${s.atPostPct}% at post` }))}
            selected={filters.state === 'all' ? null : filters.state}
            onSelect={st => setFilters({ ...filters, state: filters.state === st ? 'all' : st })}
            metricLabel="Check-in rate"
          />
        </ChartCard>
        <ChartCard title="Needs attention" desc="Generated from the data for the selected period." fill>
          <Attention items={attention} navigate={navigate} />
        </ChartCard>
      </div>

      {/* Trends */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 10 }}>
        <ChartCard title="Daily check-in rate" desc={`Share of the ${roster.length} expected coordinators who checked in each day.`}>
          <ReportingRateChart series={chartSeries} height={165} />
        </ChartCard>
        <ChartCard title="Where coordinators checked in" desc="Daily check-ins by the form's LGA boundary check and redeployment codes.">
          <LocationStackChart series={chartSeries} height={165} />
        </ChartCard>
      </div>

      {/* State comparison */}
      <ChartCard title="State comparison" pad={false}
        desc={`Sorted by check-in rate (${periodLabel}). Hover a column name for its definition; click a row to focus on a state.`}>
        <div className="scroll-box" style={{ overflow: 'auto', maxHeight: 340 }}>
          <table className="tbl">
            <thead>
              <tr>
                <HelpTh help="Programme state. Click a row to focus the whole dashboard on that state.">State</HelpTh>
                <HelpTh className="num" help="Coordinators on the roster for this state (LGA Coordinators plus the State Coordinator), each expected to check in once a day.">Coordinators</HelpTh>
                <HelpTh help={isPeriod ? `Days checked in ÷ (coordinators × ${days.length} days), each coordinator counted once per day. Bar colours match the map.` : `Share of the state's coordinators who checked in at least once on ${fmtDate(day)}. Bar colours match the map.`}>Check-in rate · {periodLabel}</HelpTh>
                <HelpTh help={`Daily check-in rate from ${fmtDate(range.from)} to ${fmtDate(range.to)}. The dot is the latest day.`}>Trend</HelpTh>
                {isPeriod && <HelpTh className="num" help={`Share of the state's coordinators who checked in on the last day of the period (${fmtDate(day)}).`}>{fmtDate(day)}</HelpTh>}
                <HelpTh className="num" help={`Share of check-ins (${periodLabel}) where the form's GPS boundary check placed the coordinator inside their own LGA, or they entered a valid redeployment code.`}>At post</HelpTh>
                <HelpTh className="num" help={`Check-ins (${periodLabel}) outside the coordinator's LGA with no redeployment code entered. Their reasons are listed on the Issues page.`}>Outside, not redeployed</HelpTh>
                <HelpTh className="num" help="Share of the period's check-ins that triggered at least one of the form's automated quality checks (e.g. same GPS as the previous day, summary copied). A flag means review, not proof of a problem.">Quality flagged</HelpTh>
                <HelpTh className="num" help="Security or access incidents plus critical issues escalated to the State team, reported in the selected period.">Security / critical</HelpTh>
              </tr>
            </thead>
            <tbody>
              {[...states].sort((a, b) => b.rate - a.rate || a.state.localeCompare(b.state)).map(s => (
                <tr key={s.state} onClick={() => setFilters({ ...filters, state: filters.state === s.state ? 'all' : s.state })}
                  style={{ cursor: 'pointer', background: filters.state === s.state ? 'var(--eha-blue-10)' : undefined }}>
                  <td style={{ fontWeight: 600 }}>{s.state}</td>
                  <td className="num">{s.coordinators}</td>
                  <td><RateBar value={s.rate} /></td>
                  <td><Sparkline values={s.trend} width={90} height={22} domain={[0, 100]} /></td>
                  {isPeriod && <td className="num">{s.latestRate}%</td>}
                  <td className="num">{s.checkins ? `${s.atPostPct}%` : '–'}</td>
                  <td className="num" style={{ color: s.unverified ? 'var(--crit-ink)' : 'var(--ink-4)', fontWeight: s.unverified ? 600 : 400 }}>{s.unverified || '–'}</td>
                  <td className="num">{s.flaggedPct ? `${s.flaggedPct}%` : '–'}</td>
                  <td className="num" style={{ color: s.issues ? 'var(--crit-ink)' : 'var(--ink-4)', fontWeight: s.issues ? 600 : 400 }}>{s.issues || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

    </div>
  )
}

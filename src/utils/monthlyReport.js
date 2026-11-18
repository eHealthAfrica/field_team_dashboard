// Field Consultants' Check-in & Field Performance Report - month-end report,
// built in the browser from the dashboard's own data (same approach as the LC
// dashboard's report downloads). Consultants are identified by post
// ("Fagge LGA", "Kano SC"), never by name - the published data has no names.
//
// A reporting cycle runs from the 24th of the previous month to the 23rd.

import { ACTIVITIES, OUTPUTS, FLAGS, addDays, daysBetween, lgaDayOutputs, pct } from './data'

export const DEFAULT_EXPECTED_DAYS = 22   // threshold used in the LC monthly reports

const RULES = {
  outside_no_redeploy: 'Outside the assigned LGA with no redeployment code',
  date_problem: 'Date problem (finished another day, phone clock set back, or dated after it was sent)',
  duplicate: 'Extra check-in on a day already counted (one per consultant per day)',
}
const DATE_FLAGS = ['finished_other_day', 'clock_moved_back', 'date_after_submission']

// ----------------------------------------------------------------- cycles

export function cycleBounds(ym) {            // 'YYYY-MM' -> 24th prev month .. 23rd
  const [y, m] = ym.split('-').map(Number)
  const end = `${ym}-23`
  const prev = new Date(Date.UTC(y, m - 2, 24)).toISOString().slice(0, 10)
  return { from: prev, to: end }
}

export function cycleFor(dateStr) {          // which cycle a date belongs to
  const [y, m, d] = dateStr.split('-').map(Number)
  if (d <= 23) return `${y}-${String(m).padStart(2, '0')}`
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function cyclesInData(rows) {
  const set = new Set(rows.map(r => cycleFor(r.date)))
  return [...set].sort().reverse()
}

export const cycleName = ym => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const fd = d => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// ----------------------------------------------------------------- analysis

export function analyseCycle({ rows, staff, cycle, state = 'all', expectedDays = DEFAULT_EXPECTED_DAYS }) {
  const { from, to } = cycleBounds(cycle)
  const lastData = rows.reduce((m, r) => (r.date > m ? r.date : m), '')
  const periodEnd = lastData && lastData < to ? lastData : to
  const roster = staff.filter(s => state === 'all' || s.state === state)
  const ids = new Set(roster.map(s => s.id))

  const recs = rows
    .filter(r => r.date >= from && r.date <= periodEnd && (state === 'all' || r.state === state))
    .map(r => ({ ...r }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

  // Rule-based validity - the same rules every cycle.
  for (const x of recs) {
    x.reason = x.status === 'outside_not_redeployed' ? 'outside_no_redeploy'
      : x.flags.some(f => DATE_FLAGS.includes(f)) ? 'date_problem' : null
  }
  const seen = new Set()
  for (const x of recs) {
    if (x.reason) continue
    const k = `${x.uid || x.who}|${x.date}`
    if (seen.has(k)) x.reason = 'duplicate'; else seen.add(k)
  }
  recs.forEach(x => { x.valid = !x.reason })

  const firstData = recs.length ? recs[0].date : from
  const liveFrom = firstData > from ? firstData : from
  const liveDays = daysBetween(liveFrom, periodEnd)
  // The standard (22 of a ~31-day cycle) scales in proportion when only part of
  // the cycle has data - a new form, or a draft before the 23rd.
  const cycleDays = daysBetween(from, to).length
  const expected = liveDays.length >= cycleDays ? expectedDays
    : Math.max(1, Math.min(liveDays.length, Math.round(expectedDays * liveDays.length / cycleDays)))

  const byUid = new Map()
  recs.forEach(x => { const k = x.uid || x.who; if (!byUid.has(k)) byUid.set(k, []); byUid.get(k).push(x) })

  const people = roster.map(p => {
    const rs = byUid.get(p.id) || []
    const vdays = new Set(rs.filter(x => x.valid).map(x => x.date))
    const reasons = {}
    rs.forEach(x => { if (x.reason) reasons[x.reason] = (reasons[x.reason] || 0) + 1 })
    return {
      ...p, total: rs.length, invalid: rs.filter(x => !x.valid).length, valid: rs.filter(x => x.valid).length,
      validDays: vdays.size, anyDays: new Set(rs.map(x => x.date)).size, met: vdays.size >= expected,
      last: rs.length ? rs[rs.length - 1].date : null, reasons,
    }
  })

  const states = [...new Set(roster.map(p => p.state))].sort().map(st => {
    const ps = people.filter(p => p.state === st)
    const rs = recs.filter(x => x.state === st)
    return {
      state: st, lgas: new Set(ps.map(p => p.lga).filter(Boolean)).size, expected: ps.length,
      reporting: ps.filter(p => p.total).length, valid: rs.filter(x => x.valid).length, total: rs.length,
      met: ps.filter(p => p.met).length,
      coverage: pct(ps.reduce((n, p) => n + p.validDays, 0), ps.length * liveDays.length),
    }
  })

  // Outside-LGA exceptions, one row per consultant
  const outMap = new Map()
  recs.filter(x => x.status !== 'home_lga').forEach(x => {
    const k = x.uid || x.who; if (!outMap.has(k)) outMap.set(k, []); outMap.get(k).push(x)
  })
  const outside = [...outMap.values()].map(rs => {
    const st = new Set(rs.map(x => x.status))
    const found = Object.entries(rs.reduce((m, x) => { const f = x.found_lga || 'Outside programme area'; m[f] = (m[f] || 0) + 1; return m }, {}))
      .sort((a, b) => b[1] - a[1])[0][0]
    const dists = rs.map(x => x.dist_km).filter(v => v != null)
    return {
      who: rs[0].who, state: rs[0].state, lga: rs[0].home_lga, found,
      days: new Set(rs.map(x => x.date)).size, maxKm: dists.length ? Math.max(...dists) : null,
      outcome: st.has('outside_not_redeployed') ? 'Pending - no redeployment code'
        : st.has('outside_old_form') ? 'Pending - old form version' : 'Verified - redeployment code',
      reasons: [...new Set(rs.map(x => x.outside_reason).filter(Boolean))].join('; ').slice(0, 220),
    }
  }).sort((a, b) => (a.outcome.startsWith('Pending') ? 0 : 1) - (b.outcome.startsWith('Pending') ? 0 : 1) || b.days - a.days)

  // Data quality (dimensions from the PM template, mapped to this form)
  const fc = {}; recs.forEach(x => x.flags.forEach(f => { fc[f] = (fc[f] || 0) + 1 }))
  // Records with at least one of the flags (a record can carry several flags)
  const sumF = list => recs.filter(x => x.flags.some(f => list.includes(f))).length
  const dq = [
    ['Missing consultant name', 0, 'Blocked by the form: login must match the roster'],
    ['Missing phone number', 0, 'Blocked by the form (pre-flight check)'],
    ['Incorrect phone date/time', sumF(['clock_moved_back', 'finished_other_day', 'date_after_submission', 'odd_hour']), 'Clock set back, finished another day, dated after sending, odd hour'],
    ['Missing coordinates', 0, 'GPS is mandatory in the form'],
    ['GPS precision / implausible location', sumF(['same_gps_as_last', 'far_from_last', 'moved_during_form', 'far_outside']), 'Same GPS as last, >50 km jump, moved during form, >20 km outside'],
    ['Missing / unusable photo evidence', recs.filter(x => x.selfie === false).length, 'Check-ins with no selfie attached'],
    ['Duplicate / suspicious submissions', recs.filter(x => x.reason === 'duplicate' || x.flags.some(f => ['copied_from_last', 'other_user_on_phone', 'rushed', 'open_too_long'].includes(f))).length, 'Same-day repeats, copied summary, shared phone, rushed or left open'],
    ['Other validation issues', sumF(['retrieved_gt_issued', 'tracks_gt_deployed', 'charge_ne_deployed', 'qc_gt_deployed', 'settlements_lt_wards', 'mlos_new_gt_validated', 'teams_gt_phones', 'all_phones_faulty', 'many_activities', 'many_wards', 'meeting_only_day', 'outside_field_work', 'evening_review_in_morning']), 'Consistency and plausibility checks built into the form'],
  ]

  // Activities (valid check-ins) and outputs (each LGA once per day, never added across days)
  const valid = recs.filter(x => x.valid)
  const act = {}
  valid.forEach(x => x.acts.forEach(a => { act[x.state] = act[x.state] || {}; act[x.state][a] = (act[x.state][a] || 0) + 1 }))
  const daily = {}
  lgaDayOutputs(valid).forEach(r => { daily[r.date] = daily[r.date] || {}; for (const k in r.out) daily[r.date][k] = (daily[r.date][k] || 0) + r.out[k] })
  const outputs = OUTPUTS.map(o => {
    const vals = Object.entries(daily).map(([d, v]) => [d, v[o.key] || 0]).filter(([, v]) => v)
    if (!vals.length) return null
    const peak = vals.reduce((b, c) => (c[1] > b[1] ? c : b))
    return { label: o.label, days: vals.length, avg: Math.round(vals.reduce((n, [, v]) => n + v, 0) / vals.length), peak: peak[1], peakDay: peak[0] }
  }).filter(Boolean)

  const reasonCounts = {}; recs.forEach(x => { if (x.reason) reasonCounts[x.reason] = (reasonCounts[x.reason] || 0) + 1 })
  return {
    cycle, from, to, periodEnd, partial: periodEnd < to, state, liveFrom, liveDays, expected, expectedCfg: expectedDays,
    people, states, outside, dq, act, outputs, recs, reasonCounts,
    total: recs.length, valid: valid.length, invalid: recs.length - valid.length,
    reporting: people.filter(p => p.total).length, met: people.filter(p => p.met).length,
    belowValid: people.filter(p => !p.met), belowAny: people.filter(p => p.anyDays < expected),
    security: recs.filter(x => x.security), critical: recs.filter(x => x.critical),
    orphans: recs.filter(x => !ids.has(x.uid)).length,
  }
}

// ----------------------------------------------------------------- Word document

export async function downloadMonthlyReport(opts) {
  const a = analyseCycle(opts)
  const D = await import('docx')
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, HeadingLevel, AlignmentType, BorderStyle } = D

  const NAVY = '123B5D'
  const n = (k, one, many = `${one}s`) => `${k.toLocaleString()} ${k === 1 ? one : many}`
  const TODO = t => `[To complete${t ? `: ${t}` : ''}]`
  const txt = (s, o = {}) => new TextRun({ text: String(s ?? ''), font: 'Aptos', size: o.size ?? 19, bold: o.bold, italics: o.italic, color: o.color })
  const P = (s, o = {}) => new Paragraph({ children: [txt(s, o)], spacing: { after: o.after ?? 120 }, alignment: o.align })
  const H = s => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 }, children: [new TextRun({ text: s, font: 'Aptos', bold: true, size: 26, color: NAVY })] })
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFC7D1' }
  const borders = { top: border, bottom: border, left: border, right: border }
  const cell = (v, o = {}) => new TableCell({
    borders, width: o.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined,
    shading: o.head ? { type: ShadingType.CLEAR, color: 'auto', fill: NAVY } : o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ children: [txt(v, { size: o.size ?? 16, bold: o.head || o.bold, color: o.head ? 'FFFFFF' : undefined })] })],
  })
  const T = (header, rows, widths, size = 16) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, { head: true, w: widths?.[i], size })) }),
      ...rows.map(r => new TableRow({ children: r.map((v, i) => cell(v, { w: widths?.[i], size, bold: r._bold })) })),
    ],
  })
  const gap = () => P('', { after: 60 })

  const month = cycleName(a.cycle)
  const scope = a.state === 'all' ? `All ${a.states.length} states` : `${a.state} State`
  const nd = a.liveDays.length, exp = a.expected, N = a.people.length
  const below = a.belowValid.length
  const pending = a.outside.filter(o => o.outcome.startsWith('Pending')).length
  // Several states: compare states. One state: compare its coordinators.
  const units = a.states.length > 1
    ? a.states.map(s => ({ label: s.state, v: s.coverage }))
    : a.people.map(p => ({ label: p.who, v: pct(p.validDays, nd) }))
  const byCov = [...units].sort((x, y) => y.v - x.v || x.label.localeCompare(y.label))
  const best = byCov.slice(0, 2), worst = byCov.slice(-2).reverse()
  const unitWord = a.states.length > 1 ? 'state' : 'coordinator'
  const now = new Date(Date.now() + 3600e3).toISOString().slice(0, 16).replace('T', ' ')
  const totalCov = pct(a.people.reduce((n, p) => n + p.validDays, 0), N * nd)

  const rcCounts = {}
  a.belowValid.forEach(p => {
    const k = p.total === 0 ? 'No check-in at all in the period'
      : Object.keys(p.reasons).length ? `Submissions made but some invalid (${Object.keys(p.reasons).map(r => RULES[r].split(' (')[0].toLowerCase()).join(', ')})`
        : 'Checked in on too few days'
    rcCounts[k] = (rcCounts[k] || 0) + 1
  })
  const actions = [
    below && `Follow up the ${n(below, 'consultant')} below ${exp} valid days (Annex B)`,
    pending && `Verify the ${n(pending, 'pending outside-LGA exception')} (Annex D)`,
    a.outside.some(o => o.outcome.includes('old form')) && 'Ensure every consultant updates to the current form version',
    a.security.length && `Review the ${n(a.security.length, 'security incident')} with State teams (Annex E)`,
  ].filter(Boolean)
  const topActs = Object.keys(ACTIVITIES).map(k => [k, Object.values(a.act).reduce((n, s) => n + (s[k] || 0), 0)])
    .sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k]) => k)
  const post = p => p.who + (p.role === 'sc' ? '' : '')

  const children = [
    P('FIELD CONSULTANTS’', { bold: true, size: 24, color: NAVY, after: 0 }),
    P('CHECK-IN & FIELD PERFORMANCE REPORT', { bold: true, size: 40, color: NAVY, after: 60 }),
    P('Submission compliance, field presence, activity delivery and data quality', { italic: true, size: 20 }),
    T(['REPORTING DETAILS', 'DETAILS'], [
      ['Reporting month / period', `${month} cycle: ${fd(a.from)} – ${fd(a.to)}${a.partial ? ` (draft - data to ${fd(a.periodEnd)})` : ''}`],
      ['Programme / project', 'eHealth Africa field team (LGA and State Coordinators)'],
      ['State / operational area', a.state === 'all' ? `${a.states.length} states: ${a.states.map(s => s.state).join(', ')}` : a.state],
      ['Prepared by', TODO('name, role')], ['Reviewed by', TODO('name, role')],
      ['Date of submission', TODO('DD Month YYYY')], ['Version', `Draft 1 - generated from the Field Team Dashboard, ${now} WAT`],
    ], [30, 70]),
    gap(),
    P('Reporting principle: verified check-in submissions are the evidence base. Submitted records are distinguished from valid records using written rules (section 2), exceptions are explained, and every corrective action has an owner and a due date. Consultants are identified by post (LGA or State Coordinator).', { size: 17 }),

    H('1. Executive summary'),
    P(`Over ${nd} reporting day${nd === 1 ? '' : 's'} (${fd(a.liveFrom)} – ${fd(a.periodEnd)}), ${a.reporting} of ${N} consultants submitted check-ins: ${a.total.toLocaleString()} submissions, of which ${a.valid.toLocaleString()} (${pct(a.valid, a.total)}%) were valid. ${n(a.met, 'consultant')} (${pct(a.met, N)}%) reached ${exp} valid days; ${below} did not. ${n(a.outside.length, 'consultant')} checked in outside their assigned LGA at least once; ${pending} of these still need verification. Consultants raised ${n(a.security.length, 'security incident')} and ${n(a.critical.length, 'critical issue')}.`),
    T(['Executive summary element', 'Narrative / result'], [
      ['Overall performance status', TODO("Green / Amber / Red with a brief explanation - reviewer's judgement against the agreed standard")],
      ['Key achievement(s)', `Highest valid-day coverage by ${unitWord}: ${best.map(u => `${u.label} (${u.v}%)`).join(', ')}. ${pct(a.valid, a.total)}% of submissions valid.`],
      ['Key concern(s)', `${n(below, 'consultant')} below ${exp} valid days; lowest coverage by ${unitWord}: ${worst.map(u => `${u.label} (${u.v}%)`).join(', ')}; ${n(pending, 'unverified outside-LGA exception')}.`],
      ['Management attention required', TODO('decision, support or escalation required')],
      ['Overall conclusion', TODO('one-paragraph assessment')],
    ], [30, 70]),

    H('2. Reporting scope and methodology'),
    T(['Item', 'Specification'], [
      ['Reporting period', `${fd(a.from)} – ${fd(a.to)} (cycle ends on the 23rd)${a.partial ? `; this draft covers data to ${fd(a.periodEnd)}` : ''}`],
      ['Expected reporting days', `${exp} valid days${exp < a.expectedCfg ? ` (the standard ${a.expectedCfg} of ${daysBetween(a.from, a.to).length} cycle days, scaled to the ${nd} days with data)` : ''}`],
      ['Consultant population', `${N} on the approved roster in the form: ${n(a.people.filter(p => p.role === 'lc').length, 'LGA Coordinator')}, ${n(a.people.filter(p => p.role === 'sc').length, 'State Coordinator')} (${scope})`],
      ['Data source(s)', "KoboToolbox form 'Field Team Daily Check-in': submissions, GPS boundary check, redeployment codes, selfie, form-built quality flags"],
      ['Cut-off date and time', `${opts.fetchedAt || now} (latest dashboard data)`],
      ['Validation approach', `A submission is invalid if: ${Object.values(RULES).map((r, i) => `(${i + 1}) ${r}`).join('; ')}. Valid days = distinct days with at least one valid submission.`],
      ['Exclusions / limitations', `Form live from ${fd(a.liveFrom)}. Check-ins on old form versions cannot record redeployment (listed for review, not counted invalid). Activity figures are self-reported. ${TODO('leave, onboarding, network downtime, approved exceptions')}`],
    ], [30, 70]),

    H('3. Performance dashboard'),
    T(['Indicator', 'Result', 'Calculation / definition'], [
      ['Consultants expected to report', N, 'Active consultants on the approved roster'],
      ['Consultants with ≥1 submission', a.reporting, 'Unique consultants with at least one record'],
      ['Total check-in submissions', a.total.toLocaleString(), 'All records dated within the period'],
      ['Valid submissions', a.valid.toLocaleString(), 'Records passing the validation rules (section 2)'],
      ['Invalid submissions', a.invalid.toLocaleString(), Object.entries(a.reasonCounts).map(([k, v]) => `${RULES[k].split(' (')[0]}: ${v}`).join('; ') || '-'],
      ['Valid submission rate', `${pct(a.valid, a.total)}%`, 'Valid ÷ total submissions × 100'],
      ['Consultants meeting expected days', `${a.met} / ${pct(a.met, N)}%`, `Consultants with ≥${exp} valid days`],
      ['Consultants below expected valid days', below, `Fewer than ${exp} valid days (Annex B)`],
      ['Consultants below expected total counts', a.belowAny.length, `Fewer than ${exp} days with any submission`],
      ['Outside-assigned-LGA exceptions', `${a.outside.length} consultants / ${a.outside.reduce((n, o) => n + o.days, 0).toLocaleString()} days`, 'Days with a check-in outside the assigned LGA (Annex D)'],
      ['Records with missing coordinates', '0 / 0%', 'GPS is mandatory in the form'],
      ['Records with identity flags', a.recs.filter(x => x.flags.includes('other_user_on_phone')).length, 'Phone last used by another consultant'],
    ], [34, 18, 48]),

    H('4. Submission compliance and coverage'),
    P(`4.1 Consultants not meeting the ${exp}-day threshold (all consultants in Annex A)`, { bold: true }),
    T(['S/N', 'Consultant (post)', 'State', 'Total', 'Invalid', 'Valid', 'Valid days', 'Status'],
      [...a.belowValid].sort((x, y) => x.validDays - y.validDays || x.state.localeCompare(y.state)).map((p, i) => [i + 1, post(p), p.state, p.total, p.invalid, p.valid, p.validDays, 'Not met']),
      [6, 30, 16, 9, 9, 9, 10, 11], 15),
    gap(),
    P('4.2 Coverage by state', { bold: true }),
    T(['State', 'LGAs', 'Expected consultants', 'Reporting', 'Valid submissions', 'Coverage rate', 'Below threshold'],
      [...a.states.map(s => [s.state, s.lgas, s.expected, s.reporting, s.valid.toLocaleString(), `${s.coverage}%`, s.expected - s.met]),
        Object.assign(['TOTAL', a.states.reduce((n, s) => n + s.lgas, 0), N, a.reporting, a.valid.toLocaleString(), `${totalCov}%`, below], { _bold: true })],
      [18, 10, 14, 13, 16, 14, 15]),
    P(`Coverage rate = valid days ÷ (consultants × ${nd} reporting days). ${TODO('interpret differences between states')}`, { italic: true, size: 17 }),

    H('5. Geographic presence and field deployment verification'),
    P('The form checks every check-in against the assigned LGA boundary and records redeployment release codes. A GPS exception is not treated as misconduct until reviewed. Location is where most outside check-ins were made; distance is the furthest any single check-in was from the coordinator’s own LGA, across all days.', { size: 18 }),
    T(['Consultant (post)', 'Assigned state', 'Most frequent location', 'Days outside', 'Furthest from own LGA', 'Verification outcome', 'Reason given'],
      a.outside.filter(o => o.outcome.startsWith('Pending')).map(o => [o.who, o.state, o.found, o.days, o.maxKm != null ? `${o.maxKm} km` : '-', o.outcome, o.reasons || TODO('follow-up')]),
      [16, 11, 15, 9, 9, 18, 22], 15),
    gap(),
    T(['Geographic verification summary', 'Value'], [
      ['Consultants with an outside-LGA check-in', a.outside.length],
      ['Verified by redeployment code (approved deployment)', a.outside.filter(o => o.outcome.startsWith('Verified')).length],
      ['Pending - old form version (redeployment not recordable)', a.outside.filter(o => o.outcome.includes('old form')).length],
      ['Pending - no redeployment code', a.outside.filter(o => o.outcome.includes('no redeployment')).length],
      ['Missing or unusable coordinate records', 0],
    ], [75, 25]),

    H('6. Field activities and delivery'),
    T(['State', ...topActs.map(k => ACTIVITIES[k])], Object.keys(a.act).sort().map(s => [s, ...topActs.map(k => a.act[s][k] || 0)]), null, 15),
    P('Activity-days = valid check-ins logging each activity. Outputs count each LGA once per day and are never added across days, because the form asks for that day’s figures.', { italic: true, size: 17 }),
    T(['Output', 'Days reported', 'Average per day', 'Peak day'], a.outputs.map(o => [o.label, o.days, o.avg.toLocaleString(), `${o.peak.toLocaleString()} on ${fd(o.peakDay)}`]), [34, 18, 20, 28]),
    P(`Narrative assessment: ${TODO('what the activity data means for implementation progress and quality; activity is self-reported')}`, { size: 18 }),

    H('7. Data quality and audit findings'),
    T(['Data-quality dimension', 'Records flagged', 'How detected', 'Resolved', 'Outstanding', 'Corrective measure'],
      a.dq.map(([n, c, how]) => [n, c, how, TODO(), TODO(), TODO()]), [22, 10, 32, 11, 11, 14], 15),
    P(`Data quality conclusion: ${TODO('is the dataset fit for management use; limitations; records withheld')}`, { size: 18 }),

    H('8. Performance exceptions and root-cause analysis'),
    P(`8.1 Consultants below ${exp} valid days: ${below} (section 4.1 and Annex B).`),
    T(['Observed gap', 'Consultants', 'Likely root cause', 'Proposed response'],
      Object.entries(rcCounts).sort((x, y) => y[1] - x[1]).map(([g, n]) => [g, n, TODO('evidence-based cause'), TODO('response')]), [40, 12, 24, 24]),

    H('9. Risks, decisions and management support'),
    T(['Risk / decision required', 'Likelihood', 'Impact', 'Mitigation / decision', 'Owner', 'Due date'], [[TODO(), '', '', '', '', ''], [TODO(), '', '', '', '', '']]),
    H('10. Corrective action and improvement tracker'),
    T(['ID', 'Finding / action', 'Priority', 'Responsible', 'Due date', 'Success measure', 'Status'],
      actions.map((t, i) => [`A${String(i + 1).padStart(2, '0')}`, t, TODO(), TODO(), TODO(), TODO(), 'Open']), [7, 33, 11, 13, 11, 15, 10], 15),
    H('11. Conclusion and priorities for the next period'),
    T(['Area', 'Conclusion / next-period priority'],
      ['Overall performance judgement', 'Priority 1', 'Priority 2', 'Priority 3', 'Support required from management', 'Expected improvement by next report'].map(k => [k, TODO()]), [35, 65]),
    H('12. Review and approval'),
    T(['Prepared by', 'Reviewed by', 'Approved by'], [Array(3).fill('Name:          Role:          Signature:          Date:')]),

    H('Annex A. Consultant-level submission and validity summary'),
    T(['Consultant (post)', 'State', 'Total', 'Invalid', 'Valid', 'Valid days', `Met ${exp}?`, 'Last check-in'],
      [...a.people].sort((x, y) => x.state.localeCompare(y.state) || (x.role === 'sc' ? -1 : 1) - (y.role === 'sc' ? -1 : 1) || x.who.localeCompare(y.who))
        .map(p => [post(p), p.state, p.total, p.invalid, p.valid, p.validDays, p.met ? 'Met' : 'Not met', p.last ? fd(p.last) : 'None']),
      [26, 14, 9, 9, 9, 10, 10, 13], 14),
    H(`Annex B. Consultants below ${exp} valid days`),
    T(['Consultant (post)', 'State', 'Total', 'Invalid', 'Valid days', 'Reason / explanation', 'Supervisor assessment', 'Action'],
      [...a.belowValid].sort((x, y) => x.validDays - y.validDays).map(p => [post(p), p.state, p.total, p.invalid, p.validDays, '', '', '']), [20, 12, 8, 8, 9, 15, 15, 13], 14),
    H('Annex D. Outside-assigned-LGA exception log'),
    T(['Consultant (post)', 'Assigned state', 'Most frequent location', 'Days', 'Furthest from own LGA', 'Outcome', 'Reasons given'],
      a.outside.map(o => [o.who, o.state, o.found, o.days, o.maxKm != null ? `${o.maxKm} km` : '-', o.outcome, o.reasons]), [16, 11, 15, 7, 10, 18, 23], 14),
    H('Annex E. Security incidents and critical issues'),
    T(['Date', 'Type', 'Consultant (post)', 'Where', 'Description'],
      [...a.security.map(x => [x.date, 'Security', x.who, `${x.work_state} · ${x.work_lga}`, x.security_desc]),
        ...a.critical.map(x => [x.date, 'Critical', x.who, `${x.work_state} · ${x.work_lga}`, x.critical_desc])]
        .sort((p, q) => p[0].localeCompare(q[0])).map(([d, ...rest]) => [fd(d), ...rest]),
      [11, 9, 16, 18, 46], 14),

    H('Indicator definitions and reporting rules'),
    T(['Term / indicator', 'Definition applied'], [
      ['Total submissions', 'Check-in records dated within the reporting period, before validity exclusions.'],
      ['Valid submission', 'A record that breaks none of the rules in section 2. Only the first valid record per consultant per day counts.'],
      ['Valid days', 'Distinct days with at least one valid check-in.'],
      ['Compliance threshold', `${exp} valid days in this cycle (standard ${a.expectedCfg}, as in the LC reports; scaled in proportion when only part of the cycle has data).`],
      ['Outside-LGA exception', "Check-in outside the assigned LGA by the form's GPS boundary check. Verified when a redeployment release code was entered."],
      ['Coverage rate', 'Valid days ÷ (consultants × reporting days).'],
      ['Reporting population', 'Approved roster in the form at the cut-off. Consultants are identified by post, not by name.'],
    ], [28, 72]),
    P('Detailed daily attendance and record-level quality flags (with Kobo IDs) can be downloaded as CSV from the Attendance and Data quality pages.', { italic: true, size: 16 }),
  ]

  const doc = new Document({
    creator: 'Field Team Dashboard', title: `Field Consultants Check-in Report - ${month}`,
    styles: {
      default: { document: { run: { font: 'Aptos', size: 19 } } },
      // Real heading style, so sections show in Word's navigation pane / table of contents
      paragraphStyles: [{
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: 'Aptos', size: 26, bold: true, color: NAVY }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 },
      }],
    },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 950, right: 950 } } }, children }],
  })
  const blob = await Packer.toBlob(doc)
  const name = `Field_Consultants_Report_${a.cycle}${a.state === 'all' ? '' : `_${a.state}`}${a.partial ? `_draft-${a.periodEnd}` : ''}.docx`
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 2000)
  return { name, summary: a }
}

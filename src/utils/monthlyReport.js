// Field Consultants' Check-in & Field Performance Report - month-end report,
// built in the browser from the dashboard's own data (same approach as the LC
// dashboard's report downloads). Consultants are identified by post
// ("Fagge LGA", "Kano SC"), never by name - the published data has no names.
//
// A reporting cycle runs from the 24th of the previous month to the 23rd.

import { ACTIVITIES, OUTPUTS, addDays, daysBetween, lgaDayOutputs, pct } from './data'

export const DEFAULT_EXPECTED_DAYS = 22   // set in the PM's report template ("Below 22 days"); never scaled

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

// The period is either a reporting cycle ('YYYY-MM') or any from/to dates.
// A from/to range that matches a cycle exactly is treated as that cycle.
export function analyseCycle({ rows, staff, cycle, from: f, to: t, state = 'all', expectedDays = DEFAULT_EXPECTED_DAYS }) {
  const { from, to } = f && t ? { from: f, to: t } : cycleBounds(cycle)
  const cb = cycleBounds(cycleFor(to))
  cycle = cb.from === from && cb.to === to ? cycleFor(to) : null
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
  // The PM's standard as written in the template (22 valid days). It is not
  // scaled: in a draft the count is "so far" and consultants can still reach it.
  const expected = expectedDays

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
    belowValid: people.filter(p => !p.met), belowAny: people.filter(p => p.total < expected),
    security: recs.filter(x => x.security), critical: recs.filter(x => x.critical),
    orphans: recs.filter(x => !ids.has(x.uid)).length,
  }
}

// ----------------------------------------------------------------- report content
// One content model drives all three formats (Word, PDF, PowerPoint).
// Everything that can be worked out from the data is filled in; narrative,
// root causes, risks and actions are drafted by fixed rules from the figures
// using the rules stated in the report. Nothing is left blank for hand completion.

const NAVY = '123B5D'
const BLUE = '0090FC'
const LIME = 'E2EE64'
const nf = (k, one, many = `${one}s`) => `${k.toLocaleString()} ${k === 1 ? one : many}`
const andList = xs => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const median = xs => {
  if (!xs.length) return 0
  const s = [...xs].sort((p, q) => p - q), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
const nextCycle = ym => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` }

const REASON_CAUSE = {
  outside_no_redeploy: 'checking in outside the assigned LGA without a redeployment code',
  date_problem: 'wrong phone date/time or forms finished on a later day',
  duplicate: 'repeat check-ins on a day already counted',
}
const DQ_FIX = {
  'Incorrect phone date/time': 'Set phones to automatic date and time; submit on the day',
  'GPS precision / implausible location': 'Supervisor spot-check of the flagged locations',
  'Missing / unusable photo evidence': 'Remind consultants that a selfie is part of each check-in',
  'Duplicate / suspicious submissions': 'One check-in per day, on the consultant’s own phone',
  'Other validation issues': 'Review the figures with the consultant; refresher on the form fields',
}

export function buildReport(opts) {
  const a = analyseCycle(opts)
  const isCycle = !!a.cycle
  const month = isCycle ? cycleName(a.cycle) : `${fd(a.from)} – ${fd(a.to)}`
  const periodLabel = isCycle ? `${month} cycle` : `Period ${month}`
  const multi = a.states.length > 1
  const scope = multi ? `All ${a.states.length} states` : `${a.state === 'all' ? a.states[0]?.state : a.state} State`
  const nd = a.liveDays.length, exp = a.expected, N = a.people.length
  const below = a.belowValid.length
  const pendingList = a.outside.filter(o => o.outcome.startsWith('Pending'))
  const pending = pendingList.length
  const noCode = a.outside.filter(o => o.outcome.includes('no redeployment')).length
  const oldFormRecs = a.recs.filter(x => x.status === 'outside_old_form').length
  const sharedPhone = a.recs.filter(x => x.flags.includes('other_user_on_phone')).length
  const dateProb = a.reasonCounts.date_problem || 0
  const now = new Date(Date.now() + 3600e3).toISOString().slice(0, 16).replace('T', ' ')
  const today = now.slice(0, 10)
  const totalCov = pct(a.people.reduce((k, p) => k + p.validDays, 0), N * nd)
  const validRate = pct(a.valid, a.total)
  const quickDue = addDays(a.periodEnd, 7)
  const cycleDue = a.partial ? a.to : cycleBounds(nextCycle(cycleFor(a.to))).to

  // Several states: compare states. One state: compare its coordinators.
  const units = (multi
    ? a.states.map(s => ({ label: s.state, v: s.coverage }))
    : a.people.map(p => ({ label: p.who, v: pct(p.validDays, nd) })))
  const byCov = [...units].sort((x, y) => y.v - x.v || x.label.localeCompare(y.label))
  const best = byCov.slice(0, 2), worst = byCov.slice(-2).reverse()
  const unitWord = multi ? 'state' : 'coordinator'
  const belowAvg = units.filter(u => u.v < totalCov).length

  // Consultants below the threshold, grouped by what the data shows
  const groups = { none: [], invalid: [], few: [] }
  a.belowValid.forEach(p => groups[p.total === 0 ? 'none' : p.anyDays >= exp ? 'invalid' : 'few'].push(p))
  const invalidReasons = {}
  groups.invalid.forEach(p => Object.entries(p.reasons).forEach(([r, k]) => { if (r !== 'duplicate') invalidReasons[r] = (invalidReasons[r] || 0) + k }))
  const topInvalid = Object.entries(invalidReasons).sort((x, y) => y[1] - x[1]).map(([r]) => REASON_CAUSE[r])
  const ROOT = {
    none: {
      gap: 'No check-in at all in the period',
      cause: 'Post not active in the form: consultant not yet onboarded, without a working phone or data, or post vacant',
      response: 'State Coordinator to confirm the status of each post, then onboard, equip or replace',
    },
    invalid: {
      gap: `Checked in on ${exp}+ days, but invalid submissions left them short`,
      cause: topInvalid.length ? `Submissions made but invalid, mainly ${andList(topInvalid)}` : 'Submissions made but invalid',
      response: 'Enter the redeployment code when working in another LGA; keep the phone on automatic date and time',
    },
    few: {
      gap: 'Checked in on too few days',
      cause: `Irregular reporting: a median of ${median(groups.few.map(p => p.anyDays))} days with any check-in, against ${exp} expected`,
      response: 'Daily reminder from the State Coordinator and a weekly review of the dashboard Attendance page',
    },
  }
  const groupOf = p => (p.total === 0 ? 'none' : p.anyDays >= exp ? 'invalid' : 'few')

  // Corrective actions: drafted from the findings, highest priority first
  const actions = [
    a.security.length && { area: 'Security', text: `Review the ${nf(a.security.length, 'security incident')} with State teams and record the follow-up (Annex H)`, priority: 'High', owner: 'Programme Manager with State Coordinators', due: quickDue, measure: 'Every incident has a recorded follow-up' },
    groups.none.length && { area: 'Compliance', text: `Confirm the status of the ${nf(groups.none.length, 'post')} with no check-in at all (onboard, equip or replace)`, priority: 'High', owner: 'State Coordinators', due: quickDue, measure: 'Every rostered post submits at least one check-in' },
    pending && { area: 'Presence', text: `Verify the ${nf(pending, 'pending outside-LGA exception')} (Annex D)`, priority: noCode ? 'High' : 'Medium', owner: 'State Coordinators', due: quickDue, measure: 'No pending exceptions at the next report' },
    below && { area: 'Compliance', text: `Follow up the ${nf(below, 'consultant')} below ${exp} valid days (Annex B)`, priority: 'Medium', owner: 'State Coordinators', due: cycleDue, measure: 'Follow-up recorded for each consultant in Annex B' },
    oldFormRecs && { area: 'Data quality', text: `Update the form on every phone: ${nf(oldFormRecs, 'outside-LGA check-in')} came from old versions that cannot record redeployment`, priority: 'Medium', owner: 'Data team with State Coordinators', due: cycleDue, measure: 'No check-ins from old form versions' },
    dateProb && { area: 'Data quality', text: `Ask consultants to keep phones on automatic date and time (${nf(dateProb, 'submission')} invalid for date problems)`, priority: 'Medium', owner: 'State Coordinators', due: cycleDue, measure: 'No date-problem submissions' },
    sharedPhone && { area: 'Data quality', text: `Confirm each consultant uses their own phone (${nf(sharedPhone, 'check-in')} from a phone last used by someone else)`, priority: 'Low', owner: 'State Coordinators', due: cycleDue, measure: 'No shared-phone flags' },
  ].filter(Boolean).map((x, i) => ({ ...x, id: `A${String(i + 1).padStart(2, '0')}` }))
  const actRef = area => actions.filter(x => x.area === area).map(x => x.id).join(', ')

  const risks = [
    below && ['Low reporting compliance weakens evidence of field presence', `Occurred: ${below} of ${N} consultants`, 'Field presence cannot be confirmed for these posts', `Follow-up by State Coordinators (${actRef('Compliance')})`, 'State Coordinators', fd(cycleDue)],
    pending && ['Work outside assigned LGAs not yet verified', `Occurred: ${nf(pending, 'consultant')}`, 'Possible unapproved movement or wrong LGA assignment', `Verify each case; use redeployment codes for approved moves (${actRef('Presence')})`, 'State Coordinators', fd(quickDue)],
    a.security.length && ['Security incidents in the field', `Occurred: ${nf(a.security.length, 'incident')}`, 'Staff safety and disrupted activities', `Review with State teams; escalate where needed (${actRef('Security')})`, 'Programme Manager', fd(quickDue)],
    (oldFormRecs || dateProb || sharedPhone) && ['Data integrity: old form versions, wrong dates or shared phones', `Occurred: ${[oldFormRecs && `${oldFormRecs} old-form`, dateProb && `${dateProb} date-problem`, sharedPhone && `${sharedPhone} shared-phone`].filter(Boolean).join(', ')} check-ins`, 'Less reliable compliance figures', `Form update and phone settings (${actRef('Data quality')})`, 'Data team', fd(cycleDue)],
  ].filter(Boolean)

  // Narrative
  const statusText = `${pct(a.met, N)}% of consultants met the ${exp}-day standard, ${validRate}% of submissions were valid and valid-day coverage was ${totalCov}%.`
  const achieveText = `Highest valid-day coverage by ${unitWord}: ${best.map(u => `${u.label} (${u.v}%)`).join(', ')}. ${validRate}% of submissions valid.`
  const concernText = `${nf(below, 'consultant')} below ${exp} valid days; lowest coverage by ${unitWord}: ${worst.map(u => `${u.label} (${u.v}%)`).join(', ')}; ${nf(pending, 'unverified outside-LGA exception')}.`
  const attention = actions.filter(x => x.priority === 'High').map(x => x.text)
  const attentionText = attention.length ? attention.join('; ') + '.' : 'No high-priority issue in the data this period.'
  const mainGap = Object.entries(groups).filter(([, v]) => v.length).sort((x, y) => y[1].length - x[1].length)[0]
  const conclusion = `In the ${isCycle ? periodLabel : `period ${month}`}${a.partial ? ` (draft, data to ${fd(a.periodEnd)})` : ''}, ${a.reporting} of ${N} consultants reported and ${validRate}% of their ${a.total.toLocaleString()} submissions were valid. Valid-day coverage was ${totalCov}%, highest in ${best[0]?.label} and lowest in ${worst[0]?.label}. ${below ? `${nf(below, 'consultant')} fell short of ${exp} valid days; the largest group (${mainGap[1].length}) ${mainGap[0] === 'none' ? 'did not check in at all' : mainGap[0] === 'invalid' ? 'lost days to invalid submissions' : 'checked in on too few days'}.` : `Every consultant reached ${exp} valid days.`} ${pending ? `${nf(pending, 'outside-LGA exception')} still need verification.` : 'All outside-LGA check-ins are verified.'} ${a.security.length ? `${nf(a.security.length, 'security incident')} and ${nf(a.critical.length, 'critical issue')} were raised.` : 'No security incidents were raised.'} Priorities for the next cycle are in section 11.`

  const zeroDays = a.liveDays.filter(d => !a.recs.some(x => x.date === d))
  const limits = [
    `Form live from ${fd(a.liveFrom)}${a.liveFrom > a.from ? `, so the period has ${nd} reporting days instead of ${daysBetween(a.from, a.to).length}` : ''}.`,
    zeroDays.length ? `No check-ins at all on ${andList(zeroDays.map(fd))} (possible network or system downtime).` : '',
    oldFormRecs ? `${nf(oldFormRecs, 'outside-LGA check-in')} came from old form versions that cannot record redeployment; these are listed for review, not counted invalid.` : '',
    'Activity figures are self-reported.',
    'Leave, onboarding dates and approved absences are not recorded in the form, so they are not excluded.',
  ].filter(Boolean).join(' ')

  const covNote = `Coverage rate = valid days ÷ (consultants × ${nd} reporting days). Coverage ranged from ${byCov[byCov.length - 1]?.v}% (${byCov[byCov.length - 1]?.label}) to ${byCov[0]?.v}% (${byCov[0]?.label}); ${belowAvg} of ${units.length} ${unitWord}s were below the overall rate of ${totalCov}%.`

  const topActs = Object.keys(ACTIVITIES).map(k => [k, Object.values(a.act).reduce((s, st) => s + (st[k] || 0), 0)])
    .sort((x, y) => y[1] - x[1]).slice(0, 6).filter(([, v]) => v).map(([k]) => k)
  const actTotals = topActs.map(k => [ACTIVITIES[k], Object.values(a.act).reduce((s, st) => s + (st[k] || 0), 0)])
  const stateActs = Object.entries(a.act).map(([s, m]) => [s, Object.values(m).reduce((p, q) => p + q, 0)]).sort((x, y) => y[1] - x[1])
  const actNarr = actTotals.length
    ? `The most logged activities were ${andList(actTotals.slice(0, 3).map(([l, v]) => `${l.toLowerCase()} (${v.toLocaleString()} activity-days)`))}.${multi && stateActs.length ? ` ${stateActs[0][0]} logged the most activity-days (${stateActs[0][1].toLocaleString()}).` : ''}${a.outputs.length ? ` On an average reporting day LGAs reported ${andList(a.outputs.slice(0, 3).map(o => `${o.avg.toLocaleString()} ${o.label.toLowerCase()}`))}.` : ''} All activity figures are self-reported and not verified against other sources.`
    : 'No activities were logged in valid check-ins this period.'

  const flaggedRecs = a.recs.filter(x => x.flags.length).length
  const topDq = [...a.dq].sort((x, y) => y[1] - x[1])[0]
  const dqConclusion = `${pct(a.recs.length - flaggedRecs, a.recs.length)}% of records carry no quality flag and ${validRate}% are valid under the section 2 rules. Invalid records (${a.invalid.toLocaleString()}) are left out of every compliance figure; flagged records that are still valid are kept and can be checked on the Data quality page. ${topDq && topDq[1] ? `The largest issue is ${topDq[0].toLowerCase()} (${topDq[1].toLocaleString()} records).` : ''} Resolution of flags is not recorded in the form, so all flagged records show as outstanding until reviewed.`

  const support = [
    oldFormRecs && 'Help field staff update the form on their phones',
    a.security.length && 'Security follow-up with State teams',
    groups.none.length && `Decision on the ${nf(groups.none.length, 'post')} with no check-in (replace or reassign)`,
  ].filter(Boolean)

  // ---------------------------------------------------------------- blocks
  const B = []
  const p = (text, o = {}) => B.push({ t: 'p', text, ...o })
  const h = text => B.push({ t: 'h', text })
  const tb = (head, rows, widths, size = 16, o = {}) => B.push({ t: 'table', head, rows: rows.map(r => r.map(v => (typeof v === 'number' ? v.toLocaleString() : String(v ?? '')))), widths, size, ...o })
  const gap = () => B.push({ t: 'gap' })

  p('FIELD CONSULTANTS’', { bold: true, size: 24, color: NAVY, after: 0 })
  p('CHECK-IN & FIELD PERFORMANCE REPORT', { bold: true, size: 40, color: NAVY, after: 60 })
  p('Submission compliance, field presence, activity delivery and data quality', { italic: true, size: 20 })
  tb(['REPORTING DETAILS', 'DETAILS'], [
    ['Reporting month / period', `${isCycle ? `${periodLabel}: ${fd(a.from)} – ${fd(a.to)}` : periodLabel}${a.partial ? ` (draft - data to ${fd(a.periodEnd)})` : ''}`],
    ['Programme / project', 'eHealth Africa field team (LGA and State Coordinators)'],
    ['State / operational area', multi ? `${a.states.length} states: ${a.states.map(s => s.state).join(', ')}` : scope],
    ['Prepared by', 'Field Team Dashboard (automated draft)'], ['Reviewed by', 'Programme Manager'],
    ['Date of submission', fd(today)], ['Version', `Draft 1 - generated from the Field Team Dashboard, ${now} WAT`],
  ], [30, 70])
  gap()
  p('Reporting principle: verified check-in submissions are the evidence base. Submitted records are distinguished from valid records using written rules (section 2), exceptions are explained, and every corrective action has an owner and a due date. Narrative, root causes, risks and actions are drafted automatically from the data by the fixed rules set out in the indicator definitions. Consultants are identified by post (LGA or State Coordinator).', { size: 17 })

  h('1. Executive summary')
  p(`Over ${nf(nd, 'reporting day')} (${fd(a.liveFrom)} – ${fd(a.periodEnd)}), ${a.reporting} of ${N} consultants submitted check-ins: ${a.total.toLocaleString()} submissions, of which ${a.valid.toLocaleString()} (${validRate}%) were valid. ${nf(a.met, 'consultant')} (${pct(a.met, N)}%) reached ${exp} valid days; ${below} did not. ${nf(a.outside.length, 'consultant')} checked in outside their assigned LGA at least once; ${pending} of these still need verification. Consultants raised ${nf(a.security.length, 'security incident')} and ${nf(a.critical.length, 'critical issue')}.`)
  tb(['Executive summary element', 'Narrative / result'], [
    ['Overall performance status', statusText],
    ['Key achievement(s)', achieveText],
    ['Key concern(s)', concernText],
    ['Management attention required', attentionText],
    ['Overall conclusion', conclusion],
  ], [30, 70])

  h('2. Reporting scope and methodology')
  tb(['Item', 'Specification'], [
    ['Reporting period', `${fd(a.from)} – ${fd(a.to)} ${isCycle ? ' (cycle ends on the 23rd)' : ''}${a.partial ? `; this draft covers data to ${fd(a.periodEnd)}` : ''}`],
    ['Expected reporting days', `${exp} valid days, as set in the report template${a.partial ? `. The period is not finished (data to ${fd(a.periodEnd)}), so counts below ${exp} are so far, not final` : ''}`],
    ['Consultant population', `${N} on the approved roster in the form: ${nf(a.people.filter(x => x.role === 'lc').length, 'LGA Coordinator')}, ${nf(a.people.filter(x => x.role === 'sc').length, 'State Coordinator')} (${scope})`],
    ['Data source(s)', "KoboToolbox form 'Field Team Daily Check-in': submissions, GPS boundary check, redeployment codes, selfie, form-built quality flags"],
    ['Cut-off date and time', `${opts.fetchedAt || now} (latest dashboard data)`],
    ['Validation approach', `A submission is invalid if: ${Object.values(RULES).map((r, i) => `(${i + 1}) ${r}`).join('; ')}. Valid days = distinct days with at least one valid submission.`],
    ['Exclusions / limitations', limits],
  ], [30, 70])

  h('3. Performance dashboard')
  const kpis = [
    ['Consultants expected to report', N, 'Active consultants on the approved roster'],
    ['Consultants with ≥1 submission', a.reporting, 'Unique consultants with at least one record'],
    ['Total check-in submissions', a.total.toLocaleString(), 'All records dated within the period'],
    ['Valid submissions', a.valid.toLocaleString(), 'Records passing the validation rules (section 2)'],
    ['Invalid submissions', a.invalid.toLocaleString(), Object.entries(a.reasonCounts).map(([k, v]) => `${RULES[k].split(' (')[0]}: ${v}`).join('; ') || '-'],
    ['Valid submission rate', `${validRate}%`, 'Valid ÷ total submissions × 100'],
    ['Consultants meeting expected days', `${a.met} / ${pct(a.met, N)}%`, `Consultants with ≥${exp} valid days`],
    ['Consultants below expected valid days', below, `Fewer than ${exp} valid days (Annex B)`],
    ['Consultants below expected total counts', a.belowAny.length, `Fewer than ${exp} total check-in records`],
    ['Outside-assigned-LGA exceptions', `${a.outside.length} consultants / ${a.outside.reduce((k, o) => k + o.days, 0).toLocaleString()} days`, 'Days with a check-in outside the assigned LGA (Annex D)'],
    ['Records with missing coordinates', '0 / 0%', 'GPS is mandatory in the form'],
    ['Records with identity flags', sharedPhone, 'Phone last used by another consultant'],
  ]
  tb(['Indicator', 'Result', 'Calculation / definition'], kpis, [34, 18, 48])

  h('4. Submission compliance and coverage')
  p(`4.1 Consultants not meeting the ${exp}-day threshold (all consultants in Annex A)`, { bold: true })
  tb(['S/N', 'Consultant (post)', 'State', 'Total', 'Invalid', 'Valid', 'Valid days', 'Status'],
    [...a.belowValid].sort((x, y) => x.validDays - y.validDays || x.state.localeCompare(y.state)).map((x, i) => [i + 1, x.who, x.state, x.total, x.invalid, x.valid, x.validDays, 'Not met']),
    [6, 30, 16, 9, 9, 9, 10, 11], 15)
  gap()
  p('4.2 Coverage by state', { bold: true })
  tb(['State', 'LGAs', 'Expected consultants', 'Reporting', 'Valid submissions', 'Coverage rate', 'Below threshold'],
    [...a.states.map(s => [s.state, s.lgas, s.expected, s.reporting, s.valid, `${s.coverage}%`, s.expected - s.met]),
      ['TOTAL', a.states.reduce((k, s) => k + s.lgas, 0), N, a.reporting, a.valid, `${totalCov}%`, below]],
    [18, 10, 14, 13, 16, 14, 15], 16, { boldLast: true })
  p(covNote, { italic: true, size: 17 })

  h('5. Geographic presence and field deployment verification')
  p('The form checks every check-in against the assigned LGA boundary and records redeployment release codes. A GPS exception is not treated as misconduct until reviewed. Location is where most outside check-ins were made; distance is the furthest any single check-in was from the coordinator’s own LGA, across all days.', { size: 18 })
  tb(['Consultant (post)', 'Assigned state', 'Most frequent location', 'Days outside', 'Furthest from own LGA', 'Verification outcome', 'Reason given'],
    pendingList.map(o => [o.who, o.state, o.found, o.days, o.maxKm != null ? `${o.maxKm} km` : '-', o.outcome, o.reasons || 'No reason given in the form']),
    [16, 11, 15, 9, 9, 18, 22], 15)
  gap()
  const geo = [
    ['Consultants with an outside-LGA check-in', a.outside.length],
    ['Verified by redeployment code (approved deployment)', a.outside.filter(o => o.outcome.startsWith('Verified')).length],
    ['Pending - old form version (redeployment not recordable)', a.outside.filter(o => o.outcome.includes('old form')).length],
    ['Pending - no redeployment code', noCode],
    ['Missing or unusable coordinate records', 0],
  ]
  tb(['Geographic verification summary', 'Value'], geo, [75, 25])

  h('6. Field activities and delivery')
  if (topActs.length) tb(['State', ...topActs.map(k => ACTIVITIES[k])], Object.keys(a.act).sort().map(s => [s, ...topActs.map(k => a.act[s][k] || 0)]), null, 15)
  p('Activity-days = valid check-ins logging each activity. Outputs count each LGA once per day and are never added across days, because the form asks for that day’s figures.', { italic: true, size: 17 })
  if (a.outputs.length) tb(['Output', 'Days reported', 'Average per day', 'Peak day'], a.outputs.map(o => [o.label, o.days, o.avg, `${o.peak.toLocaleString()} on ${fd(o.peakDay)}`]), [34, 18, 20, 28])
  p(`Narrative assessment: ${actNarr}`, { size: 18 })

  h('7. Data quality and audit findings')
  tb(['Data-quality dimension', 'Records flagged', 'How detected', 'Resolved', 'Outstanding', 'Corrective measure'],
    a.dq.map(([name, c, how]) => [name, c, how, c ? 'Not tracked' : '-', c, c ? (DQ_FIX[name] || 'Review with the consultant') : 'None needed']), [22, 10, 30, 10, 10, 18], 15)
  p(`Data quality conclusion: ${dqConclusion}`, { size: 18 })

  h('8. Performance exceptions and root-cause analysis')
  p(`8.1 Consultants below ${exp} valid days: ${below} (section 4.1 and Annex B).`)
  const rootRows = Object.entries(groups).filter(([, v]) => v.length).sort((x, y) => y[1].length - x[1].length).map(([k, v]) => [ROOT[k].gap, v.length, ROOT[k].cause, ROOT[k].response])
  tb(['Observed gap', 'Consultants', 'Likely root cause (from the data)', 'Proposed response'],
    rootRows.length ? rootRows : [['None - every consultant met the threshold', 0, '-', '-']], [26, 10, 34, 30])

  h('9. Risks, decisions and management support')
  tb(['Risk / decision required', 'Likelihood', 'Impact', 'Mitigation / decision', 'Owner', 'Due date'],
    risks.length ? risks : [['No risk identified from the data', '-', '-', '-', '-', '-']], [24, 14, 18, 24, 11, 9], 15)

  h('10. Corrective action and improvement tracker')
  tb(['ID', 'Finding / action', 'Priority', 'Responsible', 'Due date', 'Success measure', 'Status'],
    actions.length ? actions.map(x => [x.id, x.text, x.priority, x.owner, fd(x.due), x.measure, 'Open']) : [['-', 'No corrective action needed from the data', '-', '-', '-', '-', '-']],
    [6, 34, 9, 15, 11, 16, 9], 15)

  h('11. Conclusion and priorities for the next period')
  tb(['Area', 'Conclusion / next-period priority'], [
    ['Overall performance judgement', statusText],
    ['Priority 1', actions[0]?.text || 'Maintain current performance'],
    ['Priority 2', actions[1]?.text || '-'],
    ['Priority 3', actions[2]?.text || '-'],
    ['Support required from management', support.length ? support.join('; ') : 'None identified from the data'],
  ], [35, 65])

  h('12. Review and approval')
  tb(['Prepared by', 'Reviewed by'], [['Field Team Dashboard (automated draft)', 'Programme Manager']])

  h('Annex A. Consultant-level submission and validity summary')
  tb(['Consultant (post)', 'State', 'Total', 'Invalid', 'Valid', 'Valid days', `Met ${exp}?`, 'Last check-in'],
    [...a.people].sort((x, y) => x.state.localeCompare(y.state) || (x.role === 'sc' ? -1 : 1) - (y.role === 'sc' ? -1 : 1) || x.who.localeCompare(y.who))
      .map(x => [x.who, x.state, x.total, x.invalid, x.valid, x.validDays, x.met ? 'Met' : 'Not met', x.last ? fd(x.last) : 'None']),
    [26, 14, 9, 9, 9, 10, 10, 13], 14)
  h(`Annex B. Consultants below ${exp} valid days`)
  tb(['Consultant (post)', 'State', 'Total', 'Invalid', 'Valid days', 'Reason (from the data)', 'Suggested action'],
    [...a.belowValid].sort((x, y) => x.validDays - y.validDays).map(x => {
      const SHORT = { outside_no_redeploy: 'outside LGA, no code', date_problem: 'date problem', duplicate: 'repeat' }
      const rs = Object.entries(x.reasons).map(([r, k]) => `${k} ${SHORT[r]}`)
      const why = x.total === 0 ? 'No check-in in the period'
        : `${x.validDays} valid of ${x.anyDays} days with a check-in${rs.length ? `; invalid: ${rs.join(', ')}` : ''}; last ${fd(x.last)}`
      return [x.who, x.state, x.total, x.invalid, x.validDays, why, ROOT[groupOf(x)].response]
    }), [17, 10, 7, 7, 8, 29, 22], 14)
  h('Annex D. Outside-assigned-LGA exception log')
  tb(['Consultant (post)', 'Assigned state', 'Most frequent location', 'Days', 'Furthest from own LGA', 'Outcome', 'Reasons given'],
    a.outside.map(o => [o.who, o.state, o.found, o.days, o.maxKm != null ? `${o.maxKm} km` : '-', o.outcome, o.reasons || '-']), [16, 11, 15, 7, 10, 18, 23], 14)
  h('Annex H. Security incidents and critical issues')
  tb(['Date', 'Type', 'Consultant (post)', 'Where', 'Description'],
    [...a.security.map(x => [x.date, 'Security', x.who, `${x.work_state} · ${x.work_lga}`, x.security_desc]),
      ...a.critical.map(x => [x.date, 'Critical', x.who, `${x.work_state} · ${x.work_lga}`, x.critical_desc])]
      .sort((u, v) => u[0].localeCompare(v[0])).map(([d, ...rest]) => [fd(d), ...rest]),
    [11, 9, 16, 18, 46], 14)

  h('Indicator definitions and reporting rules')
  tb(['Term / indicator', 'Definition applied'], [
    ['Total submissions', 'Check-in records dated within the reporting period, before validity exclusions.'],
    ['Valid submission', 'A record that breaks none of the rules in section 2. Only the first valid record per consultant per day counts.'],
    ['Valid days', 'Distinct days with at least one valid check-in.'],
    ['Compliance threshold', `${exp} valid days, as set in the report template.`],
    ['Outside-LGA exception', "Check-in outside the assigned LGA by the form's GPS boundary check. Verified when a redeployment release code was entered."],
    ['Coverage rate', 'Valid days ÷ (consultants × reporting days).'],
    ['Drafted text', 'Narrative, root causes, risks, priorities, owners and due dates are drafted by fixed rules from the figures in this report. Due dates: verification and security items 7 days after the data cut-off; compliance and data-quality items by the end of the cycle still running (the next cycle, once this one has closed).'],
    ['Reporting population', 'Approved roster in the form at the cut-off. Consultants are identified by post, not by name.'],
  ], [28, 72])
  p('Detailed daily attendance and record-level quality flags (with Kobo IDs) can be downloaded as CSV from the Attendance and Data quality pages.', { italic: true, size: 16 })

  const base = `Field_Consultants_Report_${isCycle ? a.cycle : `${a.from}_to_${a.to}`}${a.state === 'all' ? '' : `_${a.state}`}${a.partial ? `_draft-${a.periodEnd}` : ''}`
  return {
    a, base, blocks: B, month, periodLabel, scope, now,
    deck: { nd, exp, N, below, pending, totalCov, validRate, units, byCov, unitWord, multi, statusText, conclusion, actions, risks, geo, actTotals, rootRows, support, achieveText, concernText },
  }
}

// ----------------------------------------------------------------- helpers

function saveBlob(blob, name) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 2000)
}

async function logoData() {
  try {
    const { default: url } = await import('../assets/eha-logo-white.png')
    if (url.startsWith('data:')) return url
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return `data:image/png;base64,${btoa(bin)}`
  } catch { return null }
}
const LOGO_RATIO = 624 / 181

// ----------------------------------------------------------------- Word

async function renderDocx(R) {
  const D = await import('docx')
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, HeadingLevel, BorderStyle } = D
  const txt = (s, o = {}) => new TextRun({ text: String(s ?? ''), font: 'Aptos', size: o.size ?? 19, bold: o.bold, italics: o.italic, color: o.color })
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFC7D1' }
  const borders = { top: border, bottom: border, left: border, right: border }
  const cell = (v, o = {}) => new TableCell({
    borders, width: o.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined,
    shading: o.head ? { type: ShadingType.CLEAR, color: 'auto', fill: NAVY } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ children: [txt(v, { size: o.size ?? 16, bold: o.head || o.bold, color: o.head ? 'FFFFFF' : undefined })] })],
  })
  const children = R.blocks.map(b => {
    if (b.t === 'p') return new Paragraph({ children: [txt(b.text, b)], spacing: { after: b.after ?? 120 } })
    if (b.t === 'gap') return new Paragraph({ children: [txt('')], spacing: { after: 60 } })
    if (b.t === 'h') return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 }, children: [new TextRun({ text: b.text, font: 'Aptos', bold: true, size: 26, color: NAVY })] })
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: b.head.map((x, i) => cell(x, { head: true, w: b.widths?.[i], size: b.size })) }),
        ...(b.rows.length ? b.rows : [b.head.map((_, i) => (i ? '' : 'None'))]).map((r, ri, all) => new TableRow({ children: r.map((v, i) => cell(v, { w: b.widths?.[i], size: b.size, bold: b.boldLast && ri === all.length - 1 })) })),
      ],
    })
  })
  const doc = new Document({
    creator: 'Field Team Dashboard', title: `Field Consultants Check-in Report - ${R.month}`,
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
  const name = `${R.base}.docx`
  saveBlob(await Packer.toBlob(doc), name)
  return name
}

// ----------------------------------------------------------------- PDF

// The built-in PDF fonts only cover Latin-1, so a few typographic characters are swapped.
const latin1 = s => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/…/g, '...').replace(/[^\x00-\xFF]/g, '')

async function renderPdf(R) {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = typeof at.default === 'function' ? at.default : at.default?.default || at.autoTable
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14, CW = W - 2 * M
  const rgb = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
  let y = M

  // Cover band with the eHA logo
  doc.setFillColor(...rgb(BLUE)); doc.rect(0, 0, W, 22, 'F')
  doc.setFillColor(...rgb(LIME)); doc.rect(0, 22, W, 1.2, 'F')
  const logo = await logoData()
  if (logo) doc.addImage(logo, 'PNG', M, 5.5, 11 * LOGO_RATIO, 11)
  y = 32

  const ensure = need => { if (y + need > H - M) { doc.addPage(); y = M } }
  for (const b of R.blocks) {
    if (b.t === 'gap') { y += 2; continue }
    if (b.t === 'h') {
      ensure(18); y += 4
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...rgb(NAVY))
      doc.text(latin1(b.text), M, y); y += 6; continue
    }
    if (b.t === 'p') {
      const fs = (b.size ?? 19) / 2
      doc.setFont('helvetica', b.bold && b.italic ? 'bolditalic' : b.bold ? 'bold' : b.italic ? 'italic' : 'normal')
      doc.setFontSize(fs); doc.setTextColor(...(b.color ? rgb(b.color) : [30, 30, 30]))
      const lines = doc.splitTextToSize(latin1(b.text), CW)
      const lh = fs * 0.42
      ensure(lines.length * lh + 2)
      doc.text(lines, M, y + lh * 0.8); y += lines.length * lh + ((b.after ?? 120) / 120) * 2 + 0.5
      continue
    }
    const fs = Math.max(6.5, b.size / 2 - 0.5)
    const body = b.rows.length ? b.rows : [b.head.map((_, i) => (i ? '' : 'None'))]
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, top: M, bottom: M },
      head: [b.head.map(latin1)], body: body.map(r => r.map(latin1)),
      styles: { font: 'helvetica', fontSize: fs, cellPadding: 1.4, lineColor: rgb('BFC7D1'), lineWidth: 0.15, textColor: [30, 30, 30], overflow: 'linebreak' },
      headStyles: { fillColor: rgb(NAVY), textColor: 255, fontStyle: 'bold' },
      columnStyles: b.widths ? Object.fromEntries(b.widths.map((w, i) => [i, { cellWidth: (CW * w) / 100 }])) : {},
      didParseCell: d => { if (b.boldLast && d.section === 'body' && d.row.index === body.length - 1) d.cell.styles.fontStyle = 'bold' },
    })
    y = doc.lastAutoTable.finalY + 3
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120)
    doc.text(latin1(`Field Consultants' Check-in & Field Performance Report · ${R.month} · ${R.scope}`), M, H - 6)
    doc.text(`Page ${i} of ${pages}`, W - M, H - 6, { align: 'right' })
  }
  const name = `${R.base}.pdf`
  saveBlob(doc.output('blob'), name)
  return name
}

// ----------------------------------------------------------------- PowerPoint (summary deck)

async function renderPptx(R) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const { a, deck: d } = R
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'                       // 13.33 x 7.5 in
  pptx.title = `Field Consultants Check-in Report - ${R.month}`
  const logo = await logoData()
  const FONT = 'Aptos'
  pptx.defineSlideMaster({
    title: 'EHA', background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 0, w: 13.33, h: 0.8, fill: { color: BLUE } } },
      { rect: { x: 0, y: 0.8, w: 13.33, h: 0.05, fill: { color: LIME } } },
      ...(logo ? [{ image: { data: logo, x: 11.55, y: 0.2, w: 0.4 * LOGO_RATIO, h: 0.4 } }] : []),
      { text: { text: `${R.periodLabel} · ${R.scope}${a.partial ? ' · draft' : ''}`, options: { x: 0.45, y: 7.05, w: 9, h: 0.3, fontFace: FONT, fontSize: 9, color: '7A8794' } } },
    ],
    slideNumber: { x: 12.5, y: 7.05, w: 0.5, h: 0.3, fontFace: FONT, fontSize: 9, color: '7A8794' },
  })
  const slide = title => {
    const s = pptx.addSlide({ masterName: 'EHA' })
    s.addText(title, { x: 0.45, y: 0.12, w: 10.8, h: 0.56, fontFace: FONT, fontSize: 22, bold: true, color: 'FFFFFF' })
    return s
  }
  const headCell = t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } })
  const table = (s, head, rows, o) => s.addTable([head.map(headCell), ...rows.map(r => r.map(v => ({ text: String(v ?? '') })))], {
    fontFace: FONT, fontSize: 11, color: '1E1E1E', border: { type: 'solid', pt: 0.5, color: 'BFC7D1' }, valign: 'middle', margin: 0.05, ...o,
  })
  const note = (s, text, y = 6.45) => s.addText(text, { x: 0.45, y, w: 12.4, h: 0.5, fontFace: FONT, fontSize: 11, italic: true, color: '55606B' })

  // 1. Title
  const t = pptx.addSlide()
  t.background = { color: BLUE }
  t.addShape(pptx.ShapeType.rect, { x: 0, y: 5.6, w: 13.33, h: 0.08, fill: { color: LIME }, line: { color: LIME } })
  if (logo) t.addImage({ data: logo, x: 0.7, y: 0.7, w: 0.7 * LOGO_RATIO, h: 0.7 })
  t.addText('FIELD CONSULTANTS’', { x: 0.7, y: 2.1, w: 12, h: 0.5, fontFace: FONT, fontSize: 20, bold: true, color: 'FFFFFF' })
  t.addText('Check-in & Field Performance Report', { x: 0.7, y: 2.6, w: 12, h: 0.9, fontFace: FONT, fontSize: 38, bold: true, color: 'FFFFFF' })
  t.addText(`${R.a.cycle ? `${R.periodLabel} · ${fd(a.from)} – ${fd(a.to)}` : R.periodLabel}${a.partial ? ` · draft, data to ${fd(a.periodEnd)}` : ''}`, { x: 0.7, y: 3.6, w: 12, h: 0.5, fontFace: FONT, fontSize: 18, color: 'FFFFFF' })
  t.addText(R.scope, { x: 0.7, y: 4.1, w: 12, h: 0.5, fontFace: FONT, fontSize: 18, color: LIME })
  t.addText(`Generated from the Field Team Dashboard, ${R.now} WAT · consultants identified by post`, { x: 0.7, y: 6.0, w: 12, h: 0.4, fontFace: FONT, fontSize: 11, color: 'FFFFFF' })

  // 2. Executive summary
  let s = slide('Executive summary')
  const tiles = [
    [`${a.reporting} / ${d.N}`, 'consultants reported'],
    [`${d.validRate}%`, 'of submissions valid'],
    [`${a.met} / ${d.N}`, `met ${d.exp} valid days`],
    [`${d.totalCov}%`, 'valid-day coverage'],
  ]
  tiles.forEach(([v, l], i) => {
    const x = 0.45 + i * 3.13
    s.addShape(pptx.ShapeType.rect, { x, y: 1.15, w: 2.95, h: 1.35, fill: { color: 'F1F7FD' }, line: { color: 'CCE9FE' } })
    s.addShape(pptx.ShapeType.rect, { x, y: 1.15, w: 0.07, h: 1.35, fill: { color: BLUE }, line: { color: BLUE } })
    s.addText(v, { x: x + 0.2, y: 1.25, w: 2.7, h: 0.7, fontFace: FONT, fontSize: 30, bold: true, color: NAVY })
    s.addText(l, { x: x + 0.2, y: 1.9, w: 2.7, h: 0.45, fontFace: FONT, fontSize: 13, color: '55606B' })
  })
  s.addText(d.conclusion, { x: 0.45, y: 2.75, w: 12.4, h: 1.55, fontFace: FONT, fontSize: 14, color: '1E1E1E', valign: 'top' })
  table(s, ['Summary', 'Result'], [['Key achievement(s)', d.achieveText], ['Key concern(s)', d.concernText], ['Performance status', d.statusText]], { x: 0.45, y: 4.4, w: 12.4, colW: [2.6, 9.8], fontSize: 12 })

  // 3. Coverage
  s = slide(`Valid-day coverage by ${d.unitWord}`)
  const shown = d.byCov.length > 25 ? d.byCov.slice(-25) : d.byCov
  const asc = [...shown].reverse()                  // bar charts draw the first category at the bottom
  s.addChart(pptx.ChartType.bar, [{ name: 'Coverage %', labels: asc.map(u => u.label), values: asc.map(u => u.v) }], {
    x: 0.45, y: 1.05, w: 8.2, h: 5.4, barDir: 'bar', chartColors: [BLUE], valAxisMaxVal: 100, valAxisMinVal: 0,
    showValue: true, dataLabelFormatCode: '0"%"', dataLabelFontSize: 9, dataLabelColor: '1E1E1E', catAxisLabelFontSize: shown.length > 15 ? 8 : 10,
    valAxisLabelFontSize: 9, valGridLine: { color: 'E6EAEE', size: 0.5 }, catAxisLabelFontFace: FONT, barGapWidthPct: 40, showLegend: false,
  })
  if (d.multi) {
    table(s, ['State', 'Expected', 'Below'], a.states.map(x => [x.state, x.expected, x.expected - x.met]), { x: 8.9, y: 1.05, w: 4.0, colW: [2.0, 1.0, 1.0], fontSize: 10 })
  } else {
    s.addText(`${d.byCov.length > 25 ? 'Lowest 25 coordinators shown. ' : ''}${d.below} of ${d.N} below ${d.exp} valid days.`, { x: 8.9, y: 1.05, w: 4.0, h: 1, fontFace: FONT, fontSize: 13, color: '1E1E1E' })
  }
  note(s, `Coverage = valid days ÷ (consultants × ${d.nd} reporting days). Overall ${d.totalCov}%.`)

  // 4. Compliance gaps
  s = slide(`Consultants below ${d.exp} valid days: ${d.below}`)
  table(s, ['Observed gap', 'Consultants', 'Likely root cause (from the data)', 'Proposed response'],
    d.rootRows.length ? d.rootRows : [['None - every consultant met the threshold', 0, '-', '-']], { x: 0.45, y: 1.1, w: 12.4, colW: [3.0, 1.3, 4.3, 3.8], fontSize: 12 })
  note(s, 'The full list is in Annex B of the Word or PDF report.')

  // 5. Geographic presence
  s = slide('Geographic presence and redeployment')
  table(s, ['Geographic verification summary', 'Value'], d.geo, { x: 0.45, y: 1.1, w: 5.4, colW: [4.4, 1.0], fontSize: 11 })
  const pend = a.outside.filter(o => o.outcome.startsWith('Pending')).slice(0, 10)
  if (pend.length) {
    table(s, ['Pending case (post)', 'State', 'Days', 'Outcome'], pend.map(o => [o.who, o.state, o.days, o.outcome.replace('Pending - ', '')]), { x: 6.15, y: 1.1, w: 6.7, colW: [2.2, 1.4, 0.7, 2.4], fontSize: 10 })
    note(s, `${pend.length < d.pending ? `Top ${pend.length} of ${d.pending} pending cases by days outside. ` : ''}Full log in Annex D.`)
  }

  // 6. Activities
  s = slide('Field activities and outputs')
  if (d.actTotals.length) {
    const acts = [...d.actTotals].reverse()
    s.addChart(pptx.ChartType.bar, [{ name: 'Activity-days', labels: acts.map(x => x[0]), values: acts.map(x => x[1]) }], {
      x: 0.45, y: 1.05, w: 6.4, h: 4.3, barDir: 'bar', chartColors: [BLUE], showValue: true, dataLabelFontSize: 9, catAxisLabelFontSize: 10,
      valAxisLabelFontSize: 9, valGridLine: { color: 'E6EAEE', size: 0.5 }, barGapWidthPct: 40, showLegend: false, showTitle: true, title: 'Activity-days (valid check-ins)', titleFontSize: 12,
    })
  }
  if (a.outputs.length) table(s, ['Output', 'Avg / day', 'Peak day'], a.outputs.slice(0, 9).map(o => [o.label, o.avg.toLocaleString(), `${o.peak.toLocaleString()} · ${fd(o.peakDay)}`]), { x: 7.1, y: 1.1, w: 5.75, colW: [2.6, 1.05, 2.1], fontSize: 10 })
  note(s, 'Self-reported. Outputs count each LGA once per day and are never added across days.', 5.6)

  // 7. Data quality
  s = slide('Data quality')
  table(s, ['Data-quality dimension', 'Records flagged', 'Corrective measure'], a.dq.map(([n, c]) => [n, c.toLocaleString(), c ? (DQ_FIX[n] || 'Review with the consultant') : 'None needed']), { x: 0.45, y: 1.1, w: 12.4, colW: [4.0, 1.8, 6.6], fontSize: 12 })
  note(s, `${d.validRate}% of submissions valid; invalid records are excluded from every compliance figure.`)

  // 8. Risks and actions
  s = slide('Risks and corrective actions')
  table(s, ['ID', 'Action', 'Priority', 'Responsible', 'Due'],
    d.actions.length ? d.actions.map(x => [x.id, x.text, x.priority, x.owner, fd(x.due)]) : [['-', 'No corrective action needed from the data', '-', '-', '-']],
    { x: 0.45, y: 1.1, w: 12.4, colW: [0.6, 6.6, 1.0, 2.6, 1.6], fontSize: 11 })

  // 9. Next period
  s = slide('Conclusion and priorities for the next period')
  table(s, ['Area', 'Next-period priority'], [
    ['Priority 1', d.actions[0]?.text || 'Maintain current performance'],
    ['Priority 2', d.actions[1]?.text || '-'],
    ['Priority 3', d.actions[2]?.text || '-'],
    ['Support required', d.support.length ? d.support.join('; ') : 'None identified from the data'],
  ], { x: 0.45, y: 1.1, w: 12.4, colW: [2.6, 9.8], fontSize: 13 })
  note(s, 'Drafted from the data by fixed rules. Owners and dates follow the rules in the full report.')

  const name = `${R.base}.pptx`
  saveBlob(await pptx.write({ outputType: 'blob' }), name)
  return name
}

// ----------------------------------------------------------------- entry point

export async function downloadReport(opts, format = 'docx') {
  const R = buildReport(opts)
  const name = format === 'pdf' ? await renderPdf(R) : format === 'pptx' ? await renderPptx(R) : await renderDocx(R)
  return { name, summary: R.a }
}

export const downloadMonthlyReport = opts => downloadReport(opts, 'docx')

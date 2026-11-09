// ---------------------------------------------------------------------------
// Labels - mirror the Kobo form's choice lists and QA calculations.
// ---------------------------------------------------------------------------

export const ACTIVITIES = {
  stk:   'Stakeholder engagement',
  trk:   'Uploading tracks',
  csup:  'Campaign supervision',
  eoc:   'EOC meeting',
  omeet: 'Other meetings',
  mlos:  'MLoS validation',
  dip:   'DIP development',
  plog:  'Phone logistics',
  ri:    'RI supportive supervision',
  pqc:   'Phone QCs',
  chg:   'Daily charging of devices',
  flag:  'Campaign flag-off',
  fbk:   'Daily feedback',
  erm:   'Evening review meeting',
  mdp:   'Morning deployment of phones',
  oth:   'Other activities',
}

export const ROLES = { lc: 'LGA Coordinator', sc: 'State Coordinator' }

export const STATUS = {
  home_lga:               { label: 'Inside own LGA',          color: 'var(--status-good)' },
  within_state:           { label: 'Redeployed (same state)', color: 'var(--series-1)' },
  interstate:             { label: 'Redeployed (other state)', color: 'var(--series-4)' },
  outside_not_redeployed: { label: 'Outside LGA, not redeployed', color: 'var(--status-critical)' },
  // Older form versions had no redeployment question - status unknown.
  outside_old_form:       { label: 'Outside LGA (old form, no redeploy question)', color: '#a8a7a0' },
}
export const STATUS_ORDER = ['home_lga', 'within_state', 'interstate', 'outside_not_redeployed', 'outside_old_form']

// QA flags computed inside the form. `group` drives the Data Quality page.
export const FLAGS = {
  outside_field_work:        { label: 'Field activity logged while outside LGA',     group: 'Location' },
  far_outside:               { label: 'More than 20 km outside LGA',                  group: 'Location' },
  same_gps_as_last:          { label: 'Exact same GPS as previous check-in',          group: 'Location' },
  far_from_last:             { label: 'Over 50 km from previous check-in',            group: 'Location' },
  moved_during_form:         { label: 'Moved over 2 km while filling the form',       group: 'Location' },
  odd_hour:                  { label: 'Checked in before 6am or after 9pm',           group: 'Timing' },
  rushed:                    { label: 'Form completed in under 3 minutes',            group: 'Timing' },
  open_too_long:             { label: 'Form open for over 3 hours',                   group: 'Timing' },
  finished_other_day:        { label: 'Finished on a different day from report date', group: 'Timing' },
  clock_moved_back:          { label: 'Phone clock earlier than previous report',     group: 'Timing' },
  evening_review_in_morning: { label: 'Evening review logged before 3pm',             group: 'Timing' },
  other_user_on_phone:       { label: 'Phone last used by another staff member',      group: 'Identity' },
  copied_from_last:          { label: 'Summary copied from previous report',          group: 'Identity' },
  retrieved_gt_issued:       { label: 'Phones retrieved > phones issued',             group: 'Consistency' },
  tracks_gt_deployed:        { label: 'Tracks uploaded > phones deployed',            group: 'Consistency' },
  charge_ne_deployed:        { label: 'Devices charged ≠ phones deployed',            group: 'Consistency' },
  qc_gt_deployed:            { label: 'Phones QC’d > phones deployed',                group: 'Consistency' },
  settlements_lt_wards:      { label: 'Fewer settlements than wards visited',         group: 'Consistency' },
  mlos_new_gt_validated:     { label: 'New settlements > settlements validated',      group: 'Consistency' },
  teams_gt_phones:           { label: 'Teams deployed > phones deployed',             group: 'Consistency' },
  all_phones_faulty:         { label: 'Every phone QC’d had an issue (5+)',           group: 'Consistency' },
  many_activities:           { label: 'More than 8 activities in one day',            group: 'Plausibility' },
  many_wards:                { label: 'More than 5 wards supervised in one day',      group: 'Plausibility' },
  meeting_only_day:          { label: 'Only meetings or engagement, no field work',   group: 'Plausibility' },
}

// Field outputs, grouped by the activity they belong to.
export const OUTPUTS = [
  { act: 'mdp',  key: 'mdp_phones',       label: 'Phones deployed' },
  { act: 'mdp',  key: 'mdp_teams',        label: 'Teams deployed' },
  { act: 'csup', key: 'csup_teams',       label: 'Teams supervised' },
  { act: 'csup', key: 'csup_wards',       label: 'Wards visited' },
  { act: 'csup', key: 'csup_settlements', label: 'Settlements visited' },
  { act: 'trk',  key: 'trk_num',          label: 'Phones with tracks uploaded' },
  { act: 'pqc',  key: 'pqc_checked',      label: 'Phones QC’d' },
  { act: 'pqc',  key: 'pqc_issues',       label: 'Phones with issues' },
  { act: 'chg',  key: 'chg_charged',      label: 'Devices charged' },
  { act: 'chg',  key: 'chg_not',          label: 'Devices not charged' },
  { act: 'plog', key: 'plog_issued',      label: 'Phones issued' },
  { act: 'plog', key: 'plog_retrieved',   label: 'Phones retrieved' },
  { act: 'mlos', key: 'mlos_validated',   label: 'Settlements validated' },
  { act: 'mlos', key: 'mlos_new',         label: 'New settlements found' },
  { act: 'dip',  key: 'dip_wards',        label: 'Wards with DIP template' },
  { act: 'stk',  key: 'stk_num',          label: 'Stakeholders engaged' },
  { act: 'erm',  key: 'erm_attendees',    label: 'Review meeting attendees' },
]

export const DIP_STATUS = { progress: 'In progress', completed: 'Completed', validated: 'Completed and validated' }

// ---------------------------------------------------------------------------
// Dates (all YYYY-MM-DD strings, WAT)
// ---------------------------------------------------------------------------

export const todayWAT = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10)

export function addDays(d, n) {
  const t = new Date(d + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

export function daysBetween(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export const fmtDate = (d, year = false) => d
  ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' })
  : ''

export const fmtDay = d => d
  ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  : ''

export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export function dataRange(rows) {
  if (!rows.length) return { min: todayWAT(), max: todayWAT() }
  let min = rows[0].date, max = rows[0].date
  for (const r of rows) { if (r.date < min) min = r.date; if (r.date > max) max = r.date }
  return { min, max }
}

// Resolve a preset into concrete from/to dates.
export function resolveRange(filters, rows) {
  const { max, min } = dataRange(rows)
  const end = max
  switch (filters.range) {
    case 'latest': return { from: end, to: end }
    case '7d':     return { from: addDays(end, -6) < min ? min : addDays(end, -6), to: end }
    case '14d':    return { from: addDays(end, -13) < min ? min : addDays(end, -13), to: end }
    case 'custom': return { from: filters.from || min, to: filters.to || end }
    default:       return { from: min, to: end }
  }
}

export function filterRoster(staff, f) {
  return staff.filter(s =>
    (f.state === 'all' || s.state === f.state) &&
    (f.role === 'all' || s.role === f.role))
}

export function filterRows(rows, f, range) {
  return rows.filter(r =>
    r.date >= range.from && r.date <= range.to &&
    (f.state === 'all' || r.state === f.state) &&
    (f.role === 'all' || r.role === f.role))
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

// One check-in per person per day counts towards attendance; repeats are
// reported separately so they don't inflate the reporting rate.
export function staffDays(rows) {
  const set = new Set()
  for (const r of rows) set.add(`${r.uid || r.who}|${r.date}`)
  return set
}

export function computeKPIs(rows, roster, range) {
  const days = daysBetween(range.from, range.to).length
  const sd = staffDays(rows)
  const people = new Set(rows.map(r => r.uid || r.who))
  const expected = roster.length * days
  const byStatus = Object.fromEntries(STATUS_ORDER.map(k => [k, 0]))
  rows.forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + 1 })
  const flagged = rows.filter(r => r.flags.length).length

  return {
    checkins: rows.length,
    days,
    rosterSize: roster.length,
    staffDays: sd.size,
    duplicates: rows.length - sd.size,
    reportingRate: pct(sd.size, expected),
    activeStaff: people.size,
    activePct: pct(people.size, roster.length),
    insidePct: pct(byStatus.home_lga, rows.length),
    redeployed: byStatus.within_state + byStatus.interstate,
    outsideUnverified: byStatus.outside_not_redeployed,
    outsidePct: pct(byStatus.outside_not_redeployed, rows.length),
    outsideOldForm: byStatus.outside_old_form,
    byStatus,
    flagged,
    flaggedPct: pct(flagged, rows.length),
    challenges: rows.filter(r => r.challenges.length).length,
    security: rows.filter(r => r.security).length,
    critical: rows.filter(r => r.critical).length,
  }
}

export function dailySeries(rows, roster, range) {
  const map = Object.fromEntries(daysBetween(range.from, range.to).map(d => [d, {
    date: d, label: fmtDate(d), expected: roster.length, people: new Set(),
    ...Object.fromEntries(STATUS_ORDER.map(k => [k, 0])),
  }]))
  for (const r of rows) {
    const day = map[r.date]; if (!day) continue
    day[r.status] = (day[r.status] || 0) + 1
    day.people.add(r.uid || r.who)
  }
  return Object.values(map).map(({ people, ...d }) => ({
    ...d, staff: people.size, rate: pct(people.size, d.expected),
  }))
}

export function activityCounts(rows) {
  const c = Object.fromEntries(Object.keys(ACTIVITIES).map(k => [k, 0]))
  rows.forEach(r => r.acts.forEach(a => { c[a] = (c[a] || 0) + 1 }))
  return Object.entries(c)
    .map(([key, n]) => ({ key, label: ACTIVITIES[key], n, pct: pct(n, rows.length) }))
    .sort((a, b) => b.n - a.n)
}

export function hourCounts(rows) {
  const c = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${String(h).padStart(2, '0')}:00`, n: 0 }))
  rows.forEach(r => { if (r.hour != null) c[r.hour].n++ })
  // trim to the span that has data, keeping at least 6am-9pm
  const first = Math.min(6, ...c.filter(x => x.n).map(x => x.hour))
  const last = Math.max(21, ...c.filter(x => x.n).map(x => x.hour))
  return c.slice(first, last + 1)
}

export function sumOutputs(rows) {
  const t = Object.fromEntries(OUTPUTS.map(o => [o.key, 0]))
  rows.forEach(r => { for (const k in r.out) if (k in t) t[k] += r.out[k] })
  return t
}

// Per-state table: roster vs. reporting, location and issues.
export function stateTable(rows, staff, range) {
  const days = daysBetween(range.from, range.to).length
  const states = [...new Set(staff.map(s => s.state))].sort()
  return states.map(state => {
    const st = staff.filter(s => s.state === state)
    const rs = rows.filter(r => r.state === state)
    const k = computeKPIs(rs, st, range)
    const lastDay = new Set(rows.filter(r => r.state === state && r.date === range.to).map(r => r.uid || r.who))
    return {
      state, roster: st.length, days,
      lastDay: lastDay.size, lastDayPct: pct(lastDay.size, st.length),
      ...k,
    }
  })
}

// Per-person attendance for the Attendance page.
export function staffAttendance(rows, staff, range) {
  const days = daysBetween(range.from, range.to)
  const byUser = new Map()
  for (const r of rows) {
    const k = r.uid || r.who
    if (!byUser.has(k)) byUser.set(k, [])
    byUser.get(k).push(r)
  }
  const known = new Set(staff.map(s => s.id))
  const list = staff.map(s => {
    const rs = (byUser.get(s.id) || []).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    const dates = new Set(rs.map(r => r.date))
    const last = rs[rs.length - 1]
    return {
      ...s,
      rows: rs,
      daysIn: dates.size,
      rate: pct(dates.size, days.length),
      byDay: Object.fromEntries(days.map(d => [d, rs.filter(r => r.date === d)])),
      last,
      flags: rs.reduce((n, r) => n + r.flags.length, 0),
      outside: rs.filter(r => r.status === 'outside_not_redeployed').length,
    }
  })
  // check-ins from people no longer on the roster
  const orphans = rows.filter(r => !known.has(r.uid))
  return { days, list, orphans }
}

export function flagCounts(rows) {
  const c = {}
  rows.forEach(r => r.flags.forEach(f => { c[f] = (c[f] || 0) + 1 }))
  return Object.entries(c)
    .map(([key, n]) => ({ key, n, label: FLAGS[key]?.label || key, group: FLAGS[key]?.group || 'Other' }))
    .sort((a, b) => b.n - a.n)
}

export function toCSV(headers, rows) {
  const esc = v => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.map(h => esc(h.label)).join(','), ...rows.map(r => headers.map(h => esc(h.get(r))).join(','))].join('\n')
}

export function downloadCSV(name, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}


// Outputs that describe the LGA, not the individual: when several
// coordinators (e.g. redeployed staff) report for the same LGA on the same
// day they report the SAME phones/teams, so take the highest figure rather
// than adding them up. Stakeholders engaged is personal, so it is summed.
const PERSONAL_OUTPUTS = new Set(['stk_num'])

// rows -> one record per (date, work state, work LGA) with de-duplicated outputs.
export function lgaDayOutputs(rows) {
  const m = new Map()
  for (const r of rows) {
    const key = `${r.date}|${r.work_state}|${r.work_lga}`
    if (!m.has(key)) m.set(key, { date: r.date, state: r.work_state, lga: r.work_lga, out: {} })
    const o = m.get(key).out
    for (const k in r.out) {
      const v = r.out[k] || 0
      o[k] = PERSONAL_OUTPUTS.has(k) ? (o[k] || 0) + v : Math.max(o[k] || 0, v)
    }
  }
  return [...m.values()]
}

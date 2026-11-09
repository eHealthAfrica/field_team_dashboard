import { useMemo, useState } from 'react'
import Sidebar, { NAV, SIDEBAR_W, SIDEBAR_COLLAPSED } from './components/Sidebar'
import TopBar from './components/TopBar'
import FilterBar, { HiddenFilters } from './components/FilterBar'
import Overview from './pages/Overview'
import Attendance from './pages/Attendance'
import Outputs from './pages/Outputs'
import Quality from './pages/Quality'
import Issues from './pages/Issues'
import { useData } from './hooks/useData'
import { dataRange, filterRoster, filterRows, resolveRange } from './utils/data'

const PAGES = { overview: Overview, attendance: Attendance, outputs: Outputs, quality: Quality, issues: Issues }

const INTRO = {
  overview:   'Daily presence and performance of eHA field coordinators',
  attendance: 'Who checked in, when and where - one row per coordinator post',
  outputs:    'What field teams reported delivering, by activity',
  quality:    'Automated checks that point to check-ins worth verifying',
  issues:     'Challenges, security incidents and escalations from the field',
}

const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
}

export default function App() {
  // Page comes from the URL hash (shareable links), then the last page visited.
  const [page, setPage] = useState(() => {
    const h = window.location.hash.slice(1)
    if (PAGES[h]) return h
    return PAGES[store.get('ftd_page')] ? store.get('ftd_page') : 'overview'
  })
  const [collapsed, setCollapsed] = useState(() => store.get('ftd_sidebar') === 'true')
  // Filter panel always starts hidden on page load; the eye button shows it for this visit only.
  const [showFilters, setShowFilters] = useState(false)
  const toggleFilters = v => setShowFilters(v)
  const [filters, setFilters] = useState({ range: 'all', state: 'all', role: 'all', from: '', to: '' })
  const { rows, staff, fetchedAt, loading, loaded, error, refresh } = useData()

  const states = useMemo(() => [...new Set(staff.map(s => s.state))].sort(), [staff])
  const bounds = useMemo(() => dataRange(rows), [rows])
  const range = useMemo(() => resolveRange(filters, rows), [filters, rows])
  const roster = useMemo(() => filterRoster(staff, filters), [staff, filters])
  const data = useMemo(() => filterRows(rows, filters, range), [rows, filters, range])

  const [intent, setIntent] = useState(null)
  const navigate = (p, it = null) => { setIntent(it); setPage(p); store.set('ftd_page', p); window.history.replaceState(null, '', `#${p}`); window.scrollTo(0, 0) }
  const Page = PAGES[page]
  const sw = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_W
  const scope = filters.state === 'all' ? `${states.length} states` : `${filters.state} State`

  return (
    <div style={{ minHeight: '100vh' }}>
      <Sidebar page={page} onNavigate={navigate} collapsed={collapsed}
        onToggle={() => { setCollapsed(!collapsed); store.set('ftd_sidebar', String(!collapsed)) }}
        rosterSize={staff.length} stateCount={states.length} />

      <div className="app-main" style={{ marginLeft: sw, transition: 'margin-left .25s ease', minWidth: 0 }}>
        <TopBar
          title={NAV.find(n => n.id === page).label}
          subtitle={`${INTRO[page]} · ${scope} · ${roster.length} coordinators expected daily`}
          fetchedAt={fetchedAt} loading={loading} error={error} onRefresh={refresh}
        />

        <main style={{ padding: '10px 18px 16px', maxWidth: 1480 }}>
          {loaded && (
            <div style={{ marginBottom: 8 }}>
              {showFilters
                ? <FilterBar filters={filters} onChange={setFilters} states={states} range={range} bounds={bounds} onHide={() => toggleFilters(false)} />
                : <HiddenFilters filters={filters} range={range} onShow={() => toggleFilters(true)} />}
            </div>
          )}

          {error && (
            <div className="card" style={{ padding: '10px 14px', borderColor: '#f3c4c4', background: '#fdf6f6', color: 'var(--crit-ink)', marginBottom: 14, fontSize: 13 }}>
              The data could not be loaded ({error}). Try Refresh in a minute.
            </div>
          )}

          {!loaded && loading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {[...Array(8)].map((_, i) => <div key={i} className="card" style={{ height: i < 4 ? 120 : 260, background: '#eef0f3', border: 'none' }} />)}
            </div>
          )}

          {loaded && rows.length === 0 && (
            <div className="card" style={{ padding: '12px 16px', marginBottom: 14, fontSize: 13, background: 'var(--eha-lime-20)', borderColor: 'var(--eha-lime-40)' }}>
              <strong>No check-ins received yet.</strong> The dashboard fills in automatically within an hour of the first submission.
            </div>
          )}

          {loaded && <Page rows={rows} data={data} roster={roster} staff={staff} range={range} filters={filters} setFilters={setFilters} navigate={navigate} intent={intent} key={`${page}-${intent?.tab || ''}`} />}

          <footer style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--line)', display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink-3)' }}>
            <span>eHealth Africa · Field Team Daily Check-in · Source: KoboToolbox, refreshed hourly</span>
            <span>Coordinators are shown by post (LGA or state), not by name.</span>
          </footer>
        </main>
      </div>
    </div>
  )
}

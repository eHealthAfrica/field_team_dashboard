import { RefreshCw, Printer, Clock } from 'lucide-react'

// Blue page header. Line 1: page title. Line 2: context on the left and
// small, quiet controls (data freshness, refresh, print) on the right.
export default function TopBar({ title, subtitle, fetchedAt, loading, error, onRefresh }) {
  const mini = {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 6, cursor: 'pointer',
    background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.25)', color: '#fff',
    fontSize: 11, fontWeight: 600, fontFamily: 'inherit', lineHeight: 1.5,
  }
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40 }}>
      <div style={{ background: 'linear-gradient(100deg, #0079d6 0%, #0090fc 60%, #1a9cfc 100%)', padding: '8px 18px 7px' }}>
        <h1 style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25 }}>{title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
          <p style={{ margin: 0, color: '#fff', fontSize: 11, fontWeight: 500, opacity: .9 }}>{subtitle}</p>
          <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#fff', opacity: .9 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: error ? '#ff8a8a' : 'var(--eha-lime)' }} />
              {error ? 'Data failed to load' : <><Clock size={10} /> {fetchedAt ? `Data as of ${fetchedAt}` : 'Loading…'}</>}
            </span>
            <button style={mini} onClick={onRefresh} disabled={loading} title="Reload data">
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button style={mini} onClick={() => window.print()} title="Print or save as PDF">
              <Printer size={10} /> Print brief
            </button>
          </div>
        </div>
      </div>
      <div style={{ height: 3, background: 'var(--eha-lime)' }} />
    </header>
  )
}

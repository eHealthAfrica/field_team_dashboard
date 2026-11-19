import { useState, useEffect, useCallback } from 'react'
import { AUTH, api } from '../auth'

const BASE = import.meta.env.BASE_URL

// Loads the check-ins and the roster. Re-polls every 10 minutes; the data is
// refreshed hourly from Kobo. In login mode (ERITAS) it comes from the server,
// already limited to the states the signed-in user may see.
export function useData() {
  const [rows, setRows] = useState([])
  const [staff, setStaff] = useState([])
  const [fetchedAt, setFetchedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const get = async f => {
        const res = await fetch(`${BASE}data/${f}?t=${Date.now()}`)
        if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`)
        return res.json()
      }
      if (AUTH) {
        const d = await api('GET', '/api/data')
        setRows(d.rows || []); setStaff(d.staff || []); setFetchedAt(d.fetched_at || '')
      } else {
        const [data, roster] = await Promise.all([get('data.json'), get('roster.json')])
        setRows(data.rows || [])
        setStaff(roster.staff || [])
        setFetchedAt(data.fetched_at || '')
      }
      setError(null)
      setLoaded(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 10 * 60 * 1000)
    return () => clearInterval(t)
  }, [load])

  return { rows, staff, fetchedAt, loading, loaded, error, refresh: load }
}

// Login mode. The ERITAS build sets VITE_AUTH=1: the dashboard then signs
// people in and loads role-scoped data from the server's /api. The public
// GitHub Pages build leaves it unset and reads the static data files as before.
export const AUTH = import.meta.env.VITE_AUTH === '1'

export const SIGNED_OUT = 'ftd:signed-out'

export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (res.status === 401 && url !== '/api/login' && url !== '/api/me/password') window.dispatchEvent(new Event(SIGNED_OUT))
  if (!res.ok) { const e = new Error(json.error || `HTTP ${res.status}`); e.status = res.status; throw e }
  return json
}

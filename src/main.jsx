import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'
import { AUTH } from './auth'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {AUTH
      ? <AuthGate>{({ user, signOut }) => <App user={user} onSignOut={signOut} />}</AuthGate>
      : <App />}
  </React.StrictMode>
)

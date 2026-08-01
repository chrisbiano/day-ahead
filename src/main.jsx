import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import AuthGate from './components/AuthGate.jsx'
import { startUpdater } from './lib/updater.js'
import { startErrorLogging } from './lib/errorLog.js'
import './index.css'

// Before anything renders, so a crash during startup is still caught.
startErrorLogging()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate>
        <App />
      </AuthGate>
    </ErrorBoundary>
  </React.StrictMode>,
)

// Register the service worker so the app is installable and can receive push.
// Kept out of the render path — a failure here should never blank the app.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.error('Service worker registration failed:', e)
    })
  })
}

// Reload the app when a newer build has shipped (mainly for the iOS PWA, which
// doesn't re-fetch on resume). Kept out of the render path — see updater.js.
startUpdater()

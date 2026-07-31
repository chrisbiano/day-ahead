function RefreshIcon({ spinning }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

/* The brand mark, glyph-only: the arch with the sun on its threshold. No tile —
   it sits directly on the header beside the wordmark (the guideline's horizontal
   lockup). Drawn in currentColor so it picks up the gold accent and adapts with
   the theme. */
function BrandMark({ className = '' }) {
  return (
    <svg viewBox="0 0 48 52" fill="none" className={className} aria-hidden="true">
      <path d="M4 45.5 H44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
      <path d="M10 45.5 V22 A14 14 0 0 1 38 22 V45.5"
        stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M14.5 45.5 A9.5 9.5 0 0 1 33.5 45.5 Z" fill="currentColor" />
    </svg>
  )
}

export default function Layout({ children, onOpenSettings, onRefresh, refreshing }) {
  return (
    <div
      className="min-h-screen bg-bg"
      // Respect the notch in landscape; zero on desktop and in portrait.
      style={{
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Header — pad down by the iOS status-bar height so the title clears the
          clock/battery when installed as a home-screen app. The sticky bar's
          background still fills up to the top edge. */}
      <header
        className="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-line"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <BrandMark className="w-7 h-7 sm:w-8 sm:h-8 text-accent shrink-0" />
              <div className="min-w-0">
                <h1 className="font-display text-xl sm:text-2xl leading-none tracking-tight text-fg">Day Ahead</h1>
                <p className="text-muted text-xs sm:text-sm mt-0.5">Wake up to clarity</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Pull fresh calendar data on demand — an event just edited in
                  Google shouldn't have to wait for the next natural sync. */}
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  disabled={refreshing}
                  aria-label="Refresh calendar"
                  title="Refresh calendar"
                  className="w-9 h-9 flex items-center justify-center bg-transparent border border-line2 text-fg rounded-lg hover:bg-surface2 transition-colors disabled:opacity-60"
                >
                  <RefreshIcon spinning={refreshing} />
                </button>
              )}
              <button
                onClick={onOpenSettings}
                className="px-4 py-2 bg-transparent border border-line2 text-fg rounded-lg font-medium text-sm hover:bg-surface2 transition-colors"
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </div>

      {/* Footer — pad past the home-indicator bar at the bottom of the screen. */}
      <footer
        className="border-t border-line mt-12"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-faint text-sm text-center">
            Day Ahead · Keeping you on track, always
          </p>
        </div>
      </footer>
    </div>
  )
}

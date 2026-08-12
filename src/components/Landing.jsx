import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { isNative, signInNative } from '../lib/native'

/* The public face of Day Ahead: what a stranger (and Google's OAuth reviewer)
   sees at the root. Signing in swaps this for the app — no routing change, so
   nothing about the PWA, the service worker or the OAuth redirect moves.

   The email layer leads, deliberately. Every competitor writes you a morning
   summary; none of them clear the inbox, and that's the thing worth paying for. */

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.9 1.5l2.6-2.5C16.9 3.4 14.7 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 11.6S6.9 20.8 12 20.8c5.3 0 8.8-3.7 8.8-9 0-.6-.06-1-.15-1.6H12z" />
    </svg>
  )
}

function Feature({ title, children }) {
  return (
    <div className="card">
      <h3 className="font-display text-lg text-fg mb-1.5">{title}</h3>
      <p className="text-muted text-sm leading-relaxed">{children}</p>
    </div>
  )
}

export default function Landing() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /* Two routes to the same place. On the web the page navigates to Google and
     the redirect brings it back. On a device there's no page to hand over, so
     the URL opens in a browser sheet and a deep link carries the result home —
     see lib/native.js. */
  const signIn = async () => {
    setLoading(true)
    setError(null)
    try {
      if (isNative()) {
        await signInNative()
        // The sheet is up; the deep-link handler takes it from here. Clear the
        // spinner so a cancelled sign-in doesn't leave the button stuck.
        setLoading(false)
        return
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) throw error
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  const SignInButton = ({ className = '' }) => (
    <button
      onClick={signIn}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2.5 px-5 py-3 bg-accent text-accent-fg rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 ${className}`}
    >
      <GoogleGlyph />
      {loading ? 'Redirecting…' : 'Continue with Google'}
    </button>
  )

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* header */}
      <header className="max-w-5xl mx-auto px-5 sm:px-8 pt-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" aria-hidden="true" className="w-9 h-9 rounded-[10px]" />
          <span className="font-display text-xl tracking-tight">Day Ahead</span>
        </div>
        <button
          onClick={signIn}
          className="text-sm text-muted hover:text-fg transition-colors"
        >
          Sign in
        </button>
      </header>

      {/* hero */}
      <section className="max-w-3xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-14 text-center">
        <h1 className="font-display text-4xl sm:text-6xl leading-[1.05] tracking-tight">
          Wake up to clarity.
        </h1>
        <p className="text-muted text-base sm:text-lg mt-5 leading-relaxed max-w-xl mx-auto">
          Your schedule, your tasks, and every inbox — already sorted when you open your eyes.
          Not another to-do list. The one place your whole day lives.
        </p>
        <div className="mt-9 flex flex-col items-center gap-3">
          <SignInButton />
          <span className="text-faint text-xs">Free while it's in early access.</span>
        </div>
      </section>

      {/* the differentiator, stated plainly */}
      <section className="max-w-3xl mx-auto px-5 sm:px-8 pb-16">
        <div className="card card-border-accent">
          <p className="text-xs font-medium text-faint uppercase tracking-wider mb-2">
            The part nobody else does
          </p>
          <h2 className="font-display text-2xl sm:text-3xl tracking-tight mb-3">
            It reads your email so you don't have to.
          </h2>
          <p className="text-muted text-sm sm:text-base leading-relaxed">
            Connect every mailbox you have. Day Ahead sorts what arrived into what
            genuinely needs a reply, what's worth reading, and what's noise — then lets
            you answer without leaving the app. Other morning apps summarise your
            calendar. This one clears your plate.
          </p>
        </div>
      </section>

      {/* what it does */}
      <section className="max-w-5xl mx-auto px-5 sm:px-8 pb-20 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Feature title="A brief that keeps up">
          A plain-language read on your day that updates as it goes — what's ahead,
          what's still open, what needs an answer.
        </Feature>
        <Feature title="Your calendar, annotated">
          Google Calendar events sit alongside your tasks, with checklists you can add
          to any block. Read-only — nothing is ever written back.
        </Feature>
        <Feature title="Tasks that behave">
          Times, durations, subtasks, repeats and reminders that actually reach your
          phone. Delete something by mistake and it's recoverable.
        </Feature>
        <Feature title="Ask in plain words">
          “Move my 2pm edit to 4”, “add my client block to Tuesday”. It proposes the
          change and you confirm — nothing happens without a tap.
        </Feature>
      </section>

      {/* trust */}
      <section className="max-w-3xl mx-auto px-5 sm:px-8 pb-20">
        <h2 className="font-display text-2xl tracking-tight mb-4">Where your data stands</h2>
        <ul className="space-y-2.5 text-sm text-muted leading-relaxed">
          <li>· Your calendar is read-only. Day Ahead never writes to it.</li>
          <li>· Email access is only what's needed to sort and reply — never permanent deletion.</li>
          <li>· Nothing is sent, archived or deleted without you clicking it. Claude proposes; you decide.</li>
          <li>· Your account tokens never touch the browser.</li>
        </ul>
        <p className="text-faint text-xs mt-5">
          Read the <a href="/privacy.html" className="underline hover:text-muted">privacy policy</a>.
        </p>
      </section>

      {/* close */}
      <section className="max-w-3xl mx-auto px-5 sm:px-8 pb-24 text-center">
        <h2 className="font-display text-3xl sm:text-4xl tracking-tight mb-6">
          Start tomorrow already ahead.
        </h2>
        <SignInButton />
        {error && (
          <p className="text-sm mt-5 text-muted border border-line2 rounded-lg px-3 py-2 inline-block">
            {error}
          </p>
        )}
      </section>

      <footer className="border-t border-line">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-faint">
          <span>Day Ahead · Wake up to clarity</span>
          <a href="/privacy.html" className="hover:text-muted transition-colors">Privacy</a>
        </div>
      </footer>
    </div>
  )
}

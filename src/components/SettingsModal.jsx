import { useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { startGoogleConnect, isConnectConfigured } from '../lib/connect'
import useConnectedAccounts from '../hooks/useConnectedAccounts'
import {
  isPushConfigured, pushStatus, currentSubscription,
  enablePush, disablePush, sendTestPush, isIOS,
} from '../lib/push'
import { submitReport } from '../lib/errorLog'
import { buildExportHtml } from '../lib/exportDoc'

/* Turn Web Push on for this device, and prove it works with a test ping before
   any reminder depends on it. The iOS reality is baked in: on iPhone, push only
   works once Day Ahead is installed to the home screen, so a Safari tab is
   guided to install rather than shown a button that can't work. */
function NotificationsSection({ morningBrief, onMorningBriefChange, briefTime, onBriefTimeChange }) {
  const [status] = useState(pushStatus)      // ready | ios-needs-install | unsupported | unconfigured
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [error, setError] = useState(null)
  // The brief-time picker commits on an explicit Save (not on every keystroke) so
  // a save is unmistakable. `timeDraft` holds the pending value; it re-syncs when
  // the saved value loads or changes.
  const [timeDraft, setTimeDraft] = useState(briefTime)
  const [savedNote, setSavedNote] = useState(false)
  // The OS-level notification permission (granted | denied | default). iOS only
  // shows its prompt once — after that, a re-attempt resolves to the remembered
  // value WITHOUT re-prompting, which reads as "the button blipped and nothing
  // happened". Surfacing this lets Chris (and us) see why, since DevTools isn't
  // an option on his phone.
  const readPerm = () => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [perm, setPerm] = useState(readPerm)
  // Pre-permission step: on "Turn on" we first show an explainer (what to look
  // for, where, tap Allow) instead of firing the OS prompt cold — an unexpected
  // prompt is what people wave away, which lands us in 'denied'.
  const [priming, setPriming] = useState(false)
  // Where the browser draws its prompt differs by platform; name it so the user
  // knows where to look.
  const promptWhere = isIOS()
    ? 'a popup will appear in the middle of your screen'
    : 'your browser will ask at the top of the window, near the web address'

  useEffect(() => {
    currentSubscription().then(sub => setEnabled(Boolean(sub))).catch(() => {})
  }, [])
  useEffect(() => { setTimeDraft(briefTime) }, [briefTime])

  const saveBriefTime = () => {
    onBriefTimeChange(timeDraft)
    setSavedNote(true)
    setTimeout(() => setSavedNote(false), 2500)
  }

  if (!isPushConfigured) return null

  const enable = async () => {
    setBusy(true); setError(null)
    // Prime the OS prompt: it's drawn by the browser (small dropdown near the
    // address bar on desktop, a dialog on iPhone) and can't be restyled, so tell
    // the user to expect it — an ignored prompt is what got us stuck on 'denied'.
    setNote('Your browser is asking permission now — look for its prompt and choose “Allow”.')
    try {
      await enablePush()
      setEnabled(true)
      setNote('Notifications are on for this device.')
    } catch (e) {
      setError(e.message || 'Could not enable notifications')
    } finally { setBusy(false); setPerm(readPerm()) }
  }

  const disable = async () => {
    setBusy(true); setError(null); setNote(null)
    try {
      await disablePush()
      setEnabled(false)
      setNote('Notifications are off for this device.')
    } catch (e) {
      setError(e.message || 'Could not turn notifications off')
    } finally { setBusy(false) }
  }

  const test = async () => {
    setBusy(true); setError(null); setNote(null)
    try {
      const r = await sendTestPush()
      const dev = `${r.devices} device${r.devices === 1 ? '' : 's'}`
      if (r.sent === 0) {
        // The push service rejected every attempt — a delivery problem, not an
        // OS-display one. Usually a stale/expired subscription.
        setError(`Reached ${dev}, but the push service didn’t accept it. Turn notifications off and back on to refresh this device, then retry.`)
      } else {
        // Accepted for delivery. If it still didn't appear, the OS is hiding it.
        setNote(
          `Sent to ${r.sent} of ${dev}. If nothing showed up on this Mac, macOS is hiding it — open System Settings → Notifications → your browser (Chrome/Safari), turn Allow Notifications on, and make sure Focus / Do Not Disturb is off. On iPhone it should just appear.`,
        )
      }
    } catch (e) {
      setError(e.message || 'Could not send a test')
    } finally { setBusy(false) }
  }

  return (
    <div>
      <h3 className="text-xs font-medium text-faint uppercase tracking-wider mb-3">Notifications</h3>

      {status === 'ios-needs-install' ? (
        <p className="text-xs text-muted">
          To get reminders on your iPhone, first add Day Ahead to your Home Screen:
          tap the <span className="text-fg">Share</span> button in Safari, then
          <span className="text-fg"> Add to Home Screen</span>. Open Day Ahead from
          that icon and this option will turn on.
        </p>
      ) : status === 'unsupported' ? (
        <p className="text-xs text-muted">
          This browser doesn’t support notifications. Try Day Ahead on your phone
          (installed to the Home Screen) or a recent desktop browser.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-fg">Reminders on this device</p>
              <p className="text-xs text-faint mt-0.5">
                {enabled
                  ? 'This device will receive reminder alerts.'
                  : 'Turn on to let Day Ahead alert you here.'}
              </p>
            </div>
            <button
              onClick={enabled ? disable : () => { setError(null); setNote(null); setPriming(true) }}
              disabled={busy}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium shrink-0 transition-opacity disabled:opacity-50 ${
                enabled
                  ? 'border border-line2 text-muted hover:text-fg hover:bg-surface2'
                  : 'bg-accent text-accent-fg hover:opacity-90'
              }`}
            >
              {busy ? '…' : enabled ? 'Turn off' : 'Turn on'}
            </button>
          </div>

          {/* Pre-permission explainer — tells the user exactly what's about to
              happen so they don't ignore the browser's prompt. */}
          {priming && !enabled && (
            <div className="mt-3 rounded-lg border border-line2 bg-surface2 px-3 py-3">
              {perm === 'denied' ? (
                <>
                  <p className="text-sm text-fg font-medium">Notifications are blocked</p>
                  <p className="text-xs text-muted mt-1">
                    {isIOS()
                      ? 'iOS won’t ask again until you reinstall: delete Day Ahead from your Home Screen, re-add it from Safari (Share → Add to Home Screen), open it once, then tap Turn on and choose Allow.'
                      : 'Your browser is remembering “no.” Click the icon just left of the web address, set Notifications to Allow, reload, then tap Turn on again.'}
                  </p>
                  <button
                    onClick={() => setPriming(false)}
                    className="mt-3 px-3 py-1.5 text-sm rounded-lg font-medium border border-line2 text-muted hover:text-fg hover:bg-surface2"
                  >
                    Got it
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-fg font-medium">One quick step</p>
                  <p className="text-xs text-muted mt-1">
                    When you tap Continue, {promptWhere}. Choose{' '}
                    <span className="text-fg font-medium">“Allow.”</span> If you ignore or dismiss
                    it, {isIOS() ? 'iOS' : 'the browser'} stops asking and notifications stay off.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => { setPriming(false); enable() }}
                      disabled={busy}
                      className="px-3 py-1.5 text-sm rounded-lg font-medium bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50"
                    >
                      Continue
                    </button>
                    <button
                      onClick={() => setPriming(false)}
                      disabled={busy}
                      className="px-3 py-1.5 text-sm rounded-lg font-medium border border-line2 text-muted hover:text-fg hover:bg-surface2"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {enabled && (
            <button
              onClick={test}
              disabled={busy}
              className="mt-3 w-full px-3 py-2 text-sm rounded-lg border border-line2 text-muted hover:text-fg hover:bg-surface2 transition-colors disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send a test notification'}
            </button>
          )}

          {/* Account-wide, but delivered by push, so it lives with notifications.
              Shown even when this device's notifications are off — otherwise the
              toggle is invisible and can never be turned on. */}
          {onMorningBriefChange && (
            <div className="mt-4 pt-3 border-t border-line">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-fg">Daily brief</p>
                  <p className="text-xs text-faint mt-0.5">
                    A running summary of your day — schedule, tasks, and emails needing a reply. Updates as the day goes on.
                  </p>
                </div>
                <Toggle checked={morningBrief} onChange={onMorningBriefChange} />
              </div>
              {morningBrief && onBriefTimeChange && (
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted">Send at</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="time"
                        value={timeDraft}
                        onChange={e => setTimeDraft(e.target.value)}
                        className="input py-1 text-sm w-36"
                      />
                      <button
                        onClick={saveBriefTime}
                        disabled={timeDraft === briefTime}
                        className={`px-3 py-1.5 text-sm rounded-lg font-medium shrink-0 transition-opacity ${
                          timeDraft !== briefTime
                            ? 'bg-accent text-accent-fg hover:opacity-90'
                            : 'border border-line2 text-faint opacity-50'
                        }`}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  {savedNote && timeDraft === briefTime && (
                    <p className="text-xs text-faint mt-1.5">Saved ✓ — the brief will send at this time.</p>
                  )}
                </div>
              )}
              {!enabled && (
                <p className="text-xs text-muted mt-2">
                  It arrives as a notification — turn on “Reminders on this device” above (or on your phone) to receive it.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {note && <p className="text-sm text-fg mt-3">{note}</p>}

      {error && (
        <div className="mt-3 rounded-lg border border-warn-line/40 bg-warn/10 px-3 py-2">
          <p className="text-sm text-fg">{error}</p>
          {perm === 'denied' && (
            <p className="text-xs text-muted mt-1.5">
              iOS is blocking notifications for Day Ahead and won’t ask again. To reset it:
              delete Day Ahead from your Home Screen, re-add it from Safari (Share → Add to
              Home Screen), open it once, then turn this on and tap <span className="text-fg">Allow</span>.
            </p>
          )}
        </div>
      )}

      {/* Always-visible permission state when off — a quiet diagnostic so a silent
          failure is never invisible. */}
      {!enabled && status !== 'ios-needs-install' && status !== 'unsupported' && (
        <p className="text-[11px] text-faint mt-2">
          Permission: <span className="text-muted">{perm}</span>
        </p>
      )}
    </div>
  )
}

/* Strip anything that shouldn't survive a paste.
 *
 * This is the account owner's own markup, going into their own outgoing mail,
 * so the risk is low — but it gets rendered back inside Day Ahead's own page,
 * and a <script> or an onerror= arriving via the clipboard would run there.
 * Tags and event handlers go; formatting, links, colours and images stay,
 * because those are the whole point of a signature. */
/* Quiet mode — stop reminders and the brief for a while.
 *
 * Every option except the last sets a real moment, so it lapses on its own. A
 * plain on/off switch is how someone silences the app before a shoot and finds
 * out three weeks later that it never started again — and they'd blame the app,
 * fairly. "Until I turn it back on" is still offered, because sometimes that IS
 * what you mean, but it's the deliberate choice rather than the default shape.
 */
function QuietMode({ quietUntil, isQuiet, onChange }) {
  const endOfToday = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d.toISOString() }
  const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString()

  const presets = [
    { label: 'For an hour', value: () => inHours(1) },
    { label: 'Rest of today', value: endOfToday },
    { label: 'For a week', value: () => inHours(24 * 7) },
    { label: 'Until I turn it back on', value: () => 'infinity' },
  ]

  const describe = () => {
    if (quietUntil === 'infinity') return 'Quiet until you turn it back on.'
    const d = new Date(quietUntil)
    if (isNaN(d.getTime())) return 'Quiet.'
    const sameDay = d.toDateString() === new Date().toDateString()
    const when = sameDay
      ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    return `Quiet until ${when}.`
  }

  return (
    <div>
      <h3 className="text-xs font-medium text-faint uppercase tracking-wider mb-3">Quiet mode</h3>
      <div className="border border-line2 rounded-xl p-3.5">
        {isQuiet ? (
          <>
            <p className="text-sm text-fg font-medium">{describe()}</p>
            <p className="text-xs text-muted mt-1">
              Reminders and your morning brief are paused. Everything else works normally.
            </p>
            <button
              onClick={() => onChange(null)}
              className="mt-3 text-xs font-medium text-accent border border-line2 rounded-lg px-3 py-1.5 hover:bg-surface2 transition-colors"
            >
              Turn notifications back on
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-fg font-medium">Notifications are on</p>
            <p className="text-xs text-muted mt-1 mb-3">
              Pause reminders and the morning brief without turning anything off for good.
            </p>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => onChange(p.value())}
                  className="text-xs font-medium text-muted hover:text-fg border border-line2 rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* The AI switch.
 *
 * Worth being specific about what stops, because "turn off AI" in most products
 * means "lose half the app". Here the features degrade rather than disappear,
 * and saying so plainly is the difference between a setting people trust and
 * one nobody dares touch.
 */
function AiControl({ enabled, onChange }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-faint uppercase tracking-wider mb-3">AI features</h3>
      <div className="border border-line2 rounded-xl p-3.5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-fg font-medium">
              {enabled ? 'AI is on' : 'AI is off'}
            </p>
            <p className="text-xs text-muted mt-1">
              {enabled
                ? 'Day Ahead sorts your inbox, writes your morning brief, understands typed tasks, and drafts replies.'
                : 'Nothing about your mail is sent anywhere for analysis.'}
            </p>
          </div>
          <Toggle checked={enabled} onChange={() => onChange(!enabled)} />
        </div>

        <div className="mt-3 pt-3 border-t border-line2">
          <p className="text-xs text-muted">
            {enabled ? (
              <>Turning this off stops inbox triage and reply drafting, and your brief
              becomes a plain count of the day. Your calendar, tasks, subtasks, reminders,
              and notes are unaffected — and your email is no longer read at all.</>
            ) : (
              <>Your calendar, tasks, reminders, and notes all work as normal. Mail already
              sorted stays sorted; new mail simply isn’t triaged.</>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

function cleanSignatureHtml(html) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
}

/* The signature that goes out on replies from this mailbox.
 *
 * Day Ahead used to read this from Gmail, which cost the restricted
 * gmail.settings.basic scope — one that also permits changing filters,
 * forwarding and vacation responders, so it asked for far more than it used.
 * Pasting it once is the better trade; see lib/connect.js.
 *
 * The editor is contenteditable, NOT a textarea. A textarea can only ever hold
 * plain text: paste rich content into one and the browser hands over the text
 * flavour and silently drops the markup, so a logo never arrives. A
 * contenteditable region receives the real HTML from the clipboard, which is
 * how the image, links and colours survive.
 *
 * Uncontrolled on purpose — the content is written into the node once when the
 * editor opens and read back on save. Driving innerHTML from React state on
 * every keystroke fights the browser for the caret and sends it to the start of
 * the line mid-word. */
function SignatureEditor({ account, onSave }) {
  const savedSig = account.signature ?? ''
  const savedName = account.display_name ?? ''
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(savedName)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const boxRef = useRef(null)

  // Seed the editable node when it appears, not on every render.
  useEffect(() => {
    if (open && boxRef.current) boxRef.current.innerHTML = savedSig
  }, [open, savedSig])

  const save = async () => {
    setSaving(true); setErr(null)
    const html = cleanSignatureHtml(boxRef.current?.innerHTML || '')
    // A logo pasted as a data: URI can be enormous; warn rather than fail a
    // save halfway through.
    if (html.length > 200_000) {
      setSaving(false)
      setErr('That signature is very large — try an image hosted at a URL rather than pasted in.')
      return
    }
    const res = await onSave(account.id, { signature: html, displayName: name })
    setSaving(false)
    if (res?.ok === false) setErr(res.error || 'Could not save that.')
    else setOpen(false)
  }

  return (
    <div className="mt-2">
      {(open || savedSig) && (
        <button
          onClick={() => { setName(savedName); setErr(null); setOpen(v => !v) }}
          className="text-xs text-faint hover:text-fg transition-colors"
        >
          {open ? 'Close signature' : 'Edit signature'}
        </button>
      )}

      {/* Nags like the missing-purpose row does, and for the same reason: Gmail
          only adds a signature in its own compose window, so a mailbox without
          one here sends replies out bare — and the compose window looks fine
          either way, so nobody notices until a client has already had one. */}
      {!open && !savedSig && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted min-w-0">
            No signature — replies from this mailbox go out unsigned.
          </p>
          <button
            onClick={() => { setName(savedName); setErr(null); setOpen(true) }}
            className="text-xs px-2.5 py-1 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            Add signature
          </button>
        </div>
      )}

      {!open && savedSig && (
        <div className="mt-2 rounded-lg border border-line bg-bg p-3">
          <div
            className="text-sm text-muted [&_a]:text-fg [&_img]:max-w-full [&_img]:h-auto"
            dangerouslySetInnerHTML={{ __html: savedSig }}
          />
        </div>
      )}

      {open && (
        <div className="mt-2 rounded-lg border border-line bg-bg p-3">
          <label className="block text-[11px] text-faint mb-1">
            Name recipients see (optional)
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            size={1}
            placeholder="Chris · Fast Rose Creative"
            className="input w-full min-w-0 text-xs mb-3"
          />

          <label className="block text-[11px] text-faint mb-1">Signature</label>
          <div
            ref={boxRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Email signature"

            data-placeholder="Paste your signature from Gmail — image and all."
            className="input w-full min-w-0 text-sm min-h-[6rem] max-h-72 overflow-auto
                       [&_a]:text-accent [&_img]:max-w-full [&_img]:h-auto
                       empty:before:content-[attr(data-placeholder)] empty:before:text-faint empty:before:text-xs"
          />
          <p className="text-[11px] text-faint mt-1.5">
            This box keeps formatting. What you see here is what your recipient gets.
          </p>

          {err && <p className="text-xs text-warn mt-2">{err}</p>}

          <div className="flex items-center justify-end gap-2 mt-2.5">
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-faint hover:text-fg transition-colors px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="text-xs px-3 py-1 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-accent' : 'bg-surface2 border border-line2'
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
          checked ? 'left-[1.125rem] bg-accent-fg' : 'left-0.5 bg-muted'
        }`}
      />
    </button>
  )
}

/* "That did the wrong thing." Crash reporting only sees things that break, and
   most product problems don't throw — they just behave badly. The build id, page
   and browser ride along automatically, so a report is actionable without having
   to go back and ask which version they were on. */
/* Delete the account and everything Day Ahead holds.
 *
 * The privacy policy used to say "email us", which is honest but weak: it makes
 * the person ask permission to leave, and it puts a human step between a
 * request and a deletion. This does it in the product.
 *
 * Two deliberate frictions, and no more. The counts are fetched first so nobody
 * accepts a consequence described only in the abstract — "14 tasks, 3 mailboxes"
 * lands differently from "all your data". And the address must be typed, which
 * is checked again server-side against the token's own user, so a stale or
 * mistaken screen can't delete the wrong account.
 *
 * Deliberately NOT undoable, and it says so. A grace period would mean keeping
 * the data of someone who asked to be forgotten. */
/* Take everything with you.
 *
 * Pairs with delete: the only real cost of having no undo is that a deletion
 * made in frustration leaves nothing behind. This makes that a file instead.
 * It is also the portability half of what an assessor expects to see next to a
 * delete button.
 *
 * No server code, deliberately. RLS already scopes every one of these tables to
 * the signed-in user, so the browser reads exactly what belongs to them and
 * nothing else — and account_tokens has RLS on with NO policies, which means
 * this cannot export the Google tokens even by accident. The safety is
 * structural rather than something this function has to remember.
 *
 * JSON rather than CSV: subtasks nest inside tasks, and flattening them to rows
 * would lose the shape that makes the file worth keeping.
 */
const EXPORT_TABLES = [
  'tasks',
  'event_notes',
  'email_verdicts',
  'connected_accounts',
  'task_templates',
  'user_prefs',
  'push_subscriptions',
]

function ExportData() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(false)

  // format: 'doc' (a readable HTML document) or 'json' (the raw rows).
  const run = async (format) => {
    setBusy(true); setErr(null); setDone(false)
    try {
      const out = {}
      for (const t of EXPORT_TABLES) {
        const { data, error } = await supabase.from(t).select('*')
        if (error) throw error
        out[t] = data ?? []
      }
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        exportedAt: new Date().toISOString(),
        account: user?.email ?? null,
        note: 'Google access tokens are deliberately not included — they are secrets, not your content, and Day Ahead cannot read them from a browser.',
        ...out,
      }
      const stamp = new Date().toISOString().slice(0, 10)
      const asDoc = format !== 'json'
      const url = URL.createObjectURL(new Blob(
        [asDoc ? buildExportHtml(payload) : JSON.stringify(payload, null, 2)],
        { type: asDoc ? 'text/html' : 'application/json' },
      ))

      /* Opening beats downloading for the document.
         A .html file landing in Downloads is fine on a Mac and close to useless
         on a phone, where most people have no idea what to do with one in Files.
         Opened in a tab it's just a page — and every device already has a way to
         keep a page: Print → Save as PDF, or Share → Print on iOS. The document
         says so at the top. Downloading the file stays available for anyone who
         wants the file itself. */
      if (format === 'open') {
        const w = window.open(url, '_blank')
        if (!w) throw new Error('Your browser blocked the new tab. Allow pop-ups for dayahead.app, or use “save the file” below.')
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = `day-ahead-export-${stamp}.${asDoc ? 'html' : 'json'}`
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
      // Revoking immediately can cancel a download, or blank a tab that's still
      // loading. A minute is plenty and the leak is one object per export.
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setDone(format === 'open' ? 'opened' : 'saved')
    } catch (e) {
      setErr(e.message || 'Could not build the export.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-8 pt-5 border-t border-line">
      <p className="text-xs font-medium text-faint uppercase tracking-wider mb-2">
        Your data
      </p>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted min-w-0">
          Everything Day Ahead holds — tasks, checklists, mailbox notes and preferences —
          as one page. It opens in a new tab, and the page itself shows you how to keep it
          as a PDF. Worth doing before you delete your account.
        </p>
        <button
          onClick={() => run('open')}
          disabled={busy}
          className="text-xs px-2.5 py-1 rounded-lg border border-line text-muted hover:text-fg hover:bg-surface2 transition-colors shrink-0 disabled:opacity-50"
        >
          {busy ? 'Preparing…' : 'Open'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
        <button
          onClick={() => run('doc')}
          disabled={busy}
          className="text-[11px] text-faint hover:text-fg transition-colors disabled:opacity-50"
        >
          or save the file
        </button>
        {/* For anyone moving the data into another tool rather than keeping it. */}
        <button
          onClick={() => run('json')}
          disabled={busy}
          className="text-[11px] text-faint hover:text-fg transition-colors disabled:opacity-50"
        >
          raw data (JSON)
        </button>
      </div>
      {done && (
        <p className="text-xs text-faint mt-2">
          {done === 'opened' ? 'Opened in a new tab.' : 'Saved to your downloads.'}
        </p>
      )}
      {err && <p className="text-xs text-warn mt-2">{err}</p>}
    </div>
  )
}

function DeleteAccount() {
  const [stage, setStage] = useState('idle')      // idle | confirming | working | failed
  const [info, setInfo] = useState(null)          // { counts, email }
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState(null)

  const begin = async () => {
    setErr(null); setStage('working')
    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: { mode: 'preview' },
    })
    if (error || data?.error) {
      setErr((data && data.error) || 'Could not read your account just now.')
      setStage('failed')
      return
    }
    setInfo(data); setTyped(''); setStage('confirming')
  }

  const destroy = async () => {
    setErr(null); setStage('working')
    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: { mode: 'delete', confirmEmail: info?.email },
    })
    if (error || data?.error) {
      setErr((data && data.error) || 'Could not delete the account.')
      setStage('failed')
      return
    }
    // The account is gone; the session it was signed in with is meaningless.
    await supabase.auth.signOut().catch(() => {})
    window.location.replace('/')
  }

  const rows = Object.entries(info?.counts || {}).filter(([, n]) => n > 0)
  const label = {
    tasks: 'tasks', event_notes: 'annotated calendar blocks', email_verdicts: 'sorted emails',
    connected_accounts: 'connected mailboxes', push_subscriptions: 'notification devices',
    task_templates: 'task templates', user_prefs: 'preference records',
    problem_reports: 'problem reports', client_errors: 'error reports',
  }

  return (
    <div className="mt-8 pt-5 border-t border-line">
      <p className="text-xs font-medium text-faint uppercase tracking-wider mb-2">
        Delete account
      </p>

      {stage === 'idle' || stage === 'failed' ? (
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-muted min-w-0">
            Removes everything Day Ahead holds and revokes its access to your Google
            account. Your mail and calendar stay where they are, untouched.
          </p>
          <button
            onClick={begin}
            className="text-xs px-2.5 py-1 rounded-lg border border-warn-line text-warn hover:bg-warn/10 transition-colors shrink-0"
          >
            Delete account
          </button>
        </div>
      ) : null}

      {stage === 'working' && !info && (
        <p className="text-xs text-faint">Checking what you have…</p>
      )}

      {stage === 'confirming' && (
        <div className="rounded-lg border border-warn-line bg-bg p-3">
          <p className="text-xs text-fg mb-2">This will permanently delete:</p>
          <ul className="text-xs text-muted mb-3 space-y-0.5">
            {rows.length === 0 ? (
              <li>· your account, and the preferences attached to it</li>
            ) : rows.map(([k, n]) => (
              <li key={k}>· {n} {label[k] || k.replace(/_/g, ' ')}</li>
            ))}
          </ul>
          <p className="text-xs text-muted mb-3">
            It also revokes Day Ahead's access to your Google account. Your email and
            calendar themselves are not touched. <strong className="text-fg">This cannot be
            undone.</strong>
          </p>
          <label className="block text-[11px] text-faint mb-1">
            Type <span className="text-fg">{info?.email}</span> to confirm
          </label>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            size={1}
            autoComplete="off"
            className="input w-full min-w-0 text-xs"
          />
          {err && <p className="text-xs text-warn mt-2">{err}</p>}
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={() => { setStage('idle'); setInfo(null); setErr(null) }}
              className="text-xs text-faint hover:text-fg transition-colors px-2 py-1"
            >
              Keep my account
            </button>
            <button
              onClick={destroy}
              disabled={typed.trim().toLowerCase() !== String(info?.email || '').toLowerCase()}
              className="text-xs px-3 py-1 rounded-lg bg-warn text-bg font-medium hover:opacity-90 transition-opacity disabled:opacity-30"
            >
              Delete everything
            </button>
          </div>
        </div>
      )}

      {stage === 'working' && info && (
        <p className="text-xs text-faint">Deleting…</p>
      )}

      {stage === 'failed' && err && (
        <p className="text-xs text-warn mt-2">{err}</p>
      )}
    </div>
  )
}

function ReportProblem() {
  const [text, setText] = useState('')
  const [state, setState] = useState('idle')   // idle | sending | sent
  const [error, setError] = useState(null)

  const send = async () => {
    setState('sending'); setError(null)
    try {
      await submitReport(text)
      setState('sent')
      setText('')
    } catch (e) {
      setState('idle')
      setError(e.message || 'Could not send that.')
    }
  }

  return (
    <div className="border-t border-line pt-5">
      <h3 className="text-xs font-medium text-faint uppercase tracking-wider mb-3">Report a problem</h3>
      {state === 'sent' ? (
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-fg">
            Sent — thank you. What you were looking at and which version you're on came with it.
          </p>
          <button
            onClick={() => setState('idle')}
            className="text-xs px-2.5 py-1 rounded-lg border border-line2 text-muted hover:text-fg transition-colors shrink-0"
          >
            Send another
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-faint mb-2">
            Something behaving oddly, or just confusing? Describe it in your own words.
          </p>
          <textarea
            rows={3}
            value={text}
            onChange={e => { setText(e.target.value); setError(null) }}
            placeholder="What happened, and what did you expect instead?"
            className="input w-full text-sm resize-none"
          />
          {error && <p className="text-xs text-warn mt-1.5">{error}</p>}
          <div className="flex justify-end mt-2">
            <button
              onClick={send}
              disabled={state === 'sending' || !text.trim()}
              className="px-3 py-1.5 text-sm rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function AccountRow({ account, onSetPurpose, onSetSignature, onDisconnect }) {
  const saved = account.purpose ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(saved)
  const [saving, setSaving] = useState(false)

  const dirty = draft.trim() !== saved.trim()

  const open = () => { setDraft(saved); setEditing(true) }
  const cancel = () => { setDraft(saved); setEditing(false) }

  const save = async () => {
    if (!dirty) { setEditing(false); return }
    setSaving(true)
    const res = await onSetPurpose(account.id, draft)
    setSaving(false)
    // Stay open on failure so the text isn't lost; collapse only on success.
    if (res?.ok !== false) setEditing(false)
  }

  // One-line gist for the collapsed view — cut on a word boundary.
  const gist = saved.trim().length > 64
    ? saved.trim().slice(0, 64).replace(/\s+\S*$/, '') + '…'
    : saved.trim()

  return (
    <div className="py-2 border-b border-line last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-fg truncate">{account.email}</p>
          <p className="text-xs text-faint mt-0.5 capitalize">
            {account.provider} · {account.status}
          </p>
        </div>
        <button
          onClick={() => onDisconnect(account.id)}
          className="text-xs text-faint hover:text-fg border border-line px-2.5 py-1 rounded-full shrink-0 transition-colors"
        >
          Disconnect
        </button>
      </div>

      {editing ? (
        <div className="mt-2">
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            placeholder="What's this mailbox for? e.g. “My band Lost Saints — booking inquiries from venues and promoters, plus press. Anything about a date or a show matters.”"
            className="input w-full text-xs resize-none"
          />
          <div className="flex items-center justify-end gap-2 mt-1.5">
            <button
              onClick={cancel}
              className="text-xs text-faint hover:text-fg transition-colors px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="text-xs px-3 py-1 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : saved.trim() ? (
        <div className="flex items-center justify-between gap-3 mt-2">
          {/* min-w-0 is what makes truncate work here. A flex child defaults to
              min-width:auto, and truncate sets white-space:nowrap — so without
              this the paragraph's minimum width is the WHOLE description and it
              widens the panel instead of ellipsing. */}
          <p className="text-xs text-muted italic truncate min-w-0">“{gist}”</p>
          <button
            onClick={open}
            className="text-xs text-faint hover:text-fg border border-line px-2.5 py-1 rounded-full shrink-0 transition-colors"
          >
            Edit
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 mt-2">
          <p className="text-xs text-muted min-w-0">
            No context yet — Claude will guess, and guess wrong on the mail you care about.
          </p>
          <button
            onClick={open}
            className="text-xs px-2.5 py-1 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            Add context
          </button>
        </div>
      )}

      <SignatureEditor account={account} onSave={onSetSignature} />
    </div>
  )
}

export default function SettingsModal({ open, onClose, settings, onChange, morningBrief, onMorningBriefChange, briefTime, onBriefTimeChange, aiEnabled, onAiEnabledChange, quietUntil, isQuiet, onQuietUntilChange }) {
  const [email, setEmail] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const { accounts, loading: accountsLoading, disconnect, setPurpose, setSignature } = useConnectedAccounts()

  const connect = async () => {
    setConnecting(true)
    try {
      await startGoogleConnect()
    } catch (e) {
      console.error('Connect failed:', e)
      setConnecting(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !isSupabaseConfigured) return
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md my-8 sm:my-0 bg-surface border border-line2 rounded-2xl shadow-xl flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h2 className="text-base font-medium text-fg">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-surface2 transition-colors"
          >
            <XIcon />
          </button>
        </div>

        <div className="px-5 py-4 space-y-6 overflow-y-auto flex-1 min-h-0">
          {/* Preferences */}
          <div>
            <h3 className="text-xs font-medium text-faint uppercase tracking-wider mb-3">Preferences</h3>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-fg">Hide completed tasks</p>
                <p className="text-xs text-faint mt-0.5">Keep the schedule and list focused on what's left</p>
              </div>
              <Toggle
                checked={settings.hideCompleted}
                onChange={() => onChange({ ...settings, hideCompleted: !settings.hideCompleted })}
              />
            </div>

            {/* Appearance — Auto follows the device, so a phone on a night
                schedule switches without anyone touching this. */}
            <div className="mt-4 pt-3 border-t border-line">
              <p className="text-sm text-fg">Appearance</p>
              <p className="text-xs text-faint mt-0.5">
                {(settings.theme || 'dark') === 'auto'
                  ? 'Following your device setting.'
                  : `Always ${settings.theme || 'dark'}.`}
              </p>
              <div className="mt-2.5 inline-flex rounded-lg border border-line2 p-0.5 gap-0.5">
                {['auto', 'light', 'dark'].map(opt => {
                  const active = (settings.theme || 'dark') === opt
                  return (
                    <button
                      key={opt}
                      onClick={() => onChange({ ...settings, theme: opt })}
                      className={`px-3 py-1 text-sm rounded-md capitalize transition-colors ${
                        active ? 'bg-accent text-accent-fg font-medium' : 'text-muted hover:text-fg hover:bg-surface2'
                      }`}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Account */}
          {isSupabaseConfigured && (
            <div>
              <h3 className="text-xs font-medium text-faint uppercase tracking-wider mb-3">Signed in as</h3>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-fg truncate">{email || 'Signed in'}</p>
                  <p className="text-xs text-faint mt-0.5">
                    Your Day Ahead login — this alone doesn't give access to any mail or calendar
                  </p>
                </div>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="px-3 py-1.5 text-sm rounded-lg border border-line2 text-muted hover:text-fg hover:bg-surface2 transition-colors shrink-0"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}

          {/* Notifications — Web Push for reminders */}
          {isSupabaseConfigured && (
            <NotificationsSection
              morningBrief={morningBrief}
              onMorningBriefChange={onMorningBriefChange}
              briefTime={briefTime}
              onBriefTimeChange={onBriefTimeChange}
            />
          )}

          {/* Quiet mode sits apart from Notifications on purpose: it's enforced
              on the server, so it still applies when this device has no
              notifications turned on at all. */}
          {isSupabaseConfigured && (
            <QuietMode
              quietUntil={quietUntil}
              isQuiet={isQuiet}
              onChange={onQuietUntilChange}
            />
          )}

          {isSupabaseConfigured && (
            <AiControl enabled={aiEnabled} onChange={onAiEnabledChange} />
          )}

          {/* Connected mailboxes */}
          {isConnectConfigured && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-medium text-faint uppercase tracking-wider">
                  Connected accounts
                </h3>
                <button
                  onClick={connect}
                  disabled={connecting}
                  className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg border border-line2 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                >
                  <PlusIcon /> {connecting ? 'Opening…' : 'Connect account'}
                </button>
              </div>
              <p className="text-xs text-faint mb-3">
                Mailboxes Day Ahead reads. Tell each one what it's for — that's what
                Claude uses to tell a real ask from noise, and it reads them differently.
              </p>

              {accountsLoading ? (
                <p className="text-xs text-faint">Loading…</p>
              ) : accounts.length === 0 ? (
                <p className="text-xs text-faint">
                  None yet. Start by connecting <span className="text-muted">{email || 'the account you signed in with'}</span> — granting
                  access is a separate step from signing in — then add your other accounts.
                </p>
              ) : (
                <div>
                  {accounts.map(a => (
                    <AccountRow
                      key={a.id}
                      account={a}
                      onSetPurpose={setPurpose}
                      onSetSignature={setSignature}
                      onDisconnect={disconnect}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {isSupabaseConfigured && <ReportProblem />}

          {isSupabaseConfigured && <ExportData />}
          {isSupabaseConfigured && <DeleteAccount />}
        </div>

        <div className="px-5 py-3 border-t border-line text-xs text-faint">
          Day Ahead · calendar read-only — your tokens never touch the browser
        </div>
      </div>
    </div>
  )
}

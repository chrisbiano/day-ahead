import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

/* Where Google sends you back to after signing in on a device.
 *
 * On the web this is just the site's origin. A native app has no origin worth
 * returning to — capacitor://localhost isn't something Supabase will redirect
 * to — so the app registers its own URL scheme and catches the hand-back.
 * Declared in ios/App/App/Info.plist under CFBundleURLTypes; the two have to
 * agree or the round trip dead-ends in the browser sheet.
 *
 * It must also be listed in Supabase's redirect allowlist, which is dashboard
 * config, not code.
 */
export const NATIVE_AUTH_REDIRECT = 'app.dayahead://auth/callback'

/* Native-shell setup. Everything here is a no-op in the browser, so the web
 * build at dayahead.app is unaffected — one codebase, three targets.
 */

export const isNative = () => Capacitor.isNativePlatform()

/* Keep the web content out from under the status bar.
 *
 * The CSS already pads with env(safe-area-inset-top) and the viewport is set to
 * viewport-fit=cover, but inside the native WebView that inset resolves to zero,
 * so the header rendered on top of the clock and battery. Setting contentInset
 * didn't move it either. Telling the status bar not to overlay the web view is
 * the fix that actually holds: iOS shrinks the view instead, so there's nothing
 * to pad around.
 *
 * The bar is also tinted to match the app rather than left transparent, and its
 * text is flipped to suit whichever theme is showing — light text on the dark
 * ground, dark text on the light one.
 */
export async function setupNativeChrome() {
  if (!isNative()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setOverlaysWebView({ overlay: false })

    const apply = async () => {
      const light = document.documentElement.getAttribute('data-theme') === 'light'
        || (!document.documentElement.hasAttribute('data-theme')
          && window.matchMedia('(prefers-color-scheme: light)').matches)
      // Style.Light means LIGHT TEXT, for a dark bar — the naming reads backwards.
      await StatusBar.setStyle({ style: light ? Style.Dark : Style.Light })
      await StatusBar.setBackgroundColor({ color: light ? '#fafafa' : '#0B0B0C' })
    }
    await apply()

    // App.jsx stamps data-theme on <html> whenever the theme changes, so follow
    // it rather than reading the setting twice.
    new MutationObserver(apply).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme'],
    })
  } catch (e) {
    // A missing status bar must never stop the app from starting.
    console.error('Native chrome setup failed:', e)
  }
}

/* Start the Google sign-in on a device.
 *
 * The web version hands the whole page over to Google and lets the redirect
 * bring it back. A native app can't do that — there's no page to navigate — so
 * we ask Supabase for the URL instead of following it (skipBrowserRedirect),
 * open it in the system browser sheet, and wait for the deep link below.
 *
 * The sheet matters beyond looks: it's a real Safari instance, so an existing
 * Google session is already there and Apple requires it for third-party sign-in
 * rather than an in-app web view that could read what's typed.
 */
export async function signInNative() {
  const { Browser } = await import('@capacitor/browser')
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true },
  })
  if (error) throw error
  if (!data?.url) throw new Error('Supabase returned no sign-in URL')
  await Browser.open({ url: data.url, presentationStyle: 'popover' })
}

/* Catch the hand-back and turn it into a session.
 *
 * Supabase can return the result two ways depending on the flow it's using: a
 * one-time `code` to exchange (PKCE), or the tokens themselves in the fragment
 * (implicit). Which one is a client-library default that has changed across
 * versions, so both are handled rather than pinned to today's behaviour — the
 * failure mode otherwise is a silent no-op on a screen you can't get past.
 */
export async function startNativeAuthBridge() {
  if (!isNative() || !supabase) return
  try {
    const { App } = await import('@capacitor/app')
    const { Browser } = await import('@capacitor/browser')

    App.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.startsWith('app.dayahead://')) return
      try {
        // Custom schemes are parsed inconsistently, so read the parts by hand
        // rather than trusting URL() with a non-http protocol.
        const query = new URLSearchParams(url.split('?')[1]?.split('#')[0] || '')
        const fragment = new URLSearchParams(url.split('#')[1] || '')

        const failed = query.get('error_description') || query.get('error')
        if (failed) throw new Error(failed)

        const code = query.get('code')
        const accessToken = fragment.get('access_token')
        const refreshToken = fragment.get('refresh_token')

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken, refresh_token: refreshToken,
          })
          if (error) throw error
        } else {
          throw new Error('Sign-in came back without a code or tokens')
        }
      } catch (e) {
        console.error('Native sign-in failed:', e)
      } finally {
        // Always dismiss the sheet — leaving it up on failure looks like a hang.
        await Browser.close().catch(() => {})
      }
    })
  } catch (e) {
    console.error('Native auth bridge failed to start:', e)
  }
}

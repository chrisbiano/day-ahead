import { Capacitor } from '@capacitor/core'

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

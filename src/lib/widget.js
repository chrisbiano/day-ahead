import { Capacitor, registerPlugin } from '@capacitor/core'
import { buildSnapshot } from './widgetSnapshot.js'
import { reportError } from './errorLog'

/* The crossing from web into the widget's process.
 *
 * A WidgetKit widget can't reach Supabase, can't see the session, and can't read
 * anything the WebView stored. The shared App Group container is the only place
 * both processes can see, so the app hands over a finished snapshot and the
 * widget only draws.
 *
 * @capacitor/preferences looked like it would do this — it has a `group`
 * option — but its iOS source always writes to UserDefaults.standard and treats
 * `group` as a key prefix, so a widget reading a real App Group suite would
 * find nothing. Hence the small native plugin in WidgetBridgePlugin.swift.
 *
 * No-ops in a browser, so the web build carries it harmlessly.
 */

const WidgetBridge = registerPlugin('WidgetBridge')

export const widgetsSupported = () => Capacitor.getPlatform() === 'ios'

/* Failures are logged, never thrown: a stale widget is a small disappointment,
   and crashing the app over one is not a trade worth making. */
export async function publishWidgetSnapshot(input) {
  // TEMPORARY: report what the app thinks it is, so a silent no-op is visible.
  try { reportError(new Error(`widget probe platform=${Capacitor.getPlatform()} native=${Capacitor.isNativePlatform()}`), 'widget-probe') } catch {}
  if (!widgetsSupported()) return
  try {
    await WidgetBridge.publish({ json: JSON.stringify(buildSnapshot(input)) })
  } catch (e) {
    // Routed to client_errors as well as the console: a widget that never fills
    // in is otherwise a silent failure, and the WebView console is not
    // reachable on a device.
    console.error('Widget publish failed:', e)
    reportError(e, 'widget')
  }
}

export { buildSnapshot }

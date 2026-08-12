import Foundation
import Capacitor
import WidgetKit

/**
 * The one road from the web app into the widget.
 *
 * A WidgetKit widget is a separate process. It cannot call Supabase, cannot see
 * the user's session, and cannot read anything the WebView stored — so the app
 * has to hand it a finished snapshot to draw. The shared App Group container is
 * the only place both processes can see.
 *
 * @capacitor/preferences looked like it would do this — it has a `group`
 * option — but its iOS source always writes to UserDefaults.standard and treats
 * `group` as a key prefix. A widget reading a real App Group suite would find
 * nothing there, and the failure would look like an empty widget rather than a
 * missing feature. Hence this.
 *
 * Deliberately dumb: it stores a string and asks WidgetKit to redraw. All
 * shaping of that string happens in JS, where the schedule already lives and
 * where it can be changed without a native build.
 */
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "publish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise)
    ]

    /// Must match the App Group on BOTH targets, or each process silently reads
    /// its own empty container and the widget just looks broken.
    static let appGroup = "group.app.dayahead"
    static let snapshotKey = "todaySnapshot"

    private var shared: UserDefaults? {
        UserDefaults(suiteName: WidgetBridgePlugin.appGroup)
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        // Reports whether the App Group is actually wired up. Without this the
        // only symptom of a missing capability is a widget that never fills in.
        call.resolve(["available": shared != nil])
    }

    @objc func publish(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("Expected { json }")
            return
        }
        guard let store = shared else {
            call.reject("App Group \(WidgetBridgePlugin.appGroup) is not available to this build")
            return
        }
        store.set(json, forKey: WidgetBridgePlugin.snapshotKey)
        // Ask for a redraw. Budgeted by the system, so this is a request rather
        // than a command — the widget may update a moment later.
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve(["ok": true])
    }
}

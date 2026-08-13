import UIKit
import Capacitor

/**
 * The app's Capacitor view controller, subclassed for one reason: to register
 * the plugins that live in this target rather than in an npm package.
 *
 * Capacitor auto-discovers plugins that ship as packages, because their install
 * step registers them. A plugin defined here is invisible to that: nothing in
 * Swift or Objective-C ever names WidgetBridgePlugin, so the linker dead-strips
 * it out of the binary entirely — it compiled, and then wasn't there. The
 * symptom was calls resolving to nothing and a widget that never filled in.
 *
 * registerPluginInstance both wires it up and, by naming the class, guarantees
 * it survives linking.
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}

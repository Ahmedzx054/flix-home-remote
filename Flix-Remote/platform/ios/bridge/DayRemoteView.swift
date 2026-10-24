// SPDX-License-Identifier: MIT
import UIKit
import Capacitor
import AppPlugin
import FilesystemPlugin
import PreferencesPlugin
import SharePlugin

private final class DayRemoteController: HomeRemoteViewController {
    let assets: URL
    init(assets: URL) { self.assets = assets; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("Use the bundled asset initializer") }
    override func instanceDescriptor() -> InstanceDescriptor {
        InstanceDescriptor(at: assets,
            configuration: assets.appendingPathComponent("capacitor.config.json"),
            cordovaConfiguration: nil)
    }
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(AppPlugin())
        bridge?.registerPluginInstance(FilesystemPlugin())
        bridge?.registerPluginInstance(PreferencesPlugin())
        bridge?.registerPluginInstance(SharePlugin())
    }
}
private final class DayRemoteView: UIControl {
    let controller: DayRemoteController
    private var pageReady = false
    private var probeGeneration = 0
    override var isEnabled: Bool {
        get { super.isEnabled && pageReady }
        set { super.isEnabled = newValue }
    }
    init(assets: URL) {
        controller = DayRemoteController(assets: assets)
        super.init(frame: .zero)
        accessibilityIdentifier = "flix-remote-surface"
    }
    required init?(coder: NSCoder) { fatalError("Use the bundled asset initializer") }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else {
            probeGeneration += 1
            pageReady = false
            controller.willMove(toParent: nil)
            controller.viewIfLoaded?.removeFromSuperview()
            controller.removeFromParent()
            return
        }
        guard controller.parent == nil else { return }
        var responder: UIResponder? = next
        while let current = responder, !(current is UIViewController) { responder = current.next }
        guard let parent = responder as? UIViewController else { return }
        parent.addChild(controller)
        addSubview(controller.view)
        controller.view.frame = bounds
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        controller.didMove(toParent: parent)
        probeGeneration += 1
        checkPage(0, generation: probeGeneration)
    }
    override func layoutSubviews() {
        super.layoutSubviews()
        // Day can attach a Piece before assigning its final frame. Containment
        // must follow that layout, including rotation and subsequent resizes.
        controller.viewIfLoaded?.frame = bounds
    }
    private func checkPage(_ attempt: Int, generation: Int) {
        guard window != nil, generation == probeGeneration else { return }
        guard let web = controller.webView else {
            if attempt < 120 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in self?.checkPage(attempt + 1, generation: generation) }
            }
            return
        }
        let script = "(() => { const f = document.getElementById('original-remote'); const d = f?.contentDocument; const p = d?.getElementById('tvPick'); return !!(p && p.getBoundingClientRect().width > 100 && innerWidth > 200 && innerHeight > 200); })()"
        web.evaluateJavaScript(script) { [weak self] value, error in
            guard let self, self.window != nil, generation == self.probeGeneration else { return }
            self.pageReady = (value as? Bool == true) && self.bounds.width > 200 && self.bounds.height > 200
            if self.pageReady {
                NSLog("FLIX original remote DOM and native frame ready (probe %d)", attempt)
            } else {
                if attempt == 20 || attempt == 120 {
                    NSLog("FLIX readiness pending: frame %.0fx%.0f, DOM %@, JS error %@", self.bounds.width, self.bounds.height, String(describing: value), String(describing: error?.localizedDescription))
                }
                if attempt < 120 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in self?.checkPage(attempt + 1, generation: generation) }
                }
            }
        }
    }
}
@_cdecl("flix_day_remote_create")
// Rust calls this C entry point outside the Swift module. Keep it exported in
// optimized SwiftPM builds as well as the simulator's unoptimized build.
public func flixDayRemoteCreate(_ path: UnsafePointer<CChar>) -> UnsafeMutableRawPointer {
    dispatchPrecondition(condition: .onQueue(.main))
    let view = DayRemoteView(assets: URL(fileURLWithPath: String(cString: path), isDirectory: true))
    return Unmanaged.passRetained(view).toOpaque()
}

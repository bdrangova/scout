// Scout's menu bar item: shows whether the background service answers and runs `scout <command>` for the
// menu actions, so the service logic lives in one place (service/scout).
import AppKit

let dashboardURL = URL(string: "http://scout.localhost:4546")!
let healthURL = URL(string: "http://127.0.0.1:4546/api/health")!

enum ServiceState {
  case checking, running, stopped, busy(String)
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
  private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
  private let menu = NSMenu()
  private var state: ServiceState = .checking
  private var timer: Timer?
  private let control: String = {
    let fromBundle = Bundle.main.object(forInfoDictionaryKey: "ScoutControl") as? String
    return fromBundle ?? (NSHomeDirectory() as NSString).appendingPathComponent(".local/bin/scout")
  }()
  // Black on transparent, marked as a template so macOS tints it for light and dark menu bars.
  // `image(forResource:)` picks up scout-menubar@2x.png for Retina screens.
  private lazy var icon: NSImage? = {
    guard let image = Bundle.main.image(forResource: "scout-menubar") else { return nil }
    image.size = NSSize(width: 18, height: 18)
    image.isTemplate = true
    return image
  }()

  func applicationDidFinishLaunching(_ notification: Notification) {
    menu.delegate = self
    item.menu = menu
    render()
    refresh()
    timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.refresh() }
  }

  func menuNeedsUpdate(_ menu: NSMenu) {
    refresh()
    buildMenu()
  }

  private func refresh() {
    if case .busy = state { return }
    let request = URLRequest(url: healthURL, timeoutInterval: 2)
    URLSession.shared.dataTask(with: request) { [weak self] _, response, _ in
      let ok = (response as? HTTPURLResponse)?.statusCode == 200
      DispatchQueue.main.async {
        guard let self else { return }
        if case .busy = self.state { return }
        self.state = ok ? .running : .stopped
        self.render()
      }
    }.resume()
  }

  private func render() {
    guard let button = item.button else { return }
    if let icon {
      button.image = icon
      button.title = ""
    } else {
      button.title = "Scout"
    }
    switch state {
    case .running: button.alphaValue = 1; button.toolTip = "Scout is running"
    case .stopped: button.alphaValue = 0.35; button.toolTip = "Scout is stopped"
    case .checking: button.alphaValue = 0.6; button.toolTip = "Scout"
    case .busy(let what): button.alphaValue = 0.6; button.toolTip = what
    }
    buildMenu()
  }

  private func buildMenu() {
    menu.removeAllItems()
    let status: String
    switch state {
    case .running: status = "Running at scout.localhost:4546"
    case .stopped: status = "Stopped"
    case .checking: status = "Checking…"
    case .busy(let what): status = what
    }
    let header = NSMenuItem(title: status, action: nil, keyEquivalent: "")
    header.isEnabled = false
    menu.addItem(header)
    menu.addItem(.separator())

    var busy = false
    if case .busy = state { busy = true }
    var running = false
    if case .running = state { running = true }

    add("Open Scout", #selector(openDashboard), key: "o", enabled: running)
    menu.addItem(.separator())
    if running {
      add("Stop", #selector(stop), enabled: !busy)
      add("Restart", #selector(restart), enabled: !busy)
    } else {
      add("Start", #selector(start), enabled: !busy)
    }
    add("Rebuild & Restart", #selector(rebuild), enabled: !busy)
    add("Show Logs", #selector(showLogs))
    menu.addItem(.separator())
    add("Quit Menu Bar Icon", #selector(quit), key: "q")
  }

  private func add(_ title: String, _ action: Selector, key: String = "", enabled: Bool = true) {
    let entry = NSMenuItem(title: title, action: enabled ? action : nil, keyEquivalent: key)
    entry.target = self
    menu.addItem(entry)
  }

  private func run(_ command: String, busy label: String) {
    state = .busy(label)
    render()
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/bash")
    process.arguments = [control, command]
    let output = Pipe()
    process.standardOutput = output
    process.standardError = output
    process.terminationHandler = { [weak self] finished in
      let text = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
      DispatchQueue.main.async {
        guard let self else { return }
        self.state = .checking
        self.render()
        self.refresh()
        if finished.terminationStatus != 0 { self.alert("scout \(command) failed", text) }
      }
    }
    do {
      try process.run()
    } catch {
      state = .checking
      alert("Could not run \(control)", error.localizedDescription)
      refresh()
    }
  }

  private func alert(_ title: String, _ text: String) {
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = String(text.suffix(1500))
    NSApp.activate(ignoringOtherApps: true)
    alert.runModal()
  }

  @objc private func openDashboard() { NSWorkspace.shared.open(dashboardURL) }
  @objc private func start() { run("start", busy: "Starting…") }
  @objc private func stop() { run("stop", busy: "Stopping…") }
  @objc private func restart() { run("restart", busy: "Restarting…") }
  @objc private func rebuild() { run("rebuild", busy: "Rebuilding… (about a minute)") }
  @objc private func quit() { NSApp.terminate(nil) }

  @objc private func showLogs() {
    let home = ProcessInfo.processInfo.environment["AI_REVIEW_HOME"] ?? (NSHomeDirectory() as NSString).appendingPathComponent(".ai-review")
    let log = URL(fileURLWithPath: (home as NSString).appendingPathComponent("logs/scout.log"))
    NSWorkspace.shared.open([log], withApplicationAt: URL(fileURLWithPath: "/System/Applications/Utilities/Console.app"), configuration: NSWorkspace.OpenConfiguration())
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()

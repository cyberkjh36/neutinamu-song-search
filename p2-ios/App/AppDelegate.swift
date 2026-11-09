import UIKit

@main final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    let controller = RemoteController()
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey:Any]?) -> Bool {
        let w = UIWindow(frame:UIScreen.main.bounds); w.rootViewController = controller; w.makeKeyAndVisible(); window = w
        if let url = options?[.url] as? URL { controller.openRoom(url) }; return true
    }
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey:Any] = [:]) -> Bool { controller.openRoom(url) }
    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        guard let url = userActivity.webpageURL else { return false }; return controller.openRoom(url)
    }
    func applicationDidEnterBackground(_ application: UIApplication) { controller.background() }
    func applicationDidBecomeActive(_ application: UIApplication) { controller.foreground() }
}

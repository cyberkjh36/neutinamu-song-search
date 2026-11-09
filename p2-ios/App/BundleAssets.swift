import WebKit

final class BundleAssets: NSObject, WKURLSchemeHandler {
    static let home = URL(string:"neuti://app/search/index.html")!
    static let names: Set<String> = ["index.html","chosung.js","native-search.js","favorites-data.js","favorites-ui.js","favorites.css","p2-ui.mjs","p2-client.mjs","p2.css","icon.svg","icon-192.png","icon-512.png","catalog-20261018.csv","catalog-update-20261104.csv"]
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.scheme == "neuti", url.host == "app", url.user == nil, url.password == nil, url.port == nil, url.query == nil, url.fragment == nil,
              url.path == "/search/" + url.lastPathComponent, Self.names.contains(url.lastPathComponent),
              let file = Bundle.main.url(forResource:url.lastPathComponent,withExtension:nil,subdirectory:"Web"), let data = try? Data(contentsOf:file) else { task.didFailWithError(URLError(.resourceUnavailable)); return }
        let ext = url.pathExtension
        let mime = ext == "html" ? "text/html" : ["js","mjs"].contains(ext) ? "application/javascript" : ext == "css" ? "text/css" : ext == "png" ? "image/png" : ext == "svg" ? "image/svg+xml" : "text/csv"
        guard let response = HTTPURLResponse(url:url,statusCode:200,httpVersion:"HTTP/1.1",headerFields:["Content-Type":mime + "; charset=utf-8","Content-Length":String(data.count),"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"]) else { task.didFailWithError(URLError(.badServerResponse)); return }
        task.didReceive(response); task.didReceive(data); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

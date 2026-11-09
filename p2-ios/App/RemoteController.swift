import UIKit
import WebKit
import NetworkExtension
import UniformTypeIdentifiers

@MainActor final class RemoteController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, UIDocumentPickerDelegate {
    private var web: WKWebView!
    private let transport = P2Connection(), speech = SpeechSearch()
    private var room: String?, pageReady = false, joinPending = false, generation = 0, resumeConnection = false
    private var message = "아이폰 개발본 · P2 직접 연결은 현장 검증이 필요합니다."
    private var queueData: [String:Any] = ["songs":[],"valid":false,"message":"먼저 P2에 연결해 주세요."]
    private var playback: [String:Any] = ["number":0,"known":false]
    private lazy var history = PersonalSongsStore(file:FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("PrivateHistory/personal-songs-v1.json"))
    private lazy var devices: [String:String] = {
        guard let file = Bundle.main.url(forResource:"rooms",withExtension:"json"), let data = try? Data(contentsOf:file), let values = try? JSONDecoder().decode([String:String].self,from:data) else { return [:] }; return values
    }()
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = UIColor(red:0.03,green:0.08,blue:0.13,alpha:1)
        let config = WKWebViewConfiguration(); config.setURLSchemeHandler(BundleAssets(),forURLScheme:"neuti")
        config.userContentController.add(self,name:"p2")
        let bridge = "Object.defineProperty(window,'NeutiP2',{value:Object.freeze({command:function(v){window.webkit.messageHandlers.p2.postMessage({kind:'command',value:v});},saveCsv:function(n,c){window.webkit.messageHandlers.p2.postMessage({kind:'csv',name:n,value:c});}})});"
        config.userContentController.addUserScript(WKUserScript(source:bridge,injectionTime:.atDocumentStart,forMainFrameOnly:true))
        web = WKWebView(frame:.zero,configuration:config); web.navigationDelegate = self; web.uiDelegate = self; web.isOpaque = false; web.backgroundColor = view.backgroundColor
        web.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(web)
        NSLayoutConstraint.activate([web.topAnchor.constraint(equalTo:view.safeAreaLayoutGuide.topAnchor),web.leadingAnchor.constraint(equalTo:view.leadingAnchor),web.trailingAnchor.constraint(equalTo:view.trailingAnchor),web.bottomAnchor.constraint(equalTo:view.safeAreaLayoutGuide.bottomAnchor)])
        transport.stateChanged = { [weak self] text in self?.message = text; self?.paint() }
        transport.queueChanged = { [weak self] songs,text,valid in self?.queueData = ["songs":songs,"message":text,"valid":valid]; self?.paint() }
        transport.playbackChanged = { [weak self] song,known in self?.playback = ["number":song,"known":known]; self?.paint() }
        transport.personalSong = { [weak self] song in guard let self else { return }; do { try self.history.record(song,at:Int64(Date().timeIntervalSince1970 * 1000)); self.personalSongs() } catch { self.personalSongs("내 애창곡을 저장하지 못했습니다. 기존 기록은 유지했습니다.") } }
        web.load(URLRequest(url:BundleAssets.home))
    }
    private func call(_ function: String, _ args: [Any]) {
        guard pageReady, let data = try? JSONSerialization.data(withJSONObject:args,options:[.fragmentsAllowed]), let json = String(data:data,encoding:.utf8) else { return }
        web.evaluateJavaScript("window.\(function)&&window.\(function).apply(null,\(json))",completionHandler:nil)
    }
    private func paint() {
        let name = room.map { $0 + "번방" } ?? "P2"
        call("onP2NativeState",[["label":(transport.connected ? "● " : "○ ") + name + (transport.connected ? " 연결됨" : " 연결 전"),"message":message,"connected":transport.connected,"busy":joinPending || transport.busy,"reconnecting":false]])
        call("onP2NativeQueue",[queueData]); call("onP2NativePlayback",[playback])
    }
    private func feedback(_ text: String) { message = text; paint() }
    func userContentController(_ userContentController: WKUserContentController, didReceive m: WKScriptMessage) {
        guard m.frameInfo.isMainFrame, m.frameInfo.securityOrigin.protocol == "neuti", m.frameInfo.securityOrigin.host == "app", m.webView === web, let b = m.body as? [String:Any] else { return }
        if b["kind"] as? String == "csv" { exportCSV(b); return }
        guard let raw = b["value"] as? String, raw.utf8.count <= 512, let data = raw.data(using:.utf8), let req = try? JSONSerialization.jsonObject(with:data) as? [String:Any], let command = req["command"] as? String else { return }
        func number() throws -> Int { let text = String(describing:req["number"] ?? ""); guard text.range(of:"^[1-9][0-9]{0,7}$",options:.regularExpression) != nil, let n = Int(text) else { throw P2Error.invalid("곡번호를 확인해 주세요.") }; return n }
        func position() throws -> Int { let text = String(describing:req["index"] ?? ""); guard text.range(of:"^(0|[1-9][0-9]{0,2})$",options:.regularExpression) != nil, let n = Int(text), n <= 254 else { throw P2Error.invalid("예약 위치를 확인해 주세요.") }; return n }
        do {
            switch command {
            case "status": paint()
            case "personalSongs": personalSongs()
            case "personalRemove": try history.remove(number()); personalSongs()
            case "connect": if transport.connected || transport.connecting || joinPending { disconnect() } else { connectSelected() }
            case "find": selectRoom()
            case "connection": settingsMenu()
            case "voice": speech.start(in:self) { [weak self] texts,error in self?.call("onP2NativeVoice",[texts,error]) }
            case "import": present(UIDocumentPickerViewController(forOpeningContentTypes:[.commaSeparatedText,.plainText],asCopy:true),animated:true); (presentedViewController as? UIDocumentPickerViewController)?.delegate = self
            case "play","reserve","queuePlay","queueCancel","cancel","next","queue":
                guard let s = transport.session, s.identified else { throw P2Error.invalid("먼저 P2에 연결해 주세요.") }
                switch command {
                case "play": try s.startInOrder(number())
                case "reserve": try s.reserve(number())
                case "queuePlay": try s.playQueued(number(),position())
                case "queueCancel": try s.cancelQueued(number(),position())
                case "cancel": try s.stop()
                case "next": try s.next()
                default: try s.queue()
                }
            default: break
            }
        } catch { feedback(error.localizedDescription) }
    }
    private func personalSongs(_ override: String = "") {
        do { let rows = try history.read().map { ["number":$0.number,"lastPlayed":$0.lastPlayed] as [String:Any] }; call("onP2NativePersonalSongs",[["songs":rows,"error":override]]) }
        catch { call("onP2NativePersonalSongs",[["songs":[],"error":"내 애창곡을 읽지 못했습니다. 기존 기록은 지우지 않았습니다."]]) }
    }
    @discardableResult func openRoom(_ url: URL) -> Bool {
        guard let requested = Rooms.parseLink(url) else { return false }
        loadViewIfNeeded()
        guard !transport.connected && !transport.connecting && !joinPending || room == requested else { feedback("현재 연결을 해제한 뒤 다른 방 QR을 스캔해 주세요."); return true }
        room = requested; if !transport.connected && !transport.connecting && !joinPending { connectSelected() }; return true
    }
    private func disconnect() { generation += 1; joinPending = false; resumeConnection = false; transport.disconnect(); feedback("연결을 해제했습니다.") }
    private func connectSelected() {
        guard let room else { selectRoom(); return }
        do {
            guard let config = try PrivateSettings.room(room), let device = devices[room] else { feedback("\(room)번방의 아이폰 연결 설정이 아직 없습니다. 직원용 연결 설정과 P2 무선망 접속 확인이 필요합니다."); return }
            let profile = try GuestProfile(deviceName:device,clientID:PrivateSettings.clientID(),password:config.protocolPassword)
            generation += 1; let token = generation
            func begin() { guard self.generation == token else { return }; self.joinPending = false; do { try self.transport.connect(config,profile:profile) } catch { self.feedback(error.localizedDescription) } }
            if config.ssid.isEmpty { begin(); return }
            joinPending = true; feedback("P2 Wi-Fi 연결 허용 창을 확인해 주세요.")
            let wifi = config.wifiPassword.isEmpty ? NEHotspotConfiguration(ssid:config.ssid) : NEHotspotConfiguration(ssid:config.ssid,passphrase:config.wifiPassword,isWEP:false)
            wifi.joinOnce = true
            NEHotspotConfigurationManager.shared.apply(wifi) { [weak self] error in DispatchQueue.main.async {
                guard let self, self.generation == token else { return }; self.joinPending = false
                if let e = error as NSError?, e.domain != NEHotspotConfigurationErrorDomain || e.code != NEHotspotConfigurationError.alreadyAssociated.rawValue { self.feedback("P2 Wi-Fi에 연결하지 못했습니다. 무선망 이름과 비밀번호를 확인해 주세요."); return }; begin()
            }}
        } catch { feedback(error.localizedDescription) }
    }
    private func selectRoom() {
        guard !transport.connected && !transport.connecting && !joinPending else { feedback("현재 연결을 먼저 해제해 주세요."); return }
        let a = UIAlertController(title:"내 방 선택",message:"아이폰의 일반 Wi-Fi 접속이 확인된 방에서 사용합니다.",preferredStyle:.alert)
        for n in Rooms.numbers { a.addAction(UIAlertAction(title:n + "번방",style:.default) { [weak self] _ in self?.room = n; self?.connectSelected() }) }
        a.addAction(UIAlertAction(title:"취소",style:.cancel)); present(a,animated:true)
    }
    private func settingsMenu() {
        let a = UIAlertController(title:"P2 연결",message:"아이폰 개발본 · Wi-Fi Direct 자동 탐색은 지원하지 않습니다. P2가 일반 Wi-Fi 접속을 허용하는지 현장 확인이 필요합니다.",preferredStyle:.alert)
        a.addAction(UIAlertAction(title:"방 QR 스캔",style:.default) { [weak self] _ in let scanner = QRScanner(); scanner.selected = { [weak self] in _ = self?.openRoom($0) }; self?.present(scanner,animated:true) })
        a.addAction(UIAlertAction(title:"방 번호 선택",style:.default) { [weak self] _ in self?.selectRoom() })
        a.addAction(UIAlertAction(title:"직원용 연결 설정",style:.default) { [weak self] _ in self?.editConnection() })
        a.addAction(UIAlertAction(title:"마이크·카메라·로컬 네트워크 권한",style:.default) { _ in if let url = URL(string:UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } })
        a.addAction(UIAlertAction(title:"연결 해제",style:.destructive) { [weak self] _ in self?.disconnect() })
        a.addAction(UIAlertAction(title:"닫기",style:.cancel)); present(a,animated:true)
    }
    private func editConnection() {
        guard !transport.connected && !transport.connecting && !joinPending else { feedback("연결을 해제한 뒤 설정해 주세요."); return }
        let existing = room.flatMap { try? PrivateSettings.room($0) }
        let a = UIAlertController(title:"직원용 연결 설정",message:"P2의 일반 Wi-Fi 접속을 먼저 확인하세요. 반주기 IP를 추측해서 입력하지 마세요. SSID를 비워 두면 현재 연결된 Wi-Fi를 사용합니다.",preferredStyle:.alert)
        for (hint,value) in [("방 번호 (1, 2, 3, 5, 6, 7, 8)",room ?? ""),("P2의 내부 IP 주소",existing?.host ?? ""),("P2 Wi-Fi 이름 (선택)",existing?.ssid ?? ""),("Wi-Fi 비밀번호 (선택)",existing?.wifiPassword ?? ""),("P2 연결 암호 숫자 (기본 0)",String(existing?.protocolPassword ?? 0))] {
            a.addTextField { f in f.placeholder = hint; f.text = value; f.autocorrectionType = .no; f.autocapitalizationType = .none; f.isSecureTextEntry = hint.contains("비밀번호") }
        }
        a.addAction(UIAlertAction(title:"저장",style:.default) { [weak self, weak a] _ in
            guard let self, let fields = a?.textFields, let password = UInt32(fields[4].text ?? "") else { return }
            let c = RoomConnection(room:fields[0].text?.trimmingCharacters(in:.whitespaces) ?? "",host:fields[1].text?.trimmingCharacters(in:.whitespaces) ?? "",ssid:fields[2].text ?? "",wifiPassword:fields[3].text ?? "",protocolPassword:password)
            do { try PrivateSettings.saveRoom(c); self.room = c.room; self.feedback("\(c.room)번방 설정을 저장했습니다. P2 연결을 눌러 시험해 주세요.") } catch { self.feedback(error.localizedDescription) }
        }); a.addAction(UIAlertAction(title:"취소",style:.cancel)); present(a,animated:true)
    }
    func background() { speech.cancel(); resumeConnection = transport.connected; generation += 1; joinPending = false; transport.disconnect("앱을 다시 열면 연결을 확인합니다.") }
    func foreground() { if resumeConnection { resumeConnection = false; connectSelected() } }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { guard webView.url == BundleAssets.home else { return }; pageReady = true; paint() }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url == BundleAssets.home && action.targetFrame?.isMainFrame == true { decisionHandler(.allow); return }
        if action.navigationType == .linkActivated && url.scheme == "https" && url.host == "www.tjmedia.com" && url.path == "/song/accompaniment_search" { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard frame.isMainFrame, frame.securityOrigin.protocol == "neuti", frame.securityOrigin.host == "app" else { completionHandler(false); return }
        let a = UIAlertController(title:nil,message:message,preferredStyle:.alert); a.addAction(UIAlertAction(title:"확인",style:.default) { _ in completionHandler(true) }); a.addAction(UIAlertAction(title:"취소",style:.cancel) { _ in completionHandler(false) }); present(a,animated:true)
    }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }; let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
        do { let size = try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 16_777_217; guard size <= 16_777_216 else { throw P2Error.invalid("16MB 이하의 CSV 파일을 선택해 주세요.") }; let data = try Data(contentsOf:url); guard data.count <= 16_777_216, let text = String(data:data,encoding:.utf8) else { throw P2Error.invalid("UTF-8 CSV 파일을 선택해 주세요.") }; call("onP2NativeImport",[text,""]) }
        catch { call("onP2NativeImport",["",error.localizedDescription]) }
    }
    private func exportCSV(_ b: [String:Any]) {
        guard let name = b["name"] as? String, name.count <= 80, name.hasSuffix(".csv"), !name.contains("/"), !name.contains("\\"), let text = b["value"] as? String, text.utf8.count <= 16_777_216 else { return }
        do { let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString); try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true); let file = directory.appendingPathComponent(name); try Data(text.utf8).write(to:file,options:.completeFileProtection)
            let sheet = UIActivityViewController(activityItems:[file],applicationActivities:nil); sheet.popoverPresentationController?.sourceView = view; sheet.completionWithItemsHandler = { _,_,_,_ in try? FileManager.default.removeItem(at:directory) }; present(sheet,animated:true)
        } catch { call("onP2NativeFile",["CSV 파일을 내보내지 못했습니다."]) }
    }
}

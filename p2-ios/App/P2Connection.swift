import Foundation
import Network

/// Standard Wi-Fi/TCP transport. It does NOT implement Android Wi-Fi Direct/WPS discovery.
@MainActor final class P2Connection {
    private var socket: NWConnection?
    private var decoder = FrameDecoder()
    private var timer: Timer?
    private var deadline: DispatchWorkItem?
    private(set) var session: Session?
    var stateChanged: (String) -> Void = { _ in }
    var queueChanged: ([Int],String,Bool) -> Void = { _,_,_ in }
    var playbackChanged: (Int,Bool) -> Void = { _,_ in }
    var personalSong: (Int) -> Void = { _ in }
    private(set) var connecting = false
    var connected: Bool { session?.identified == true }
    var busy: Bool { connecting || session?.busy == true }
    func connect(_ config: RoomConnection, profile: GuestProfile) throws {
        try config.validate(); disconnect(); decoder = FrameDecoder(); connecting = true
        let tcp = NWProtocolTCP.Options(); tcp.noDelay = true
        let parameters = NWParameters(tls:nil,tcp:tcp)
        parameters.requiredInterfaceType = .wifi
        let connection = NWConnection(host:NWEndpoint.Host(config.host),port:7070,using:parameters)
        socket = connection; stateChanged("Wi-Fi로 P2에 연결하고 있습니다…")
        connection.stateUpdateHandler = { [weak self, weak connection] state in
            Task { @MainActor in
            guard let self, let connection, self.socket === connection else { return }
            switch state {
            case .ready:
                self.deadline?.cancel(); self.deadline = nil; self.connecting = false
                let s = Session(profile:profile) { [weak self, weak connection] bytes in
                    guard let self, let connection, self.socket === connection else { return }
                    connection.send(content:Data(bytes),completion:.contentProcessed { error in
                        guard let error else { return }; _ = error
                        DispatchQueue.main.async { [weak self, weak connection] in
                            guard let self, let connection, self.socket === connection else { return }
                            self.fail("전송 결과를 확인하지 못했습니다. 명령은 자동 재전송하지 않습니다.")
                        }
                    })
                }
                self.session = s
                s.changed = { [weak self] text in
                    guard let self else { return }
                    if self.session?.state == .closed { self.cancelSocket() }
                    self.stateChanged(text)
                }
                s.queueChanged = { [weak self] in self?.queueChanged($0,$1,$2) }
                s.playbackChanged = { [weak self] in self?.playbackChanged($0,$1) }
                s.personalSong = { [weak self] in self?.personalSong($0) }
                self.timer = Timer.scheduledTimer(withTimeInterval:1,repeats:true) { [weak self] _ in
                    Task { @MainActor in self?.session?.tick() }
                }
                s.start(); self.receive(connection)
            case .failed: self.fail("P2에 연결하지 못했습니다. 로컬 네트워크 허용과 P2 Wi-Fi 연결을 확인해 주세요.")
            default: break
            }
            }
        }
        let timeout = DispatchWorkItem { [weak self, weak connection] in
            guard let self, let connection, self.socket === connection, self.connecting else { return }
            self.fail("P2에 도달하지 못했습니다. 아이폰에서 P2 무선망에 연결할 수 있는지 먼저 확인해 주세요.")
        }
        deadline = timeout; DispatchQueue.main.asyncAfter(deadline:.now() + 12,execute:timeout)
        connection.start(queue:.main)
    }
    private func receive(_ connection: NWConnection) {
        connection.receive(minimumIncompleteLength:1,maximumLength:8192) { [weak self, weak connection] data,_,complete,error in
            Task { @MainActor in
            guard let self, let connection, self.socket === connection else { return }
            do {
                if let data { for frame in try self.decoder.feed(Array(data)) { try self.session?.receive(frame) } }
                if complete || error != nil { self.fail("P2 연결이 끊겼습니다. 다시 연결해 주세요."); return }
                if self.socket === connection { self.receive(connection) }
            } catch { self.fail("P2 응답 형식을 확인하지 못해 연결을 종료했습니다.") }
            }
        }
    }
    private func cancelSocket() { deadline?.cancel(); deadline = nil; timer?.invalidate(); timer = nil; connecting = false; let old = socket; socket = nil; old?.stateUpdateHandler = nil; old?.cancel() }
    private func fail(_ message: String) {
        cancelSocket()
        if let s = session, s.state != .closed { s.close(message) } else { stateChanged(message) }
    }
    func disconnect(_ message: String = "연결을 해제했습니다.") { cancelSocket(); session?.close(message); session = nil }
}

import Foundation

/// Event-driven port of the Android 0.11.15 protocol. Drive only from one serial queue.
/// Network acceptance is not playback. No mutating command is retried automatically.
final class Session {
    enum State { case closed, auth, identify, ready, play, stop, reserve, queue, advanceQueue, advanceMove, advanceConfirm, advanceStop, advanceRecheck, advancePlay, advanceVerify, removeQueue, removeSend, removeVerify }
    enum Advance { case next, selected, search }
    private(set) var state: State = .closed
    private(set) var identified = false
    var changed: (String) -> Void = { _ in }
    var queueChanged: ([Int], String, Bool) -> Void = { _,_,_ in }
    var playbackChanged: (Int, Bool) -> Void = { _,_ in }
    var personalSong: (Int) -> Void = { _ in }
    let profile: GuestProfile
    let send: ([UInt8]) -> Void
    let clock: () -> TimeInterval
    private var deadline: TimeInterval = 0, lastReceived: TimeInterval = 0
    private var wanted = 0, reserved = 0, index = 0, removeSong = 0
    private var action: Advance?, expected: Snapshot?, lastQueue: Snapshot?, removeBefore: Snapshot?
    private var playing = 0, playbackKnown = false, playbackRevision = 0, personalRevision = -1
    private var ownReservations: Set<Int> = []
    var busy: Bool { state != .ready && state != .closed }
    private var advancing: Bool { [.advanceQueue,.advanceMove,.advanceConfirm,.advanceStop,.advanceRecheck,.advancePlay,.advanceVerify].contains(state) }
    private var removing: Bool { [.removeQueue,.removeSend,.removeVerify].contains(state) }

    init(profile: GuestProfile, clock: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }, send: @escaping ([UInt8]) -> Void) {
        self.profile = profile; self.clock = clock; self.send = send
    }
    private func change(_ next: State, _ message: String) { state = next; deadline = clock() + 10; changed(message) }
    private func write(_ f: Frame) { send(profile.packet(f)) }
    func start() { guard state == .closed else { return }; lastReceived = clock(); change(.auth, "P2의 연결 응답을 기다립니다…"); write(profile.registration()) }
    func close(_ message: String = "연결을 해제했습니다.") {
        guard state != .closed else { return }
        state = .closed; identified = false; ownReservations.removeAll(); action = nil; expected = nil; lastQueue = nil; removeBefore = nil
        updatePlayback(0, false); queueChanged([], "다시 연결해 주세요.", false); changed(message)
    }
    func tick() {
        guard state != .closed else { return }
        if clock() - lastReceived > 60 { close("P2의 연결 유지 응답이 없어 연결을 종료했습니다."); return }
        guard state != .ready, clock() > deadline else { return }
        if state == .auth || state == .identify { close("P2의 연결 승인을 확인하지 못했습니다. Wi-Fi와 방 설정을 확인해 주세요."); return }
        failure("응답 시간이 지났습니다. 반주기 화면과 예약 목록을 확인해 주세요. 요청은 자동 재전송하지 않습니다.")
    }
    private func requireReady() throws { guard state == .ready, identified else { throw P2Error.invalid("P2 연결과 이전 요청의 완료를 기다려 주세요.") } }
    func startInOrder(_ song: Int) throws { guard Wire.validSong(song) else { throw P2Error.invalid("곡번호 오류") }; try advance(.search, song, 0) }
    func next() throws { try advance(.next, 0, 0) }
    func playQueued(_ song: Int, _ position: Int) throws {
        guard Wire.validSong(song), (0...254).contains(position) else { throw P2Error.invalid("예약 위치 오류") }
        try advance(.selected, song, position)
    }
    private func advance(_ mode: Advance, _ song: Int, _ position: Int) throws {
        try requireReady(); action = mode; wanted = song; index = position; reserved = 0; expected = nil
        change(.advanceQueue, "최신 예약 순서를 확인합니다…"); write(Wire.queue())
    }
    private func play(_ song: Int) throws {
        try requireReady(); let packet = try Wire.song(song, reserve: false); wanted = song
        change(.play, "\(song)번 시작 요청 중…"); write(packet)
    }
    func reserve(_ song: Int) throws {
        try requireReady(); let packet = try Wire.song(song, reserve: true); reserved = song
        change(.reserve, "\(song)번 예약 요청 중…"); write(packet)
    }
    func queue() throws { try requireReady(); reserved = 0; change(.queue, "P2 예약 목록을 불러옵니다…"); write(Wire.queue()) }
    func stop() throws {
        guard identified, [.ready,.play,.queue].contains(state) else { throw P2Error.invalid("P2 연결과 이전 요청을 확인해 주세요.") }
        reserved = 0; change(.stop, "현재 곡 정지 요청 중…"); write(Wire.stop())
    }
    func cancelQueued(_ song: Int, _ position: Int) throws {
        try requireReady()
        guard let snapshot = lastQueue, snapshot.songs.indices.contains(position), snapshot.songs[position] == song else { throw P2Error.invalid("예약 목록을 새로고침한 뒤 다시 선택해 주세요.") }
        removeBefore = snapshot; removeSong = song; index = position
        change(.removeQueue, "취소 전 최신 예약 목록을 확인합니다…"); write(Wire.queue())
    }
    private func failure(_ text: String) { action = nil; expected = nil; removeBefore = nil; lastQueue = nil; reserved = 0; queueChanged([],text,false); change(.ready,text) }
    private func stopForQueue() { change(.advanceStop, "현재 곡을 정지한 뒤 예약곡 \(wanted)번을 시작합니다…"); write(Wire.stop()) }
    private func updatePlayback(_ song: Int, _ known: Bool) {
        guard song != playing || known != playbackKnown else { return }
        playing = song; playbackKnown = known; playbackRevision += 1; playbackChanged(song, known)
        if known && song > 0 && ownReservations.remove(song) != nil { record(song) }
    }
    private func record(_ song: Int) {
        guard playbackKnown, playing == song, personalRevision != playbackRevision else { return }
        personalRevision = playbackRevision; ownReservations.remove(song); personalSong(song)
    }
    func receive(_ f: Frame) throws {
        guard state != .closed else { return }; lastReceived = clock()
        if f.code == 1000 && f.body.isEmpty { write(Wire.heartbeat()); return }
        if state == .auth && f.code == 3000 {
            guard f.type == 1, f.body.count == 1 else { close("P2가 초기 연결을 승인하지 않았습니다. 다른 식별값이나 암호로 재시도하지 않습니다."); return }
            change(.identify, "연결된 반주기를 확인합니다…"); write(Wire.info()); return
        }
        if state == .identify && f.code == 3100 {
            guard f.type == 1, profile.matches(f.body) else { close("선택한 방과 반주기가 다릅니다. 제어 명령을 보내지 않았습니다."); return }
            identified = true; change(.ready, "P2 연결 확인 · 노래를 선택해 주세요."); return
        }
        guard identified else { return }
        var reported: Int?
        if f.code == 4300 {
            reported = try? Wire.playing(f)
            if let n = reported { updatePlayback(n, n > 0) } else { updatePlayback(0,false) }
        }
        let stopped = f.code == 4100 && f.type == 1 && f.scalar == 12
        if stopped { updatePlayback(0,true) }
        if state == .removeSend && f.code == 4210 {
            if f.type == 9 && f.scalar == 100 { change(.removeVerify, "남은 예약 목록을 확인합니다…"); write(Wire.queue()) }
            else { failure("예약 취소를 승인받지 못했습니다. 목록을 새로고침해 주세요.") }; return
        }
        if state == .advanceMove && f.code == 4210 {
            if f.type == 9 && f.scalar == 100 { change(.advanceConfirm, "변경된 예약 순서를 확인합니다…"); write(Wire.queue()) }
            else { failure("순서 변경을 확인하지 못해 곡을 시작하지 않았습니다.") }; return
        }
        if state == .advanceStop && f.code == 4100 {
            if stopped { change(.advanceRecheck, "시작 전 예약 순서를 다시 확인합니다…"); write(Wire.queue()) }
            else if f.type == 3 || f.type == 9 { failure("정지 승인을 확인하지 못해 곡을 시작하지 않았습니다.") }; return
        }
        if state == .advancePlay {
            if f.code == 4100 {
                if f.type == 3 || (f.type == 9 && f.scalar != 100) { failure("시작 요청을 승인받지 못했습니다.") }
                else { changed("시작 응답을 받았습니다. 실제 재생 확인을 기다립니다…") }; return
            }
            if reported == wanted && wanted > 0 {
                record(wanted); change(.advanceVerify, "실행한 곡이 예약에서 빠졌는지 확인합니다…"); write(Wire.queue()); return
            }
        }
        if f.code == 4200 || f.code == 4220 {
            guard let snapshot = try? Snapshot(f) else {
                lastQueue = nil; queueChanged([], "예약 목록 형식을 확인하지 못했습니다.", false)
                if (f.code == 4200 && (advancing || removing)) || state == .queue { failure("예약 목록 오류로 처리를 중단했습니다. 새로고침해 주세요.") }; return
            }
            lastQueue = snapshot; let songs = snapshot.songs
            var text = "P2 예약곡 \(songs.count)곡 · 반주기에서 받은 순서입니다."
            if state == .queue && reserved > 0 && songs.contains(reserved) { ownReservations.insert(reserved); text = "\(reserved)번 예약 확인 · 총 \(songs.count)곡" }
            queueChanged(songs, text, true)
            if f.code == 4200 && removing {
                guard let before = removeBefore else { failure("예약 취소 상태 오류"); return }
                if state == .removeQueue {
                    guard before == snapshot else { failure("예약 목록이 바뀌어 취소하지 않았습니다. 다시 선택해 주세요."); return }
                    change(.removeSend, "\(removeSong)번 예약 취소 요청 중…"); write(try Wire.edit(snapshot,index:index,remove:true)); return
                }
                if state == .removeVerify {
                    let confirmed = before.without(index) == snapshot
                    if confirmed { ownReservations.remove(removeSong) }
                    removeBefore = nil; change(.ready, confirmed ? "예약 취소 완료 · 남은 \(songs.count)곡" : "취소 응답과 남은 목록이 다릅니다. 실제 목록을 확인해 주세요."); return
                }
            }
            if f.code == 4200 && advancing {
                if state == .advanceQueue {
                    if songs.isEmpty {
                        let fallback = wanted, mode = action; action = nil; expected = nil
                        change(.ready, "예약곡이 없습니다.")
                        if mode == .search { try play(fallback) }; return
                    }
                    if action == .selected && (!songs.indices.contains(index) || songs[index] != wanted) { failure("예약 순서가 바뀌었습니다. 최신 목록에서 다시 선택해 주세요."); return }
                    expected = snapshot
                    if action == .selected && index > 0 {
                        expected = snapshot.movedToFront(index); change(.advanceMove, "선택한 예약곡을 먼저 실행하도록 준비합니다…"); write(try Wire.edit(snapshot,index:index,remove:false)); return
                    }
                    wanted = songs[0]; stopForQueue(); return
                }
                if state == .advanceConfirm || state == .advanceRecheck {
                    guard expected == snapshot else { failure("예약 순서가 예상과 달라 시작을 멈췄습니다. 최신 목록을 확인해 주세요."); return }
                    if state == .advanceConfirm { stopForQueue() }
                    else { change(.advancePlay, "첫 번째 예약곡 \(wanted)번을 실행합니다…"); write(Wire.next()) }; return
                }
                if state == .advanceVerify {
                    let match = expected?.without(0) == snapshot
                    action = nil; expected = nil
                    change(.ready, match ? "\(wanted)번 재생 확인 · 남은 \(songs.count)곡은 예약 순서대로 진행합니다." : "재생은 확인했으나 남은 예약 목록이 예상과 다릅니다. 실제 목록을 확인해 주세요."); return
                }
            }
            if state == .queue { reserved = 0; change(.ready,text) }; return
        }
        if state == .reserve && f.code == 4000 {
            if (f.type == 1 && f.scalar == 2) || (f.type == 9 && f.scalar == 100) { change(.queue, "실제 예약 목록을 확인합니다…"); write(Wire.queue()) }
            else { failure("예약 승인을 확인하지 못했습니다. 목록을 새로고침해 주세요.") }; return
        }
        if state == .play && f.code == 4000 {
            if f.type == 3 || (f.type == 9 && f.scalar != 100) { change(.ready,"시작 요청을 승인받지 못했습니다."); return }
            changed("시작 요청 응답을 받았습니다. 실제 재생 확인을 기다립니다…")
        }
        if state == .play && reported == wanted && wanted > 0 { record(wanted); change(.ready,"\(wanted)번 재생 확인") }
        else if state == .stop && stopped { change(.ready,"현재 곡 정지 확인") }
    }
}

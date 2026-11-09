import XCTest
@testable import P2Core

final class ProtocolTests: XCTestCase {
    let name = "TJ_P2_P0200000001_1_B"
    func profile() throws -> GuestProfile { try GuestProfile(deviceName:name,clientID:"02:11:22:33:44:55") }
    func identity() -> Frame { Wire.frame(3100,Array("P2AP0200000001".utf8) + [UInt8](repeating:0,count:52)) }
    func queue(_ songs: [Int], tag: UInt8 = 0, broadcast: Bool = false) -> Frame {
        let b = [UInt8(songs.count)] + songs.flatMap { Wire.integer(UInt32($0)) + [tag,0,0,0,0] }
        return Wire.frame(broadcast ? 4220 : 4200,(broadcast ? [UInt8](repeating:0,count:7) : []) + b)
    }
    func playing(_ song: Int) -> Frame { Wire.frame(4300,Wire.integer(UInt32(song)) + [0]) }
    func ready(_ s: Session) throws { s.start(); try s.receive(Wire.frame(3000,[7])); try s.receive(identity()); XCTAssertTrue(s.identified); XCTAssertEqual(s.state,.ready) }
    func testRegistrationAndWireParity() throws {
        let p = try profile(), b = p.packet(p.registration())
        XCTAssertEqual(b.count,63); XCTAssertEqual(Wire.u32(b,0),3000); XCTAssertEqual(Array(b[4..<12]),[1,0,0,0,0,2,0,1])
        XCTAssertEqual(Array(b[16..<20]),Array("TJAA".utf8)); XCTAssertEqual(Array(b[28..<38]),Array("0000000000".utf8)); XCTAssertEqual(Array(b[43..<60]),Array("02:11:22:33:44:55".utf8))
        XCTAssertEqual(try Wire.song(10909,reserve:false).bytes,[160,15,0,0,2,0,0,0,0,2,0,1,9,0,0,0,176,4,0,0,157,42,0,0,0])
        var secured = p; secured.password = 0x12345678
        XCTAssertEqual(Array(secured.packet(Wire.next())[5..<9]),[0x78,0x56,0x34,0x12])
    }
    func testDecoderAllSplitPositionsAndCoalescing() throws {
        let bytes = Wire.info().bytes + playing(10909).bytes
        for split in 0...bytes.count {
            var d = FrameDecoder(); let a = try d.feed(Array(bytes[..<split])); let b = try d.feed(Array(bytes[split...])); XCTAssertEqual((a + b).map(\.code),[3100,4300]); try d.finish()
        }
        var partial = FrameDecoder(); _ = try partial.feed([1,2]); XCTAssertThrowsError(try partial.finish())
        var invalid = FrameDecoder(); XCTAssertThrowsError(try invalid.feed([UInt8](repeating:0,count:12) + Wire.integer(UInt32(Wire.maxBody + 1))))
    }
    func testIdentityMustMatchBeforeControl() throws {
        var sent: [[UInt8]] = []; let s = Session(profile:try profile()) { sent.append($0) }
        s.start(); XCTAssertThrowsError(try s.reserve(10909)); try s.receive(Wire.frame(3000,[1])); try s.receive(Wire.frame(3100,Array(repeating:0,count:66)))
        XCTAssertEqual(s.state,.closed); XCTAssertFalse(s.identified); XCTAssertEqual(sent.map { Wire.u32($0,0) },[3000,3100])
    }
    func testRegistrationRejectDoesNotRetry() throws {
        var sent: [[UInt8]] = []; let s = Session(profile:try profile()) { sent.append($0) }; s.start(); try s.receive(Wire.frame(3000,Wire.integer(3003),type:3)); s.tick()
        XCTAssertEqual(s.state,.closed); XCTAssertEqual(sent.count,1)
    }
    func testEmptyQueueStartRequiresPlaybackForHistory() throws {
        var sent: [[UInt8]] = [], history: [Int] = []; let s = Session(profile:try profile()) { sent.append($0) }; s.personalSong = { history.append($0) }; try ready(s)
        try s.startInOrder(10909); XCTAssertEqual(Wire.u32(sent.last!,0),4200); try s.receive(queue([])); XCTAssertEqual(Wire.u32(sent.last!,0),4000)
        try s.receive(Wire.frame(4000,Wire.integer(2))); XCTAssertTrue(history.isEmpty); XCTAssertEqual(s.state,.play)
        try s.receive(playing(914)); XCTAssertTrue(history.isEmpty)
        try s.receive(playing(10909)); try s.receive(playing(10909)); XCTAssertEqual(history,[10909]); XCTAssertEqual(s.state,.ready)
    }
    func testReserveAndOtherPhoneHistoryIsolation() throws {
        var history: [Int] = []; let s = Session(profile:try profile()) { _ in }; s.personalSong = { history.append($0) }; try ready(s)
        try s.reserve(10909); try s.receive(Wire.frame(4000,Wire.integer(2))); XCTAssertEqual(s.state,.queue); XCTAssertTrue(history.isEmpty)
        try s.receive(queue([10909])); try s.receive(playing(914)); XCTAssertTrue(history.isEmpty)
        try s.receive(playing(10909)); try s.receive(playing(10909)); XCTAssertEqual(history,[10909])
        try s.receive(playing(0)); try s.receive(playing(10909)); XCTAssertEqual(history,[10909])
    }
    func testThirdQueuedSongConsumedThenOriginalRelativeOrder() throws {
        var sent: [[UInt8]] = [], history: [Int] = []; let s = Session(profile:try profile()) { sent.append($0) }; s.personalSong = { history.append($0) }; try ready(s)
        try s.playQueued(3,2); try s.receive(queue([1,2,3,4,5])); XCTAssertEqual(Wire.u32(sent.last!,0),4210); XCTAssertEqual(Array(sent.last!.suffix(8)),[5,3,0,0,0,3,2,0])
        try s.receive(Wire.frame(4210,Wire.integer(100),type:9)); try s.receive(queue([3,1,2,4,5])); XCTAssertEqual(Array(sent.last!.suffix(4)),Wire.integer(12))
        try s.receive(Wire.stop()); XCTAssertEqual(Wire.u32(sent.last!,0),4200); try s.receive(queue([3,1,2,4,5])); XCTAssertEqual(Array(sent.last!.suffix(4)),Wire.integer(11))
        try s.receive(playing(3)); XCTAssertEqual(history,[3]); try s.receive(queue([1,2,4,5])); XCTAssertEqual(s.state,.ready)
        XCTAssertFalse(sent.contains { Wire.u32($0,0) == 4000 })
    }
    func testSearchStartUsesExistingHeadNotSelectedSearch() throws {
        var history: [Int] = []; let s = Session(profile:try profile()) { _ in }; s.personalSong = { history.append($0) }; try ready(s)
        try s.startInOrder(99); try s.receive(queue([11,22])); try s.receive(Wire.stop()); try s.receive(queue([11,22])); try s.receive(playing(11)); try s.receive(queue([22])); XCTAssertEqual(history,[11])
    }
    func testChangedQueueStopsMutationIncludingOpaqueDuplicateEntries() throws {
        var sent: [[UInt8]] = []; let s = Session(profile:try profile()) { sent.append($0) }; try ready(s)
        try s.receive(queue([10909,10909],tag:1)); try s.cancelQueued(10909,1); let count = sent.count
        try s.receive(queue([10909,10909],tag:2)); XCTAssertEqual(sent.count,count); XCTAssertEqual(s.state,.ready)
    }
    func testCancelOneReservationDoesNotStopPlaying() throws {
        var sent: [[UInt8]] = [], last: [Int] = []; let s = Session(profile:try profile()) { sent.append($0) }; s.queueChanged = { if $2 { last = $0 } }; try ready(s)
        try s.receive(queue([1,2,3])); try s.cancelQueued(2,1); try s.receive(queue([1,2,3])); XCTAssertEqual(Array(sent.last!.suffix(8)),[3,2,0,0,0,2,1,0])
        try s.receive(Wire.frame(4210,Wire.integer(100),type:9)); try s.receive(queue([1,3])); XCTAssertEqual(last,[1,3]); XCTAssertEqual(s.state,.ready)
        XCTAssertFalse(sent.contains { [4000,4100].contains(Wire.u32($0,0)) })
    }
    func testTimeoutNoReplayAndNoFalseHistory() throws {
        var now: TimeInterval = 0, sent: [[UInt8]] = [], history: [Int] = []; let s = Session(profile:try profile(),clock:{ now }) { sent.append($0) }; s.personalSong = { history.append($0) }; try ready(s)
        try s.reserve(10909); let count = sent.count; now = 11; s.tick(); XCTAssertEqual(s.state,.ready); XCTAssertEqual(sent.count,count)
        try s.receive(playing(10909)); XCTAssertTrue(history.isEmpty); now = 72; s.tick(); XCTAssertEqual(s.state,.closed)
    }
    func testMalformedQueueCannotBecomeEmptyStart() throws {
        var sent: [[UInt8]] = []; let s = Session(profile:try profile()) { sent.append($0) }; try ready(s); try s.startInOrder(10909)
        try s.receive(Wire.frame(4200,[1,0])); XCTAssertEqual(s.state,.ready); XCTAssertFalse(sent.contains { Wire.u32($0,0) == 4000 })
    }
    func testHeartbeatDoesNotResetCommandDeadline() throws {
        var now: TimeInterval = 0, sent: [[UInt8]] = []; let s = Session(profile:try profile(),clock:{ now }) { sent.append($0) }; try ready(s); try s.reserve(1)
        now = 9; try s.receive(Wire.frame(1000)); XCTAssertEqual(sent.last!,try profile().packet(Wire.heartbeat())); now = 11; s.tick(); XCTAssertEqual(s.state,.ready)
    }
    func testRoomLinksCannotInjectNetworkOrCommands() {
        XCTAssertEqual(Rooms.parseLink(URL(string:"https://cyberkjh36.github.io/neutinamu-song-search/p2-room.html?room=8")!),"8")
        XCTAssertEqual(Rooms.parseLink(URL(string:"neutinamu-p2://connect?room=1")!),"1")
        for url in ["neutinamu-p2://connect?room=8&host=192.168.0.1","neutinamu-p2://connect?room=8&room=1","neutinamu-p2://connect?room=4","https://evil.example/p2-room.html?room=8","neutinamu-p2://connect?room=1#play"] { XCTAssertNil(Rooms.parseLink(URL(string:url)!)) }
        for ip in ["127.0.0.1","8.8.8.8","169.254.1.1","192.168.0.256","10.1.1.-1","host.local"] { XCTAssertFalse(Rooms.privateIPv4(ip)) }
        for ip in ["192.168.49.1","10.0.0.1","172.31.0.1"] { XCTAssertTrue(Rooms.privateIPv4(ip)) }
    }
}

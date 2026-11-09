import Foundation

enum P2Error: Error, LocalizedError {
    case invalid(String)
    var errorDescription: String? { if case let .invalid(message) = self { return message }; return nil }
}

struct Frame {
    let code: UInt32
    let control: [UInt8]
    let body: [UInt8]
    var type: UInt8 { control[7] }
    var scalar: UInt32? { body.count == 4 ? Wire.u32(body, 0) : nil }
    var bytes: [UInt8] { Wire.integer(code) + control + Wire.integer(UInt32(body.count)) + body }
}

enum Wire {
    static let maxBody = 1_048_576
    static func u32(_ b: [UInt8], _ offset: Int) -> UInt32 {
        (0..<4).reduce(UInt32(0)) { $0 | UInt32(b[offset + $1]) << ($1 * 8) }
    }
    static func integer(_ value: UInt32) -> [UInt8] { (0..<4).map { UInt8(truncatingIfNeeded: value >> ($0 * 8)) } }
    static func validSong(_ n: Int) -> Bool { (1...99_999_999).contains(n) }
    static func frame(_ code: UInt32, _ body: [UInt8] = [], version: UInt8 = 1, type: UInt8 = 1, flag: UInt8 = 0) -> Frame {
        Frame(code: code, control: [version,0,0,0,0,2,flag,type], body: body)
    }
    static func info() -> Frame { frame(3100, type: 0) }
    static func heartbeat() -> Frame { frame(1000, integer(100), type: 9, flag: 1) }
    static func queue() -> Frame { frame(4200, type: 0) }
    static func stop() -> Frame { frame(4100, integer(12)) }
    static func next() -> Frame { frame(4100, integer(11)) }
    static func song(_ n: Int, reserve: Bool) throws -> Frame {
        guard validSong(n) else { throw P2Error.invalid("곡번호를 확인해 주세요.") }
        return frame(4000, integer(reserve ? 1100 : 1200) + integer(UInt32(n)) + [0], version: 2)
    }
    static func edit(_ songs: Snapshot, index: Int, remove: Bool) throws -> Frame {
        guard songs.entries.indices.contains(index), songs.entries.count <= 255, remove || index > 0 else { throw P2Error.invalid("예약 위치를 확인해 주세요.") }
        return frame(4210, [UInt8(songs.entries.count)] + integer(UInt32(songs.songs[index])) + [remove ? 2 : 3, UInt8(index), 0])
    }
    static func playing(_ f: Frame) throws -> Int {
        guard f.code == 4300, f.type == 1, f.body.count == 5 else { throw P2Error.invalid("재생 응답 형식 오류") }
        let n = Int(u32(f.body, 0))
        guard n <= 99_999_999 else { throw P2Error.invalid("재생 곡번호 오류") }
        return n
    }
}

struct Snapshot: Equatable {
    let entries: [[UInt8]]
    var songs: [Int] { entries.map { Int(Wire.u32($0, 0)) } }
    init(_ frame: Frame) throws {
        let offset = frame.code == 4200 ? 0 : frame.code == 4220 ? 7 : -1
        guard offset >= 0, frame.type == 1, frame.body.count > offset else { throw P2Error.invalid("예약 응답 형식 오류") }
        let count = Int(frame.body[offset])
        guard frame.body.count == offset + 1 + count * 9 else { throw P2Error.invalid("예약 응답 길이 오류") }
        let parsed = (0..<count).map { Array(frame.body[(offset + 1 + $0 * 9)..<(offset + 10 + $0 * 9)]) }
        guard parsed.allSatisfy({ Wire.validSong(Int(Wire.u32($0, 0))) }) else { throw P2Error.invalid("예약 곡번호 오류") }
        entries = parsed
    }
    private init(entries: [[UInt8]]) { self.entries = entries }
    func movedToFront(_ index: Int) -> Snapshot { var e = entries; e.insert(e.remove(at: index), at: 0); return Snapshot(entries: e) }
    func without(_ index: Int) -> Snapshot { var e = entries; e.remove(at: index); return Snapshot(entries: e) }
}

struct FrameDecoder {
    private var buffer: [UInt8] = []
    mutating func feed(_ input: [UInt8]) throws -> [Frame] {
        guard buffer.count + input.count <= Wire.maxBody + 16 + 8192 else { throw P2Error.invalid("수신 용량 초과") }
        buffer += input
        var offset = 0, frames: [Frame] = []
        while buffer.count - offset >= 16 {
            let length = Int(Wire.u32(buffer, offset + 12))
            guard length <= Wire.maxBody else { throw P2Error.invalid("수신 길이 오류") }
            guard buffer.count - offset >= 16 + length else { break }
            frames.append(Frame(code: Wire.u32(buffer, offset), control: Array(buffer[(offset + 4)..<(offset + 12)]), body: Array(buffer[(offset + 16)..<(offset + 16 + length)])))
            offset += 16 + length
        }
        buffer.removeFirst(offset)
        return frames
    }
    func finish() throws { guard buffer.isEmpty else { throw P2Error.invalid("수신 중 연결이 끊겼습니다.") } }
}

struct GuestProfile {
    let serial: String
    let clientID: String
    var password: UInt32 = 0
    init(deviceName: String, clientID: String, password: UInt32 = 0) throws {
        guard deviceName.range(of: "^TJ_P2_P[0-9]{10}_[0-9]+_B$", options: .regularExpression) != nil,
              clientID.range(of: "^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$", options: .regularExpression) != nil,
              let first = UInt8(clientID.prefix(2), radix: 16), first & 3 == 2,
              clientID.uppercased() != "02:00:00:00:00:00" else { throw P2Error.invalid("방 연결 설정 오류") }
        self.serial = String(deviceName.split(separator: "_")[2]); self.clientID = clientID.uppercased(); self.password = password
    }
    func registration() -> Frame {
        var b = [UInt8](repeating: 0, count: 47)
        b.replaceSubrange(0..<4, with: Array("TJAA".utf8))
        b.replaceSubrange(12..<22, with: Array("0000000000".utf8))
        b.replaceSubrange(27..<44, with: Array(clientID.utf8))
        return Wire.frame(3000, b)
    }
    func packet(_ frame: Frame) -> [UInt8] { var bytes = frame.bytes; bytes.replaceSubrange(5..<9, with: Wire.integer(password)); return bytes }
    func matches(_ info: [UInt8]) -> Bool {
        guard info.count >= 20, info.prefix(3).allSatisfy({ (65...90).contains($0) || (48...57).contains($0) }) else { return false }
        let wanted = Array(serial.utf8)
        return Array(info[3..<(3 + wanted.count)]) == wanted && info[(3 + wanted.count)..<20].allSatisfy { $0 == 0 }
    }
}

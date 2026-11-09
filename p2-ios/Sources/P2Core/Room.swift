import Foundation

enum Rooms {
    static let numbers = ["1","2","3","5","6","7","8"]
    static func parseLink(_ url: URL) -> String? {
        guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false), c.user == nil, c.password == nil, c.port == nil, c.fragment == nil else { return nil }
        let custom = c.scheme == "neutinamu-p2" && c.host == "connect" && (c.path.isEmpty || c.path == "/")
        let web = c.scheme == "https" && c.host == "cyberkjh36.github.io" && c.path == "/neutinamu-song-search/p2-room.html"
        guard custom || web, let items = c.queryItems, items.count == 1, items[0].name == "room", let room = items[0].value, numbers.contains(room) else { return nil }
        return room
    }
    static func privateIPv4(_ value: String) -> Bool {
        let p = value.split(separator: ".", omittingEmptySubsequences: false)
        guard p.count == 4, p.allSatisfy({ !$0.isEmpty && $0.count <= 3 && $0.allSatisfy({ $0.isASCII && $0.isNumber }) && (Int($0) ?? 256) <= 255 }) else { return false }
        let v = p.map { Int($0)! }
        return v[0] == 10 || (v[0] == 192 && v[1] == 168) || (v[0] == 172 && (16...31).contains(v[1]))
    }
}

struct RoomConnection: Codable {
    let room: String
    let host: String
    let ssid: String
    let wifiPassword: String
    var protocolPassword: UInt32 = 0
    func validate() throws {
        guard Rooms.numbers.contains(room), Rooms.privateIPv4(host), ssid.utf8.count <= 32,
              ssid.isEmpty ? wifiPassword.isEmpty : (wifiPassword.isEmpty || (8...63).contains(wifiPassword.utf8.count)) else { throw P2Error.invalid("방 번호, P2의 내부 IP, Wi-Fi 정보를 확인해 주세요.") }
    }
}

struct PersonalSong: Codable, Equatable {
    let number: Int
    let lastPlayed: Int64
}

/// Private on-device history, excluded from iCloud backups. Catalog metadata is resolved in the UI.
final class PersonalSongsStore {
    let file: URL
    init(file: URL) { self.file = file }
    func read() throws -> [PersonalSong] {
        guard FileManager.default.fileExists(atPath:file.path) else { return [] }
        let size = (try file.resourceValues(forKeys:[.fileSizeKey])).fileSize ?? 0
        guard size <= 524_288 else { throw P2Error.invalid("내 애창곡 파일을 확인하지 못했습니다.") }
        let songs = try JSONDecoder().decode([PersonalSong].self,from:Data(contentsOf:file))
        guard songs.count <= 5000, songs.allSatisfy({ Wire.validSong($0.number) && $0.lastPlayed > 0 }), Set(songs.map(\.number)).count == songs.count else { throw P2Error.invalid("내 애창곡 파일 형식 오류") }
        return songs
    }
    func record(_ number: Int, at time: Int64) throws {
        guard Wire.validSong(number), time > 0 else { throw P2Error.invalid("잘못된 재생 기록") }
        var records = try read().filter { $0.number != number }
        records.insert(PersonalSong(number:number,lastPlayed:time),at:0)
        try write(Array(records.prefix(5000)))
    }
    func remove(_ number: Int) throws { try write(try read().filter { $0.number != number }) }
    private func write(_ songs: [PersonalSong]) throws {
        var directory = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        var noBackup = URLResourceValues(); noBackup.isExcludedFromBackup = true
        try directory.setResourceValues(noBackup)
        #if os(iOS)
        try JSONEncoder().encode(songs).write(to:file,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
        #else
        try JSONEncoder().encode(songs).write(to:file,options:.atomic)
        #endif
        var target = file; try target.setResourceValues(noBackup)
    }
}

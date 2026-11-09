import XCTest
@testable import P2Core

final class PersonalSongsTests: XCTestCase {
    var directory: URL!
    override func setUpWithError() throws { directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString); try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true) }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at:directory) }
    func testPersistsAcrossRestartDeduplicatesAndKeepsNewestFirst() throws {
        let file = directory.appendingPathComponent("phone-one/history.json"), store = PersonalSongsStore(file:directory.appendingPathComponent("phone-one/history.json"))
        try store.record(10909,at:1); try store.record(914,at:2); try store.record(10909,at:3)
        XCTAssertEqual(try PersonalSongsStore(file:file).read(),[PersonalSong(number:10909,lastPlayed:3),PersonalSong(number:914,lastPlayed:2)])
        XCTAssertEqual(try file.resourceValues(forKeys:[.isExcludedFromBackupKey]).isExcludedFromBackup,true)
    }
    func testDifferentPhoneAndLocalDeletionIsolation() throws {
        let a = PersonalSongsStore(file:directory.appendingPathComponent("a/history.json")), b = PersonalSongsStore(file:directory.appendingPathComponent("b/history.json"))
        try a.record(1,at:1); try b.record(2,at:2); try a.remove(1); XCTAssertEqual(try a.read(),[]); XCTAssertEqual(try b.read().map(\.number),[2])
    }
    func testCorruptionPreservedInsteadOfSilentlyOverwritten() throws {
        let file = directory.appendingPathComponent("history.json"), bytes = Data("not valid json".utf8); try bytes.write(to:file)
        let s = PersonalSongsStore(file:file); XCTAssertThrowsError(try s.record(1,at:1)); XCTAssertEqual(try Data(contentsOf:file),bytes)
    }
    func testInvalidAndOversizedHistoryRejected() throws {
        let file = directory.appendingPathComponent("history.json"), s = PersonalSongsStore(file:directory.appendingPathComponent("history.json"))
        XCTAssertThrowsError(try s.record(0,at:1)); XCTAssertThrowsError(try s.record(1,at:0)); try Data(repeating:0,count:524_289).write(to:file); XCTAssertThrowsError(try s.read())
    }
}

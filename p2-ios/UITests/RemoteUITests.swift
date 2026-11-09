import XCTest

final class RemoteUITests: XCTestCase {
    @MainActor func testOfflineSearchFavoritesAndConnectionGuard() throws {
        let app = XCUIApplication(); app.launch()
        let mine = app.buttons["내 애창곡 열기"]
        XCTAssertTrue(mine.waitForExistence(timeout:60),app.debugDescription)
        mine.tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format:"label CONTAINS %@","아직 저장된 곡이 없습니다")).firstMatch.waitForExistence(timeout:30),app.debugDescription)
        attach("my-favorites",app)
        let close = app.buttons.matching(NSPredicate(format:"label CONTAINS %@","닫기")).firstMatch
        XCTAssertTrue(close.exists); close.tap()
        let query = app.searchFields.firstMatch
        if !query.isHittable { app.swipeUp() }
        XCTAssertTrue(query.waitForExistence(timeout:10)); query.tap(); query.typeText("10909\n")
        let number = app.staticTexts["10909"].firstMatch
        XCTAssertTrue(number.waitForExistence(timeout:30),app.debugDescription)
        attach("song-search",app)
        app.swipeDown(); app.swipeDown(); app.swipeDown()
        let connect = app.buttons["P2 연결"]
        XCTAssertTrue(connect.waitForExistence(timeout:10),app.debugDescription); connect.tap()
        XCTAssertTrue(app.alerts["내 방 선택"].waitForExistence(timeout:10)); app.alerts.buttons["8번방"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format:"label CONTAINS %@","아이폰 연결 설정이 아직 없습니다")).firstMatch.waitForExistence(timeout:10),app.debugDescription)
        XCTAssertFalse(app.staticTexts.containing(NSPredicate(format:"label CONTAINS %@","8번방 연결됨")).firstMatch.exists)
        attach("connection-requires-setup",app)
    }
    @MainActor private func attach(_ name: String, _ app: XCUIApplication) { let a = XCTAttachment(screenshot:app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a) }
}

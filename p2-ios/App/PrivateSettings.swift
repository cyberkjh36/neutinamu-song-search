import Foundation
import Security

enum PrivateSettings {
    private static let service = "kr.neutinamu.p2.ios.private"
    static func read(_ key: String) throws -> Data? {
        let query: [String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:key,kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]
        var result: CFTypeRef?; let status = SecItemCopyMatching(query as CFDictionary,&result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw P2Error.invalid("저장된 연결 설정을 읽지 못했습니다.") }; return data
    }
    static func save(_ key: String, _ data: Data) throws {
        let query: [String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:key]
        let values: [String:Any] = [kSecValueData as String:data,kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary,values as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(values) { _,n in n } as CFDictionary,nil) }
        guard status == errSecSuccess else { throw P2Error.invalid("연결 설정을 안전하게 저장하지 못했습니다.") }
    }
    static func clientID() throws -> String {
        if let data = try read("clientID"), let value = String(data:data,encoding:.utf8) { return value }
        var bytes = [UInt8](repeating:0,count:6)
        guard SecRandomCopyBytes(kSecRandomDefault,bytes.count,&bytes) == errSecSuccess else { throw P2Error.invalid("앱 연결 식별값을 만들지 못했습니다.") }
        bytes[0] = (bytes[0] & 0xfc) | 2
        if bytes == [2,0,0,0,0,0] { bytes[5] = 1 }
        let value = bytes.map { String(format:"%02X",$0) }.joined(separator:":")
        try save("clientID",Data(value.utf8)); return value
    }
    static func room(_ room: String) throws -> RoomConnection? {
        guard let data = try read("room-" + room) else { return nil }
        let c = try JSONDecoder().decode(RoomConnection.self,from:data); try c.validate()
        guard c.room == room else { throw P2Error.invalid("저장된 방 설정 오류") }; return c
    }
    static func saveRoom(_ c: RoomConnection) throws { try c.validate(); try save("room-" + c.room,JSONEncoder().encode(c)) }
}

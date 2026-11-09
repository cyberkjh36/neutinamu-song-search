# 느티나무노래방 전용 리모컨 — iPhone 개발본

Android 0.11.15를 기준으로 만든 **iOS 16 이상용 네이티브 개발 프로젝트**입니다. 손님용 설치본이나 실물 P2에서 검증된 완성 배포판이 아닙니다. Android 앱, 기존 설치 QR, 방 QR, 공개 GitHub Pages는 변경하지 않습니다.

## 옮긴 기능

- 기존 곡 데이터와 화면을 그대로 번들에 포함: 제목·가수·곡번호·한글 초성 검색, 큰 곡번호, 30~40대/50~60대/트로트 애창곡.
- 아이폰 기본 키보드 및 Apple 음성 인식. 마이크·음성 인식 권한을 요청하며, 음성 인식은 인터넷/Apple 서비스를 사용할 수 있습니다.
- 실행, 예약, 정지, 다음곡, 예약곡 목록, 선택 예약곡 실행, 한 항목 예약 취소.
- 실행은 실제 반주기 예약 순서를 우선합니다. 중간 예약곡을 선택하면 순서 변경과 재생/남은 목록 응답을 차례로 검증합니다. 명령 타임아웃 시 실행·예약 명령을 자동 재전송하지 않습니다.
- 내 애창곡: 이 연결에서 요청한 곡의 실제 재생 응답을 확인한 경우에만 기록합니다. 최근 부른 순서, 재예약, 내 목록에서만 지우기를 제공합니다.
- 현재 폰 전용 원자적 저장, iCloud 백업 제외. 앱 삭제/데이터 삭제 시 내 애창곡을 잃을 수 있습니다. 기록은 GitHub에 보내지 않습니다.
- 방 번호 선택과 앱 안에서 기존 방 QR 읽기. QR은 등록된 방만 선택하며 주소·암호·곡 실행 명령을 주입할 수 없습니다.
- CSV 가져오기/내보내기, 연결 설정·권한 안내, `made by cyberkjh`.

## 아직 해결되지 않은 현장 조건

Android판의 **Wi-Fi Direct 탐색 + WPS 연결을 iPhone으로 그대로 옮기지 않았습니다.** Apple의 공개 API는 Android의 WifiP2pManager와 호환되는 API가 아닙니다. iOS 26의 Wi-Fi Aware 역시 기존 P2의 Wi-Fi Direct 호환성을 입증하지 않습니다.

이 개발본은 일반 Wi-Fi에 연결한 뒤 TCP/7070으로 통신하는 경로만 구현합니다. 아래 두 가지가 실제 P2에서 확인되어야 작동을 보장할 수 있습니다.

1. 아이폰이 P2의 무선망에 일반 Wi-Fi 단말로 접속할 수 있거나, P2 제어 포트가 동일 LAN에서 접근 가능해야 합니다. 단순히 매장 인터넷 공유기에 연결했다는 사실만으로 이 조건을 충족하지 않습니다.
2. 그 경로에서 P2가 게스트 등록을 승인하고 해당 방 식별정보를 반환해야 합니다. 안드로이드에서 승인된 앱 전용 익명 식별 방식의 iOS 경로 호환성은 아직 실물 검증 전입니다.

현재 방 자료에는 반주기 식별값만 있고, 아이폰 접속에 필요한 SSID/접속 암호/IP가 없습니다. IP를 추측하거나 다른 폰의 주소를 복제하지 않습니다. `직원용 연결 설정`에서 확인된 정보만 넣습니다. 연결 정보는 이 아이폰의 Keychain에 저장합니다. SSID를 비우면 아이폰에서 이미 연결한 Wi-Fi를 사용합니다. SSID가 있으면 시스템의 Wi-Fi 참여 확인을 요청합니다. 승인 창은 자동으로 우회하지 않습니다.

검증이 끝날 때까지 연결 설정이 없는 방은 실행을 막고 안내합니다. PC 중계·별도 동글 경로로 바꾸지 않았습니다. P2가 일반 Wi-Fi 접속을 지원하지 않는 경우 이 프로젝트만으로 동일한 직접 연결 기능을 완성할 수 없습니다. 그 경우 별도 연결 방식에 대한 결정이 필요합니다.

앱이 백그라운드로 가면 iOS 제한을 존중하여 연결을 닫고, 복귀 시 이전에 승인된 방으로 연결을 한 번 확인합니다. 노래 실행·예약 명령은 복귀 때 다시 보내지 않습니다. 앱을 닫은 동안 재생된 예약곡의 개인 기록을 소급 복원하지 않습니다.

## 설치·배포가 아직 안 되는 이유

CI는 iPhone용 앱을 **서명 없이 컴파일**하고 iOS 시뮬레이터에서 화면을 검증합니다. 이 `.app`은 아이폰에 설치할 수 있는 IPA가 아닙니다. APK를 IPA로 이름만 바꾸는 작업도 하지 않습니다.

TestFlight/App Store 배포에는 소유자의 Apple Developer Program 계정, 앱 식별자, 서명 설정, 필요한 심사 절차가 필요합니다. 현재 이 프로젝트에는 Apple 팀/인증서/프로비저닝 프로필이 제공되지 않았습니다. 개발자 계정 연회비는 Apple 공식 기준 미화 99달러이며 지역에 따라 현지 통화가 적용될 수 있습니다.

기본 카메라로 기존 HTTPS 방 QR을 찍어 곧바로 앱을 여는 Universal Links도 Apple 팀 ID와 실제 앱 서명이 정해진 뒤 `apple-app-site-association` 및 Associated Domains를 구성해야 합니다. 현재는 앱 안의 QR 스캐너와 `neutinamu-p2://connect?room=8` 같은 등록된 커스텀 링크를 처리합니다. 기존 공개 QR 페이지를 아이폰 설치 페이지로 바꾸지 않았습니다.

## Xcode에서 열기

macOS와 Xcode가 필요합니다. 프로젝트 생성에는 외부 패키지가 필요하지 않습니다.

```sh
python3 p2-ios/tools/prepare.py --rooms-from-apk /path/to/Neutinamu_P2_Room_QR_0.11.15.apk
python3 p2-ios/tools/project.py
open p2-ios/NeutinamuRemote.xcodeproj
```

`prepare.py`는 기존 배포 APK의 SHA-256을 확인하고 검증된 7개 방 매핑과 기존 UI/곡 데이터를 번들에 넣습니다. 원본 APK에 있는 비밀키/인증 자료는 가져오지 않습니다. 직접 새 빌드를 시험하려면 Xcode의 Signing & Capabilities에서 소유자 Team을 선택합니다. Hotspot Configuration 권한이 필요합니다. 앱 서명/배포 전 P2 실제 연결 시험부터 진행해야 합니다.

```sh
swift test --package-path p2-ios
```

프로토콜 테스트는 분할 TCP 프레임, 등록 거절, 방 식별 불일치, 실행 확인, 예약 및 개인 기록, 중간 예약곡 실행/소비, 다른 리모컨이 바꾼 목록, 예약 취소, 타임아웃, 하트비트, QR 입력 제한, 개인 기록 저장·손상·분리를 검증합니다. 시뮬레이터 검증은 실물 P2 통신·마이크·카메라·무선 접속 검증을 대신하지 않습니다.

## 확인 근거 (2026-11-09)

### 개발 검증 결과

| 확인 항목 | 결과 | 범위 |
|---|---|---|
| Swift 프로토콜·개인 기록 테스트 | 18개 통과, 실패 0개 | 모의 P2 응답, 파일 저장·복원·분리 |
| iPhone Release 빌드 | 컴파일 성공 | arm64, iOS 16 이상, 서명 없음 |
| iPhone 16 Pro / iOS 18.5 시뮬레이터 | 화면 테스트 1개 통과 | 내 애창곡 열기, 실제 10909번 검색 결과와 가수 확인, 연결 설정 오류 시 미연결 유지 |
| 기존 자료 보존 | 확인 | 원본 화면·곡 데이터 14개 파일 일치, 검증된 7개 방 포함 |
| 실제 iPhone ↔ P2 연결·곡 실행 | 미검증 | 현장 네트워크와 실제 장비 필요 |
| 실제 마이크·카메라·서명된 Keychain | 미검증 | 서명된 앱과 실물 아이폰 필요 |
| TestFlight / App Store 설치 | 미제공 | Apple 계정·서명·배포 설정 필요 |

[기록된 검증 결과](verification/2026-11-09-summary.json)와 [성공한 Xcode 빌드·테스트 실행](https://github.com/cyberkjh36/neutinamu-song-search/actions/runs/42618996173)에 근거합니다. 시뮬레이터의 서명 없는 빌드는 Keychain 사용 오류가 날 수 있으므로, 이번 화면 테스트는 그 경우에도 연결된 것으로 표시하거나 명령을 보내지 않는지 확인합니다. 실제 곡 재생 테스트를 통과했다는 뜻은 아닙니다.

현장 확인은 **아이폰에서 P2의 무선망에 일반 Wi-Fi로 접속할 수 있는지**부터 진행해야 합니다. 이 확인 전에는 개발자 계정을 결제하거나 손님용 QR을 교체할 필요가 없습니다.

- [Apple: iOS Wi-Fi API 개요](https://developer.apple.com/documentation/technotes/tn3111-ios-wifi-api-overview)
- [Apple: Wi-Fi 구성](https://developer.apple.com/documentation/networkextension/wi-fi-configuration)
- [Apple: NEHotspotConfigurationManager](https://developer.apple.com/documentation/networkextension/nehotspotconfigurationmanager)
- [Apple: 배포 방법](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases/)
- [Apple Developer Program](https://developer.apple.com/kr/programs/)
- [TJ매니저 공식 안내](https://www.tjmedia.com/support/app): 기존 업주용 앱의 iOS 미지원 명시. 다른 앱인 iOS 마이 티제이의 존재만으로 P2 구형 직접 연결을 지원한다고 판단하지 않습니다.
- 기존 `p2-direct/PROTOCOL.md`의 사용자 제공 클라이언트/현장 기록 기반 프로토콜 분석. 제조사 구현 코드나 원본 패킷을 이 프로젝트에 포함하지 않습니다.

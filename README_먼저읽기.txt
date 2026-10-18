느티나무 노래방 번호검색 QR 웹앱 v2 (2026-10-18)

[파일 설명]
index.html : 노래 제목 텍스트/음성 검색 화면
catalog-20261018.csv : 이전 APK 백업에서 가져온 76,435곡 목록 (기기별 수록 여부 미검증)
manifest.webmanifest, icon-*.png, sw.js : 홈 화면 추가 및 오프라인 텍스트 검색

[배포 방법 - PC GitHub Pages 예시]
1. GitHub에서 새 PUBLIC 저장소 (예: neutinamu-song-finder)를 만듭니다.
2. 이 폴더 내 7개 배포 파일을 저장소 최상위에 업로드합니다. README 파일은 선택 사항입니다.
3. Settings > Pages > Build and deployment > Deploy from a branch > main/(root) > Save.
4. 페이지 주소 (https://사용자명.github.io/저장소이름/)가 공개되면 스마트폰에서 직접 접속해 확인합니다.
5. QR코드는 배포 완료된 실제 주소로 새로 만드세요. (현재 제공하는 '기존 사이트 QR'은 이전에 게시된 ChatGPT Site로 연결합니다.)

[주의]
- HTML 파일을 휴대전화에서 단독으로 열면 CSV를 읽지 못할 수 있습니다. 반드시 HTTPS 웹서버에 올려 사용하세요.
- 웹앱은 별도 APK 설치가 아니므로 Android '출처를 알 수 없는 앱' 설치 경고가 뜨지 않습니다.
- 사이트를 처음 열 때 인터넷이 필요하며, 음성 인식은 브라우저와 OS 지원 및 인터넷 연결 여부에 따라 달라집니다.
- iPhone에서는 Safari를 권장합니다. 음성 검색이 지원되지 않으면 키보드의 받아쓰기로 곡명을 입력하세요.
- TJ미디어 공식 앱이 아니며, 모든 곡번호의 매장 P2 재생 가능 여부가 검증되지 않았습니다.
- 기존 APK 백업의 서명키/비밀번호는 웹 파일에 포함하지 않았습니다.

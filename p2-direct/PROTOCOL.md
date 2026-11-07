# P2 legacy interoperability findings

Evidence: one user-authorized P2 capture with confirmed song **10909** followed by Cancel, physical diagnostics from 0.2/0.3, and static inspection of the user's uploaded **마이 티제이 2.0.0 / versionCode 98** (`kr.tj.tjsmartplay_B`). The latter is a consumer client, distinct from the owner client used for the capture. Vendor APK/code and private captures are not included in this repository.

## Frame fields and corrections in 0.4

All integer fields below are little-endian. TCP boundaries are not message boundaries.

| Offset | Length | Finding |
| --- | --- | --- |
| 0 | 4 | Command |
| 4 | 1 | Packet version/variant; preserve the observed play variant 2 |
| 5 | 4 | Connection password; copied from the user's authorized connection profile |
| 9 | 1 | Client/protocol marker; preserve the imported value, do not force the consumer client's value |
| 10 | 1 | Request/response-related flag; preserve command-specific values |
| 11 | 1 | Body type: 1 data, 3 error, 9 message |
| 12 | 4 | Body length |
| 16 | variable | Body |

Static inspection locators: frame encoder `jc.c`, registration encoder `mc.i`, legacy socket parser `ic.d$b`, registration callback `kr.tj.tjsmartplay_B.utility.manager.o`. These names refer to this APK version only. Original interoperability implementation was written in this repository; decompiled implementation is not distributed.

- Command 3000 registration body has fixed-width UTF-8 fields: 2-byte application prefix, 10-byte marker, 15-byte phone/account field, 20-byte **current phone Wi-Fi Direct interface MAC**. The observed `TJAA` prefix is the beginning of the first two fields, not an opaque authentication token.
- Official `WifiP2pManagerService` obtains the current P2P interface hardware address on Android 10. The trial previously replayed an address from an earlier capture. 0.4 replaces that field from the actual connected socket's local interface; it refuses missing/placeholder addresses and does not spoof or silently reuse old ones.
- A 3000 data reply of one byte is a user colour/slot identifier. **Nonzero is not automatically failure.** 0.4 accepts this data shape, then still requires the device identity to match before controls are enabled. Error/message body types cannot satisfy that step.
- Subsequent requests now preserve the connection password and protocol marker. The previous hardcoded zero password would not match profiles with a nonzero password.
- `3003` is processed through the error-body path in the inspected client. Its detailed meaning and remedy were **not established**. Do not label it duplicate login, valid login, or success.

| Command | Body observed in user capture | Treatment |
| --- | --- | --- |
| 3000 out | 47 bytes | Rebuilt for current local interface; no private values logged |
| 3000 in | one-byte data | Assigned identifier, followed by identity check |
| 3100 | request empty / response 66 bytes | Compare existing imported device identity |
| 1000 | empty request / u32 100 reply | Keepalive |
| 4000 | u32 1200, u32 song number, byte 0 | Observed start command |
| 4000 in | u32 2 | Request response, not proof of playback |
| 4300 in | u32 song number, byte 0 | Matching notification used for playback-state confirmation |
| 4100 | u32 12 | Cancel / corresponding reply |
| 4220 | 26 bytes | Ignored; full semantics not established |
| 3200 / TCP 7071 | catalog transfer | Not requested by trial |

## Independent radio setup added in 0.4

The inspected legacy client discovers peers using Android Wi-Fi Direct, filters the karaoke WPS category, and calls connect with PBC and group-owner intent 0. NFC supplies initial configuration; it does not carry song-control commands.

0.4 adds user-selected peer discovery and connection with public Android APIs. It checks the selected peer is the current remote group owner, uses the current owner IP and exact group interface (avoiding overlapping ordinary Wi-Fi subnets), reads the current local interface address, and only then performs registration/identity verification. It does not remove existing groups, pick arbitrary peers automatically, emulate NFC, or bypass the P2's connection approval. Whether this physical P2 accepts discovery/PBC without a new NFC tag is **unverified**. An existing valid private profile remains necessary. Changing the P2's connection password may invalidate that profile.

Scan, join and authentication are separate stages. Callback generations and deadlines prevent stale success after cancellation/destruction/timeout. The legacy existing-group path remains available. Diagnostics now retain fixed reason codes such as A02 without raw exception messages or addresses.

## Actual hardware evidence before 0.4

- 0.2: TCP connected; command 3000/body 47 sent; response 3000/body 4/value **3003**; our trial closed the socket. No song-start command was sent.
- After user force-stopped TJ Manager, 0.2 reported no network route (`N10`).
- 0.3 at 20:17 KST: our P2P client remained registered; group matched after visiting Settings; TCP connected; registration sent; no complete response recorded for about 10 seconds; our session closed at its deadline. A later query reported no group. This does not prove which side caused the radio group loss.
- Software tests use synthetic identities and simulated sockets. They do **not** establish successful playback on the user's physical P2 or compatibility with iPhone/new Android MAC restrictions.


## Physical evidence and persistence update (0.5)

On 2026-11-06 (Asia/Seoul), the user confirmed that trial 0.4 actually started and cancelled song 10909 on their P2. The available shared diagnostic excerpt shows a 4100 data reply with value 12, STATE_READY, and incoming/outgoing 1000 traffic at roughly nine-second intervals through 371313 ms. The start command is not present in that excerpt; physical playback is the user's report. This does not establish NFC-free fresh association, multiple phones or long-duration reliability.

0.5 preserves Wire, Session and the Wi-Fi Direct protocol unchanged. The imported template is serialized in a bounded, versioned format and encrypted locally with AES-GCM/Android Keystore. Restoring a profile does not connect or send playback commands; `forConnection` still replaces the old phone address only with the current interface address. The template and key are not backed up or uploaded. Changed passwords/identity still require a new authorized import. Encryption failure is reported and never falls back to a plaintext file.

Diagnostic 1000 frames are aggregated into RX/TX counters and last-seen elapsed times, leaving the last 48 non-heartbeat events intact during idle time. Original payloads, song query text, addresses, registration identity and exception details remain excluded.


## Search and control UI (0.6)

No changes to Wire, Session, CaptureProfile, ProfileStore, or Wi-Fi backends. The Android application ID and release signing key remain the same as 0.5, preserving app-private encrypted data on an in-place update. The status banner uses live protocol state, not profile presence, to show connection readiness.

Song search runs on a separate cancellable executor with a generation check for late UI results. Paging exposes all catalog matches, exact song numbers rank ahead of title matches, and title/artist tokens may appear in either order. A direct number edit refreshes the selected title or explicitly reports an unknown title. Selecting a search result and clearing a search do not send playback commands. Connection setup and diagnostics remain reachable in the collapsible setup panel.


## 0.10.0 reservation and queue

Interoperability facts below were checked against the user-provided Android client. This is an independently implemented subset, not copied client source. Reservation has not yet been verified on physical P2 hardware in this release.

- Normal reserve uses command 4000, version 2, a 9-byte body: LE u32 key 1100, LE u32 song number, zero option count. Start remains key 1200. Priority reservation (1110) is not exposed.
- Queue request is command 4200, no body, same header kind as the existing device-info request. Connection context is applied by the existing profile packet writer.
- Data response 4200 is one unsigned count byte followed by exactly count * 9 bytes. Each entry starts with an LE u32 song number, then a one-byte field and four-byte short code. The latter fields are not used as titles or commands.
- Update 4220 has seven bytes of metadata before the same count/list layout. Only a validated, identified live session may publish it.
- 4000 data scalar 2 or message scalar 100 triggers a read-only queue request after a reservation. It never implies that playback began. The UI shows only the returned list and never appends optimistically.
- Malformed counts, truncated/trailing data, invalid song numbers, and non-data responses do not become an empty or partial successful list. Queue failures leave the session available for explicit retry. Reservation timeouts never replay the mutation.
- Queue responses cannot complete a pending play/cancel operation. Cancel may interrupt a queue read. Disconnect/room changes clear the displayed list.

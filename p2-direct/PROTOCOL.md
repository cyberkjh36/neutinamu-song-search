# Single-capture experimental P2 protocol

Evidence: one authorized local capture, user-confirmed song **10909** followed by **Cancel**. No public packet dump, phone number, MAC, device ID or connection password is included.

Frame: little-endian u32 command at 0; eight **opaque** bytes at 4; little-endian u32 body length at 12; body at 16. TCP message boundaries are not packet boundaries. This is an observation, not a vendor specification.

| Command | Observed body | Interpretation |
| --- | --- | --- |
| 3000 outbound | 47 private bytes, starts `TJAA` | initial registration; imported in memory only |
| 3000 inbound | `00` | observed initial reply, only this form accepted by trial |
| 3100 outbound | empty | device information request |
| 3100 inbound | 66 bytes in capture | first 14 bytes used as private device identity; remaining fields unknown |
| 1000 inbound | empty | periodic keepalive request |
| 1000 outbound | u32 100 | observed keepalive reply |
| 4000 outbound | u32 1200, u32 10909, u8 0 | user-confirmed song start action |
| 4000 inbound | u32 2 | observed response, not assumed general success |
| 4300 inbound | u32 10909, u8 0 | correlates with playing song; second song still needed |
| 4100 outbound/inbound | u32 12 | user-confirmed cancel action / corresponding response |
| 4220 inbound | 26 bytes | meaning unconfirmed; ignored |
| 3200 TCP7071 | catalog database transfer | observed but not requested by trial |

The exact non-private play/cancel/keepalive frames are regression fixtures. Opaque header fields are deliberately not assigned guessed semantic names. Reusing their observed values is **experimental**, especially for repeated commands or another device/session. Registration import is also experimental and not proof of a valid independent login implementation.

No automatic reconnect or command replay. A play acknowledgment cannot enable a second play until a matching song notification or explicit unknown-outcome timeout. A cancel can interrupt a pending play. The device identity must match the selected private capture before controls are enabled.

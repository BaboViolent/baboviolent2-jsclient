# BaboViolent WebSocket binary contract

The Rust server and browser client use explicit little-endian, fixed-width binary
layouts. This contract is independent of C/C++ compiler ABI. Existing reserved
bytes remain zero for stable vectors and future extension; native source defines
gameplay meaning, not implicit struct serialization.

`WIRE_CONTRACT.json` is mirrored byte-for-byte in both repositories and checked
by the browser integration suite. It is the machine-readable compatibility gate.

| Packet struct | Size | Fields (byte offset) |
|---|---:|---|
| `net_clsv_svcl_player_info` | 122 | playerID 0, playerIP 1, playerName 17, username 49, password 70, macAddr 102 |
| `net_clsv_spawn_request` | 19 | playerID 0, weaponID 1, meleeID 2, skin 3, red 10, green 13, blue 16 |
| `net_svcl_player_spawn` | 26 | playerID 0, weaponID 1, meleeID 2, padding 3, position 4, skin 10, red 17, green 20, blue 23 |
| `net_clsv_svcl_player_coord_frame` | 28 | playerID 0, padding 1–3, frameID 4, position 8, vel 14, padding 17, mousePos 18, babonetID 24 |
| `player_change_name` | 33 | playerID 0, UTF-8 name 1–31, NUL/reserved through 32 |
| `player_update_skin` | 17 | playerID 0, skin 1–7, red 8, green 11, blue 14 |

Golden vectors for these layouts live in `test/playerWireLayout.test.js` and the
Rust server's protocol-vector tests. IDs carried in signed-byte fields must be
decoded as two's complement (notably world/environment attacker `0xff == -1`).

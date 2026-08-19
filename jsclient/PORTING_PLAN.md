# BaboViolent 2 — JavaScript Client Port Plan

Goal: a **1:1 functional port** of the BaboViolent 2 C++ client (`src/Game/`*,
`src/Engine/*`) to JavaScript running in a browser (WebGL2 + WebAudio), reusing
the **original, unmodified assets** in `Content/main/`.

This document is the working contract for any agent continuing the port. Read it
fully before writing code. Every phase lists the exact C++ source of truth so the
port stays faithful instead of "inspired by".

---

## 0. Ground rules

1. **The C++ source is the spec.** When behaviour is ambiguous, open the file
  referenced in the phase table and port the arithmetic literally — including
   magic constants, the order of operations, and the quirks (BV2 collision is
   axis-sequential and slightly wrong; keep it wrong, it defines the game feel).
2. **Never fork the assets.** `Content/main/` is served read-only at `/content/`.
  No re-encoding TGA → PNG, no re-baking maps. Decoders live in JS.
3. **No build step, no bundler, no npm dependencies.** Plain ES modules served
  directly. `node server.js` must be the only thing needed to run.
4. **Match the coordinate system:** X right, Y "up" on the map plane, **Z is up
  in the world**. Tiles are 1×1 world units. Players sit at `z = 0.25` with
   collision radius `0.25`.
5. **Units and scale factors on the wire are part of the protocol** — positions
  are `short` at ×100, velocities `short` at ×10, shoot rays `short` at ×10.
   See `src/Game/netPacket.h`.
6. Keep modules small and mirroring the C++ file layout (`game/`, `render/`,
  `net/`, `assets/`) so a reviewer can diff a JS file against its C++ origin.

---



## 0b. Verified gotchas (learned the hard way — trust these)

1. `FileIO::getInt()` **reads a 16-bit** `short`**, not an int32.** Only
  `getLong`/`getULong` are 32-bit (`src/Zeven/FileIO.cpp:114`). Every `getInt()`
   in `Map.cpp` — theme, weather, map size, spawn counts, game-type ids — is two
   bytes. Reading them as int32 makes every map fail. `BinaryReader` mirrors the
   C++ names and widths deliberately.
2. **Babos are 3D spheres, not sprites.** `Player::render` draws
  `drawSphere(0.25f, 16, 16)` textured with `tex_skin`, and rolls it: the
   orientation matrix is rotated by `PI * |movement|` about `cross(movement, Z)`
   each frame, then re-orthonormalised (`PlayerUpdate.cpp:348`).
3. **Skin TGAs are colour *masks*, not finished art.** `Player::regenTex`
  (`Player.cpp:750`) rebuilds a 64×32 texture per babo:
   `final = (redDecal*r + greenDecal*g + blueDecal*b) / (r+g+b)`. Team colours
   override the player's own decals in every game type except DM.
4. `currentCF.angle` **is in DEGREES, measured from +Y**, negative when aiming
  right: `angle = acos(dir.y) * TO_DEGREE; if (dir.x > 0) angle = -angle`.
5. **Only three theme textures exist on disk** (`tex_floor`, `tex_floor_dirt`,
  `tex_wall_center`). `Map::reloadTheme` also asks for `tex_wall_bottom/up/top/  both`, but those files were never shipped, so the loader returns 0 and every
   wall band ends up drawn with `tex_wall_center`.
6. Map author strings contain the engine's colour escape bytes (`\x1`..`\x6`);
  strip or interpret them, don't assume clean ASCII.
7. **The camera is pure top-down.** `Map::setCameraPos` sets
  `camDest = lookAt + (0,0,7)` and `GameRender.cpp:120` looks at
   `(camPos.x, camPos.y, 0)` - no tilt, no Y offset. Use +Y as the up vector.
8. **DKO chunks have no length field** - just a 2-byte id. An unhandled id
  desynchronises the entire stream, so `dko.js` throws rather than skipping.
9. **DKO material lists are stored last-first**: `CdkoModel` fills
  `materialArray[nbMat - i - 1]`, so `MAT_ID` lookups break if you append in
   read order.
10. `babo.tga` **carries no font metrics.** `CFont::loadTGAFile` finds glyphs by
  scanning the alpha channel in 64px rows from ASCII 33. Its index
    `(512 - (j+curY) - 1)` combines with OpenGL's bottom-up `glGetTexImage` to
    net out as **plain top-down rows** - flipping again produces garbled text.
11. Weapon muzzles are DKO **dummies** named `flash1..n` (brass ejection:
  `eject1..n`), in model space; multiply by the `.005` model scale, rotate by
    the player angle, then add the player position (`Weapon::shoot`).

---



## 1. Reference map: C++ file → JS module


| C++ source                                                                  | JS module                                                    | Status                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| `src/Zeven/FileIO.cpp` binary getters                                       | `public/src/core/binaryReader.js`                            | done                                                          |
| TGA loading (`dktCreateTextureFromFile`)                                    | `public/src/assets/tga.js`                                   | done                                                          |
| `src/Game/Map.cpp` (constructor, `.bvm` parse)                              | `public/src/game/bvm.js`                                     | done, verified on all 81 shipped maps                         |
| `src/Game/Map.h` themes/weather enums, `COLLISION_EPSILON`, `BOUNCE_FACTOR` | `public/src/game/constants.js`                               | done                                                          |
| `src/Source/GameVar.cpp` weapon table + `sv_*` damage vars                  | `public/src/game/constants.js`                               | partial (stats only)                                          |
| `src/Game/MapRender.cpp` `performCollision` / `collisionClip`               | `public/src/game/collision.js`                               | done                                                          |
| `src/Game/Map.cpp` `regenCell` / `buildWalls` / `buildGround`               | `public/src/render/mapMesh.js`                               | done (ground + walls)                                         |
| `src/Game/Player.cpp` `regenTex` (skin recolour)                            | `public/src/game/skin.js`                                    | done                                                          |
| `src/Game/Player.cpp` babo sphere + roll matrix                             | `public/src/render/sphere.js`, `public/src/core/mat3.js`     | done                                                          |
| `src/Game/GameRender.cpp` `Game::render`                                    | `public/src/render/renderer.js`                              | partial                                                       |
| `src/Game/PlayerUpdate.cpp` `controlIt` + physics                           | `public/src/game/player.js`                                  | done (local movement)                                         |
| `src/Game/Game.cpp` `Game::update`                                          | `public/src/game/game.js`                                    | done                                                          |
| `src/Game/Game.h` `Douille`                                                 | `public/src/game/brass.js`                                   | done                                                          |
| `src/Game/Game.h` `FloorMark`                                               | `public/src/game/decals.js`                                  | done                                                          |
| `src/Engine/dko` model format (`.DKO`)                                      | `public/src/assets/dko.js`                                   | done, verified on all 26 shipped models                       |
| DKO -> GPU batches, material textures                                       | `public/src/render/model.js`, `modelRenderer.js`             | done                                                          |
| `src/Game/Map.cpp` `rayTest` / `rayTileTest`                                | `public/src/game/raycast.js`                                 | done                                                          |
| `src/Game/Weapon.cpp`, `src/Game/Game.cpp` `Game::shoot`                    | `public/src/game/weapon.js`                                  | done (local resolution, see phase 4)                          |
| `src/Game/GameProjectile.cpp`                                               | `public/src/game/projectile.js`                              | rocket / grenade / molotov                                    |
| `dkpCreateParticleEx*` particle system                                      | `public/src/render/particles.js`                             | approximated                                                  |
| `dks*` 3D sound                                                             | `public/src/audio/audio.js`                                  | done (FMOD inverse rolloff)                                   |
| `src/Engine/Zeven/dkf/CFont.cpp`                                            | `public/src/ui/font.js`                                      | done                                                          |
| `src/Game/CStatus.cpp`, HUD/minimap                                         | `public/src/ui/hud.js`                                       | health, weapon, minimap                                       |
| `src/Game/netPacket.h`                                                      | `public/src/net/protocol.js`                                 | ids declared, encode/decode TBD                               |
| `src/Game/Client.cpp` / `ClientRecv.cpp`                                    | `public/src/net/client.js`                                   | **partial** (WebSocket transport + handshake)                 |
| `src/Game/Server*.cpp`, `ServerRecv.cpp`, `ServerCTF.cpp`                   | `server/` (Rust crate)                                       | **partial** — WS lobby + spawn/coords; hitscan/CTF TBD        |
| `src/Engine/Babonet/*`                                                      | —                                                            | **abandoned for web** — no TCP/UDP bridge                     |
| `src/Menu2/*`                                                               | `public/index.html`, `public/src/main.js`, `public/src/ui/*` | **partial** — canvas HUD done; Menu2 shell stub only (see §8) |
| `src/Game/GameSpawn.cpp` spawn selection                                    | `public/src/game/spawn.js`                                   | done (farthest-enemy on `dmSpawns`)                           |
| `src/Game/ServerCTF.cpp`                                                    | `public/src/game/ctf.js`                                     | done (local sandbox CTF)                                      |
| `src/Game/MapRender.cpp` flag pods                                          | `public/src/render/renderer.js` `renderFlags()`              | done                                                          |


---



## 2. Phases



### Phase 1 — Assets, map, walk around (DONE)

Deliverable: load a real `.bvm`, render the themed tilemap in WebGL2, walk a babo
around with BV2's exact physics and collision.

- [x] Zero-dependency static server exposing `Content/` at `/content/` and a
  ```
  `/api/maps` listing.
  ```
- [x] `BinaryReader` — little-endian `getInt/getULong/getFloat/getUByte/
  ```
  getVector3f/getByteArray`, matching `FileIO`.
  ```
- [x] TGA decoder: types 2 (uncompressed BGR/BGRA) and 10 (RLE), 8/24/32 bpp,
  ```
  origin-bit handling. Everything in `Content/main/textures` is TGA.
  ```
- [x] `.bvm` parser for **all four versions** — 10010, 10011, 20201, 20202.
  ```
  Byte layout is in §3 below.
  ```
- [x] Ground mesh with the per-vertex dirt splat blend (`splater[]` corner
  ```
  mapping documented in §3).
  ```
- [x] Wall mesh reproducing `Map::regenCell`: `tex_wall_bottom` /
  ```
  `tex_wall_both` for the first unit of height, `tex_wall_center` for the
  middle, `tex_wall_up` / `tex_wall_top` for the cap, with the per-face
  brightness constants `0.3 / 0.4 / 0.7 / 0.8` (N / E / S / W).
  ```
- [x] Local player: accel `12.5`, linear friction `4.0/s` on speed magnitude,
  ```
  `z = 0.25`, radius `0.25`, then `performCollision` + `collisionClip`.
  ```
- [x] Babo drawn as the real rolling, lit, skin-textured sphere plus the
  ```
  `BaboShadow.tga` quad.
  ```
- [x] Verified: all 81 shipped maps parse, spawn points land in bounds, theme
  ```
  and weather ids are in range.
  ```



### Phase 2 — Weapons, projectiles, effects (DONE)

Source: `src/Game/Weapon.cpp`, `src/Game/GameProjectile.cpp`,
`src/Source/GameVar.cpp` (lines ~278-336 build the weapon table).

- [x] Weapon table ported verbatim: fire delay, damage coefficient, spread
  ```
  (`impressision`), `nbShot`, recoil (`reculVel`), projectile type.
  ```
- [x] Hitscan via the ported `Map::rayTest` + `rayTileTest`, plus a segment/
  ```
  sphere test for babos (radius 0.25).
  ```
- [x] Projectiles: rocket (2.5x launch speed, exponential accel, capped at 10),
  ```
  grenade (5x + 5 up, 2s fuse, 0.65 bounce), molotov. Explosion radius 1.5
  visual / 3 damage, per `GameProjectile.cpp:664`.
  ```
- [x] `.DKO` loader + renderer; weapons and projectiles draw their real models.
- [x] Particles for muzzle smoke, impacts, blood and explosions.
- [x] Shotgun 6-shot reload, chain-gun overheat, photon charge-up, flamethrower
  ```
  flames, knives/nuke melee, shield.
  ```
- [x] Brass ejection (`Douille`) using the `eject1..n` dummies.
- [x] Decals: `ExplosionMark.tga` / blood splats stamped into the ground layer.
- [x] Particles are ground-plane quads (top-down camera; no billboard revisit needed).



### Phase 3 — Audio (BASIC) (DONE)

- [x] WebAudio wrapper with distance attenuation + stereo pan, weapon and
  ```
  explosion sounds, gesture-gated context.
  ```
- [x] FMOD inverse rolloff (`minDist = range`, `maxDist = 10000`) matching
  ```
  `dksPlay3DSound`.
  ```
- [x] Music (`Music.ogg` at volume 60) on map load; looping ambience
  ```
  (`rain2.wav`, `wind.wav`, `lava.wav`) from theme-derived weather.
  ```
- [x] Wall impacts play random `ric1..5` (GameSpawn.cpp:422); grenade bounce
  ```
  plays `GrenadeRebond.wav` (GameProjectile.cpp:636).
  ```



### Phase 4 — Multiplayer (Rust dedicated server + WebSocket client)

**Decision (2026-08):** Do **not** build a WebSocket↔TCP/UDP bridge to the legacy C++
dedicated server (`src/Game/Server*.cpp` + `src/Engine/Babonet/`). That path would
perpetuate BaboNet on the wire and require operating two server stacks forever.

Instead:

1. Implement a **new dedicated server in Rust** that ports authoritative game logic
  from the C++ server sources.
2. Browser clients connect over **WebSocket** (binary frames), not raw TCP/UDP.
3. The legacy C++ dedicated server remains in-tree for native-client reference only;
  it is **not** a deployment target for jsclient multiplayer.



#### Why Rust + WebSocket


| Requirement              | Approach                                                                  |
| ------------------------ | ------------------------------------------------------------------------- |
| Browser transport        | WebSocket only — no raw sockets                                           |
| Authoritative simulation | Port `Server.cpp`, `ServerRecv.cpp`, `ServerSend.cpp`, `ServerCTF.cpp`, … |
| Wire format              | Reuse `netPacket.h` **payloads** byte-for-byte inside WS binary frames    |
| Ops / scale              | Single binary, async I/O, fits Kubernetes + Istio                         |
| Dev ergonomics           | `cargo run` locally; same crate builds the container image                |


Native BaboNet (`baboNet.cpp`, UDP/TCP peers) is **not** reused. Packet *definitions*
and *game rules* in C++ remain the spec; transport is WebSocket.

#### Repository layout (planned)

```
server/                          # new Rust workspace member
  Cargo.toml
  src/
    main.rs                      # listen, accept WS, tick loop
    net/                         # frame codec, session state
    game/                        # ported Server* logic
    map/                         # .bvm load (share rules with jsclient/bvm.js)
jsclient/public/src/net/
  protocol.js                    # encode/decode netPacket bodies
  client.js                      # WebSocket connect, ping, reconnect
```

Static assets (`Content/`) continue to be served read-only for the browser. In
production this can be a separate static host, an object store, or eventually
embedded static routes in the Rust binary — **game traffic and asset traffic may
share port 8080 behind Istio path rules**.

#### Default port and local dev

- Rust dedicated server default listen: `8080` (WebSocket upgrade on a defined
path, e.g. `/ws` or `/game`).
- jsclient dev: `node server.js` may keep serving UI + `/content/` on the same or
a different port; `client.js` takes a configurable `ws://host:8080/...` URL.
- Local smoke test: run Rust server on 8080, point jsclient at `ws://localhost:8080/ws`.



#### Kubernetes + Istio (target deployment)

Traffic enters through an **Istio Gateway**; a **VirtualService** routes by URI:

```
Internet / cluster ingress
        │
        ▼
  Istio Gateway  (e.g. baboviolent.example.com:443)
        │
        ▼
  VirtualService
    /content/*  →  static asset Service (or CDN origin)
    /*          →  jsclient static Service (SPA)
    /ws         →  bv2-server Service :8080  (WebSocket, sticky sessions if needed)
        │
        ▼
  Deployment: bv2-server (Rust dedicated server pod)
    containerPort: 8080
    probes: HTTP GET /health (add alongside WS listener)
    env: MAP_DIR, SV_* game vars, RUST_LOG
```

Notes for whoever implements the chart/manifests:

- Terminate TLS at the Gateway; use `ws` → `wss` upstream or TLS passthrough per
mesh policy.
- Set **WebSocket-friendly timeouts** on Gateway/VirtualService (idle timeout,
connection duration) — game sessions are long-lived.
- One pod = one game instance initially; horizontal scale = multiple independent
server instances (each with its own match), not one shared world.
- Optional: `DestinationRule` with `connectionPool` / outlier detection for the
game Service.



#### Client connect sequence (unchanged semantics, new transport)

Source: `ClientRecv.cpp`, `netPacket.h`. Frames are the same bytes as today; only
the envelope is WebSocket binary instead of BaboNet.

1. WebSocket connect → server sends `NET_SVCL_NEWPLAYER` (101), assigns `playerID`
2. client → `NET_CLSV_GAMEVERSION_ACCEPTED` (4) with password
3. server → `NET_SVCL_SERVER_INFO` (102): map name, game type, scores
4. map download if missing: `NET_CLSV_MAP_REQUEST` (209) / `NET_SVCL_MAP_CHUNK` (210)
5. client → `NET_CLSV_SPAWN_REQUEST` (2)
6. steady state: `NET_CLSV_SVCL_PLAYER_COORD_FRAME` (204) out at ping-derived rate,
  server pushes `105/108/110/112/114/…` as today

Remote players use `CoordFrame::interpolate` between `netCF0`/`netCF1` — port it
exactly or remote motion will look wrong.

#### Rust server implementation checklist

**Milestone A — wire + lobby**

- [x] WebSocket listener on `:8080`, binary message codec
- [x] Session table (max 32 players), connect/disconnect
- [x] Handshake packets 101, 4, 102
- [x] Map list + chunk download (209/210) from on-disk `Content/main/maps/`
- [x] Health endpoint for K8s probes

**Milestone B — in-match simulation**

- [x] Tick loop (20 ms) — coord relay, ping, timer sync
- [x] Spawn, coord frames (204 in / relay out), ping/pong
- [x] Authoritative hitscan, `PLAYER_HIT`, death, DM/TDM team damage rules
- [x] Projectile spawn relay + explosion reports (`CLSV_REPORT_EXPLOSION` / 220)
- [x] Melee (knife radius)
- [x] Server-side rocket/grenade/molotov physics, authoritative explosions and burns
- [ ] Server-side pickups and remaining dropped-item entities

**Milestone C — ops**

- [x] Dockerfile (multi-stage `cargo build --release`)
- [ ] Helm chart or K8s manifests *(Istio/Gateway deferred)*
- [x] Config via env for map, password, game type

**Explicitly out of scope for v1**

- Interop with legacy TCP/UDP native clients on the same process
- BaboNet master listing protocol (browser browser can use a separate HTTP API later)
- UDP peer relay / `cPeer2Peer`



#### jsclient checklist (Phase 4 client side)

- [x] `packet.js` — encode/decode BaboNet frames + handshake helpers
- [x] `client.js` — WebSocket lifecycle, handshake, coord/spawn/team send
- [x] Wire `client.js` into main menu connect + console `connect`/`disconnect`
- [x] Local hitscan disabled when online; server `PLAYER_SHOOT`/`PLAYER_HIT` authoritative
- [x] Game Browser: `/api/servers` probes comma-separated `BV2_GAME_SERVERS`,
  omits offline entries, measures response time, and sorts live results
- [x] Host panel generates the full Rust launch environment/command; native
  process startup is explicitly host-side because browsers cannot spawn it



### Phase 5 — UI / menus / HUD (PARTIAL)

Canvas HUD and weapon feedback are largely done. The Menu2 boot shell, Profile,
Options, Credits, browser, and editor entry are now functional DOM ports.

- [x] Bitmap font renderer using `Content/main/fonts/babo.tga`, including the
  ```
  alpha-scan glyph metrics from `CFont::loadTGAFile`.
  ```
- [x] HUD: vertical health bar, reload bar, chaingun heat, shotgun shell counter,
  ```
  throwable icons, minimap, CTF win counts, kill feed.
  ```
- [x] Colour escape codes (`\x1`..`\x9`) and team `{`/`}` markers.
- [x] Scoreboard (Tab), chat (T/Y), console (```), sniper scope (mouse-distance
  ```
  zoom), damage flash, weapon reload sounds.
  ```
- [x] **Menu2 main menu** — Profile, Game Browser, Map Editor, Options,
  ```
  Credits, Quit, Resume Game (Phase 5b).
  ```
- [ ] DOM `#menu` Local tab is a **placeholder**, not native parity.



### Phase 5b — Menu2 / boot shell parity (IN PROGRESS)

Native source of truth: `src/Menu2/CMainTab.cpp`, `CMenuManager.cpp`, panel
classes below. The native client runs **loading → intro → tabbed main menu**
(`menuManager.root`, 800×600) before any map is played. That overlay persists
over idle, connected-client, and editor states.

#### Native boot sequence

```
main.cpp RunGraphicalClient()
  → load main/bv2.cfg (gameVar)
  → scene = new Scene()
       → LOADING splash (Scene.cpp ~52)
       → IntroScreen ~3s (IntroScreen.cpp) — any key skips
       → createMenu() (MenuSetup.cpp)
       → menuManager.root->visible = true, Menu.ogg
  → main loop: Scene::update/render; menuManager when root visible
```


| Piece                   | Path                                               |
| ----------------------- | -------------------------------------------------- |
| Main entry              | `src/Source/main.cpp`                              |
| Scene / net transitions | `src/Game/Scene.cpp`, `SceneNet.cpp`               |
| Tab bar + panels        | `src/Menu2/CMainTab.cpp`                           |
| Widget system           | `src/Menu2/CControl.*`, `CMenuManager.cpp`         |
| Console bridge          | `src/Source/Console.cpp`                           |
| In-game Esc menu        | `src/Game/Client.cpp`, `ClientRender.cpp` L715–777 |




#### Top tab bar (`CMainTab.cpp` L90–105)


| Tab                   | Panel        | C++ file              | Offline?                                         |
| --------------------- | ------------ | --------------------- | ------------------------------------------------ |
| **Profile** (default) | `CUserLogin` | `CUserLogin.cpp`      | Yes — name, skin 1–23, RGB decals, 3D preview    |
| **Game Browser**      | `CBrowser`   | `CBrowser.cpp`        | Partial — IP join offline; list needs master     |
| **Host**              | `CHost`      | `CHost.cpp`           | Partial — local listen + self-join               |
| **Map Editor**        | `CEditor`    | `CEditor.cpp`         | Yes — form → `edit` cmd                          |
| **Options**           | `COption`    | `COption.cpp`         | Yes — render/audio/keys; saves `bv2.cfg` on exit |
| **Credits**           | `CCredit`    | `CCredit.cpp`         | Yes — static text                                |
| **Quit**              | —            | `CMainTab.cpp` L250   | Yes                                              |
| **Resume Game**       | —            | `CMainTab.cpp` L79–80 | No* — *only when client connected; hides overlay |


**Dead in current native build (skip unless restoring):** News, Friends, online
login UI (fields never constructed), CSurvey, CProfile sub-tabs.

#### Checklist by panel

**Profile (**`CUserLogin.cpp`**)**

- [x] Name edit (31 chars), skin slider (1–23), RGB decal sliders ×3
- [x] Live babo preview + `Menu1Back.tga`

- Profile settings persist and feed spawn/player-info packets.

**Game Browser (**`CBrowser.cpp`**)**

- [x] Live list + Refresh (`/api/servers`)
- [x] IP + password, Join, measured ping sort, dbl-click join
- [x] Visible cancellable connecting/failure overlay (`ClientRender.cpp` L807–820)

**Host (**`CHost.cpp`**)**

- [x] Game name/password/type/map/bind/player/bot/win configuration generates
  a copyable **Rust dedicated server** launch command and documents process/API behavior

- jsclient Local tab ≈ offline explore subset only

**Map Editor (**`CEditor.cpp`**)**

- [ ] Author/name/size form → `edit` command (editor itself = Phase 6)

**Options (**`COption.cpp`**)**

- [x] Render scale, audio, and key binds persist in browser storage

**Credits (**`CCredit.cpp`**)**

- [x] Static credits + `Menu5Back.tga`

**Resume Game**

- [x] Main-menu button; hidden until a session is active
- [ ] Remove jsclient Esc “Resume” (non-native; native Esc closes on team/weapon pick)

**In-game Esc menu (**`Client.cpp` ****`clientRoot`**) — partial DOM port**

- [x] Header, blue/red team, weapon columns, selection highlight
- [ ] Auto team, spectator, **Disconnect**, main menu **without** dropping connection
- [ ] Server team/weapon requests (Phase 4)

**Menu2 infrastructure**

- [x] Tab shell at 800×600 and `Menu1Back.tga`…`Menu5Back.tga`
- [x] Skippable intro and menu music (`Music.ogg` fallback for legacy `Menu.ogg`)



#### Recommended order

1. Boot shell (intro + tab bar + panel switching)
2. Profile → Options → Credits (offline panels)
3. Host + local play path
4. Esc menu parity (spectator, disconnect, connected main-menu)
5. Browser manual IP join → master list (Phase 4)
6. Map Editor entry → Resume Game



### Phase 6 — Parity pass

- [ ] Side-by-side screenshots vs the native client on the same map/theme.
- [x] Verify every theme in `textures/themes/` loads (23 themes); automated
  coverage checks the three shipped textures for every theme.
- [x] Weather: fog params in `Map::reloadWeather` (`fogStart/fogEnd/fogColor`
  ```
  per weather id), rain/snow/lava particle systems (`src/Weather/`).
  ```
- [x] In-world browser editor mode (`src/Game/Editor*.cpp`): full renderer
  viewport, drag painting, pan/zoom, tile height and dirt, DM/team spawns,
  flags/objectives, profile authorship, and native 20202 `.bvm` export.
- [x] Camera smoothing: `Map::update` lerps `camPos` towards `camDest`
  ```
  (`Map.cpp:1266`); port together with any remaining sniper edge cases.
  ```
- [x] DKO animation interpolation for flags, shield, knives (`CdkoMesh`).

---



## 9. Audit — port vs original (2026-08)

Full pass over the JS client + Rust server against `src/`. Fixed items are done;
open items are ordered by gameplay impact.

### Spectator (DONE)

`PLAYER_TEAM_SPECTATOR` (-1) is a non-playing observer, not a team you spawn on.


| Rule           | Original                                                           | Port                                                                   |
| -------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Never spawns   | `PlayerUpdate.cpp:388` only blue/red request spawns                | server drops spawn requests from -1; client gates `requestOnlineSpawn` |
| No body drawn  | never `PLAYER_STATUS_ALIVE`, so never rendered                     | `enterSpectator()` forces dead; renderer already skips non-alive       |
| Free camera    | `Game.cpp:585` pans `camLookAt` at 10 u/s, no collision            | `Game.updateSpectator` + `renderer.cameraFocus`                        |
| Clamped to map | `Map.cpp:1211` clamps to `[5, sizeX-5] / [4, sizeY-4]`             | same                                                                   |
| Wheel height   | `Map.cpp:1242` `zoom` in `[-8, longestSide/2]`, cam at `14 + zoom` | same; `input.consumeWheel()` is now actually read                      |
| Join state     | `Player.cpp:112` new players start spectator                       | client enters spectator on connect, picks a team from the menu         |




### Also fixed

- **Team chat leaked to enemies.** The server rebroadcast every chat frame to
everyone. `ServerRecv.cpp:562` routes by `teamID`: `-2` = all, `-1` =
spectators, `0/1` = that team. Client now sends `-2` for global (it was
sending `-1`, which is spectator chat) and filters per `ClientRecv.cpp:381`.
- **Explosions damaged through walls.** `handle_explosion` had no line-of-sight
test; `Game.cpp:1618` requires `!map->rayTest(p1, p2, normal)`. It also
duplicated the death path, so blast kills skipped team scores and the
attacker's enum broadcast. Now routed through `apply_damage_from`.
- **CTF frags inflated the team score.** `Player.cpp:1469` only credits
`blueScore`/`redScore` outside CTF, where the score tracks captures.
- **Team switch skipped the respawn wait.** `Game.cpp:942` kills and sets
`timeToSpawn` only when the team actually changes; carried flags drop.



### Open — server authority (highest impact)

The server validates *who* shot but not *how*, so a modified client still has
room to cheat:

- [x] **Fire rate is enforced.** `ServerRecv.cpp:915-980` rejects shots inside
  ```
  `fireDelay + 0.05` (chain gun `0.04`) and burst-counts shotgun/sniper.
  Rust now owns the elapsed-fire clock and bounded burst counter.
  ```
- [x] **Muzzle is validated.** `Game.cpp:1465` ray-tests
  ```
  `position -> p1` before resolving, so you cannot originate a shot past a
  wall. Rust also rejects implausibly distant muzzle origins.
  ```
- [x] **Projectiles are simulated server-side.** `ServerRecv.cpp:1001` runs
  ```
  `spawnProjectile(..., true)`; Rust now owns IDs, motion, collision, fuses,
  explosions, flame fields, burn cadence, ammo, and projectile cooldowns.
  ```
- [x] **Spawn weapons are validated** (`ServerRecv.cpp:689` whitelists primaries).
- [x] **Shoot packet weapon is checked against the equipped weapon**, so the
  ```
  client cannot select a different damage table per shot.
  ```
- [x] Shield, knives, and nuke are server-owned with equipment checks, cooldowns,
  line-of-sight melee, shield reduction, and timed nuclear detonation.



### Open — behaviour divergences

- [x] **Sniper uses exactly two traces** in the browser/open-server contract.
  ```
  The camera-height third trace was `_PRO_`-only and is intentionally omitted;
  client and Rust burst authority now agree.
  ```
- [x] **Shotgun spread is authoritative and deterministic.** Clients send five
  ```
  base intents and Rust assigns the legacy `-10/-5/0/+5/+10` degree pellet
  rays by bounded burst index.
  ```
- [x] **CTF match lifecycle is server-owned.** Captures honor the configured
  ```
  win limit exactly once, broadcast the legacy winner state, then reset scores,
  players, projectiles, and flags after the original ten-second intermission.
  ```
- [x] **Server movement uses legacy collision authority** — Rust applies the
  ```
  Y-then-X `performCollision` bounce and `collisionClip`, clamps planar speed
  and elapsed displacement, and relays the corrected frame instead of trusting
  teleport or duplicate client samples.
  ```
- [x] **Flame thrower** uses a server-clamped 3-unit flame path with 0.5 hit radius
  ```
  and linear distance falloff, following the flame path in `Game.cpp:1476`.
  ```
- [x] `NET_SVCL_EXPLOSION` now includes the trailing `playerID` byte from
  ```
  `netPacket.h:257` (29 bytes), and the JS client resets the owner's rocket state.
  ```
- [x] Bots use the human five-second respawn delay and route fire attempts
  through the same server-owned weapon cooldown/burst authority.



### Verified correct (do not "fix")

- Wire player status is inverted vs the local explore constants, but
`main.js:80` maps it — alive=0/dead=1 per `Player.h:33`.
- `timeToSpawn` really is re-armed every frame while alive
(`PlayerUpdate.cpp:319`), not only at spawn.
- `sv_timeToSpawn` default is 5 (`GameVar.cpp:342`), and `Player.cpp:138` arms it
at construction, so waiting ~5s after picking a team on join is correct.

---



## 8. jsclient vs native — current menu/HUD snapshot (2026-08)

This section records what the **jsclient actually ships today** versus the native
client the user sees at launch. Update it when Menu2 work lands.

### What jsclient has


| Area                                                                          | Status                   | Files                                                     |
| ----------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| Canvas HUD (health, reload, heat, shells, minimap, chat, console, scoreboard) | Done                     | `ui/hud.js`, `ui/ui.js`                                   |
| Sniper scope + mouse-distance zoom                                            | Done                     | `game/game.js`, `ui/hud.js`                               |
| Menu2 browser/host/Profile/options shell                                      | Done                     | `index.html`, `ui/menu2.js`                               |
| DOM Esc menu (team, weapons, spectator, disconnect, Main menu)                | Done                     | `index.html`, `main.js`                                   |
| `/api/maps`                                                                   | Works                    | `server.js`                                               |
| `/api/servers`                                                                | Live configured probes   | `server.js`, `serverList.js`                              |
| Fixed spawns (`dmSpawns`, farthest-enemy)                                     | Done                     | `game/spawn.js`                                           |
| Local CTF (flags, capture, score HUD)                                         | Done                     | `game/ctf.js`, `render/renderer.js`                       |




### What jsclient is missing (native launch experience)


| Native screen                                        | Status    |
| ---------------------------------------------------- | --------- |
| Loading splash                                       | Done      |
| Intro / RndLabs logo                                 | Done      |
| Menu2 tab bar + browser-appropriate Quit             | Done      |
| Profile (name, skin, decals, preview)                | Done      |
| Host panel                                           | Done      |
| Map Editor entry                                     | Done      |
| Options                                              | Done      |
| Credits                                              | Done      |
| Resume Game (main menu, when connected)              | Done      |
| Game Browser (IP/password/live list)                 | Done      |
| Menu backgrounds (`Menu*.tga`), menu music           | Done      |
| Browser-local settings persistence                   | Done      |
| Esc menu: spectator, disconnect, connected main-menu | Done      |
| Spawn timer + “press shoot to respawn” HUD           | Missing   |
| Connecting overlay                                   | Missing   |




### Architecture note

Native uses **two menu roots**:

1. `menuManager.root` **/** `CMainTab` — full main menu (Profile … Credits). Visible
  after intro; also shown via “<- Main menu” while **staying connected**.
2. `Client::clientRoot` — in-game team/weapon picker (Esc). Never includes
  Profile/Host/Options tabs.

jsclient collapses these into `#menu` (boot) and `#ingameMenu` (Esc) with different
semantics — **Main menu disconnects play mode** instead of overlaying it.

### Multiplayer architecture (2026-08)

```
┌─────────────────┐     WebSocket (binary netPacket)      ┌──────────────────────┐
│  jsclient       │ ────────────────────────────────────► │  bv2-server (Rust)   │
│  WebGL + net/   │         :8080 /ws (local or K8s)      │  authoritative game  │
└────────┬────────┘                                       └──────────┬───────────┘
         │ GET /content/*, /* UI                                           │ reads
         ▼                                                                 ▼
   static host (node server.js, CDN, or Istio-routed Service)      Content/main/maps
```

- **No** BaboNet TCP/UDP bridge and **no** dependency on the C++ dedicated server binary.
- **Istio Gateway + VirtualService** terminate TLS and route `/ws` to the Rust Service;
UI and assets can share the same hostname on `/` and `/content/`.
- Legacy `src/Game/Server*.cpp` + `src/Engine/Babonet/` remain reference for porting
rules and packet layouts only.



### Console commands to wire (from `Console.cpp`)


| Command                      | Native effect                                      | jsclient                                                        |
| ---------------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| `host <map>`                 | `Scene::host()` — C++ listen server + local client | **Rust server** — start pod/process or connect to hosted WS URL |
| `connect <ip> <port> <pass>` | `Scene::join()` — BaboNet TCP                      | `connect` → WebSocket URL + password (Phase 4)                  |
| `edit <name> <w> <h>`        | `Scene::edit()`                                    | Not implemented                                                 |
| `disconnect`                 | `Scene::disconnect()` — show main menu             | Close WS, show main menu                                        |
| `addmap <map>`               | Queue map on running server                        | Rust server admin/rotation API (Phase 4)                        |
| `quit`                       | Exit app                                           | N/A in browser                                                  |


---



## 3. `.bvm` map format (verified against `src/Game/Map.cpp:228`)

All integers little-endian. `Vector3f` = 3 × float32.

```
u32 version            // 10010 | 10011 | 20201 | 20202   <- getULong, 32-bit

if version == 20202:
    char[25] authorName    // NUL-padded, truncate at 24
if version >= 20201:
    i16 theme              // THEME_* , 0..22  (see constants.js)
    i16 weather            // WEATHER_*, 0..5

i16 sizeX
i16 sizeY

for y in 0..sizeY-1:            // row-major, y outer
  for x in 0..sizeX-1:
    u8 data                     // bit7 = passable, bits0-6 = height (0..127)
    u8 dirt                     // vertex dirt value, /255 -> 0..1

if version == 10011 or 20201:
    Vector3f flagPod[2]
    Vector3f objective[2]
    i16 nb ; Vector3f[nb]   // dm spawns
    i16 nb ; Vector3f[nb]   // blue spawns
    i16 nb ; Vector3f[nb]   // red spawns

if version == 20202:
    i16 nb ; Vector3f[nb]   // dm spawns
    repeat GAME_TYPE_COUNT times:
        i16 gameTypeId
        case DM(0), TDM(1): nothing
        case CTF(2):  Vector3f flagPod[2]
        case SND(3):  Vector3f objective[2]
                      i16 nb ; Vector3f[nb]  // blue spawns
                      i16 nb ; Vector3f[nb]  // red spawns
```

Every count and size above is **16-bit**; only `version` and the `Vector3f`
components are 32 bits wide.

**Dirt /** `splater` **corner mapping** (derived from `Map::setTileDirt`, `Map.h:342`):
the byte read for tile `(x,y)` is the dirt value *at vertex* `(x,y)`. A cell's
four corners are therefore vertices `(x,y)`, `(x+1,y)`, `(x,y+1)`, `(x+1,y+1)` —
which is exactly `splater[1]`, `splater[2]`, `splater[0]`, `splater[3]`
respectively. The JS parser stores a `(sizeX+1)×(sizeY+1)` vertex grid instead of
per-cell arrays; it is equivalent and simpler.

If the file is missing/invalid, the C++ editor path synthesises a `sizeX×sizeY`
map with a solid border of `height = 3`. Mirror that for the editor later.

---



## 4. Physics constants (verified)


| Constant                                              | Value       | Source                  |
| ----------------------------------------------------- | ----------- | ----------------------- |
| Player accel                                          | `12.5` u/s² | `PlayerUpdate.cpp:476`  |
| Accel on ice (`sv_slideOnIce`, snow theme, dirt > .5) | `4.0`       | same                    |
| Friction (linear on speed magnitude)                  | `4.0` u/s   | `PlayerUpdate.cpp:~270` |
| Friction on ice                                       | `1.0` u/s   | same                    |
| Player Z                                              | `0.25`      | `PlayerUpdate.cpp:279`  |
| Player collision radius                               | `0.25`      | `Game.cpp:619`          |
| Minibot radius                                        | `0.15`      | `Game.cpp:548`          |
| `COLLISION_EPSILON`                                   | `0.05`      | `Map.h`                 |
| `BOUNCE_FACTOR`                                       | `0.45`      | `Map.h`                 |
| `MAX_PLAYER`                                          | `32`        | `Game.h`                |
| `MAP_VERSION`                                         | `20202`     | `Map.h`                 |


Collision is **two-stage and axis-sequential**: `performCollision(lastCF, CF, r)`
resolves Y against the 3 cells above/below then X against the 3 cells left/right
(bouncing with `BOUNCE_FACTOR`), then `collisionClip(CF, r)` push-clips out of any
cell the entity ended up inside. Port both; the order matters.

---



## 5. Assets inventory


| Path                                     | Format              | Notes                                                                                                         |
| ---------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Content/main/maps/*.bvm`                | binary, §3          |                                                                                                               |
| `Content/main/textures/**.tga`           | TGA 24/32, some RLE | `blood01..10`, `BaboShadow`, `Menu`, …                                                                        |
| `Content/main/textures/themes/<theme>/`  | TGA                 | Only `tex_floor`, `tex_floor_dirt`, `tex_wall_center` ship. Fall back to `themes/grass/` if a theme lacks one |
| `Content/main/skins/*.tga`               | TGA 64×32           | RGB channel *mask*, recoloured per babo — see gotcha 3                                                        |
| `Content/main/models/*.DKO`              | proprietary         | Phase 2                                                                                                       |
| `Content/main/sounds/*.wav`, `Music.ogg` | native              | Phase 3                                                                                                       |
| `Content/main/fonts/babo.tga`            | TGA bitmap font     | Phase 5                                                                                                       |


---



## 6. Running

**jsclient (static UI + assets)**

```sh
cd jsclient
node server.js          # http://localhost:8080 — UI + /content/
```

`server.js` serves `public/` at `/` and the repo's `Content/` at `/content/`.
No install step, no dependencies.

**Rust dedicated server (Phase 4 — not yet in tree)**

```sh
cd server
cargo run --release     # WebSocket game server on :8080 (default)
```

Point the browser client at `ws://localhost:8080/ws` (exact path TBD when the crate
lands). In Kubernetes, expose the same port on the `bv2-server` Service and route
it through Istio Gateway / VirtualService.

---



## 7. Open questions to resolve (do not guess — verify in C++)

1. Lightmap: `dko_mapLM` is an alternative map representation (3D model maps in
  `main/modelmaps_______/`). When present, collision switches to a sphere-vs-mesh
   test. Decide whether to support model maps at all.
2. Weapon behaviour is still resolved locally in explore/offline (`weapon.js`).
  When Phase 4 lands, connected clients send `NET_CLSV_PLAYER_SHOOT`; the **Rust
   server** validates and broadcasts `NET_SVCL_PLAYER_SHOOT` / `NET_SVCL_PLAYER_HIT`.
3. Menu2 port strategy: reimplement `CControl` in canvas, or DOM at fixed 800×600
  with native `Menu*.tga` backgrounds — decide before Phase 5b coding.
4. Browser `quit`: native Quit tab calls `dkwForceQuit()`; web client can only
  close the tab — document expected behaviour.
5. Rust server: confirm WebSocket subprotocol and path (`/ws` vs `/game`) before
  Istio VirtualService rules are written; document sticky-session needs if any.
6. Map format in Rust: duplicate `bvm.js` logic, generate via `wasm-bindgen` from
  shared code, or spec-only reimplementation — pick one before Milestone B.
7. ~~TCP/WebSocket bridge vs JS server~~ — **resolved:** Rust dedicated server +
  WebSocket; legacy BaboNet abandoned for web.

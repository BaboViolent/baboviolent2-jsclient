# BaboViolent 2 — JavaScript client

A browser port of the BaboViolent 2 client. It reads the original assets in
`../Content/main/` directly — original `.bvm` maps, original `.tga` textures and
skins. No conversion, no bundler, no dependencies.

```sh
node server.js      # then open http://localhost:8080
```

Controls: **WASD / arrows** move, mouse aims, **click** shoots, **1-0** switch
weapon, **M** next map. **Tab** scoreboard, **T/Y** chat, **`** console, **Esc** menu.
Sniper: scroll wheel zooms (scope overlay above height 8).

Working today: original `.bvm` maps and themes, `.tga` textures, recoloured babo
skins, `.DKO` weapon and projectile models, hitscan and projectile weapons with
BV2's own spread/recoil/bounce maths, particles, 3D audio, and HUD.

Networking: join via **Game Browser** (`127.0.0.1:8080`) or console
`connect 127.0.0.1 8080`.
Online combat uses the Rust server's authoritative hitscan; grenades report explosions to the server.
See `server/README.md`.

```sh
# Terminal 1 — game server
cd ../server && BV2_CONTENT_ROOT=../Content/main cargo run --release

# Terminal 2 — static client (different port while game server uses 8080)
cd jsclient && PORT=3000 node server.js
```

For a live browser list, configure one or more Rust server HTTP endpoints:

```sh
BV2_GAME_SERVERS=http://game-a:8080,http://game-b:8080 PORT=3000 node server.js
```

The Host tab generates a complete dedicated-server launch command. A browser
cannot spawn the native Rust process; run the generated command on the host,
expose its HTTP/WebSocket port, and list that endpoint with
`BV2_GAME_SERVERS`. `/api/servers` only returns servers whose live `/info`
probe succeeds, ordered by measured response time.

Run the dependency-free protocol tests with `npm test`.

See [PORTING_PLAN.md](PORTING_PLAN.md) for the phased 1:1 porting plan, the
mapping from each C++ source file to its JS module, and the verified format
gotchas future agents should not rediscover the hard way.

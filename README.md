# BaboViolent 2 Browser Client

Public WebGL browser client for BaboViolent 2. This repository includes the
runtime content required to load maps, models, textures, and sounds.

```sh
cd jsclient
npm test
npm start
```

Open `http://localhost:8080`. Tagged releases publish the web image and advance
the StandoutHost Argo CD deployment.

## Local CTF diagnostics

Start the dedicated server from its sibling checkout and redirect structured
Rust logs to a file:

```sh
cd ../babo-dedicated-server/server
: > /tmp/bv2-server.log
BV2_BIND=127.0.0.1:8081 BV2_CONTENT_ROOT=../Content/main \
  BV2_MAP=CTF-Alert BV2_GAME_TYPE=2 BV2_BOTS=12 \
  RUST_LOG=bv2_server=debug cargo run --release 2>&1 | tee -a /tmp/bv2-server.log
```

In another terminal, start the browser client with its localhost-only debug
collector:

```sh
cd jsclient
: > /tmp/bv2-jsclient.ndjson
PORT=8099 JSCLIENT_DEBUG_LOG=/tmp/bv2-jsclient.ndjson npm start
```

Open `http://localhost:8099/?debug=1`, enter `127.0.0.1:8081`, and join. The
NDJSON log correlates raw flag packets, revision acceptance, authoritative
state, carrier coordinates, and final render coordinates. Watch both streams:

```sh
tail -F /tmp/bv2-server.log /tmp/bv2-jsclient.ndjson
```

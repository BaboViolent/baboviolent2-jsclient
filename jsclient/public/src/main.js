import { AssetCache } from './assets/assetCache.js';
import { Renderer } from './render/renderer.js';
import { Input } from './input.js';
import { Game } from './game/game.js';
import { loadMap } from './game/bvm.js';
import { ClientSettings } from './ui/settings.js';
import { Menu2 } from './ui/menu2.js';
import { WorldMapEditor } from './ui/worldMapEditor.js';
import {
  WEAPONS, PRIMARY_WEAPON_IDS, MELEE_WEAPON_IDS,
  GAME_TYPE_NAMES, GAME_TYPE_DM, GAME_TYPE_TDM, GAME_TYPE_CTF, GAME_PLAYING,
  PLAYER_TEAM_BLUE, PLAYER_TEAM_RED, PLAYER_TEAM_SPECTATOR, PLAYER_TEAM_DISCONNECTED, CHAT_TEAM_ALL,
} from './game/constants.js';
import { expandCaretColors, normalizeBv2Text } from './ui/colorInput.js';
import { loadBitmapFont, renderBitmapText } from './ui/bitmapText.js';
import { Bv2Client, NET_PLAYER_STATUS_ALIVE, NET_PLAYER_STATUS_DEAD } from './net/client.js';
import { NET } from './net/protocol.js';
import { parsePlayerEnumState, parsePlayerSpawn, parseCoordFrame, parsePlayerShoot, parsePlayerHit, parseExplosion, parseChat, parseSyncTimer, parsePlayerPing, parsePlayerProjectile, parseProjectileCoordFrame, parseVoteRequest, parsePlayerChangeName, parsePlayerUpdateSkin, readFixedStr } from './net/packet.js';
import { FLAG_AT_POD, FLAG_DROPPED } from './game/ctf.js';
import { decalsForPlayer, normalizeDecals } from './game/skin.js';
import { WEAPON_FLAME_THROWER, WEAPON_GRENADE, SV_WIN_LIMIT, SV_TIME_TO_SPAWN, PLAYER_Z } from './game/constants.js';
import { Player } from './game/player.js';
import { PLAYER_STATUS_ALIVE, PLAYER_STATUS_DEAD } from './game/constants.js';
import { formatCountdown } from './ui/timeFormat.js';
import { browserIsMobileSpectator, MobileSpectatorControls } from './mobile.js';
import { formatHostPort, hostedJoinTargetToWsUrl } from './net/joinTarget.js';
import { DeferredPacketQueue } from './net/deferredPackets.js';

const canvas = document.getElementById('view');
const hud = document.getElementById('hud');
const ingameMenu = document.getElementById('ingameMenu');
const overlay = document.getElementById('overlay');
const textInput = document.getElementById('textInput');
const igGameTitle = document.getElementById('igGameTitle');
const igGameSubtitle = document.getElementById('igGameSubtitle');
const igMapInfoCanvas = document.getElementById('igMapInfoCanvas');
const igWeapons = document.getElementById('igWeapons');
const igMelee = document.getElementById('igMelee');
const igClientVersion = document.getElementById('igClientVersion');
const btnAutoTeam = document.getElementById('btnAutoTeam');
const btnDisconnect = document.getElementById('btnDisconnect');
const btnMainMenu = document.getElementById('btnMainMenu');
const worldEditorRoot = document.getElementById('worldEditor');
const mobileControlsRoot = document.getElementById('mobileSpectatorControls');
const sandboxMapPicker = document.getElementById('sandboxMapPicker');
const sandboxMapList = document.getElementById('sandboxMapList');
const sandboxEntry = new URLSearchParams(location.search).get('mode') === 'sandbox';
if (sandboxEntry) document.getElementById('loading').hidden = true;

fetch('/api/version')
  .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
  .then(({ version }) => { igClientVersion.textContent = `Client version: ${version || 'unknown'}`; })
  .catch(() => { igClientVersion.textContent = 'Client version: unknown'; });

const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
if (!gl) {
  hud.textContent = 'WebGL2 is required.';
  throw new Error('WebGL2 unavailable');
}

const assets = new AssetCache(gl);
const renderer = new Renderer(gl, assets);
const settings = new ClientSettings();
const input = new Input(canvas, settings.data.bindings);
const mobileSpectator = browserIsMobileSpectator();
const game = new Game(renderer, input);
game.musicEnabled = !sandboxEntry;
game.mobileSpectator = mobileSpectator;
window.bv2 = { game, renderer, assets, settings };
document.body.classList.toggle('mobile-spectator', mobileSpectator);
const mobileControls = new MobileSpectatorControls(mobileControlsRoot, input, {
  onChat: () => {
    if (!sessionActive || !game.isSpectating) return;
    game.ui.openChat(false);
    syncTextInput();
  },
  onScoreboard: (visible) => input.setMobileScoreboard(visible),
});

input.onFirstGesture(() => game.audio.resume());

// F1 normally opens browser help. While a vote is active, capture F1/F2 before
// the focused text input or browser can act on them and submit the vote instead.
window.addEventListener('keydown', (event) => {
  if (!game.ui.vote.active || game.ui.vote.voted || !['F1', 'F2'].includes(event.code)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!event.repeat) game.ui.castVote(event.code === 'F1');
}, { capture: true });

let menu2;
let worldEditor;
let mapNames = [];
let primaries = [];
let sessionActive = false;
/** @type {Bv2Client | null} */
let netClient = null;
let cancelPendingConnect = null;
let onlineAwaitingSpawn = false;
/** Packets sent after map-change are replayed only after the async map load. */
let mapLoadInFlight = null;
const deferredMapPackets = new DeferredPacketQueue();

function beginDeferredMapLoad(mapName) {
  deferredMapPackets.reset();
  const load = switchMap(mapName, { skipSpawn: true, preserveMatchState: true });
  mapLoadInFlight = load;
  void load.finally(() => {
    if (mapLoadInFlight !== load) return;
    mapLoadInFlight = null;
    const queued = deferredMapPackets.drain();
    for (const [queuedType, queuedPayload] of queued) handleNetPacket(queuedType, queuedPayload);
    updateIngameMenuLabels();
  });
  return load;
}
/** Team we asked for but the server has not echoed yet; enum packets must not undo it. */
let pendingTeamId = null;
/** Last server-confirmed team, retained while the local player is updated optimistically. */
let pendingPreviousTeamId = null;
/** Human-readable identity of the active online server. */
let connectedServerLabel = '';
/** @type {{ font: import('./ui/font.js').BitmapFont, atlas: HTMLCanvasElement } | null} */
let igBitmapFont = null;

function netStatusToLocal(status) {
  if (status === NET_PLAYER_STATUS_ALIVE) return PLAYER_STATUS_ALIVE;
  if (status === NET_PLAYER_STATUS_DEAD) return PLAYER_STATUS_DEAD;
  return PLAYER_STATUS_DEAD;
}

function bindLocalPlayerId(id) {
  game.thisPlayer.playerID = id;
  // thisPlayer starts at players[0]; moving to another slot must leave a placeholder behind
  for (let i = 0; i < game.players.length; i++) {
    if (game.players[i] === game.thisPlayer && i !== id) {
      game.players[i] = new Player(i);
    }
  }
  while (game.players.length <= id) {
    game.players.push(new Player(game.players.length));
  }
  game.players[id] = game.thisPlayer;
}

function getOrCreatePlayer(id) {
  if (id === game.thisPlayer.playerID) return game.thisPlayer;
  while (game.players.length <= id) {
    game.players.push(new Player(game.players.length));
  }
  if (game.players[id] === game.thisPlayer) {
    game.players[id] = new Player(id);
  }
  return game.players[id];
}

function resetScoreboardStats() {
  for (const p of game.players) {
    p.kills = 0;
    p.deaths = 0;
    p.score = 0;
    p.damage = 0;
    p.returns = 0;
    p.flagAttempts = 0;
  }
}

function normalizeSkinName(name) {
  const trimmed = (name ?? '').replace(/\0/g, '').trim();
  if (/^skin\d+$/i.test(trimmed)) return trimmed.toLowerCase();
  return 'skin10';
}

async function applyPlayerSkin(player, skin, decals) {
  player._skinGen = (player._skinGen ?? 0) + 1;
  const gen = player._skinGen;
  player.skin = normalizeSkinName(skin);
  if (decals) {
    const norm = normalizeDecals(decals);
    player.decals = {
      red: [...norm.red],
      green: [...norm.green],
      blue: [...norm.blue],
    };
  }
  const tint = decalsForPlayer(player, game.gameType);
  try {
    const tex = await game.renderer.loadSkin(player.skin, tint);
    if (player._skinGen !== gen) return;
    player.skinTexture = tex;
  } catch (err) {
    console.warn('skin load failed', player.skin, err);
    if (player._skinGen !== gen || player.skin === 'skin10') return;
    player.skin = 'skin10';
    try {
      const tex = await game.renderer.loadSkin('skin10', tint);
      if (player._skinGen === gen) player.skinTexture = tex;
    } catch {
      /* ignore */
    }
  }
}

function applyPlayerEnum(payload) {
  const st = parsePlayerEnumState(payload);
  const p = getOrCreatePlayer(st.playerID);
  const wasAlive = p.status === PLAYER_STATUS_ALIVE;
  const isMe = p === game.thisPlayer;
  const wasSpectating = isMe && game.isSpectating;
  p._netStateGen = (p._netStateGen ?? 0) + 1;
  const generation = p._netStateGen;
  p.name = st.name;
  if (!(isMe && pendingTeamId !== null)) {
    p.teamID = st.teamID >= 128 ? st.teamID - 256 : st.teamID;
  }
  p.status = netStatusToLocal(st.status);
      if (isMe && game.isSpectating && !wasSpectating) {
    game.enterSpectator();
    onlineAwaitingSpawn = false;
  }
  p.kills = st.kills;
  p.deaths = st.deaths;
  p.score = st.score;
  p.returns = st.returns;
  p.flagAttempts = st.flagAttempts;
  p.damage = st.damageDealt;
  if (st.life != null && Number.isFinite(st.life)) {
    p.life = Math.max(0, st.life);
  }
  if (st.weaponID != null) {
    p.weaponID = st.weaponID;
    void game.setWeapon(p, st.weaponID, generation);
  }
  void applyPlayerSkin(p, st.skin, st.decals);
  if (
    p.status === PLAYER_STATUS_DEAD
    && wasAlive
    && game.onlineMode
    && !game.isSpectating
    && game.roundState === GAME_PLAYING
  ) {
    game.onPlayerDeath(p, null, st.weaponID);
    if (isMe) {
      onlineAwaitingSpawn = true;
      showIngameMenu();
    }
  }
}

function applyPlayerSpawn(payload) {
  const sp = parsePlayerSpawn(payload);
  const p = getOrCreatePlayer(sp.playerID);
  p._netStateGen = (p._netStateGen ?? 0) + 1;
  const generation = p._netStateGen;
  p.weaponID = sp.weaponID;
  p.meleeWeaponID = sp.meleeID;
  p.pendingWeaponID = sp.weaponID;
  p.pendingMeleeWeaponID = sp.meleeID;
  p.spawnAt(sp.position);
  p.status = PLAYER_STATUS_ALIVE;
  p.life = 1;
  p.timeToSpawn = 0;
  p._deathHandled = false;
  void applyPlayerSkin(p, sp.skin, sp.decals);
  void game.setWeapon(p, sp.weaponID, generation);
  void game.setMeleeWeapon(p, sp.meleeID, generation);
  if (sp.playerID === game.thisPlayer.playerID) game.snapCameraToSpawn(sp.position);
  if (sp.playerID === game.thisPlayer.playerID && onlineAwaitingSpawn) {
    onlineAwaitingSpawn = false;
    resumeGame();
  }
}

function applyCoordFrame(payload) {
  const cf = parseCoordFrame(payload);
  const p = getOrCreatePlayer(cf.playerID);
  if (p === game.thisPlayer || p.status !== PLAYER_STATUS_ALIVE) return;
  p.queueNetworkFrame(cf, performance.now());
}

function readPayloadF32(payload, offset) {
  return new DataView(payload.buffer, payload.byteOffset + offset, 4).getFloat32(0, true);
}

function acceptFlagRevision(ctf, flagId, revision) {
  const previous = ctf.flagRevision?.[flagId] ?? null;
  if (revision == null) return previous == null;
  if (previous != null) {
    const delta = (revision - previous) >>> 0;
    if (delta !== 0 && delta >= 0x80000000) return false;
  }
  if (!ctf.flagRevision) ctf.flagRevision = [null, null];
  ctf.flagRevision[flagId] = revision;
  return true;
}

function applyFlagEnum(payload) {
  if (payload.length < 26) return;
  const ctf = game.ctf;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const revisions = payload.length >= 34
    ? [view.getUint32(26, true), view.getUint32(30, true)]
    : [null, null];
  if (acceptFlagRevision(ctf, 0, revisions[0])) {
    ctf.flagState[0] = payload[0] >= 128 ? payload[0] - 256 : payload[0];
    ctf.flagPos[0] = [readPayloadF32(payload, 2), readPayloadF32(payload, 6), readPayloadF32(payload, 10)];
  }
  if (acceptFlagRevision(ctf, 1, revisions[1])) {
    ctf.flagState[1] = payload[1] >= 128 ? payload[1] - 256 : payload[1];
    ctf.flagPos[1] = [readPayloadF32(payload, 14), readPayloadF32(payload, 18), readPayloadF32(payload, 22)];
  }
}

function applyChangeFlagState(payload) {
  if (payload.length < 3) return;
  const flagId = payload[0];
  const newState = payload[1] >= 128 ? payload[1] - 256 : payload[1];
  const playerId = payload[2];
  const action = payload.length >= 4 ? payload[3] : 0;
  if (flagId > 1) return;
  const ctf = game.ctf;
  const revision = payload.length >= 8
    ? new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(4, true)
    : null;
  if (!acceptFlagRevision(ctf, flagId, revision)) return;
  const oldState = ctf.flagState[flagId];
  const p = getOrCreatePlayer(playerId);
  const flagTeam = flagId === 0 ? PLAYER_TEAM_BLUE : PLAYER_TEAM_RED;

  // Actor team distinguishes a return from a capture even if the client did
  // not observe the preceding dropped-state packet.
  if (action !== 0 || oldState !== newState) {
    if (action === 2 || (action === 0 && newState === FLAG_AT_POD && p.teamID === flagTeam)) {
      p.returns = (p.returns ?? 0) + 1;
      game.ui.addEvent('\x03> ' + p.name + ' returned the ' + (flagId === 0 ? 'blue' : 'red') + ' flag');
      if (p.teamID === game.thisPlayer.teamID) void game.audio.play2D('return.wav', 255);
    } else if (action === 1 || (action === 0 && (oldState === FLAG_DROPPED || oldState === FLAG_AT_POD) && newState >= 0)) {
      p.flagAttempts = (p.flagAttempts ?? 0) + 1;
      game.ui.addEvent('\x03> ' + p.name + ' took the ' + (flagId === 0 ? 'blue' : 'red') + ' flag');
      void game.audio.play2D(p.teamID === game.thisPlayer.teamID ? 'ftook.wav' : 'etook.wav', 255);
    } else if (action === 3 || (action === 0 && newState === FLAG_AT_POD)) {
      if (flagId === 0) {
        game.ctf.redWin += 1;
        game.redScore = game.ctf.redWin;
        game.ui.addEvent('\x04' + p.name + ' \x08scores for the Red team!');
        void game.audio.play2D('cheerRedTeam.wav', 255);
      } else {
        game.ctf.blueWin += 1;
        game.blueScore = game.ctf.blueWin;
        game.ui.addEvent('\x01' + p.name + ' \x08scores for the Blue team!');
        void game.audio.play2D('cheerBlueTeam.wav', 255);
      }
      p.score = (p.score ?? 0) + 1;
      if (game.ctf.blueWin >= SV_WIN_LIMIT || game.ctf.redWin >= SV_WIN_LIMIT) {
        game.ui.addEvent('\x03Match over — press Esc for menu');
      }
    }
  }

  ctf.flagState[flagId] = newState;
  if (newState === FLAG_AT_POD && game.map?.flagPod) {
    ctf.flagPos[flagId] = [...game.map.flagPod[flagId]];
    ctf.flagPos[flagId][2] = 0.25;
  }
}

function applyDropFlag(payload) {
  if (payload.length < 13) return;
  const flagId = payload[0];
  if (flagId > 1) return;
  const revision = payload.length >= 17
    ? new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(13, true)
    : null;
  if (!acceptFlagRevision(game.ctf, flagId, revision)) return;
  const carrierId = game.ctf.flagState[flagId];
  if (carrierId >= 0) {
    const carrier = getOrCreatePlayer(carrierId);
    game.ui.addEvent('\x07' + carrier.name + ' \x08dropped the ' + (flagId === 0 ? 'blue' : 'red') + ' flag');
    // A carried flag is dropped only when its carrier dies, disconnects, or
    // changes team. The latter two paths already update local state, so use
    // the authoritative drop as a death fallback if a lethal-hit packet was
    // missed or failed to transition the local player.
    if (carrier === game.thisPlayer
      && carrier.status === PLAYER_STATUS_ALIVE
      && pendingTeamId === null) {
      game.onPlayerDeath(carrier, null, carrier.weaponID);
      onlineAwaitingSpawn = true;
      showIngameMenu();
    }
  }
  game.ctf.flagState[flagId] = FLAG_DROPPED;
  game.ctf.flagPos[flagId] = [
    readPayloadF32(payload, 1),
    readPayloadF32(payload, 5),
    readPayloadF32(payload, 9),
  ];
}

function applyFlameStick(payload) {
  if (payload.length < 5) return;
  const projectileId = new DataView(payload.buffer, payload.byteOffset, 4).getInt32(0, true);
  const playerId = payload[4] >= 128 ? payload[4] - 256 : payload[4];
  const flame = game.projectiles.find((p) => p.uniqueID === projectileId);
  if (!flame) return;
  flame.stickToPlayer = playerId;
  flame.movementLock = playerId >= 0;
  flame.stickFor = playerId >= 0 ? 3 : 1;
}

function handleNetPacket(typeId, payload) {
  if (mapLoadInFlight && typeId !== NET.SVCL_MAP_CHANGE && typeId !== NET.SVCL_ROUND_STATE) {
    if (!deferredMapPackets.enqueue(typeId, payload)) {
      game.ui.log('\x04Disconnected: map-load network queue exceeded its safety limit');
      netClient?.disconnect();
    }
    return;
  }
  switch (typeId) {
    case NET.SVCL_NEWPLAYER: {
      const pid = payload[0];
      if (netClient && pid === netClient.playerId) {
        bindLocalPlayerId(pid);
      } else {
        getOrCreatePlayer(pid);
      }
      break;
    }
    case NET.SVCL_SERVER_INFO: {
      const info = Bv2Client.parseServerInfo(payload);
      game.setGameType(info.gameType);
      game.blueScore = info.blueScore;
      game.redScore = info.redScore;
      if (info.gameType === GAME_TYPE_CTF) {
        game.ctf.blueWin = info.blueWin ?? info.blueScore;
        game.ctf.redWin = info.redWin ?? info.redScore;
      }
      const mapName = info.mapName.trim();
      if (mapName && (!game.map || game.map.name !== mapName)) {
        return beginDeferredMapLoad(mapName);
      }
      updateIngameMenuLabels();
      break;
    }
    case NET.SVCL_PLAYER_ENUM_STATE:
      void applyPlayerEnum(payload);
      break;
    case NET.SVCL_PLAYER_SPAWN:
      void applyPlayerSpawn(payload);
      break;
    case NET.CLSV_SVCL_PLAYER_COORD_FRAME:
      applyCoordFrame(payload);
      break;
    case NET.CLSV_SVCL_PLAYER_CHANGE_NAME: {
      if (payload.length !== 33) break;
      const update = parsePlayerChangeName(payload);
      getOrCreatePlayer(update.playerID).name = update.name;
      break;
    }
    case NET.CLSV_SVCL_PLAYER_UPDATE_SKIN: {
      if (payload.length !== 17) break;
      const update = parsePlayerUpdateSkin(payload);
      void applyPlayerSkin(getOrCreatePlayer(update.playerID), update.skin, update.decals);
      break;
    }
    case NET.SVCL_PLAYER_SHOOT: {
      const sh = parsePlayerShoot(payload);
      sh.isFlame = sh.weaponID === WEAPON_FLAME_THROWER;
      game.applyNetShoot(sh);
      break;
    }
    case NET.SVCL_PLAYER_HIT:
      game.applyNetHit(parsePlayerHit(payload));
      break;
    case NET.SVCL_PICKUP_ITEM: {
      if (payload.length < 2) break;
      const player = getOrCreatePlayer(payload[0]);
      if (payload[1] === 2) {
        void game.applyWeaponPickup(player, payload[2]);
        break;
      }
      const item = payload[1] === 1 ? 'life' : payload[1] === 3 ? 'grenade' : null;
      if (item) game.applyPickup({ item, player, authoritative: true });
      break;
    }
    case NET.SVCL_EXPLOSION: {
      const ex = parseExplosion(payload);
      game.applyExplosion({
        position: ex.position,
        normal: ex.normal,
        radius: ex.radius,
        damageRadius: ex.radius * 2,
        ownerID: ex.playerID,
        weaponID: WEAPON_GRENADE,
        fromNetwork: true,
      });
      break;
    }
    case NET.CLSV_SVCL_PLAYER_PROJECTILE:
      game.spawnNetProjectile(parsePlayerProjectile(payload));
      break;
    case NET.CLSV_SVCL_PLAYER_SHOOT_MELEE:
      game.applyNetMelee(payload[0]);
      break;
    case NET.SVCL_PROJECTILE_COORD_FRAME:
      game.applyProjectileCoordFrame(parseProjectileCoordFrame(payload));
      break;
    case NET.SVCL_DELETE_PROJECTILE: {
      if (payload.length < 4) break;
      const uniqueID = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getInt32(0, true);
      game.deleteNetProjectile(uniqueID);
      break;
    }
    case NET.CLSV_SVCL_CHAT: {
      const msg = parseChat(payload);
      game.ui.addNetChat(msg.message, msg.teamID);
      break;
    }
    case NET.CLSV_SVCL_VOTE_REQUEST: {
      if (payload.length < 81) break;
      const vote = parseVoteRequest(payload);
      const from = game.players[vote.playerID]?.name ?? `Player ${vote.playerID}`;
      game.ui.startVote(from, vote.command);
      break;
    }
    case NET.SVCL_UPDATE_VOTE:
      if (payload.length >= 2) game.ui.updateVote(payload[0], payload[1]);
      break;
    case NET.SVCL_VOTE_RESULT:
      if (payload.length >= 1) game.ui.finishVote(payload[0] !== 0);
      break;
    case NET.SVCL_MSG: {
      const msg = parseChat(payload.subarray(1));
      game.ui.addNetChat(msg.message, CHAT_TEAM_ALL);
      break;
    }
    case NET.SVCL_SYNCHRONIZE_TIMER: {
      const t = parseSyncTimer(payload);
      game.gameTimeLeft = t.gameTimeLeft;
      game.roundTimeLeft = t.roundTimeLeft;
      break;
    }
    case NET.SVCL_GAME_STATE: {
      if (payload.length < 2) break;
      const state = payload[0] >= 128 ? payload[0] - 256 : payload[0];
      const reInit = payload[1] !== 0;
      game.roundState = state;
      if (reInit) {
        game.resetRoundTransientState();
        game.blueScore = 0;
        game.redScore = 0;
        game.ctf.blueWin = 0;
        game.ctf.redWin = 0;
        game.ctf.flagState = [FLAG_AT_POD, FLAG_AT_POD];
        if (game.map?.flagPod) {
          game.ctf.flagPos = [
            [game.map.flagPod[0][0], game.map.flagPod[0][1], 0.25],
            [game.map.flagPod[1][0], game.map.flagPod[1][1], 0.25],
          ];
        }
        game.projectiles.length = 0;
        resetScoreboardStats();
        game.ui.addEvent('\x03New round');
      } else if (state === 0) {
        game.ui.addEvent('\x01Blue team wins!');
      } else if (state === 1) {
        game.ui.addEvent('\x04Red team wins!');
      } else if (state === 2) {
        game.ui.addEvent('\x03Draw!');
      }
      break;
    }
    case NET.SVCL_MAP_CHANGE: {
      if (payload.length < 17) break;
      const mapName = readFixedStr(payload, 0, 16);
      game.gameType = payload[16] >= 128 ? payload[16] - 256 : payload[16];
      // Treat map-change as an authoritative scoreboard boundary even if a
      // reordered/lost re-init packet never reached this client.
      resetScoreboardStats();
      onlineAwaitingSpawn = false;
      beginDeferredMapLoad(mapName);
      break;
    }
    case NET.SVCL_FLAG_ENUM:
      applyFlagEnum(payload);
      break;
    case NET.SVCL_DROP_FLAG:
      applyDropFlag(payload);
      break;
    case NET.SVCL_CHANGE_FLAG_STATE:
      applyChangeFlagState(payload);
      break;
    case NET.SVCL_FLAME_STICK_TO_PLAYER:
      applyFlameStick(payload);
      break;
    case NET.SVCL_PLAYER_PING: {
      const pp = parsePlayerPing(payload);
      const p = game.players[pp.playerID];
      if (p) p.ping = pp.ping;
      break;
    }
    case NET.SVCL_AUTOBALANCE:
      game.ui.addEvent('\x03Autobalance in 4 seconds');
      break;
    case NET.SVCL_PLAYER_DISCONNECT: {
      const pid = payload[0];
      const p = game.players[pid];
      if (p && p !== game.thisPlayer) {
        p.status = PLAYER_STATUS_DEAD;
        // Player slots are stable protocol IDs, so keep the object available for
        // reuse but remove it from team, FFA, spectator, and minimap rosters.
        p.teamID = PLAYER_TEAM_DISCONNECTED;
        game.ui.log('\x03' + (p.name ?? 'Player') + ' disconnected');
      }
      break;
    }
    case NET.CLSV_SVCL_TEAM_REQUEST: {
      const pid = payload[0];
      const teamId = payload[1] >= 128 ? payload[1] - 256 : payload[1];
      const p = getOrCreatePlayer(pid);
      const previousTeamId = p === game.thisPlayer && pendingTeamId !== null
        ? pendingPreviousTeamId
        : p.teamID;
      p.teamID = teamId;
      if (previousTeamId !== null && previousTeamId !== teamId) {
        const teamName = teamId === PLAYER_TEAM_BLUE
          ? '\x01Blue team'
          : teamId === PLAYER_TEAM_RED
            ? '\x04Red team'
            : '\x09spectators';
        game.ui.addEvent('\x09' + p.name + ' \x08joined the ' + teamName);
      }
      if (p === game.thisPlayer) {
        pendingTeamId = null;
        pendingPreviousTeamId = null;
        if (teamId === PLAYER_TEAM_SPECTATOR) {
          game.enterSpectator();
          onlineAwaitingSpawn = false;
        }
      }
      void applyPlayerSkin(p, p.skin, p.decals);
      break;
    }
    case NET.CLSV_SVCL_PLAYER_INFO: {
      const pid = payload[0];
      const p = getOrCreatePlayer(pid);
      p.name = readFixedStr(payload, 1, 32) || p.name;
      break;
    }
    case NET.SVCL_SERVER_DISCONNECT:
      game.ui.log('\x04Server disconnected');
      disconnectOnline();
      endSession();
      showMainMenuOverlay();
      break;
    default:
      break;
  }
}

function disconnectOnline() {
  netClient?.disconnect();
  netClient = null;
  game.netClient = null;
  game.onlineMode = false;
  onlineAwaitingSpawn = false;
  pendingTeamId = null;
  pendingPreviousTeamId = null;
  connectedServerLabel = '';
  mapLoadInFlight = null;
  deferredMapPackets.reset();
  game.resetHitFeedback();
}

/**
 * Claim a team online. The server kills us and starts the respawn wait
 * (Game.cpp:945), so we land on the death screen and respawn when input
 * is used after timer completion.
 */
function joinTeamOnline(teamId) {
  if (mobileSpectator && teamId !== PLAYER_TEAM_SPECTATOR) {
    game.ui.log('\x03Mobile clients are spectator-only');
    return;
  }
  const p = game.thisPlayer;
  const wasSpectating = game.isSpectating;
  const changedTeam = p.teamID !== teamId;
  pendingPreviousTeamId = p.teamID;
  p.teamID = teamId;
  pendingTeamId = teamId;
  netClient?.requestTeam(teamId);
  if (changedTeam || p.status !== PLAYER_STATUS_ALIVE) {
    // Carry the free camera over so the wait isn't spent staring at the map corner.
    if (wasSpectating) {
      p.currentCF.position = [game.specLookAt[0], game.specLookAt[1], PLAYER_Z];
    }
    p.status = PLAYER_STATUS_DEAD;
    p.life = 0;
    p.timeToSpawn = SV_TIME_TO_SPAWN;
  }
  onlineAwaitingSpawn = true;
  void applyPlayerSkin(p, p.skin, p.decals);
}

function requestOnlineSpawn() {
  if (!netClient || netClient.playerId < 0 || game.isSpectating) return;
  const p = game.thisPlayer;
  netClient.requestSpawn(
    p.pendingWeaponID ?? p.weaponID,
    p.pendingMeleeWeaponID ?? p.meleeWeaponID,
    p.skin,
    p.decals,
  );
}

async function startOnlinePlay(host, port, password, serverName = '') {
  settings.applyToPlayer(game.thisPlayer);
  disconnectOnline();
  game.audio.stopMusic();
  const target = port == null ? host : formatHostPort(host, port);
  const wsUrl = hostedJoinTargetToWsUrl(target);
  connectedServerLabel = serverName ? `${serverName} (${target})` : target;
  hud.textContent = `connecting ${wsUrl}...`;
  game.ui.log('\x09Connecting to ' + wsUrl);

  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cancelPendingConnect = null;
      fn(arg);
    };
    const timer = setTimeout(() => {
      netClient?.disconnect();
      finish(reject, new Error('Connection timed out'));
    }, 15000);

    netClient = new Bv2Client({
      url: wsUrl,
      name: settings.data.playerName,
      password,
      onPacket: (typeId, payload) => {
        const applied = handleNetPacket(typeId, payload);
        if (typeId === NET.SVCL_SERVER_INFO) {
          Promise.resolve(applied).then(() => finish(resolve), (error) => finish(reject, error));
        }
      },
      onDisconnect: () => {
        if (game.onlineMode) {
          game.ui.log('\x04Disconnected from server');
          disconnectOnline();
          endSession();
          showMainMenuOverlay();
        } else if (!settled) {
          finish(reject, new Error('Connection closed'));
        }
      },
    });
    cancelPendingConnect = () => {
      netClient?.disconnect();
      finish(reject, new Error('Connection cancelled'));
    };
    netClient.connect();
  });

  game.onlineMode = true;
  game.netClient = netClient;
  game.exploreMode = false;
  onlineAwaitingSpawn = false;
  sessionActive = true;
  // Joins land in spectator until a team is picked (Player.cpp:112).
  game.enterSpectator();
  game.ui.playing = true;
  game.ui.menuOpen = !mobileSpectator;
  hud.textContent = '';
  menu2.hide();
  menu2.setSessionActive(true);
  updateOverlayHelp();
  updateIngameMenuLabels();
  if (mobileSpectator) {
    resumeGame();
    mobileControls.setVisible(true);
    game.ui.log('\x03Connected — mobile spectator mode. Fly, zoom, and chat with touch controls.');
  } else {
    showIngameMenu();
    game.ui.log('\x03Connected — spectating. Pick a team to join, or Esc to fly the map.');
  }
}

function mapBase(file) {
  return file.replace(/\.bvm$/i, '');
}

function currentMapIndex() {
  const cur = game.map?.name ?? '';
  const idx = mapNames.findIndex((f) => mapBase(f) === cur);
  return idx >= 0 ? idx : 0;
}

function updateOverlayHelp() {
  // The persistent desktop control legend was intentionally removed.
}

function syncTextInput() {
  const ui = game.ui;
  const mode = ui.activeInput;
  if (mode) {
    textInput.value = ui.inputBuffer;
    textInput.focus();
  } else {
    textInput.blur();
  }
}

function syncTypedBv2Text() {
  const caret = textInput.selectionStart ?? textInput.value.length;
  const normalizedCaret = normalizeBv2Text(textInput.value.slice(0, caret)).length;
  const normalized = normalizeBv2Text(textInput.value);
  textInput.value = normalized;
  game.ui.inputBuffer = normalized;
  textInput.setSelectionRange(normalizedCaret, normalizedCaret);
}

textInput.addEventListener('input', () => {
  syncTypedBv2Text();
});
let textInputAltValue = -2;
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Alt') {
    textInputAltValue = -1;
    e.stopPropagation();
    return;
  }
  if (e.altKey) {
    const match = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
    if (match) {
      e.preventDefault();
      e.stopPropagation();
      const digit = Number(match[1]);
      textInputAltValue = textInputAltValue < 0 ? digit : textInputAltValue * 10 + digit;
      return;
    }
  }
  // This focused input owns text-entry keys: stopping propagation keeps the
  // player from moving/shooting, so submit/cancel must also happen here.
  const code = e.key === 'Enter' ? 'Enter' : e.code;
  if (game.ui.handleTextInputKey(code)) e.preventDefault();
  e.stopPropagation();
});
textInput.addEventListener('keyup', (e) => {
  if (e.key !== 'Alt') return;
  if (textInputAltValue >= 0) {
    const start = textInput.selectionStart ?? textInput.value.length;
    const end = textInput.selectionEnd ?? start;
    const code = textInputAltValue > 0xffff ? textInputAltValue & 0xffff : textInputAltValue;
    if (code >= 32 && code <= 159) {
      textInput.value = textInput.value.slice(0, start)
        + String.fromCharCode(code)
        + textInput.value.slice(end);
      textInput.setSelectionRange(start + 1, start + 1);
      syncTypedBv2Text();
    }
  }
  textInputAltValue = -2;
  e.preventDefault();
  e.stopPropagation();
});
textInput.addEventListener('beforeinput', (e) => {
  // Android IMEs often send no usable key/code for the keyboard action button,
  // but do expose it as an attempted line break on a single-line input.
  if (!['insertLineBreak', 'insertParagraph'].includes(e.inputType)) return;
  if (game.ui.handleTextInputKey('Enter')) e.preventDefault();
});

async function switchMap(name, { skipSpawn = false, preserveMatchState = false } = {}) {
  hud.textContent = `loading ${name}...`;
  try {
    const map = await loadMap(name);
    await game.setMap(map, {
      skipSpawn: skipSpawn || game.onlineMode,
      preserveMatchState,
    });
    hud.textContent = '';
    updateIngameMenuLabels();
    game.ui.log('\x03Map loaded: ' + name);
  } catch (err) {
    hud.textContent = `failed to load ${name}: ${err.message}`;
    game.ui.log('\x04Map failed: ' + name + ' — ' + err.message);
    console.error(err);
  }
}

function cycleMap(delta) {
  if (!mapNames.length) return;
  const next = mapNames[(currentMapIndex() + delta + mapNames.length) % mapNames.length];
  switchMap(mapBase(next));
}

function setSandboxMapPicker(open) {
  if (!game.exploreMode || !sandboxMapPicker) return;
  sandboxMapPicker.hidden = !open;
  game.ui.menuOpen = open;
  canvas.style.cursor = open ? 'default' : 'crosshair';
  if (!open) canvas.focus();
}

function buildSandboxMapPicker() {
  if (!sandboxMapList) return;
  sandboxMapList.replaceChildren(...mapNames.map((name) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-btn';
    button.textContent = mapBase(name);
    button.addEventListener('click', async () => {
      settings.data.exploreMap = name;
      settings.save();
      setSandboxMapPicker(false);
      await switchMap(mapBase(name));
    });
    return button;
  }));
}

function updateIngameMenuLabels() {
  if (game.exploreMode) {
    const gt = game.gameType;
    igGameTitle.textContent = GAME_TYPE_NAMES[gt] ?? 'Explore';
    const subs = {
      [GAME_TYPE_DM]: 'Free-for-all sandbox',
      [GAME_TYPE_TDM]: 'Team deathmatch sandbox',
      [GAME_TYPE_CTF]: 'Capture the flag sandbox',
    };
    igGameSubtitle.textContent = subs[gt] ?? 'Solo sandbox';
  } else {
    const gt = game.gameType;
    igGameTitle.textContent = GAME_TYPE_NAMES[gt] ?? 'Game';
    const subs = {
      [GAME_TYPE_DM]: 'Free-for-all',
    };
    const mode = subs[gt] ?? '';
    igGameSubtitle.textContent = connectedServerLabel
      ? `${connectedServerLabel}${mode ? ` · ${mode}` : ''}`
      : mode;
  }
  const map = game.map;
  if (map && igBitmapFont && igMapInfoCanvas) {
    let text = `\x09${map.name ?? ''}`;
    if (map.author?.trim()) {
      text += `\x09 created by ${expandCaretColors(map.author.trim())}`;
    }
    renderBitmapText(igMapInfoCanvas, igBitmapFont.atlas, igBitmapFont.font, text, {
      size: 32,
      scale: Math.max(1, Math.round(window.innerHeight / 600)),
      smooth: true,
    });
  } else if (igMapInfoCanvas) {
    const ctx = igMapInfoCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, igMapInfoCanvas.width, igMapInfoCanvas.height);
  }
  highlightIgSelections();
}

function highlightIgSelections() {
  const wId = game.thisPlayer.pendingWeaponID ?? game.thisPlayer.weaponID;
  const mId = game.thisPlayer.pendingMeleeWeaponID ?? game.thisPlayer.meleeWeaponID;
  igWeapons.querySelectorAll('[data-weapon]').forEach((btn) => {
    btn.classList.toggle('selected', Number(btn.dataset.weapon) === wId);
  });
  igMelee.querySelectorAll('[data-melee]').forEach((btn) => {
    btn.classList.toggle('selected', Number(btn.dataset.melee) === mId);
  });
}

function buildIngameMenuButtons() {
  primaries = PRIMARY_WEAPON_IDS.map((id) => ({ id, name: WEAPONS[id].name }));
  igWeapons.innerHTML = primaries.map(({ id, name }) =>
    `<button type="button" class="menu-btn ig-btn" data-weapon="${id}">${name}</button>`,
  ).join('');
  igMelee.innerHTML = MELEE_WEAPON_IDS.map((id) =>
    `<button type="button" class="menu-btn ig-btn" data-melee="${id}">${WEAPONS[id].name}</button>`,
  ).join('');

  igWeapons.querySelectorAll('[data-weapon]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.weapon);
      settings.data.primaryWeapon = id;
      settings.save();
      game.thisPlayer.pendingWeaponID = id;
      highlightIgSelections();
    });
  });
  igMelee.querySelectorAll('[data-melee]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.melee);
      settings.data.meleeWeapon = id;
      settings.save();
      game.thisPlayer.pendingMeleeWeaponID = id;
      highlightIgSelections();
    });
  });
  ingameMenu.querySelectorAll('[data-team]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const teamId = Number(btn.dataset.team);
      const labels = { [PLAYER_TEAM_BLUE]: 'Blue', [PLAYER_TEAM_RED]: 'Red', [PLAYER_TEAM_SPECTATOR]: 'Spectator' };
      game.ui.log('\x03Team: ' + (labels[teamId] ?? 'Unknown'));
      const leaveTeamMenu = () => {
        ingameMenu.hidden = true;
        menu2.hide();
        overlay.hidden = false;
        canvas.style.cursor = game.onlineMode && onlineAwaitingSpawn ? 'default' : 'crosshair';
        game.ui.menuOpen = false;
        if (!game.ui.menuOpen) canvas.focus();
      };
      if (teamId === PLAYER_TEAM_SPECTATOR) {
        // Spectators drop their body and free-fly instead of spawning (Game.cpp:945).
        game.enterSpectator();
        onlineAwaitingSpawn = false;
        if (game.onlineMode) netClient?.requestTeam(teamId);
        leaveTeamMenu();
        return;
      }
      if (game.onlineMode) {
        joinTeamOnline(teamId);
        leaveTeamMenu();
      } else {
        game.thisPlayer.teamID = teamId;
        if (game.map) game.spawnPlayer(game.thisPlayer);
        leaveTeamMenu();
      }
    });
  });

}

function resumeGame() {
  if (!sessionActive) return;
  ingameMenu.hidden = true;
  menu2.hide();
  game.ui.menuOpen = false;
  game.ui.playing = true;
  overlay.hidden = false;
  canvas.style.cursor = 'crosshair';
  canvas.focus();
  mobileControls.setVisible(mobileSpectator && game.isSpectating);
}

function showIngameMenu() {
  game.ui.menuOpen = true;
  ingameMenu.hidden = false;
  overlay.hidden = true;
  updateIngameMenuLabels();
  canvas.style.cursor = 'default';
  mobileControls.setVisible(false);
}

function hideIngameMenu() {
  if (game.onlineMode && onlineAwaitingSpawn && !game.isSpectating) {
    if (game.thisPlayer.timeToSpawn <= 0) requestOnlineSpawn();
    // Joining a team, the first spawn, and later deaths all use the same
    // in-world wait. The spawn state remains authoritative, but must not
    // trap the player in the menu until the server answers.
    resumeGame();
    return;
  }
  game.ui.menuOpen = false;
  ingameMenu.hidden = true;
  if (sessionActive && !onlineAwaitingSpawn) overlay.hidden = false;
  canvas.style.cursor = onlineAwaitingSpawn ? 'default' : 'crosshair';
  if (!onlineAwaitingSpawn) canvas.focus();
}

function showMainMenuOverlay() {
  hideIngameMenu();
  menu2.setSessionActive(sessionActive);
  menu2.show();
}

function endSession() {
  disconnectOnline();
  sessionActive = false;
  game.exploreMode = false;
  game.ui.playing = false;
  menu2.setSessionActive(false);
  game.audio.stopMusic();
  overlay.hidden = true;
  mobileControls.setVisible(false);
  updateOverlayHelp();
}

function resumeOrStart() {
  if (sessionActive) resumeGame();
  else void startLocalPlay();
}

async function startLocalPlay() {
  settings.applyToPlayer(game.thisPlayer);
  game.exploreMode = true;
  game.gameType = settings.data.exploreGameType ?? GAME_TYPE_DM;
  game.thisPlayer.teamID = mobileSpectator ? PLAYER_TEAM_SPECTATOR : PLAYER_TEAM_BLUE;
  await game.setWeapon(game.thisPlayer, settings.data.primaryWeapon);
  await game.setMeleeWeapon(game.thisPlayer, settings.data.meleeWeapon);
  const mapFile = settings.data.exploreMap || mapNames[0];
  const base = mapBase(mapFile);
  if (!game.map || game.map.name !== base) {
    await switchMap(base);
  } else {
    game.initGameMode();
    if (mobileSpectator) game.enterSpectator();
    else game.spawnPlayer(game.thisPlayer);
  }
  sessionActive = true;
  game.ui.playing = true;
  game.ui.menuOpen = false;
  menu2.hide();
  ingameMenu.hidden = true;
  overlay.hidden = false;
  canvas.style.cursor = 'crosshair';
  canvas.focus();
  mobileControls.setVisible(mobileSpectator);
  menu2.setSessionActive(true);
  updateOverlayHelp();
  updateIngameMenuLabels();
  game.ui.log('\x03Local play — ' + base);
}

btnAutoTeam.addEventListener('click', () => {
  if (mobileSpectator) {
    game.ui.log('\x03Mobile clients are spectator-only');
    return;
  }
  const blue = game.players.filter((p) => p.teamID === PLAYER_TEAM_BLUE).length;
  const red = game.players.filter((p) => p.teamID === PLAYER_TEAM_RED).length;
  const teamId = blue <= red ? PLAYER_TEAM_BLUE : PLAYER_TEAM_RED;
  game.ui.log('\x03Auto team: ' + (teamId === PLAYER_TEAM_BLUE ? 'Blue' : 'Red'));
  const leaveTeamMenu = () => {
    ingameMenu.hidden = true;
    menu2.hide();
    overlay.hidden = false;
    canvas.style.cursor = game.onlineMode && onlineAwaitingSpawn ? 'default' : 'crosshair';
    game.ui.menuOpen = false;
    if (!game.ui.menuOpen) canvas.focus();
  };
  if (game.onlineMode) {
    joinTeamOnline(teamId);
    leaveTeamMenu();
  } else {
    game.thisPlayer.teamID = teamId;
    void applyPlayerSkin(game.thisPlayer, game.thisPlayer.skin, game.thisPlayer.decals);
    if (game.map) game.spawnPlayer(game.thisPlayer);
    leaveTeamMenu();
  }
});

btnDisconnect.addEventListener('click', () => {
  endSession();
  showMainMenuOverlay();
});

btnMainMenu.addEventListener('click', () => showMainMenuOverlay());

async function boot() {
  game.onMapRequest = (name) => switchMap(mapBase(name));

  settings.applyToPlayer(game.thisPlayer);
  if (settings.data.masterVolume != null) {
    game.audio.setMasterVolume(settings.data.masterVolume / 255);
  }

  window.bv2Connect = (host, port, pass, name) => startOnlinePlay(host, port, pass, name);
  window.bv2Disconnect = () => {
    disconnectOnline();
    endSession();
    showMainMenuOverlay();
  };

  menu2 = new Menu2({ settings, game, assets });
  menu2.onProfileNameChange = (name) => netClient?.updateProfileName(name);
  menu2.onProfileSkinChange = (skin, decals) => netClient?.updateProfileSkin(skin, decals);
  worldEditor = new WorldMapEditor({
    root: worldEditorRoot, canvas, game, renderer, input,
    onExit: () => {
      overlay.hidden = true;
      menu2.show();
      menu2.showTab('editor');
    },
  });
  menu2.onEditMap = async (map) => {
    menu2.hideMenu();
    overlay.hidden = true;
    await worldEditor.start(map);
  };
  menu2.onResume = () => resumeOrStart();
  menu2.onJoin = async (host, port, password, serverName = '') => {
    menu2.setConnecting(`Connecting to ${host}:${port}…`);
    try {
      await startOnlinePlay(host, port, password, serverName);
      menu2.setConnecting('', { visible: false });
    } catch (err) {
      hud.textContent = String(err.message ?? err);
      game.ui.log('\x04Join failed: ' + (err.message ?? err));
      disconnectOnline();
      if ((err.message ?? '') === 'Connection cancelled') {
        menu2.setConnecting('', { visible: false });
      } else {
        menu2.setConnecting(`Connection failed: ${err.message ?? err}`, { error: true });
      }
      console.error(err);
    }
  };
  menu2.onCancelJoin = () => {
    cancelPendingConnect?.();
    if (!cancelPendingConnect) disconnectOnline();
    menu2.setConnecting('', { visible: false });
    game.ui.log('\x03Connection cancelled');
  };
  menu2.showMenu = menu2.show.bind(menu2);
  menu2.hideMenu = menu2.hide.bind(menu2);
  menu2.show = () => { overlay.hidden = true; menu2.showMenu(); };
  menu2.hide = () => {
    menu2.hideMenu();
    if (sessionActive) {
      overlay.hidden = false;
      canvas.style.cursor = 'crosshair';
      canvas.focus();
    }
  };

  buildIngameMenuButtons();
  updateOverlayHelp();

  mapNames = await (await fetch('/api/maps')).json();
  if (!mapNames.length) {
    document.getElementById('loading').querySelector('.boot-sub').textContent = 'No maps found';
    return;
  }
  menu2.setMapNames(mapNames);
  settings.data.exploreMap = settings.data.exploreMap || mapNames[0];
  buildSandboxMapPicker();

  if (!sandboxEntry) await menu2.runIntro();

  await menu2.loadAssets();
  igBitmapFont = await loadBitmapFont(assets);
  if (sandboxEntry) {
    await startLocalPlay();
  } else {
    menu2.show();
    void switchMap(mapBase(mapNames[0]));
  }

  let last = performance.now();
  const TICK_MS = 1000 / 60;

  const gameTick = () => {
    const now = performance.now();
    const delay = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (!sandboxMapPicker?.hidden && (input.consumePress('KeyM') || input.consumePress('Escape'))) {
      setSandboxMapPicker(false);
    }

    if (worldEditor.active) {
      if (input.consumePress('Escape')) {
        if (worldEditor.playtesting) worldEditor.togglePlaytest();
        else worldEditor.stop();
      }
      else worldEditor.update(delay);
      return;
    }

    if (input.consumePress('Escape') && !game.ui.consoleActive && !game.ui.chatActive) {
      if (!menu2.root.hidden && sessionActive) {
        resumeGame();
      } else if (!menu2.root.hidden && !sessionActive) {
        /* menu at boot — Esc does nothing */
      } else if (sessionActive && game.ui.playing && menu2.root.hidden && ingameMenu.hidden) {
        showIngameMenu();
      } else if (!ingameMenu.hidden) {
        hideIngameMenu();
      }
    }

    if (!menu2.root.hidden) menu2.tickPreview(delay);

    game.processUIInput();
    syncTextInput();

    if (game.ui.playing && !game.ui.menuOpen && !game.ui.consoleActive && !game.ui.chatActive) {
      if (game.exploreMode) {
        if (input.consumePress('KeyM')) setSandboxMapPicker(sandboxMapPicker?.hidden ?? true);
        if (input.consumePress('BracketRight')) cycleMap(1);
        if (input.consumePress('BracketLeft')) cycleMap(-1);
        for (let i = 0; i < 8; i++) {
          const code = `Digit${i + 1}`;
          if (input.consumePress(code) && primaries[i]) {
            game.thisPlayer.pendingWeaponID = primaries[i].id;
            settings.data.primaryWeapon = primaries[i].id;
            settings.save();
          }
        }
      }
    }

    game.update(delay);
    if (
      game.onlineMode &&
      netClient?.connected &&
      !mapLoadInFlight &&
      game.ui.playing &&
      !game.ui.menuOpen &&
      game.thisPlayer.status === PLAYER_STATUS_ALIVE
    ) {
      netClient.sendCoordFrame(game, game.thisPlayer);
    }
  };

  const renderLoop = () => {
    if (!document.hidden) {
      const now = performance.now();
      for (const p of game.players) {
        if (p !== game.thisPlayer && p.status === PLAYER_STATUS_ALIVE) p.applyNetworkInterpolation(now);
      }
      renderer.render(game);
      requestAnimationFrame(renderLoop);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestAnimationFrame(renderLoop);
  });

  setInterval(gameTick, TICK_MS);
  requestAnimationFrame(renderLoop);
}

boot().catch((err) => {
  hud.textContent = String(err);
  console.error(err);
});

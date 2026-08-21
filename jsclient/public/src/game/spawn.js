// Spawn selection — GameSpawn.cpp:208-303 (farthest from enemies on dm_spawns).
import { PLAYER_Z, GAME_TYPE_DM, GAME_TYPE_TDM, GAME_TYPE_CTF, GAME_TYPE_KOTH, PLAYER_STATUS_ALIVE } from './constants.js';

/** Editor places spawns on passable tiles at cell centers (EditorTools.cpp:472). */
export function spawnOnPassable(map, pos) {
  const cx = Math.floor(pos[0]);
  const cy = Math.floor(pos[1]);
  return map.isPassable(cx, cy);
}

export function validSpawns(map, list) {
  return list.filter((s) => spawnOnPassable(map, s));
}

function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Pick a dm_spawn farthest from relevant enemies (alive players on other teams).
 * @param {import('./bvm.js').BVMap} map
 * @param {object} player — spawning player
 * @param {object[]} players — all players
 * @param {number} gameType
 */
export function pickSpawn(map, player, players, gameType = GAME_TYPE_DM) {
  const spawns = validSpawns(map, map.dmSpawns);
  if (!spawns.length) {
    // No valid fixed spawns — scan map for passable cell centers (never random wall).
    for (let y = 1; y < map.sizeY - 1; y++) {
      for (let x = 1; x < map.sizeX - 1; x++) {
        const pos = [x + 0.5, y + 0.5, PLAYER_Z];
        if (spawnOnPassable(map, pos)) return pos;
      }
    }
    return [map.sizeX / 2, map.sizeY / 2, PLAYER_Z];
  }

  const enemies = players.filter((p) => {
    if (p === player || p.status !== PLAYER_STATUS_ALIVE) return false;
    if (gameType === GAME_TYPE_DM) return true;
    if (gameType === GAME_TYPE_TDM || gameType === GAME_TYPE_CTF || gameType === GAME_TYPE_KOTH) {
      return p.teamID >= 0 && p.teamID !== player.teamID;
    }
    return false;
  });

  if (!enemies.length) {
    const idx = Math.floor(Math.random() * spawns.length);
    return normalizeSpawn(spawns[idx]);
  }

  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < spawns.length; i++) {
    let nearest = Infinity;
    for (const e of enemies) {
      const d = distSq(spawns[i][0], spawns[i][1], e.currentCF.position[0], e.currentCF.position[1]);
      if (d < nearest) nearest = d;
    }
    if (nearest > bestScore) {
      bestScore = nearest;
      bestIdx = i;
    }
  }
  return normalizeSpawn(spawns[bestIdx]);
}

function normalizeSpawn(sp) {
  return [sp[0], sp[1], PLAYER_Z];
}

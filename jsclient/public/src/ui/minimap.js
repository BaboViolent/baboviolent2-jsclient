import {
  PLAYER_STATUS_ALIVE,
  PLAYER_TEAM_BLUE,
  PLAYER_TEAM_RED,
  GAME_TYPE_CTF,
  GAME_TYPE_TDM,
} from '../game/constants.js';
import { FLAG_AT_POD, FLAG_DROPPED } from '../game/ctf.js';

export function minimapPoint(position, bounds) {
  const { x, y, width, height, mapWidth, mapHeight } = bounds;
  return [
    x + (position[0] / mapWidth) * width,
    y + (1 - position[1] / mapHeight) * height,
  ];
}

export function visibleMinimapPlayers(players, viewer, gameType, spectating = false) {
  const teamMode = gameType === GAME_TYPE_TDM || gameType === GAME_TYPE_CTF;
  return players.filter((player) => {
    if (!player || player === viewer) return false;
    if (player.teamID !== PLAYER_TEAM_BLUE && player.teamID !== PLAYER_TEAM_RED) return false;
    if (!teamMode) return player.firedShowDelay > 0;
    if (player.status !== PLAYER_STATUS_ALIVE) return false;
    return spectating || player.teamID === viewer.teamID;
  });
}

export function visibleMinimapFlags(ctf, players = [], viewer = null, spectating = false) {
  if (!ctf) return [];
  return ctf.flagState.flatMap((state, flagID) => {
    if (state === FLAG_AT_POD || state === FLAG_DROPPED) {
      return [{ flagID, state, position: ctf.flagPos[flagID] }];
    }
    const carrier = players[state];
    if (!carrier || carrier.status !== PLAYER_STATUS_ALIVE) return [];
    if (!spectating && (!viewer || carrier.teamID !== viewer.teamID)) return [];
    return [{ flagID, state, position: carrier.currentCF.position, carrier }];
  });
}

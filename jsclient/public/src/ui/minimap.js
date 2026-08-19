import {
  PLAYER_STATUS_ALIVE,
  PLAYER_TEAM_BLUE,
  PLAYER_TEAM_RED,
} from '../game/constants.js';
import { FLAG_AT_POD, FLAG_DROPPED } from '../game/ctf.js';

export function minimapPoint(position, bounds) {
  const { x, y, width, height, mapWidth, mapHeight } = bounds;
  return [
    x + (position[0] / mapWidth) * width,
    y + (1 - position[1] / mapHeight) * height,
  ];
}

export function visibleMinimapPlayers(players, viewer, spectating = false) {
  return players.filter((player) => {
    if (!player || player === viewer || player.status !== PLAYER_STATUS_ALIVE) return false;
    if (player.teamID !== PLAYER_TEAM_BLUE && player.teamID !== PLAYER_TEAM_RED) return false;
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

// Port of Player::regenTex (src/Game/Player.cpp:750).
// A skin TGA is a 64x32 R/G/B *mask*, not a finished sprite: each channel
// selects one of three decal colours, normalised by the channel sum.

import { GAME_TYPE_DM, PLAYER_TEAM_BLUE, PLAYER_TEAM_RED } from './constants.js';

export const DEFAULT_DECALS = {
  red: [0.5, 0.5, 1],
  green: [0, 0, 1],
  blue: [0, 0, 0.5],
};

export const TEAM_DECALS = {
  red: { red: [1, 0.5, 0.5], green: [1, 0, 0], blue: [0.5, 0, 0] },
  blue: { red: [0.5, 0.5, 1], green: [0, 0, 1], blue: [0, 0, 0.5] },
};

/** Convert wire bytes (0–255) or profile floats (0–1) to recolorSkin inputs. */
export function normalizeDecals(decals) {
  const ch = (c) => {
    const arr = [...(c ?? [255, 255, 255])];
    return arr.map((v) => (v > 1 ? v / 255 : v));
  };
  return {
    red: ch(decals.red ?? decals.r),
    green: ch(decals.green ?? decals.g),
    blue: ch(decals.blue ?? decals.b),
  };
}

/** Encode profile decals for net spawn (unsigned bytes). */
export function wireDecalsFromFloats(decals) {
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  const d = normalizeDecals(decals);
  return {
    r: d.red.map(byte),
    g: d.green.map(byte),
    b: d.blue.map(byte),
  };
}

/** Player.cpp updateSkin — team tint in TDM/CTF. */
export function decalsForPlayer(player, gameType) {
  const base = normalizeDecals(player.decals);
  if (gameType === GAME_TYPE_DM) return base;
  if (player.teamID === PLAYER_TEAM_RED) return TEAM_DECALS.red;
  if (player.teamID === PLAYER_TEAM_BLUE) return TEAM_DECALS.blue;
  return base;
}

/**
 * @param {{width:number,height:number,pixels:Uint8Array}} mask decoded skin TGA
 * @param {{red:number[],green:number[],blue:number[]}} decals
 */
export function recolorSkin(mask, decals) {
  const out = new Uint8Array(mask.pixels.length);
  const { red, green, blue } = decals;
  for (let k = 0; k < mask.pixels.length; k += 4) {
    const r = mask.pixels[k] / 255;
    const g = mask.pixels[k + 1] / 255;
    const b = mask.pixels[k + 2] / 255;
    const sum = r + g + b;
    if (sum === 0) {
      out[k] = out[k + 1] = out[k + 2] = 0;
    } else {
      for (let c = 0; c < 3; c++) {
        out[k + c] = Math.round(((red[c] * r + green[c] * g + blue[c] * b) / sum) * 255);
      }
    }
    out[k + 3] = mask.pixels[k + 3];
  }
  return { width: mask.width, height: mask.height, pixels: out };
}

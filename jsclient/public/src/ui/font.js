// Bitmap font, ported from src/Engine/Zeven/dkf/CFont.cpp (loadTGAFile).
import { parseColorRuns, TEXT_COLORS } from './colors.js';
// channel in 64px rows, left to right, starting at ASCII 33.

const ATLAS = 512;
const CHAR_H = 64;

export class BitmapFont {
  constructor(image) {
    this.image = image;
    this.chars = new Array(256).fill(null);
    this.kerning = new Array(256).fill(0);
    this.scan();
  }

  alphaAt(x, y) {
    // CFont reads the GL texture bottom-up and then indexes it with
    // (512 - y - 1), which nets out to plain top-down rows - which is what the
    // TGA decoder already produces. Do NOT flip again here.
    return this.image.pixels[(y * ATLAS + x) * 4 + 3];
  }

  scan() {
    this.chars[32] = { u1: 0, v1: 0, u2: 0, v2: 0, w: 0.25 };
    this.kerning[32] = 0.25;

    let curX = 0;
    let curY = 0;
    for (let c = 33; c < 128 + 32; c++) {
      let found = false;
      while (!found) {
        for (let j = 0; j < CHAR_H; j++) {
          if (this.alphaAt(curX, j + curY) > 0) {
            const from = Math.max(curX - 1, 0);
            let to;
            for (;;) {
              let allFalse = true;
              for (let jj = 0; jj < CHAR_H; jj++) {
                if (this.alphaAt(curX, jj + curY) > 0) { allFalse = false; break; }
              }
              if (allFalse || curX >= ATLAS - 1) {
                to = Math.min(curX + 1, ATLAS);
                break;
              }
              curX++;
            }
            this.chars[c] = {
              w: (to - from) / CHAR_H,
              u1: from / ATLAS,
              u2: to / ATLAS,
              v1: curY / ATLAS,
              v2: (curY + CHAR_H) / ATLAS,
            };
            this.kerning[c] = this.chars[c].w;
            found = true;
            break;
          }
        }
        curX++;
        if (curX >= ATLAS) {
          curX = 0;
          curY += CHAR_H;
          if (curY >= ATLAS) return;
        }
      }
    }
  }

  width(size, text) {
    let best = 0;
    let cur = 0;
    for (const ch of text) {
      if (ch === '\n') {
        best = Math.max(best, cur);
        cur = 0;
        continue;
      }
      cur += this.kerning[ch.charCodeAt(0) & 0xff];
    }
    return Math.max(best, cur) * size;
  }

  /** @returns {number[]} interleaved x,y,u,v triangles in screen space */
  layout(size, x, y, text) {
    const out = [];
    let penX = x;
    let penY = y;
    for (const ch of text) {
      if (ch === '\n') {
        penX = x;
        penY += size;
        continue;
      }
      const code = ch.charCodeAt(0) & 0xff;
      const g = this.chars[code];
      if (!g) continue;
      const w = g.w * size;
      if (g.u2 > g.u1) {
        out.push(
          penX, penY, g.u1, g.v1,
          penX, penY + size, g.u1, g.v2,
          penX + w, penY + size, g.u2, g.v2,
          penX, penY, g.u1, g.v1,
          penX + w, penY + size, g.u2, g.v2,
          penX + w, penY, g.u2, g.v1,
        );
      }
      penX += w;
    }
    return out;
  }
}

/** @deprecated use parseColorRuns — strips colour bytes for plain width measurement. */
export function stripColorCodes(text) {
  return parseColorRuns(text).map((r) => r.text).join('');
}

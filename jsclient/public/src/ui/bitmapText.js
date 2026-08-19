// Canvas rendering with babo.tga — shared by menu labels and profile inputs.
import { parseColorRuns } from './colors.js';
import { BitmapFont, stripColorCodes } from './font.js';

function tgaToCanvas(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.createImageData(image.width, image.height);
  data.data.set(image.pixels);
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function drawGlyph(ctx, atlas, font, code, x, y, size, color, smooth = false) {
  const g = font.chars[code & 0xff];
  if (!g || g.u2 <= g.u1) return 0;
  const w = smooth ? g.w * size : Math.round(g.w * size);
  const h = smooth ? size : Math.round(size);
  const px = smooth ? x : Math.round(x);
  const py = smooth ? y : Math.round(y);
  const tw = atlas.width;
  const sx = g.u1 * tw;
  const sy = g.v1 * tw;
  const sw = (g.u2 - g.u1) * tw;
  const sh = (g.v2 - g.v1) * tw;

  ctx.save();
  ctx.imageSmoothingEnabled = smooth;
  if (smooth) ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = color[3] ?? 1;
  ctx.drawImage(atlas, sx, sy, sw, sh, px, py, w, h);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgb(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)})`;
  ctx.fillRect(px, py, w, h);
  ctx.restore();
  return w;
}

function charAdvance(font, code, size, smooth = false) {
  if (code >= 1 && code <= 9) return 0;
  const adv = (font.kerning[code & 0xff] ?? 0) * size;
  return smooth ? adv : Math.round(adv);
}

function drawText(ctx, atlas, font, text, x, y, size, smooth = false) {
  const runs = parseColorRuns(text);
  let penX = x;
  for (const run of runs) {
    for (let i = 0; i < run.text.length; i++) {
      const code = run.text.charCodeAt(i);
      if (code >= 1 && code <= 9) continue;
      const g = font.chars[code & 0xff];
      if (g && g.u2 > g.u1) {
        drawGlyph(ctx, atlas, font, code, penX, y, size, run.color, smooth);
      }
      penX += charAdvance(font, code, size, smooth);
    }
  }
}

export async function loadBitmapFont(assets) {
  const image = await assets.loadImage('main/fonts/babo.tga');
  return { font: new BitmapFont(image), atlas: tgaToCanvas(image) };
}

/**
 * Draw BV2 text onto a canvas sized to fit (transparent background).
 * @param {{ size?: number, pad?: number, scale?: number, smooth?: boolean }} opts
 *   smooth — bilinear upscale for large HUD-style labels (default: crisp pixels)
 */
export function renderBitmapText(canvas, atlas, font, text, { size = 32, pad = 2, scale = 1, smooth = false } = {}) {
  if (!canvas || !atlas || !font) return;
  const baseSize = Math.max(8, Math.round(size));
  const uiScale = Math.max(1, Math.round(scale));
  const renderSize = baseSize * uiScale;
  const plain = stripColorCodes(text);
  const logicalW = Math.max(1, Math.ceil(font.width(renderSize, plain) + pad * 2));
  const logicalH = Math.max(1, Math.ceil(renderSize + pad * 2));
  const dpr = window.devicePixelRatio || 1;

  if (smooth) {
    canvas.width = Math.max(1, Math.floor(logicalW * dpr));
    canvas.height = Math.max(1, Math.floor(logicalH * dpr));
    canvas.style.width = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, logicalW, logicalH);
    drawText(ctx, atlas, font, text, pad, pad, renderSize, true);
    return;
  }

  const pixelScale = uiScale * Math.max(1, Math.round(dpr));
  const outW = logicalW * pixelScale;
  const outH = logicalH * pixelScale;
  canvas.width = outW;
  canvas.height = outH;
  canvas.style.width = `${logicalW}px`;
  canvas.style.height = `${logicalH}px`;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, outW, outH);

  const off = document.createElement('canvas');
  off.width = logicalW;
  off.height = logicalH;
  const octx = off.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.clearRect(0, 0, logicalW, logicalH);
  drawText(octx, atlas, font, text, pad, pad, renderSize, false);
  ctx.drawImage(off, 0, 0, logicalW, logicalH, 0, 0, outW, outH);
}

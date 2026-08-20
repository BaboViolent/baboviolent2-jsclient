// BV2 text input — Writting.cpp: ^1-^9 colour codes + Alt+numpad (dkw.cpp).
// Renders with babo.tga so extended chars (128–159) display correctly.
import { parseColorRuns, TEXT_COLORS } from './colors.js';
import { BitmapFont } from './font.js';

const FONT_SIZE = 14;
const PAD_X = 6;
const PAD_Y = 4;

/** Expand ^0..^9 to internal control bytes (CFont / Writting.cpp). */
export function expandCaretColors(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '^' && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1) - 48;
      if (d >= 0 && d <= 9) {
        out += String.fromCharCode(d);
        i++;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

function insertAt(str, pos, chunk) {
  return str.slice(0, pos) + chunk + str.slice(pos);
}

function removeAt(str, pos) {
  if (pos <= 0) return str;
  return str.slice(0, pos - 1) + str.slice(pos);
}

function digitFromKey(e) {
  if (e.code.startsWith('Digit')) return Number(e.code.slice(5));
  if (e.code.startsWith('Numpad')) return Number(e.code.slice(6));
  return -1;
}

/** Map Unicode code points to Babo font indices (Writting.cpp L60-97). */
function mapExtendedChar(code) {
  const table = {
    199: 128, 252: 129, 233: 130, 226: 131, 228: 132, 224: 133, 229: 134,
    231: 135, 234: 136, 235: 137, 232: 138, 239: 139, 238: 140, 236: 141,
    196: 142, 197: 143, 201: 144, 230: 145, 198: 146, 244: 147, 246: 148,
    242: 149, 251: 150, 249: 151, 255: 152, 214: 153, 220: 154, 248: 155,
    163: 156, 216: 157, 215: 158, 170: 159,
  };
  return table[code] ?? code;
}

/** Convert user-facing caret markup and Unicode Alt characters to BV2 codes. */
export function normalizeBv2Text(text) {
  const expanded = expandCaretColors(text);
  let out = '';
  for (const ch of expanded) {
    const code = mapExtendedChar(ch.charCodeAt(0));
    out += String.fromCharCode(code);
  }
  return out;
}

function charWidth(font, code, size) {
  if (code >= 1 && code <= 9) return 0;
  return (font.kerning[code & 0xff] ?? 0) * size;
}

function widthBefore(text, pos, font, size) {
  let w = 0;
  for (let i = 0; i < pos && i < text.length; i++) {
    w += charWidth(font, text.charCodeAt(i), size);
  }
  return w;
}

function hitTest(text, font, size, clickX) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= text.length; i++) {
    const w = widthBefore(text, i, font, size);
    const d = Math.abs(w - clickX);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function drawGlyph(ctx, atlas, font, code, x, y, size, color) {
  const g = font.chars[code & 0xff];
  if (!g || g.u2 <= g.u1) return 0;
  const w = g.w * size;
  const tw = atlas.width;
  const sx = g.u1 * tw;
  const sy = g.v1 * tw;
  const sw = (g.u2 - g.u1) * tw;
  const sh = (g.v2 - g.v1) * tw;

  ctx.save();
  ctx.globalAlpha = color[3] ?? 1;
  ctx.drawImage(atlas, sx, sy, sw, sh, x, y, w, size);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgb(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)})`;
  ctx.fillRect(x, y, w, size);
  ctx.restore();
  return w;
}

function charAdvance(font, code, size) {
  if (code >= 1 && code <= 9) return 0;
  return (font.kerning[code & 0xff] ?? 0) * size;
}

function drawText(ctx, atlas, font, text, x, y, size) {
  const runs = parseColorRuns(text);
  let penX = x;
  for (const run of runs) {
    for (let i = 0; i < run.text.length; i++) {
      const code = run.text.charCodeAt(i);
      if (code >= 1 && code <= 9) continue;
      const g = font.chars[code & 0xff];
      if (g && g.u2 > g.u1) {
        drawGlyph(ctx, atlas, font, code, penX, y, size, run.color);
      }
      penX += charAdvance(font, code, size);
    }
  }
}

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

/**
 * Attach BV2 colour + Alt-code behaviour to a profile-style text field.
 * @param {HTMLInputElement} input
 * @param {{ maxLength?: number, assets: import('../assets/assetCache.js').AssetCache, getValue: () => string, setValue: (v: string) => void, onChange?: () => void }} opts
 */
export async function attachBv2TextInput(input, { maxLength = 31, assets, getValue, setValue, onChange } = {}) {
  const image = await assets.loadImage('main/fonts/babo.tga');
  const font = new BitmapFont(image);
  const atlas = tgaToCanvas(image);

  const wrap = document.createElement('div');
  wrap.className = 'menu-edit-wrap';
  if (input.classList.contains('menu-edit-wide')) wrap.classList.add('menu-edit-wide');
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const canvas = document.createElement('canvas');
  canvas.className = 'menu-edit-canvas';
  wrap.insertBefore(canvas, input);

  input.classList.add('menu-edit-hidden');
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  input.readOnly = true;

  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'textbox');

  let cursor = 0;
  let altValue = -2;
  let focused = false;
  let cursorAnim = 0;
  let animId = 0;

  const textMetrics = () => {
    // fontSize is returned as resolved pixels; custom properties can retain a
    // literal clamp(...) expression, which Number.parseFloat cannot read.
    const size = Number.parseFloat(getComputedStyle(wrap).fontSize) || FONT_SIZE;
    return { size, y: Math.max(PAD_Y, (wrap.clientHeight - size) / 2) };
  };

  const resizeCanvas = () => {
    const w = wrap.clientWidth || 300;
    const h = wrap.clientHeight || 25;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  };

  const render = () => {
    resizeCanvas();
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const text = getValue();
    cursor = Math.max(0, Math.min(cursor, text.length));
    const { size, y } = textMetrics();

    drawText(ctx, atlas, font, text, PAD_X, y, size);

    if (focused && Math.floor(cursorAnim * 2) % 2 === 0) {
      const cx = PAD_X + widthBefore(text, cursor, font, size);
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx, y, Math.max(1, size / 14), size);
    }
  };

  // Profile controls are constructed while the menu is hidden. Observe the
  // resolved box so the first visible frame uses the same canvas dimensions
  // and vertical text position as focused/blurred renders.
  const resizeObserver = new ResizeObserver(() => render());
  resizeObserver.observe(wrap);

  const pushValue = (next, newCursor = cursor) => {
    const clipped = next.slice(0, maxLength);
    setValue(clipped);
    cursor = Math.max(0, Math.min(newCursor, clipped.length));
    render();
    onChange?.();
  };

  const tickAnim = (t) => {
    cursorAnim += 0.016;
    if (cursorAnim >= 1) cursorAnim -= 1;
    if (focused) {
      render();
      animId = requestAnimationFrame(tickAnim);
    }
  };

  const focusWrap = () => {
    focused = true;
    wrap.focus({ preventScroll: true });
    cursorAnim = 0;
    cancelAnimationFrame(animId);
    animId = requestAnimationFrame(tickAnim);
    render();
  };

  const blurWrap = () => {
    focused = false;
    cancelAnimationFrame(animId);
    render();
  };

  wrap.addEventListener('focus', focusWrap);
  wrap.addEventListener('blur', blurWrap);
  wrap.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    focusWrap();
    const rect = canvas.getBoundingClientRect();
    cursor = hitTest(getValue(), font, textMetrics().size, e.clientX - rect.left - PAD_X);
    render();
  });

  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') {
      if (e.location !== KeyboardEvent.DOM_KEY_LOCATION_RIGHT
        && e.location !== KeyboardEvent.DOM_KEY_LOCATION_LEFT) return;
      altValue = -1;
      return;
    }

    if (e.altKey) {
      const d = digitFromKey(e);
      if (d >= 0) {
        e.preventDefault();
        if (altValue < 0) altValue = d;
        else if (altValue <= 1114111) altValue = altValue * 10 + d;
        return;
      }
    }

    let text = getValue();

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (cursor > 0) pushValue(removeAt(text, cursor), cursor - 1);
      return;
    }

    if (e.key === 'Delete') {
      e.preventDefault();
      if (cursor < text.length) pushValue(text.slice(0, cursor) + text.slice(cursor + 1), cursor);
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      cursor = Math.max(0, cursor - 1);
      cursorAnim = 0;
      render();
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      cursor = Math.min(text.length, cursor + 1);
      cursorAnim = 0;
      render();
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      cursor = 0;
      cursorAnim = 0;
      render();
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      cursor = text.length;
      cursorAnim = 0;
      render();
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      text = text.slice(0, cursor) + text.slice(cursor);

      let ch = e.key.charCodeAt(0);
      if (ch === '^'.charCodeAt(0)) {
        pushValue(insertAt(text, cursor, '^'), cursor + 1);
        return;
      }

      if (ch >= 49 && ch <= 57 && cursor > 0 && text[cursor - 1] === '^') {
        text = removeAt(text, cursor);
        const pos = cursor - 1;
        pushValue(insertAt(text, pos, String.fromCharCode(ch - 48)), pos + 1);
        return;
      }

      if (ch >= 32 && ch <= 126) {
        ch = mapExtendedChar(ch);
        if (ch >= 32 && ch <= 159) {
          pushValue(insertAt(text, cursor, String.fromCharCode(ch)), cursor + 1);
        }
      }
    }
  });

  wrap.addEventListener('keyup', (e) => {
    if (e.key !== 'Alt') return;
    if (altValue >= 0) {
      let code = altValue;
      if (code > 0x10ffff) code &= 0xffff;
      code = mapExtendedChar(code);
      if (code >= 32 && code <= 159) {
        const text = getValue();
        pushValue(insertAt(text.slice(0, cursor) + text.slice(cursor), cursor, String.fromCharCode(code)), cursor + 1);
      }
    }
    altValue = -2;
  });

  wrap.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = expandCaretColors(e.clipboardData?.getData('text') ?? '');
    const text = getValue();
    pushValue((text.slice(0, cursor) + pasted + text.slice(cursor)).slice(0, maxLength), cursor + pasted.length);
  });

  pushValue(getValue(), getValue().length);
  return { refresh: () => { cursor = getValue().length; render(); } };
}

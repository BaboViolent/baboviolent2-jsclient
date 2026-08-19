// Menu panel backgrounds — Menu1Back.tga … Menu5Back.tga with imgColor tint (CUserLogin.cpp:93).

const PANEL_BG = {
  profile: 'Menu1Back',
  browser: 'Menu2Back',
  editor: 'Menu2Back',
  options: 'Menu4Back',
  credits: 'Menu5Back',
};

/** Multiply texture RGB by tint (OpenGL imgColor). */
function tintPixels(pixels, tint) {
  const out = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    out[i] = Math.min(255, Math.round(pixels[i] * tint[0]));
    out[i + 1] = Math.min(255, Math.round(pixels[i + 1] * tint[1]));
    out[i + 2] = Math.min(255, Math.round(pixels[i + 2] * tint[2]));
    out[i + 3] = pixels[i + 3];
  }
  return out;
}

function imageDataToUrl(img, tint = [0, 0.3, 0.7]) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  const data = new ImageData(tintPixels(img.pixels, tint), img.width, img.height);
  ctx.putImageData(data, 0, 0);
  return c.toDataURL('image/png');
}

export async function loadMenuBackgrounds(assets) {
  const tint = [0, 0.3, 0.7];
  const urls = {};
  for (const name of Object.values(PANEL_BG)) {
    if (urls[name]) continue;
    const img = await assets.loadImage(`main/textures/${name}.tga`);
    urls[name] = imageDataToUrl(img, tint);
  }
  return { urls, panel: PANEL_BG };
}

export function applyPanelBackground(frameEl, urls, panelId) {
  const key = PANEL_BG[panelId] ?? 'Menu2Back';
  const url = urls[key];
  if (!url || !frameEl) return;
  frameEl.style.backgroundImage = `url(${url})`;
  frameEl.style.backgroundRepeat = 'repeat';
  frameEl.style.backgroundSize = '256px 256px';
}

// Text colour escapes from CFont.h (^0..^9) and team markers { / } used in kill strings.

export const TEXT_COLORS = {
  0: [0, 0, 0, 1],
  1: [0.35, 0.55, 1, 1],
  2: [0.4, 1, 0.45, 1],
  3: [0.45, 0.95, 0.95, 1],
  4: [1, 0.35, 0.35, 1],
  5: [0.85, 0.45, 0.85, 1],
  6: [0.75, 0.55, 0.25, 1],
  7: [0.65, 0.65, 0.65, 1],
  8: [1, 0.95, 0.4, 1],
  9: [1, 1, 1, 1],
};

/** Split a BV2 string into coloured runs (control bytes are not drawn). */
export function parseColorRuns(text, defaultColor = TEXT_COLORS[9]) {
  const runs = [];
  let color = defaultColor;
  let buf = '';
  const flush = () => {
    if (!buf) return;
    runs.push({ text: buf, color });
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    if (code >= 0 && code <= 9) {
      flush();
      color = TEXT_COLORS[code] ?? defaultColor;
    } else if (ch === '{') {
      flush();
      color = TEXT_COLORS[1];
    } else if (ch === '}') {
      flush();
      color = TEXT_COLORS[4];
    } else {
      buf += ch;
    }
  }
  flush();
  return runs.length ? runs : [{ text: '', color: defaultColor }];
}

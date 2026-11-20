// scripts/modules/ui/dark-colour.mjs v1.0.0 - 2026-11-20
// v1.0.0: Pure colour arithmetic for the dark dialog palette. Turns a colour
//         written for the light dialogs into its navy / crimson / yellow
//         counterpart: light surfaces become navy panels, tinted washes keep
//         their hue as a dark wash, mid-tone signal colours (FEAT green,
//         yellow, red, button fills) are left alone, and text is lifted only
//         as far as it needs to read on what is now behind it.
//         No Foundry and no DOM: importable from node (tools/test-dark-colour.mjs).

export const DARK = Object.freeze({
  bg: "#0a1220",
  panel: "#0f1b2b",
  panel2: "#162638",
  raise: "#213550",
  well: "#08111c",
  line: "#33475d",
  frame: "#6b82a0",
  text: "#f4ecdd",
  textSoft: "#d3cab9",
  textMuted: "#a3adba",
  ink: "#14110c",
  gold: "#f5cf45",
  goldLit: "#f8f070",
  crimson: "#a31f2d"
});

const NAVY_HUE = 212;
const NAMED = {
  white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0], green: [0, 128, 0],
  blue: [0, 0, 255], yellow: [255, 255, 0], orange: [255, 165, 0], purple: [128, 0, 128],
  gray: [128, 128, 128], grey: [128, 128, 128], silver: [192, 192, 192],
  lightgray: [211, 211, 211], lightgrey: [211, 211, 211], darkgray: [169, 169, 169],
  darkgrey: [169, 169, 169], darkred: [139, 0, 0], darkgreen: [0, 100, 0],
  darkblue: [0, 0, 139], gold: [255, 215, 0], maroon: [128, 0, 0], navy: [0, 0, 128],
  whitesmoke: [245, 245, 245], gainsboro: [220, 220, 220], dimgray: [105, 105, 105],
  dimgrey: [105, 105, 105], crimson: [220, 20, 60], goldenrod: [218, 165, 32]
};

const COLOUR_TOKEN = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;

function _clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export function parseColour(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (!s || s === "transparent") return s ? { r: 0, g: 0, b: 0, a: 0 } : null;
  if (s[0] === "#") {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = [...h].map(c => parseInt(c + c, 16));
      return { r, g, b, a: a === undefined ? 1 : a / 255 };
    }
    if (h.length === 6 || h.length === 8) {
      const n = i => parseInt(h.slice(i, i + 2), 16);
      return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
    }
    return null;
  }
  let m = s.match(/^rgba?\(([^)]*)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = p => p.endsWith("%") ? parseFloat(p) * 2.55 : parseFloat(p);
    const [r, g, b] = parts.slice(0, 3).map(ch);
    let a = 1;
    if (parts[3] !== undefined) a = parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return { r: _clamp(Math.round(r), 0, 255), g: _clamp(Math.round(g), 0, 255), b: _clamp(Math.round(b), 0, 255), a: _clamp(a, 0, 1) };
  }
  m = s.match(/^hsla?\(([^)]*)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const h = parseFloat(parts[0]), sat = parseFloat(parts[1]) / 100, l = parseFloat(parts[2]) / 100;
    let a = 1;
    if (parts[3] !== undefined) a = parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    if ([h, sat, l, a].some(Number.isNaN)) return null;
    return { ...hslToRgb(h, sat, l), a: _clamp(a, 0, 1) };
  }
  if (NAMED[s]) { const [r, g, b] = NAMED[s]; return { r, g, b, a: 1 }; }
  return null;
}

export function formatColour({ r, g, b, a = 1 }) {
  if (a < 1) return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

export function rgbToHsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: _clamp(s, 0, 1), l, chroma: d };
}

export function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [R, G, B] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  const to = v => _clamp(Math.round((v + m) * 255), 0, 255);
  return { r: to(R), g: to(G), b: to(B) };
}

export function luminance({ r, g, b }) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `top` painted over `under`, both {r,g,b,a}. */
export function blend(top, under) {
  const a = top.a ?? 1;
  const mix = k => Math.round(top[k] * a + under[k] * (1 - a));
  return { r: mix("r"), g: mix("g"), b: mix("b"), a: 1 };
}

// Creams and parchments (warm, faint) count as neutral; a faint green, pink
// or blue wash does not, so it keeps its hue as a dark wash.
function _isNeutral(hsl) {
  const warm = hsl.h >= 25 && hsl.h <= 70;
  return hsl.chroma < (warm ? 0.085 : 0.035);
}

/**
 * A fill written for the light dialogs, as it should be on navy.
 * Returns the same object when the colour is left alone.
 */
export function mapSurface(c) {
  if (!c || c.a < 0.35) return c;
  const hsl = rgbToHsl(c);
  let out;
  if (_isNeutral(hsl)) {
    let l;
    if (hsl.l >= 0.6) l = 0.154 + (1 - hsl.l) * 0.5;
    else if (hsl.l >= 0.35) l = 0.34;
    else l = _clamp(hsl.l * 0.5, 0.045, 0.12);
    out = hslToRgb(NAVY_HUE, hsl.l >= 0.35 ? 0.42 : 0.4, l);
  } else if (hsl.l >= 0.8) {
    out = hslToRgb(hsl.h, _clamp(hsl.s, 0.3, 0.5), 0.11 + (1 - hsl.l) * 0.4);
  } else {
    return c;
  }
  return { ...out, a: c.a };
}

/** A border or rule line. */
export function mapLine(c) {
  if (!c || c.a < 0.35) return c;
  const hsl = rgbToHsl(c);
  let out;
  if (_isNeutral(hsl)) {
    out = hslToRgb(NAVY_HUE, 0.3, 0.28 + (1 - hsl.l) * 0.27);
  } else if (hsl.l >= 0.75) {
    out = hslToRgb(hsl.h, Math.min(hsl.s, 0.6), 0.38);
  } else if (hsl.l < 0.42) {
    out = hslToRgb(hsl.h, Math.min(hsl.s, 0.65), 0.46);
  } else {
    return c;
  }
  return { ...out, a: c.a };
}

/**
 * Text colour `c` on background `bg` (opaque). Left alone when it already
 * reads; otherwise moved along its own hue until it does.
 *
 * `authored` says the dialog chose this colour itself. On a navy backdrop
 * that makes no difference. On a fill that stayed bright (a FEAT colour, a
 * signal button) an authored colour is the pairing the light dialog already
 * had, so it is kept; a colour that merely arrived by inheritance is not.
 */
export function mapText(c, bg, { minContrast = 4.5, authored = true } = {}) {
  if (!c || c.a < 0.35 || !bg) return c;
  if (contrast(c, bg) >= minContrast) return c;
  const hsl = rgbToHsl(c);
  const ink = { ...parseColour(DARK.ink), a: c.a };
  if (luminance(bg) >= 0.1) {
    if (authored) return c;
    if (hsl.chroma < 0.2) return ink;
    let l = hsl.l;
    while (l > 0.06) {
      l -= 0.02;
      const out = { ...hslToRgb(hsl.h, hsl.s, l), a: c.a };
      if (contrast(out, bg) >= minContrast) return out;
    }
    return ink;
  }
  if (_isNeutral(hsl)) {
    const pick = hsl.l < 0.3 ? DARK.text : hsl.l < 0.5 ? DARK.textSoft : DARK.textMuted;
    return { ...parseColour(pick), a: c.a };
  }
  const target = Math.max(minContrast, 5.2);
  const sat = Math.min(hsl.s, 0.95);
  let l = hsl.l;
  while (l < 0.96) {
    l += 0.02;
    const out = { ...hslToRgb(hsl.h, sat, l), a: c.a };
    if (contrast(out, bg) >= target) return out;
  }
  return { ...parseColour(DARK.text), a: c.a };
}

/** Map every colour token in a CSS value (a gradient, a shadow) with `fn`. */
export function mapColourTokens(value, fn) {
  let changed = false;
  const out = String(value).replace(COLOUR_TOKEN, token => {
    const c = parseColour(token);
    if (!c) return token;
    const m = fn(c);
    if (!m || m === c) return token;
    changed = true;
    return formatColour(m);
  });
  return changed ? out : value;
}

/** First opaque-ish colour in a gradient, as a stand-in for the fill behind text. */
export function gradientColour(value) {
  const tokens = String(value ?? "").match(COLOUR_TOKEN) ?? [];
  const cols = tokens.map(parseColour).filter(c => c && c.a >= 0.5);
  if (!cols.length) return null;
  const avg = k => Math.round(cols.reduce((n, c) => n + c[k], 0) / cols.length);
  return { r: avg("r"), g: avg("g"), b: avg("b"), a: 1 };
}

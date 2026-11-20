import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DARK, parseColour, formatColour, luminance, contrast, blend,
  mapSurface, mapLine, mapText, mapColourTokens, gradientColour,
} from '../scripts/modules/ui/dark-colour.mjs';

const P = parseColour;
const hex = c => formatColour(c);
const panel = P(DARK.panel);

assert.deepEqual(P('#fff'), { r: 255, g: 255, b: 255, a: 1 });
assert.deepEqual(P('#8b0000'), { r: 139, g: 0, b: 0, a: 1 });
assert.deepEqual(P('rgb(102, 102, 102)'), { r: 102, g: 102, b: 102, a: 1 });
assert.equal(P('rgba(0,0,0,.5)').a, 0.5);
assert.deepEqual(P('white'), { r: 255, g: 255, b: 255, a: 1 });
assert.equal(P('transparent').a, 0);
assert.equal(P('var(--gold)'), null, 'variables are left to the stylesheet');
assert.equal(P('currentColor'), null);
assert.equal(hex(P('#Fef102')), '#fef102');

for (const light of ['#fff', '#fafafa', '#f5f5f0', '#fcf8eb', '#faf8f2', '#eee', '#ddd', '#ccc']) {
  const out = mapSurface(P(light));
  assert.ok(luminance(out) < 0.06, `${light} becomes a navy panel, got ${hex(out)}`);
  assert.ok(out.b > out.r, `${light} is navy, not grey`);
}
assert.ok(luminance(mapSurface(P('#ddd'))) > luminance(mapSurface(P('#fff'))), 'a grey fill stays distinct from a white one');

for (const [wash, channel] of [['#e8f5e9', 'g'], ['#ffebee', 'r'], ['#e3f2fd', 'b']]) {
  const out = mapSurface(P(wash));
  assert.ok(luminance(out) < 0.06, `${wash} becomes a dark wash`);
  const others = ['r', 'g', 'b'].filter(k => k !== channel);
  assert.ok(others.every(k => out[channel] >= out[k]), `${wash} keeps its hue, got ${hex(out)}`);
}

for (const amber of ['#fff3e0', '#fff8e1', '#fff9c4', '#fff3cd']) {
  const out = mapSurface(P(amber));
  assert.ok(out.b > out.g && out.g > out.r, `${amber} becomes navy, not brown, got ${hex(out)}`);
  assert.ok(luminance(out) > luminance(mapSurface(P('#fff'))), `${amber} sits raised above a plain panel`);
}

for (const signal of ['#00a94e', '#fef102', '#ee1e25', '#4caf50', '#f9a825', '#c62828', '#8b0000']) {
  const c = P(signal);
  assert.equal(mapSurface(c), c, `${signal} is a signal colour and is left alone`);
}
const faint = P('rgba(0,0,0,.05)');
assert.equal(mapSurface(faint), faint, 'a faint tint is left alone');

for (const dark of ['#666', '#555', '#333', '#1a1a1a', '#8b0000', '#c62828', '#2e7d32', '#1565c0', '#6a1b9a', '#e65100']) {
  const out = mapText(P(dark), panel);
  assert.ok(contrast(out, panel) >= 4.5, `${dark} reads on navy, got ${hex(out)}`);
}
assert.equal(hex(mapText(P('#333'), panel)), DARK.text);
assert.equal(hex(mapText(P('#666'), panel)), DARK.textSoft);
const red = mapText(P('#c62828'), panel);
assert.ok(red.r > red.g && red.r > red.b, 'red text stays red');
const white = P('#fff');
assert.equal(mapText(white, panel), white, 'text that already reads is left alone');

const green = P('#00a94e');
assert.equal(mapText(white, green), white, 'white on FEAT green is the pairing the light dialog had');
assert.equal(hex(mapText(P(DARK.text), P('#fef102'), { authored: false })), DARK.ink, 'inherited light text on FEAT yellow becomes ink');
const ink222 = P('#222');
assert.equal(mapText(ink222, P('#fef102')), ink222, 'dark text on FEAT yellow is left alone');

assert.ok(luminance(mapLine(P('#000'))) > luminance(mapLine(P('#ddd'))), 'the heavier the light line, the brighter the dark one');
const midGreen = P('#4caf50');
assert.equal(mapLine(midGreen), midGreen, 'a mid-tone signal line is left alone');
assert.ok(luminance(mapLine(P('#8b0000'))) > luminance(P('#8b0000')), 'a dark coloured line is lifted so it shows on navy');

const grad = mapColourTokens('linear-gradient(90deg, #fff 0%, #eee 100%)', mapSurface);
assert.ok(!grad.includes('#fff') && grad.startsWith('linear-gradient(90deg, #'));
assert.equal(mapColourTokens('linear-gradient(90deg, #c62828, #8b0000)', mapSurface), 'linear-gradient(90deg, #c62828, #8b0000)');
assert.deepEqual(gradientColour('linear-gradient(#000, #fff)'), { r: 128, g: 128, b: 128, a: 1 });
assert.deepEqual(blend({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 }), { r: 128, g: 128, b: 128, a: 1 });

const theme = readFileSync(new URL('../scripts/modules/ui/sheet-theme.js', import.meta.url), 'utf8');
assert.match(theme, /if \(isThemedDialog\(app\)\) \{ applyDialogTheme\(app, element\); return; \}/, 'dialogs are themed before the light pin');
const system = JSON.parse(readFileSync(new URL('../system.json', import.meta.url), 'utf8'));
const order = name => system.styles.indexOf(`styles/${name}`);
assert.ok(order('dialog-dark.css') > order('action-dialog.css'), 'dialog-dark.css loads after the light dialog styles');
assert.ok(order('dialog-dark.css') > order('team-tracker.css') && order('dialog-dark.css') > order('global.css'));
for (const light of ['item-sheet.css', 'power-sheet-v2.css', 'talent-sheet.css', 'contact-sheet.css', 'hq-sheet.css', 'equipment-sheet-redesign.css', 'vehicle-sheet.css', 'global.css']) {
  assert.ok(order('item-sheet-dark.css') > order(light), `item-sheet-dark.css loads after ${light}`);
}
assert.ok(order('vehicle-sheet-dark.css') > order('vehicle-sheet.css') && order('vehicle-sheet-dark.css') > order('global.css'));
assert.match(theme, /if \(isItemSheet\(app\) \|\| isVehicleSheet\(app\)\) \{ _themeSheet\(app, element\); return; \}/, 'item and vehicle sheets are themed before the light pin');
for (const file of ['dialog-dark.css', 'item-sheet-dark.css', 'vehicle-sheet-dark.css']) {
  const css = readFileSync(new URL(`../styles/${file}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of css.split('}')) {
    const selector = rule.split('{')[0].trim();
    if (!selector) continue;
    for (const part of selector.split(/,(?![^()]*\))/)) {
      assert.match(part, /faserip-dark-palette|faserip-theming|faserip-recolouring/, `${file}: every rule is scoped to the dark palette: ${part.trim()}`);
    }
  }
}

console.log('dark-colour: all assertions passed');

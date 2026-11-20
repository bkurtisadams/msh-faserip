// scripts/modules/ui/dialog-theme.js v1.0.0 - 2026-11-20
// v1.0.0: Light or dark for the FASERIP dialogs, following Foundry's own
//         choice (Configure Settings > Core > UI > Applications, then the
//         browser / OS preference). Two halves:
//         1. the palette class, which styles/dialog-dark.css keys on;
//         2. the colours the dialogs write straight into style="" (about
//            three thousand of them across sixty files, many computed at run
//            time), which no stylesheet can reach. Those are re-coloured in
//            place while the dialog is dark and put back when it goes light.
//         game.msh.explainDialogTheme() prints what each open dialog resolved to.

import { applySheetTheme, resolveFoundryTheme } from "./sheet-theme.js";
import {
  DARK, parseColour, formatColour, mapSurface, mapLine, mapText, mapColourTokens,
  gradientColour, blend, contrast, rgbToHsl
} from "./dark-colour.mjs";

const PALETTE_CLASS = "faserip-dark-palette";
const SETTLING_CLASS = "faserip-theming";
const PASS_CLASS = "faserip-recolouring";
const SETTLE_MS = 350;
const LINE_PROPS = ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "outline-color"];
const SKIP_TAGS = new Set(["IMG", "SVG", "CANVAS", "VIDEO", "OPTION", "OPTGROUP"]);
const NO_TEXT_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA", "OPTION", "OPTGROUP", "STYLE", "SCRIPT", "IMG", "SVG", "CANVAS", "VIDEO"]);
const PANEL = parseColour(DARK.panel);
const GUARD = "guard:color";

const _live = new Map();

/** A window this module themes: every shim dialog, every DialogV2, and the system's own "-dialog" windows. */
export function isThemedDialog(app) {
  const classes = app?.options?.classes ?? [];
  if (classes.includes("faserip-shim-dialog")) return true;
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2 && app instanceof DialogV2) return true;
  const system = classes.some(c => c === "faserip" || c === "msh" || c.startsWith("faserip-") || c.startsWith("msh-"));
  return system && classes.some(c => c.endsWith("-dialog"));
}

function _view(el) {
  return el?.ownerDocument?.defaultView ?? globalThis;
}

function _hasOwnText(el) {
  for (const node of el.childNodes) if (node.nodeType === 3 && node.nodeValue.trim()) return true;
  return false;
}

// A FEAT "white" swatch has to stay white: on navy it would read as no colour at all.
function _isWhiteSwatch(el, colour) {
  if (!colour || colour.a < 0.9) return false;
  const hsl = rgbToHsl(colour);
  if (hsl.l < 0.85 || hsl.chroma > 0.04) return false;
  if (el.classList.contains("is-white")) return true;
  const text = (el.textContent ?? "").trim();
  return text.length > 0 && text.length <= 40 && /\bwhite\b/i.test(text);
}

function _backdrop(el, root) {
  const view = _view(el);
  const layers = [];
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const cs = view.getComputedStyle(node);
    let c = null;
    const image = cs.backgroundImage;
    if (image && image !== "none" && image.includes("gradient")) c = gradientColour(image);
    if (!c) {
      const fill = parseColour(cs.backgroundColor);
      if (fill && fill.a > 0.02) c = fill;
    }
    if (c) {
      layers.push(c);
      if (c.a >= 0.98) break;
    }
    if (node === root) break;
  }
  return layers.reduceRight((under, top) => blend(top, under), PANEL);
}

function _entry(state, el) {
  let props = state.entries.get(el);
  if (!props) {
    state.entries.set(el, props = new Map());
    if (!state.attrs.has(el)) state.attrs.set(el, el.getAttribute("style"));
  }
  return props;
}

// The value the dialog itself wrote: what is there now, unless what is there now is ours.
function _original(state, el, prop) {
  const now = el.style.getPropertyValue(prop);
  const rec = state.entries.get(el)?.get(prop);
  if (rec && now === rec.read) return { value: rec.orig, priority: rec.priority };
  return { value: now, priority: el.style.getPropertyPriority(prop) };
}

function _write(state, el, prop, orig, mapped) {
  const props = _entry(state, el);
  if (mapped === null || mapped === orig.value) {
    const rec = props.get(prop);
    if (rec && el.style.getPropertyValue(prop) === rec.read) _put(el, prop, rec.orig, rec.priority);
    props.delete(prop);
    return;
  }
  const rec = props.get(prop);
  if (rec && rec.orig === orig.value && rec.mapped === mapped && el.style.getPropertyValue(prop) === rec.read) return;
  _put(el, prop, mapped, orig.priority);
  props.set(prop, { orig: orig.value, priority: orig.priority, mapped, read: el.style.getPropertyValue(prop) });
}

function _put(el, prop, value, priority) {
  if (value) el.style.setProperty(prop, value, priority || "");
  else el.style.removeProperty(prop);
}

function _mapOne(value, fn) {
  const c = parseColour(value);
  if (!c) return null;
  const m = fn(c);
  return m && m !== c ? formatColour(m) : null;
}

function _recolour(state) {
  const root = state.root;
  if (!root?.isConnected) return;
  for (const el of state.entries.keys()) if (!el.isConnected) state.entries.delete(el);
  for (const el of state.attrs.keys()) if (!el.isConnected) state.attrs.delete(el);

  const styled = new Set();
  for (const el of root.querySelectorAll("[style]")) {
    if (!SKIP_TAGS.has(el.tagName.toUpperCase())) styled.add(el);
  }
  for (const el of state.entries.keys()) styled.add(el);

  // Fills and lines first: they do not depend on anything around them.
  for (const el of styled) {
    const fill = _original(state, el, "background-color");
    if (fill.value) {
      const c = parseColour(fill.value);
      const keep = c && _isWhiteSwatch(el, c);
      const mapped = c && !keep ? mapSurface(c) : c;
      _write(state, el, "background-color", fill, mapped && mapped !== c ? formatColour(mapped) : null);
    }
    const image = _original(state, el, "background-image");
    if (image.value && image.value.includes("gradient")) {
      const mapped = mapColourTokens(image.value, mapSurface);
      _write(state, el, "background-image", image, mapped === image.value ? null : mapped);
    }
    for (const prop of LINE_PROPS) {
      const line = _original(state, el, prop);
      if (line.value) _write(state, el, prop, line, _mapOne(line.value, mapLine));
    }
  }

  // Text the dialog coloured itself, against whatever is now behind it.
  const own = new Set();
  for (const el of styled) {
    const lift = state.entries.get(el)?.get(GUARD);
    if (lift && el.style.getPropertyValue("color") === lift.read) continue;
    const text = _original(state, el, "color");
    if (!text.value) continue;
    const c = parseColour(text.value);
    if (!c) continue;
    own.add(el);
    const mapped = mapText(c, _backdrop(el, root));
    _write(state, el, "color", text, mapped !== c ? formatColour(mapped) : null);
  }

  // Everything else that carries text: coloured by a stylesheet this palette
  // has no counterpart for, or inheriting light text onto a fill that stayed
  // bright (a FEAT colour, a signal button). Lifted only when it cannot be read.
  // Earlier lifts are taken off first so each is judged afresh; transitions
  // are held meanwhile, or taking one off would be read (and seen) mid-fade.
  const view = _view(root);
  const lifted = [];
  for (const [el, props] of state.entries) if (props.has(GUARD)) lifted.push([el, props]);
  if (lifted.length) root.classList.add(PASS_CLASS);
  for (const [el, props] of lifted) {
    if (el.style.getPropertyValue("color") === props.get(GUARD).read) el.style.removeProperty("color");
    props.delete(GUARD);
  }
  const content = root.querySelector(".window-content") ?? root;
  const lift = [];
  for (const el of content.querySelectorAll("*")) {
    if (own.has(el) || NO_TEXT_TAGS.has(el.tagName.toUpperCase()) || !_hasOwnText(el)) continue;
    if (el.style.getPropertyValue("color")) continue;
    const c = parseColour(view.getComputedStyle(el).color);
    if (!c || c.a < 0.35) continue;
    const backdrop = _backdrop(el, root);
    if (contrast(c, backdrop) >= 3) continue;
    const mapped = mapText(c, backdrop, { authored: false });
    if (mapped !== c) lift.push([el, formatColour(mapped)]);
  }
  for (const [el, value] of lift) {
    const props = _entry(state, el);
    el.style.setProperty("color", value);
    props.set(GUARD, { orig: "", priority: "", mapped: value, read: el.style.getPropertyValue("color") });
  }
  if (lifted.length) {
    void root.offsetWidth;
    root.classList.remove(PASS_CLASS);
  }
}

function _restore(state) {
  for (const [el, props] of state.entries) {
    for (const [key, rec] of props) {
      const prop = key === GUARD ? "color" : key;
      if (el.style.getPropertyValue(prop) === rec.read) _put(el, prop, rec.orig, rec.priority);
    }
  }
  state.entries.clear();

  // Writing a property makes the browser re-spell the whole style attribute
  // (#666 comes back as rgb(102, 102, 102)). Where nothing else has changed
  // since, put the attribute back exactly as the dialog wrote it, so rules
  // and scripts that match on its text still do.
  const scratch = state.root.ownerDocument.createElement("div");
  for (const [el, attr] of state.attrs) {
    if (!el.isConnected) continue;
    if (attr === null) {
      if (!el.style.length) el.removeAttribute("style");
      continue;
    }
    scratch.setAttribute("style", attr);
    if (scratch.style.cssText === el.style.cssText) el.setAttribute("style", attr);
  }
  state.attrs.clear();
}

function _run(state) {
  state.queued = false;
  if (!state.root?.isConnected) return;
  try { _recolour(state); }
  catch (e) { console.warn("[FASERIP] dialog recolour failed:", e); }
  state.observer?.takeRecords();
}

// Once on the next frame, and once more after the dialogs' own colour
// transitions (0.25s) have finished, so text is judged against settled fills.
function _schedule(state) {
  const view = _view(state.root);
  if (!state.queued) {
    state.queued = true;
    (view.requestAnimationFrame ?? setTimeout)(() => _run(state));
  }
  view.clearTimeout(state.settle);
  state.settle = view.setTimeout(() => _run(state), SETTLE_MS);
}

function _start(app, root) {
  let state = _live.get(app);
  if (state && state.root !== root) { _stop(app); state = null; }
  if (!state) {
    state = { root, entries: new Map(), attrs: new Map(), queued: false, settle: 0, observer: null };
    const Observer = _view(root).MutationObserver ?? globalThis.MutationObserver;
    if (Observer) {
      state.observer = new Observer(() => _schedule(state));
      state.observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
    }
    _live.set(app, state);
  }
  _run(state);
}

function _stop(app) {
  const state = _live.get(app);
  if (!state) return;
  state.observer?.disconnect();
  _view(state.root).clearTimeout(state.settle);
  try { _restore(state); } catch (_) { /* window already gone */ }
  _live.delete(app);
}

/** Put Foundry's theme on one dialog. Safe to call on every render. */
export function applyDialogTheme(app, element = app?.element) {
  if (!element?.classList) return;
  const { theme } = resolveFoundryTheme();
  const dark = theme === "dark";
  if (element.classList.contains(PALETTE_CLASS) !== dark) _holdTransitions(element);
  applySheetTheme(element, theme);
  if (dark) _start(app, element);
  else _stop(app);
}

// The palette swaps in one step: the dialogs' colour transitions are held
// for two frames so nothing is read, or seen, halfway between the two.
function _holdTransitions(element) {
  const view = _view(element);
  const frame = view.requestAnimationFrame ?? (fn => view.setTimeout(fn, 16));
  element.classList.add(SETTLING_CLASS);
  frame(() => frame(() => element.classList.remove(SETTLING_CLASS)));
}

/** The dialog closed: drop its observer. */
export function releaseDialogTheme(app) {
  const state = _live.get(app);
  if (!state) return;
  state.observer?.disconnect();
  _view(state.root)?.clearTimeout?.(state.settle);
  _live.delete(app);
}

function _openDialogs() {
  const apps = [];
  for (const app of foundry.applications?.instances?.values?.() ?? []) {
    if (app?.element && isThemedDialog(app)) apps.push(app);
  }
  return apps;
}

/** Re-apply the theme to every open dialog. No re-render: what was typed stays put. */
export function refreshDialogThemes() {
  for (const app of _openDialogs()) applyDialogTheme(app);
}

/** Console diagnostic: what each open dialog resolved to, and how much was re-coloured. */
export function explainDialogTheme() {
  const { theme, source } = resolveFoundryTheme();
  const rows = _openDialogs().map(app => {
    const state = _live.get(app);
    let recoloured = 0;
    for (const props of state?.entries.values() ?? []) recoloured += props.size;
    return {
      dialog: app.title ?? app.options?.window?.title ?? app.id,
      paletteClass: app.element.classList.contains(PALETTE_CLASS),
      recoloured
    };
  });
  console.log("[FASERIP] Dialog theme", { theme, source, openDialogs: rows.length });
  if (rows.length) console.table(rows);
  else console.log("[FASERIP] No dialog is open. Open one and run this again.");
  return rows;
}

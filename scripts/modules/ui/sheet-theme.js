// scripts/modules/ui/sheet-theme.js v1.5.0 - 2026-11-20
// v1.5.0: Registers the chat card theme (modules/ui/chat-theme.js) and
//         refreshes chat cards with everything else when a setting changes.
// v1.4.0: The Karma sheet and the Team Karma Pool window follow Foundry as
//         well (styles/karma-sheet-dark.css), reading the theme of the
//         character they belong to.
// v1.3.0: The vehicle actor sheet follows Foundry as well
//         (styles/vehicle-sheet-dark.css). Only the tool windows stay light.
// v1.2.0: The item sheets (power, stunt power, talent, equipment, contact,
//         headquarters, vehicle item, plain item) follow Foundry the same way
//         the character sheet does, their own Sheet Configuration theme
//         included. Their palette is styles/item-sheet-dark.css. The vehicle
//         actor sheet and the tool windows stay light.
// v1.1.0: Dialogs follow Foundry too (modules/ui/dialog-theme.js): every shim
//         dialog, every DialogV2 and the system's own "-dialog" windows take
//         Foundry's Applications colour scheme, then the browser preference.
//         Sheets other than the character sheet, and the tool windows, stay
//         light. resolveFoundryTheme() is the part of the resolution that
//         needs no document.
// v1.0.0: Light or dark for the character sheet follows Foundry's own choice,
//         replacing the "Character Sheet Colors" system setting. In order:
//         a theme set for this one sheet in Foundry's Sheet Configuration,
//         then Configure Settings > Core > UI > Applications, then the
//         browser / OS preference when Foundry is left on its default.
//         Open sheets switch at once when any of those change. Every other
//         FASERIP window, the vehicle sheet included, stays on the light
//         palette as before. game.msh.explainSheetTheme() prints what was
//         resolved and why.

import { isThemedDialog, applyDialogTheme, applyPalette, releaseDialogTheme, refreshDialogThemes, explainDialogTheme } from "./dialog-theme.js";

import { registerChatTheme, refreshChatThemes } from "./chat-theme.js";

const PALETTE_CLASS = "faserip-dark-palette";

/** The hero / villain / npc sheet. The vehicle sheet shares the shell but has its own palette (isVehicleSheet). */
export function isCharacterSheet(app) {
  const classes = app?.options?.classes ?? [];
  if (!classes.includes("faserip-sheet") || !classes.includes("actor")) return false;
  if (classes.includes("vehicle") || app?.document?.type === "vehicle") return false;
  return true;
}

/** Any FASERIP item sheet: classes faserip + sheet + item. */
export function isItemSheet(app) {
  const classes = app?.options?.classes ?? [];
  return classes.includes("faserip") && classes.includes("sheet") && classes.includes("item");
}

/** The vehicle actor sheet: the character sheet's shell with its own look. */
export function isVehicleSheet(app) {
  const classes = app?.options?.classes ?? [];
  return classes.includes("faserip-vehicle-window");
}

/** The Karma sheet and the Team Karma Pool window. */
export function isKarmaSheet(app) {
  const classes = app?.options?.classes ?? [];
  return classes.includes("faserip") && classes.includes("sheet") && (classes.includes("karma") || classes.includes("karma-pool"));
}

function _paletted(app) {
  return isItemSheet(app) || isVehicleSheet(app) || isKarmaSheet(app);
}

function _valid(value) {
  return value === "dark" || value === "light";
}

function _setting(key) {
  try { return game.settings.get("core", key); } catch (_) { return undefined; }
}

/**
 * Work out which theme Foundry wants for this sheet.
 * @returns {{theme: "light"|"dark", source: string}}
 */
export function resolveSheetTheme(app) {
  const doc = app?.document ?? app?.actor ?? null;

  // 1. A theme chosen for this sheet in Foundry's Sheet Configuration.
  //    Read from the stored values on every call, never from the classes
  //    Foundry stamped on the window when it was built: those go stale when
  //    the setting changes while the sheet stays open.
  const sheetThemes = _setting("sheetThemes");
  const perDocument = sheetThemes?.documents?.[doc?.uuid];
  if (_valid(perDocument)) return { theme: perDocument, source: "sheet configuration" };
  let flag;
  try { flag = doc?.getFlag?.("core", "sheetTheme"); } catch (_) { flag = undefined; }
  if (_valid(flag)) return { theme: flag, source: "sheet configuration" };
  const typeDefault = sheetThemes?.defaults?.[doc?.documentName]?.[doc?.type];
  if (_valid(typeDefault)) return { theme: typeDefault, source: "sheet configuration (default for this type)" };

  return resolveFoundryTheme();
}

/**
 * Foundry's theme for application windows, with no sheet in the picture.
 * @returns {{theme: "light"|"dark", source: string}}
 */
export function resolveFoundryTheme() {
  // 2. Foundry's colour scheme for application windows.
  const scheme = _setting("uiConfig")?.colorScheme?.applications;
  if (_valid(scheme)) return { theme: scheme, source: "Foundry UI setting (Applications)" };

  // 3. Foundry left on its default: the browser / OS preference decides.
  const prefersDark = globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches === true;
  return { theme: prefersDark ? "dark" : "light", source: "browser preference" };
}

/** Put a theme on a window's root element. The dark stylesheet keys on PALETTE_CLASS alone. */
export function applySheetTheme(element, theme) {
  if (!element?.classList) return;
  const dark = theme === "dark";
  element.classList.toggle(PALETTE_CLASS, dark);
  element.classList.toggle("theme-dark", dark);
  element.classList.toggle("theme-light", !dark);
  element.classList.add("themed");
}

function _openCharacterSheets() {
  const apps = [];
  for (const app of foundry.applications?.instances?.values?.() ?? []) {
    if (app?.element && (isCharacterSheet(app) || _paletted(app))) apps.push(app);
  }
  return apps;
}

function _themeSheet(app, element = app.element) {
  const { theme } = resolveSheetTheme(app);
  if (_paletted(app)) applyPalette(app, element, theme);
  else applySheetTheme(element, theme);
}

/** Re-apply the theme to every open character and item sheet. No re-render: fields and scroll stay put. */
export function refreshSheetThemes() {
  for (const app of _openCharacterSheets()) _themeSheet(app);
}

/** Console diagnostic: what each open character sheet resolved to, and from where. */
export function explainSheetTheme() {
  const rows = _openCharacterSheets().map(app => {
    const { theme, source } = resolveSheetTheme(app);
    return {
      sheet: app.title ?? app.document?.name ?? app.id,
      theme,
      source,
      paletteClass: app.element.classList.contains(PALETTE_CLASS),
      classes: app.element.className
    };
  });
  const foundryApplications = _setting("uiConfig")?.colorScheme?.applications;
  console.log("[FASERIP] Sheet theme", {
    foundryApplications: foundryApplications === "" ? "(browser default)" : foundryApplications,
    browserPrefersDark: globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches === true,
    openSheets: rows.length
  });
  if (rows.length) console.table(rows);
  else console.log("[FASERIP] No character or item sheet is open. Open one and run this again.");
  return rows;
}

let _registered = false;

/** Register the hooks. Called once from init.js at load. */
export function registerSheetTheme() {
  if (_registered) return;
  _registered = true;

  // Every FASERIP window is themed on each render. Character sheets and
  // dialogs follow Foundry; the other system windows are a fixed light design
  // and are pinned to light so a dark Foundry does not bleed dark text
  // colours into them.
  Hooks.on("renderApplicationV2", (app, element) => {
    if (isThemedDialog(app)) { applyDialogTheme(app, element); return; }
    if (_paletted(app)) { _themeSheet(app, element); return; }
    const classes = app.options?.classes ?? [];
    if (!classes.some(c => c.startsWith("faserip") || c.startsWith("msh"))) return;
    applySheetTheme(element, isCharacterSheet(app) ? resolveSheetTheme(app).theme : "light");
  });

  // Foundry's theme changed while sheets are open. Deferred one tick so
  // Foundry's own class changes land first.
  const refreshAll = () => { refreshSheetThemes(); refreshDialogThemes(); refreshChatThemes(); };
  const onSetting = key => {
    if (/(^|\.)(uiConfig|sheetThemes)$/.test(String(key ?? ""))) setTimeout(refreshAll, 0);
  };
  Hooks.on("clientSettingChanged", onSetting);
  Hooks.on("updateSetting", setting => onSetting(setting?.key));

  // The OS switched between light and dark while Foundry is on its default.
  try {
    globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", refreshAll);
  } catch (_) { /* older engines: the next render picks it up */ }

  Hooks.on("closeApplicationV2", app => releaseDialogTheme(app));
  registerChatTheme();

  Hooks.once("ready", () => {
    game.msh ??= {};
    game.msh.explainSheetTheme = explainSheetTheme;
    game.msh.refreshSheetThemes = refreshSheetThemes;
    game.msh.explainDialogTheme = explainDialogTheme;
    game.msh.refreshDialogThemes = refreshDialogThemes;
  });
}

// scripts/modules/ui/chat-theme.js v1.0.0 - 2026-11-20
// v1.0.0: Light or dark for chat cards. The chat log is part of Foundry's
//         interface, so cards follow Configure Settings > Core > UI >
//         Interface (not Applications, which the windows follow), then the
//         browser / OS preference. A dark card gets the palette class
//         styles/chat-dark.css keys on, and the colours the card scripts
//         wrote into style="" are re-coloured in place (dialog-theme.js).
//         A light card is left exactly as it was: no class is added to it.
//         game.msh.explainChatTheme() prints what was resolved and why.

import { startRecolour, stopRecolour, holdTransitions, releaseDisconnected } from "./dialog-theme.js";

const PALETTE_CLASS = "faserip-dark-palette";
const MARK = "faseripChatDark";

function _valid(value) {
  return value === "dark" || value === "light";
}

/**
 * Foundry's theme for the interface (sidebar, chat log).
 * @returns {{theme: "light"|"dark", source: string}}
 */
export function resolveInterfaceTheme() {
  let scheme;
  try { scheme = game.settings.get("core", "uiConfig")?.colorScheme; } catch (_) { scheme = undefined; }
  if (_valid(scheme?.interface)) return { theme: scheme.interface, source: "Foundry UI setting (Interface)" };
  if (scheme && !("interface" in scheme) && _valid(scheme.applications)) {
    return { theme: scheme.applications, source: "Foundry UI setting (Applications; no Interface setting found)" };
  }
  const prefersDark = globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches === true;
  return { theme: prefersDark ? "dark" : "light", source: "browser preference" };
}

function _messageElement(html) {
  const el = html?.jquery ? html[0] : html;
  if (!el?.classList) return null;
  return el.classList.contains("chat-message") ? el : (el.closest?.(".chat-message") ?? el);
}

/** Put the interface theme on one chat message element. Safe to call again. */
export function applyChatTheme(html) {
  const el = _messageElement(html);
  if (!el) return;
  const dark = resolveInterfaceTheme().theme === "dark";
  if (el.classList.contains(PALETTE_CLASS) !== dark && el.isConnected) holdTransitions(el);
  if (dark) {
    el.classList.add(PALETTE_CLASS);
    el.dataset[MARK] = "1";
    startRecolour(el, el);
  } else if (el.dataset[MARK]) {
    stopRecolour(el);
    el.classList.remove(PALETTE_CLASS);
    delete el.dataset[MARK];
  }
}

function _documents() {
  const docs = new Set([document]);
  for (const app of foundry.applications?.instances?.values?.() ?? []) {
    const doc = app?.element?.ownerDocument;
    if (doc) docs.add(doc);
  }
  return docs;
}

/** Re-apply the theme to every chat card on screen: the log, pop-outs and notification cards. */
export function refreshChatThemes() {
  releaseDisconnected();
  for (const doc of _documents()) {
    for (const el of doc.querySelectorAll(".chat-message")) applyChatTheme(el);
  }
}

/** Console diagnostic. */
export function explainChatTheme() {
  const { theme, source } = resolveInterfaceTheme();
  let cards = 0, dark = 0;
  for (const doc of _documents()) {
    for (const el of doc.querySelectorAll(".chat-message")) {
      cards++;
      if (el.classList.contains(PALETTE_CLASS)) dark++;
    }
  }
  let colorScheme;
  try { colorScheme = game.settings.get("core", "uiConfig")?.colorScheme; } catch (_) { colorScheme = undefined; }
  const report = { theme, source, colorScheme, chatCards: cards, withDarkPalette: dark };
  console.log("[FASERIP] Chat theme", report);
  return report;
}

let _registered = false;

/** Register the render hook. Called once, from registerSheetTheme(). */
export function registerChatTheme() {
  if (_registered) return;
  _registered = true;
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try { applyChatTheme(html); }
    catch (e) { console.warn("[FASERIP] chat theme failed:", e); }
  });
  Hooks.once("ready", () => {
    game.msh ??= {};
    game.msh.explainChatTheme = explainChatTheme;
    game.msh.refreshChatThemes = refreshChatThemes;
    refreshChatThemes();
  });
}

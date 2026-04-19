// sheet-zoom.js v1.2.0 - 2026-04-18
// v1.2.0: Handle both V1 (.element is jQuery) and V2 (.element is HTMLElement)
// v1.1.0: Show zoom % badge in window title bar
// Ctrl+Wheel zoom for any Foundry Application sheet.
// Usage: import { initSheetZoom } from './modules/ui/sheet-zoom.js';
//        then call initSheetZoom(sheet) in activateListeners or _onRender.

function _updateBadge(titleEl, zoom) {
  let badge = titleEl.querySelector(".faserip-zoom-badge");
  if (Math.abs(zoom - 1.0) < 0.01) {
    if (badge) badge.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "faserip-zoom-badge";
    badge.style.cssText = "margin-left:6px;font-size:10px;font-weight:normal;opacity:0.7;";
    titleEl.appendChild(badge);
  }
  badge.textContent = `(${Math.round(zoom * 100)}%)`;
}

/**
 * @param {Application} sheet - Foundry Application instance (must have .actor or .id and .element)
 */
export function initSheetZoom(sheet) {
  const id = sheet.actor?.id ?? sheet.id ?? sheet.appId;
  const key = `faserip-sheet-zoom-${id}`;
  // V1: sheet.element is jQuery, [0] extracts DOM. V2: sheet.element is already HTMLElement.
  const el = sheet.element?.[0] ?? sheet.element;
  const content = el?.querySelector(".window-content");
  const titleEl = el?.querySelector(".window-title");
  if (!content) return;
  let zoom = parseFloat(localStorage.getItem(key)) || 1.0;
  content.style.zoom = zoom;
  if (titleEl) _updateBadge(titleEl, zoom);
  content.addEventListener("wheel", (ev) => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    ev.stopPropagation();
    const delta = ev.deltaY < 0 ? 0.05 : -0.05;
    zoom = Math.round(Math.max(0.5, Math.min(2.0, zoom + delta)) * 100) / 100;
    content.style.zoom = zoom;
    localStorage.setItem(key, zoom.toFixed(2));
    if (titleEl) _updateBadge(titleEl, zoom);
  }, { passive: false });
}

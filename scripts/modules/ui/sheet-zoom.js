// sheet-zoom.js v1.3.1 - 2026-05-22
// v1.3.1: Fix V2 binding — sheet.element?.[0] returned the form's first control
//         (a header button) on tag:"form" V2 sheets, so .window-content was
//         never found and the listener never bound. Only unwrap [0] for jQuery.
// v1.3.0: Idempotency guard (content.dataset.faseripZoomBound) so calling on
//         every render — or from both the v1 adapter and the v2 _onRender —
//         doesn't stack duplicate wheel listeners (which would multiply the
//         zoom step per tick). Added closest(".window-content") fallback and
//         re-apply of the saved zoom on each call.
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
  // V1: sheet.element is a jQuery object → [0] extracts the DOM node.
  // V2: sheet.element is already an HTMLElement. Do NOT index it — when the
  // sheet uses tag:"form", element[0] returns the form's first *control*
  // (a header button), not the root, which breaks the .window-content lookup.
  const el = sheet.element?.jquery ? sheet.element[0] : sheet.element;
  if (!el) return;
  const content = el.querySelector?.(".window-content") ?? el.closest?.(".window-content");
  const titleEl = el.querySelector?.(".window-title");
  if (!content) return;

  // Re-apply the saved zoom on every call so it survives re-renders.
  const saved = parseFloat(localStorage.getItem(key)) || 1.0;
  content.style.zoom = saved;
  if (titleEl) _updateBadge(titleEl, saved);

  // Bind the wheel handler once per content element. _onRender runs on every
  // render and the v1 adapter may also reach this, so guard against stacking
  // duplicate listeners.
  if (content.dataset.faseripZoomBound === "1") return;
  content.dataset.faseripZoomBound = "1";

  let zoom = saved;
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

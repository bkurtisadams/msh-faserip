// Frame-only DialogV2 wrapper. Provides a window with a title and arbitrary
// HTML content; delegates all interaction to the content's own elements.
// Preserves the V1-Dialog jQuery render/close contract that existing FASERIP
// action dialogs were built against, so call sites only need to swap the
// constructor and update render's signature from (html) to (html, dlg).
//
// V1 was: new Dialog({ title, content, buttons: {}, render, close }).render(true)
// V2 is:  await showFaseripDialog({ title, content, render, close })
//
// The render callback receives the content slot as a jQuery handle (so
// existing html.find / html.closest('.dialog') calls keep working), plus
// the V2 dialog instance for dlg.close() calls inside button handlers.
//
// Used to silence "V1 Application framework is deprecated" warnings ahead of
// Foundry v16's removal of V1.

// Returns true when a DialogV2 (or any AppV2) instance is currently rendered
// in a Foundry v14 detached browser window rather than the main workspace.
// Detection prefers the documented window.windowId set on detach, and falls
// back to comparing the element's owning window. Used so action dialogs can
// keep a popped-out window alive after a roll instead of tearing it down.
export function isDialogDetached(dialog) {
  try {
    if (dialog?.window?.windowId != null) return true;
    const dv = dialog?.element?.ownerDocument?.defaultView;
    return !!dv && dv !== window;
  } catch (_) { return false; }
}

// 2026-07-09: showFaseripDialog now accepts optional width/height (routed to
// DialogV2 position, matching showFaseripButtonDialog) and resizable (routed
// to window.resizable) for content-heavy dialogs like the Hardware help.
export async function showFaseripDialog({ title, content, render, close, width, height, resizable } = {}) {
  const { DialogV2 } = foundry.applications.api;
  const cfg = {
    window: { title, ...(resizable ? { resizable: true } : {}) },
    content,
    // V2 requires at least one button. Provide a hidden dummy; the
    // content's own elements drive interaction. We hide the button row
    // in render before it paints. Not marked as default so Enter doesn't
    // auto-resolve — the caller's render typically binds its own Enter
    // handler that triggers the Roll button.
    classes: ["faserip-shim-dialog"],
    buttons: [{ action: "_frame", label: "" }],
    rejectClose: false,
    render: async (event, dialog) => {
      const $root = $(dialog.element);
      // Hide V2's button area. Class names vary by core version
      // (.dialog-buttons in some, footer.form-footer in others); hide
      // both so the frame-only contract is preserved regardless.
      $root.find('.dialog-buttons, footer.form-footer').hide();
      const $html = $root.find('.window-content').first();
      try { await render?.($html, dialog); }
      catch (e) { console.error("FASERIP dialog render error:", e); }
      // Keep FASERIP roll dialogs above the sheet that spawned them: clicking a
      // sheet control raises the sheet, which would otherwise bury an already-
      // open dialog. Re-raise the whole shim-dialog group on each render.
      try {
        for (const app of foundry.applications.instances.values()) {
          if (app !== dialog && app.options?.classes?.includes("faserip-shim-dialog")) app.bringToFront?.();
        }
        dialog.bringToFront?.();
      } catch (_) {}
    },
    close: () => {
      try { close?.(); }
      catch (e) { console.warn("FASERIP dialog close error:", e); }
    }
  };
  if (width || height) cfg.position = { ...(width ? { width } : {}), ...(height ? { height } : {}) };
  return DialogV2.wait(cfg);
}

// Button-driven DialogV2 wrapper. Maps V1's { buttons: { key: { label, icon,
// callback(html) } } } shape to DialogV2's button array. V1 button callbacks
// received a jQuery handle of the dialog body; we preserve that contract by
// resolving $html from dialog.element before invoking the V1 callback.
//
// V1 was: const dlg = new Dialog({ title, content, buttons, default, render,
//         close, id }, { width, height, classes }); dlg.render(true);
// V2 is:  await showFaseripButtonDialog({ title, content, buttons, default,
//         render, close, id, width, height, classes })
//
// The wait-promise resolves with the value returned by the activated button's
// callback (matches V1's Promise wrapping). On Esc / window-X dismiss it
// resolves null (rejectClose:false). Render and button callbacks both receive
// ($html, dialog); the dialog arg is for callsites that need explicit close.
//
// V1's second-arg options (width/height/classes) and config-level `id` are
// flattened into the same kwargs object — V2 routes them to position{} and
// top-level fields as needed.

export async function showFaseripButtonDialog({
  title, content, buttons = {}, default: defaultAction, render, close,
  id, width, height, classes
} = {}) {
  const { DialogV2 } = foundry.applications.api;
  const v2Buttons = Object.entries(buttons).map(([action, b]) => ({
    action,
    label: b.label,
    icon: b.icon,
    default: action === defaultAction,
    callback: async (event, button, dialog) => {
      const $html = $(dialog.element).find('.window-content').first();
      try { return b.callback ? await b.callback($html, dialog) : null; }
      catch (e) { console.error("FASERIP button-dialog callback error:", e); return null; }
    }
  }));
  const cfg = {
    window: { title },
    content,
    buttons: v2Buttons,
    default: defaultAction,
    rejectClose: false,
    render: async (event, dialog) => {
      const $root = $(dialog.element);
      const $html = $root.find('.window-content').first();
      try { await render?.($html, dialog); }
      catch (e) { console.error("FASERIP button-dialog render error:", e); }
    },
    close: () => {
      try { close?.(); }
      catch (e) { console.warn("FASERIP button-dialog close error:", e); }
    }
  };
  if (id) cfg.id = id;
  cfg.classes = ["faserip-shim-dialog", ...(Array.isArray(classes) ? classes : [])];
  if (width || height) cfg.position = { ...(width ? { width } : {}), ...(height ? { height } : {}) };
  return DialogV2.wait(cfg);
}

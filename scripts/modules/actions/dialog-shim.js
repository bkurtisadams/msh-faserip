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

export async function showFaseripDialog({ title, content, render, close } = {}) {
  const { DialogV2 } = foundry.applications.api;
  return DialogV2.wait({
    window: { title },
    content,
    // V2 requires at least one button. Provide a hidden dummy; the
    // content's own elements drive interaction. We hide the button row
    // in render before it paints. Not marked as default so Enter doesn't
    // auto-resolve — the caller's render typically binds its own Enter
    // handler that triggers the Roll button.
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
    },
    close: () => {
      try { close?.(); }
      catch (e) { console.warn("FASERIP dialog close error:", e); }
    }
  });
}

// Button-driven DialogV2 wrapper. Maps V1's { buttons: { key: { label, icon,
// callback(html) } } } shape to DialogV2's button array. V1 button callbacks
// received a jQuery handle of the dialog body; we preserve that contract by
// resolving $html from dialog.element before invoking the V1 callback.
//
// V1 was: const dlg = new Dialog({ title, content, buttons, default, render,
//         close }); dlg.render(true);
// V2 is:  await showFaseripButtonDialog({ title, content, buttons, default,
//         render, close })
//
// The wait-promise resolves with the value returned by the activated button's
// callback (matches V1's Promise wrapping). On Esc / window-X dismiss it
// resolves null (rejectClose:false). Render receives ($html, dialog) for
// callsites that need the V2 dialog instance for explicit close().

export async function showFaseripButtonDialog({
  title, content, buttons = {}, default: defaultAction, render, close
} = {}) {
  const { DialogV2 } = foundry.applications.api;
  const v2Buttons = Object.entries(buttons).map(([action, b]) => ({
    action,
    label: b.label,
    icon: b.icon,
    default: action === defaultAction,
    callback: async (event, button, dialog) => {
      const $html = $(dialog.element).find('.window-content').first();
      try { return b.callback ? await b.callback($html) : null; }
      catch (e) { console.error("FASERIP button-dialog callback error:", e); return null; }
    }
  }));
  return DialogV2.wait({
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
  });
}

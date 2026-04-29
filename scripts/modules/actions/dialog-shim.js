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
    buttons: [],
    rejectClose: false,
    render: async (event, dialog) => {
      // V2 dialog.element is the outer <dialog>; .window-content is the
      // body slot. Wrap it as jQuery so existing render bodies keep working.
      const $html = $(dialog.element).find('.window-content').first();
      try { await render?.($html, dialog); }
      catch (e) { console.error("FASERIP dialog render error:", e); }
    },
    close: () => {
      try { close?.(); }
      catch (e) { console.warn("FASERIP dialog close error:", e); }
    }
  });
}

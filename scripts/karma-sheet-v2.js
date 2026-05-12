// karma-sheet-v2.js v1.0.0
// FASERIP KarmaSheetV2 — DocumentSheetV2 wrap around the v1 KarmaSheet.
// Mirrors FaseripActorSheetV2: a lazy, non-rendering v1 sheet acts as a
// data + listener adapter; v2 owns the form element, lifecycle, and a
// single template PART. v1 KarmaSheet remains fully functional via direct
// import for the programmatic _addKarmaEvent flow in actorSheet.js
// (Resource Income, etc.) which never renders.

import { KarmaSheet } from "./karma.js";

const { HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api;

export class KarmaSheetV2 extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["faserip", "sheet", "karma"],
    position: { width: 720, height: 520 },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false },
    tag: "form"
  };

  /** @override */
  static PARTS = {
    body: {
      template: "systems/msh-faserip/templates/karma-sheet.html",
      scrollable: [".karma-history-table"]
    }
  };

  /** Accept the v1 (document, options) constructor signature so existing
   *  call sites (`new KarmaSheetV2(actor)`) work unchanged. v2's native
   *  shape is `new ApplicationV2({ document, ...options })`. */
  constructor(document, options = {}) {
    super({ ...options, document });
  }

  /** @override */
  get title() {
    return `Karma History: ${this.document.name}`;
  }

  /* -------------------------------------------- */
  /*  v1 adapter                                  */
  /* -------------------------------------------- */

  #v1 = null;

  _v1() {
    if (!this.#v1) {
      this.#v1 = new KarmaSheet(this.document, { editable: this.isEditable });
    }
    return this.#v1;
  }

  /** Proxy the v1 instance so its methods see v2's actor / element / render
   *  / close, but writes to v1-owned instance state (searchFilter,
   *  sortNewestFirst) pass through and persist across re-renders. */
  _adapterThis(v1) {
    const v2 = this;
    return new Proxy(v1, {
      get(target, prop) {
        switch (prop) {
          case "actor":       return v2.document;
          case "object":      return v2.document;
          case "document":    return v2.document;
          case "element":     return v2.element;
          case "form":        return v2.element;
          case "options":     return v2.options;
          case "isEditable":  return v2.isEditable;
          case "rendered":    return v2.rendered;
          case "position":    return v2.position;
          case "setPosition": return (...a) => v2.setPosition?.(...a);
          case "render":      return (...a) => {
            // v1 callers use render(force, options); v2 expects (options, _options).
            // Promote a leading boolean to { force } so dialog-driven re-renders fire.
            if (a.length && typeof a[0] === "boolean") {
              a = [{ force: a[0] }, ...a.slice(1)];
            }
            return v2.render(...a);
          };
          case "submit":      return (...a) => v2.submit?.(...a);
          case "close":       return (...a) => v2.close(...a);
          default:            return Reflect.get(target, prop, target);
        }
      }
    });
  }

  /* -------------------------------------------- */
  /*  Lifecycle                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const base = await super._prepareContext(options);
    let legacy = {};
    try {
      legacy = this._v1().getData() ?? {};
    } catch (err) {
      console.error("KarmaSheetV2 | v1 getData adapter failed", err);
    }
    // Shallow merge — v1 getData returns a flat template context. Legacy
    // keys (system, isGM, currentKarma, totalSpent, teamKarmaPool,
    // karmaMultiplier, sortToggle) win over the v2 base; the template
    // expects the v1 shape.
    return Object.assign(base, legacy);
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // jQuery shim — preserves v1 activateListeners(html) signature.
    // All click / drag-handle / change / input bindings, including the
    // intra-day row-reorder HTML5 drag-and-drop, are wired by v1's
    // activateListeners. Proxy routes `this.render(true)` calls from
    // inside dialog callbacks back to v2.render({ force: true }).
    const html = $(this.element);
    try {
      const v1 = this._v1();
      v1.activateListeners.call(this._adapterThis(v1), html);
    } catch (err) {
      console.error("KarmaSheetV2 | v1 activateListeners shim failed", err);
    }
  }

  /** @override */
  async close(options) {
    this.#v1 = null;
    return super.close(options);
  }
}
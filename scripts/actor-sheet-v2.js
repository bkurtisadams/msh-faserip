// scripts/actor-sheet-v2.js
// FASERIP ActorSheetV2 — Slice 1 (scaffolding).
// Wraps the existing actor-sheet.html template as a single PART and delegates
// both data preparation and listener binding to the legacy v1 sheet via an
// adapter Proxy. Opt-in via the "Use V2 Character Sheet" world setting.
// Subsequent slices split parts, port listeners, and retire v1.

import { FaseripActorSheet } from "./actorSheet.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class FaseripActorSheetV2 extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["msh-faserip", "sheet", "actor", "faserip-sheet"],
    position: { width: 800, height: 920 },
    window: { resizable: true, contentClasses: ["faserip-sheet-content"] },
    form: { submitOnChange: true, closeOnSubmit: false },
    tag: "form",
    actions: {}
  };

  /** @override */
  static PARTS = {
    body: {
      template: "systems/msh-faserip/templates/actor-sheet.html",
      scrollable: [".sheet-tab-content"]
    }
  };

  /* -------------------------------------------- */
  /*  v1 adapter                                  */
  /* -------------------------------------------- */

  #v1 = null;
  _activeTab = "powers";

  /** Lazy, non-rendering v1 sheet used purely as a data + listener adapter. */
  _v1() {
    if (!this.#v1) {
      this.#v1 = new FaseripActorSheet(this.actor, { editable: this.isEditable });
    }
    return this.#v1;
  }

  /**
   * Proxy a v1 instance so its handlers see the v2 sheet's actor / element /
   * render / close, but otherwise behave normally.
   */
  _adapterThis(v1) {
    const v2 = this;
    return new Proxy(v1, {
      get(target, prop) {
        switch (prop) {
          case "actor":      return v2.actor;
          case "object":     return v2.actor;
          case "document":   return v2.actor;
          case "element":    return v2.element;
          case "form":       return v2.element;
          case "options":    return v2.options;
          case "isEditable": return v2.isEditable;
          case "rendered":   return v2.rendered;
          case "render":     return (...a) => v2.render(...a);
          case "submit":     return (...a) => v2.submit?.(...a);
          case "close":      return (...a) => v2.close(...a);
          default:           return Reflect.get(target, prop, target);
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
      console.error("FaseripActorSheetV2 | v1 getData adapter failed", err);
    }
    return foundry.utils.mergeObject(base, legacy, { inplace: false });
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // jQuery shim — preserves the v1 activateListeners(html) signature.
    const html = $(this.element);

    // Tabs (manual binding for S1; declarative TABS arrives in S2).
    this._activateTabsShim(html);

    // Legacy listeners.
    try {
      const v1 = this._v1();
      v1.activateListeners.call(this._adapterThis(v1), html);
    } catch (err) {
      console.error("FaseripActorSheetV2 | v1 activateListeners shim failed", err);
    }
  }

  /** @override */
  async close(options) {
    this.#v1 = null;
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Tab shim                                    */
  /* -------------------------------------------- */

  _activateTabsShim(html) {
    const root = html[0];
    if (!root) return;

    const nav = root.querySelector(".sheet-tabs-navigation");
    const content = root.querySelector(".sheet-tab-content");
    if (!nav || !content) return;

    const items = nav.querySelectorAll(".item[data-tab]");
    const tabs  = content.querySelectorAll(".tab[data-tab]");

    this._setActiveTab(items, tabs, this._activeTab);

    nav.addEventListener("click", (ev) => {
      const a = ev.target.closest(".item[data-tab]");
      if (!a) return;
      ev.preventDefault();
      this._activeTab = a.dataset.tab;
      this._setActiveTab(items, tabs, this._activeTab);
    });
  }

  _setActiveTab(items, tabs, id) {
    items.forEach(i => i.classList.toggle("active", i.dataset.tab === id));
    tabs.forEach (t => t.classList.toggle("active", t.dataset.tab === id));
  }
}
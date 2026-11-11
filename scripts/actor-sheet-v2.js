// scripts/actor-sheet-v2.js v1.5.1 - 2026-11-11
// v1.5.1: An Actor dropped on the sheet goes to _onDropActor (a no-op here,
//         overridden by the vehicle sheet for its crew slots). It used to be
//         discarded, which is why crew drops stopped working on the V2
//         vehicle sheet.
// scripts/actor-sheet-v2.js v1.5.0 - 2026-11-11
// v1.5.0: Three things a subclass can now set, so the vehicle sheet can use
//         this shell: the tab selectors (TABS_SHIM), the full-size window
//         (NORMAL_SIZE) and the legacy class the adapter wraps
//         (_createLegacySheet). No behaviour change for character sheets.
// scripts/actor-sheet-v2.js v1.4.0 - 2026-11-11
// v1.4.0: The History field uses Foundry's V2 rich-text element
//         (<prose-mirror>, toggled) instead of the V1 {{editor}} helper. It
//         is a form field, so Save goes through this sheet's normal submit.
//         That removes the last use of the V1 base's editor machinery: the
//         legacy editor activation and the adapter's editor-save shim are
//         gone. A sheet that is not editable shows the enriched text with
//         no editor.
// scripts/actor-sheet-v2.js v1.3.0 - 2026-11-11
// v1.3.0: The adapter marks itself (_isV2Adapter) so the legacy class skips
//         the V1 base listeners, which had been running against this sheet's
//         form on every render (a second form-submit handler, a second
//         editor activation, a second portrait binding). The one thing they
//         did that nothing else covered, disabling the controls of a sheet
//         that is not editable, is now done here.
// scripts/actor-sheet-v2.js v1.2.1 - 2026-11-11
// v1.2.1: This is now the only registered character sheet (init.js v1.20.0);
//         the opt-in setting is gone. No code change.
// scripts/actor-sheet-v2.js v1.2.0 - 2026-11-11
// v1.2.0: Two gaps against the V1 sheet closed. (1) Form submits now run the
//         same normalisation the V1 sheet applies in _updateObject (rank /
//         number coherence, Resources sync, and the guard that stops an
//         effect-shifted display rank being saved), via the shared
//         actor-sheet-submit.js; the V2 sheet had been saving the raw form.
//         (2) close() now runs the V1 teardown (Universal Table hook, world
//         time and CTT hooks, detached table popout) before dropping the
//         adapter; those hooks were being left registered.
// scripts/actor-sheet-v2.js v1.1.2 - 2026-10-01
// v1.1.2: Portrait edit and sheet-level drop listeners were guarded by
//         instance flags but bound to this.element, which ApplicationV2
//         discards on close; after close/reopen neither listener existed.
//         Portrait click now binds on the img each render; drop guard is
//         keyed to the element it was bound on.
// v1.1.0: Preserve focused core-stat fields across submitOnChange renders so
//         keyboard Tab navigation survives ApplicationV2 PART replacement.
// FASERIP ActorSheetV2 — Slice 1 (scaffolding).
// Wraps the existing actor-sheet.html template as a single PART and delegates
// both data preparation and listener binding to the legacy v1 sheet via an
// adapter Proxy. Opt-in via the "Use V2 Character Sheet" world setting.
// Subsequent slices split parts, port listeners, and retire v1.

import { FaseripActorSheet } from "./actorSheet.js";
import { initSheetZoom } from "./modules/ui/sheet-zoom.js";
import { normalizeActorSubmit } from "./actor-sheet-submit.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class FaseripActorSheetV2 extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["msh-faserip", "sheet", "actor", "faserip-sheet"],
    position: { width: 720, height: 840 },
    window: { resizable: true, contentClasses: ["faserip-sheet-content"] },
    form: { submitOnChange: true, closeOnSubmit: false },
    tag: "form",
    actions: {},
    dragDrop: [{ dragSelector: ".item", dropSelector: null }]
  };

  /** @override */
  static PARTS = {
    header: {
      template: "systems/msh-faserip/templates/parts/header.hbs"
    },
    body: {
      template: "systems/msh-faserip/templates/parts/body.hbs",
      scrollable: [".sheet-tab-content"]
    }
  };

  /* -------------------------------------------- */
  /*  v1 adapter                                  */
  /* -------------------------------------------- */

  /** Where the tab strip and its panels live, and which tab opens first. */
  static TABS_SHIM = { nav: ".sheet-tabs-navigation", content: ".sheet-tab-content", initial: "powers" };

  /** The window size the legacy compact-mode toggle restores. */
  static NORMAL_SIZE = { width: 720, height: 840 };

  #v1 = null;
  _activeTab = this.constructor.TABS_SHIM.initial;

  /** The legacy sheet class whose data preparation and listeners this shell borrows. */
  _createLegacySheet() {
    return new FaseripActorSheet(this.actor, { editable: this.isEditable });
  }

  /** Lazy, non-rendering v1 sheet used purely as a data + listener adapter. */
  _v1() {
    if (!this.#v1) {
      this.#v1 = this._createLegacySheet();
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
          case "_isV2Adapter": return true;
          case "actor":      return v2.actor;
          case "object":     return v2.actor;
          case "document":   return v2.actor;
          case "element":    return v2.element;
          case "form":       return v2.element;
          case "options":    return v2.options;
          case "isEditable": return v2.isEditable;
          case "rendered":   return v2.rendered;
          case "position":         return v2.position;
          case "_normalSheetSize": return { ...v2.constructor.NORMAL_SIZE };
          case "setPosition":      return (...a) => v2.setPosition?.(...a);
          case "render":     return (...a) => {
            // v1 callers use render(force, options); v2 expects (options, _options).
            // Promote a leading boolean to { force } so the re-render actually fires.
            if (a.length && typeof a[0] === "boolean") {
              a = [{ force: a[0] }, ...a.slice(1)];
            }
            return v2.render(...a);
          };
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

  /**
   * Snapshot focus immediately before ApplicationV2 replaces its PART DOM.
   * The snapshot lives on the v1 adapter because activateListeners restores it
   * after the fresh controls have been bound.
   */
  _preRender(context, options) {
    if (super._preRender) super._preRender(context, options);
    try {
      const v1 = this._v1();
      v1._captureSheetFocus.call(this._adapterThis(v1));
    } catch (err) {
      console.warn('FaseripActorSheetV2 | focus snapshot failed', err);
    }
  }

  /** @override */
  async _prepareContext(options) {
    const base = await super._prepareContext(options);
    let legacy = {};
    try {
      legacy = this._v1().getData() ?? {};
    } catch (err) {
      console.error("FaseripActorSheetV2 | v1 getData adapter failed", err);
    }
    // Shallow merge — legacy getData() returns a flat template context.
    // Deep mergeObject() recurses into the live Actor document and tries
    // to assign to read-only Collection getters (actor.items, etc.).
    // v1 keys (actor, system, items, flags, ...) intentionally win over
    // v2 base keys; the legacy template expects the v1 shape.
    const context = Object.assign(base, legacy);
    context.historyEditor = await this._historyEditorHtml();
    return context;
  }

  /** Markup for the History field in the Bio panel: a toggled <prose-mirror>
   *  form element when the sheet is editable, the enriched text otherwise. */
  async _historyEditorHtml() {
    const raw = String(this.actor.system?.history ?? "");
    const TE = foundry.applications.ux.TextEditor?.implementation ?? globalThis.TextEditor;
    let enriched = raw;
    try {
      enriched = await TE.enrichHTML(raw, { relativeTo: this.actor, secrets: this.actor.isOwner, documents: true });
    } catch (err) {
      console.warn("FaseripActorSheetV2 | could not enrich History", err);
    }
    if (!this.isEditable) return `<div class="editor-content msh-history-readonly">${enriched}</div>`;

    const editor = foundry.applications.elements.HTMLProseMirrorElement.create({
      name: "system.history",
      value: raw,
      enriched,
      toggled: true,
      collaborate: false,
      documentUUID: this.actor.uuid,
      height: 200
    });
    editor.classList.add("msh-history-editor");
    return editor.outerHTML;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // jQuery shim — preserves the v1 activateListeners(html) signature.
    const html = $(this.element);

    // Compact-mode class lived on the inner wrapper div in v1; that wrapper
    // is gone now that header and body are separate PARTS, so apply the
    // class to the v2 outer form element directly.
    this.element.classList.toggle("compact-mode", !!context?.compactSheet);

    // Tabs (manual binding for S1; declarative TABS arrives in S2).
    this._activateTabsShim(html);

    // Wire v2 DragDrop ourselves; ApplicationV2 declares the option in
    // DEFAULT_OPTIONS but does not auto-instantiate the handlers.
    this._bindDragDrop();

    // Wire data-edit clicks for portraits / image fields. v1's base
    // _onEditImage doesn't reach the right FilePicker through our adapter
    // in v14, so we handle it natively via a delegated root listener.
    this._bindEditImage();

    // Legacy listeners. Null v1's own _dragDrop array first so its
    // activateListeners doesn't try to double-bind on top of ours with
    // callbacks that close over the unrendered v1 instance.
    try {
      const v1 = this._v1();
      if (v1._dragDrop) v1._dragDrop = [];
      v1.activateListeners.call(this._adapterThis(v1), html);
    } catch (err) {
      console.error("FaseripActorSheetV2 | v1 activateListeners shim failed", err);
    }

    // Ctrl+Wheel zoom — bind against the v2 sheet directly. v1's own
    // initSheetZoom call (in actorSheet.activateListeners) doesn't take effect
    // on the live element through the adapter, so bind here with the real
    // this.element. The utility guards against double-binding.
    initSheetZoom(this);

    if (!this.isEditable) this._lockContent();
  }

  /** Disable every control in the sheet body. The window header (close,
   *  controls menu) stays live. Mirrors what the V1 base did for a sheet
   *  that is not editable. */
  _lockContent() {
    const body = this.element?.querySelector(".window-content");
    if (!body) return;
    for (const el of body.querySelectorAll("input, select, textarea, button")) {
      el.setAttribute("disabled", "");
    }
  }

/* -------------------------------------------- */
  /*  Drag & drop (delegated to v1)               */
  /* -------------------------------------------- */

  /** Bind a single drop handler directly on this.element. ApplicationV2's
   *  DEFAULT_OPTIONS.dragDrop key is not reliably propagated to this.options
   *  in v14, and the DragDrop class wrapper masks failures; native
   *  addEventListener avoids both pitfalls. Drag-from-sheet continues to
   *  flow through v1's per-row dragstart listeners bound by activateListeners
   *  (PowerSort, FaseripItem, etc.). Once-only flag prevents duplicate
   *  listeners on re-render. */
  _bindDragDrop() {
    const root = this.element;
    if (!root) return;
    // v1.1.2: guard per *element*, not per instance. ApplicationV2 discards
    // this.element on close and builds a fresh one on the next render, so an
    // instance-level once-only flag left the reopened sheet with no live
    // listener (same failure the v1 sheet hit with __mshDropBound).
    if (this._dragDropBoundEl === root) return;

    root.addEventListener("dragover", ev => ev.preventDefault());
    root.addEventListener("drop", async ev => {
      ev.preventDefault();
      await this._onDrop(ev);
    });

    this._dragDropBoundEl = root;
    console.log("FaseripActorSheetV2 | drop listener bound on", root);
  }

  /** @override */
  _onDragStart(event) {
    // Drag-off-the-sheet still flows through v1's per-row listeners
    // (PowerSort / FaseripItem / etc.); fall back to v1 here only if
    // the row didn't already handle the dragstart and set dataTransfer.
    try {
      const v1 = this._v1();
      return v1._onDragStart?.call(this._adapterThis(v1), event);
    } catch (err) {
      console.error("FaseripActorSheetV2 | v1 _onDragStart shim failed", err);
    }
  }

  /** @override */
  _onDragOver(event) { /* no-op; DragDrop's drop handler manages preventDefault */ }

  /** Bind a delegated click handler on the sheet root for <img> elements
   *  with data-edit (portraits / actor img). Selector is narrowed to img
   *  so it does NOT fire on the editor-content div, which also carries
   *  data-edit (e.g. data-edit="system.history") and would otherwise
   *  open the FilePicker with editor HTML as a bogus "current path."  */
  _bindEditImage() {
    // v1.1.2: bind on the <img> elements themselves, every render. The old
    // root-delegated listener was guarded by an instance flag, but
    // ApplicationV2 replaces this.element on close/reopen and replaces the
    // header PART's DOM on every render, so the guard outlived the element it
    // protected and the portrait went dead. A listener on the img is rebuilt
    // with the DOM and fires before any ancestor handler can swallow it.
    const root = this.element;
    if (!root) return;
    for (const img of root.querySelectorAll("img[data-edit]")) {
      if (img.__mshEditBound) continue;
      img.__mshEditBound = true;
      img.style.cursor = "pointer";
      img.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();   // v1's adapter-bound handler must not open a second picker
        this._onEditImage(img);
      });
    }
  }

  async _onEditImage(target) {
    const attr = target?.dataset?.edit;
    if (!attr) return;

    // Editability: V2's isEditable should be true for GMs/owners, but in
    // some v14 builds it briefly returns false on first render. Fall back
    // to a direct permission check + GM role so the picker still opens.
    const canEdit = this.isEditable
      || this.actor?.canUserModify?.(game.user, "update")
      || game.user?.isGM;
    if (!canEdit) return;

    // FilePicker in v14: foundry.applications.apps.FilePicker is the V2
    // class; .implementation is the resolved subclass on builds that
    // expose it. globalThis.FilePicker is the appv1 shim which newer
    // v14 patches have started removing. Try them in order.
    const FilePickerClass =
         foundry.applications?.apps?.FilePicker?.implementation
      ?? foundry.applications?.apps?.FilePicker
      ?? globalThis.FilePicker;
    if (!FilePickerClass) {
      console.warn("FaseripActorSheetV2 | FilePicker class not found; cannot edit", attr);
      return;
    }

    const current = foundry.utils.getProperty(this.actor, attr);
    const top  = (this.position?.top ?? 0) + 40;
    const left = (this.position?.left ?? 0) + 10;
    const picker = new FilePickerClass({
      type: "image",
      current,
      callback: (path) => this.actor.update({ [attr]: path }),
      // ApplicationV2 FilePicker reads position.{top,left}; the appv1
      // fallback reads top/left. Supply both.
      position: { top, left },
      top, left
    });
    return picker.render(true);
  }

  /**
   * V2-native drop. The v1 base ActorSheet._onDrop chain depends on the
   * legacy global TextEditor and a fully-rendered v1 instance, neither of
   * which survives the unrendered adapter pattern in v14. We implement the
   * standard Item / ActiveEffect / Folder dispatch directly against the
   * live actor and let the inline per-row drop listeners (PowerSort,
   * FaseripItem, etc.) keep handling their own intra-sheet sort payloads.
   *
   * @override
   */
  async _onDrop(event) {
    console.log("FaseripActorSheetV2 | _onDrop", { target: event.target });
    if (!this.isEditable) return;

    const TE = foundry.applications.ux.TextEditor?.implementation
            ?? globalThis.TextEditor;
    const data = await TE.getDragEventData(event);
    if (!data) return;

    // Preserve the dropActorSheetData hook for modules/system listeners.
    if (Hooks.call("dropActorSheetData", this.actor, this, data) === false) return;

    switch (data.type) {
      case "Item":         return this._onDropItem(event, data);
      case "ActiveEffect": return this._onDropActiveEffect(event, data);
      case "Folder":       return this._onDropFolder(event, data);
      case "Actor":        return this._onDropActor(event, data);
    }
  }

  /** Handle an Actor dropped on the sheet. Character sheets ignore it. */
  async _onDropActor(_event, _data) {
    return false;
  }

  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;

    // Drop from this same actor: leave intra-sheet sort to v1's row handlers.
    if (this.actor.uuid === item.parent?.uuid) return false;

    return this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
  }

  async _onDropActiveEffect(event, data) {
    if (!this.actor.isOwner) return false;
    const effect = await ActiveEffect.implementation.fromDropData(data);
    if (!effect) return false;
    if (effect.target === this.actor) return false;
    return ActiveEffect.implementation.create(effect.toObject(), { parent: this.actor });
  }

  async _onDropFolder(event, data) {
    if (!this.actor.isOwner) return [];
    if (data.documentName !== "Item") return [];
    const folder = await Folder.implementation.fromDropData(data);
    if (!folder) return [];
    return this.actor.createEmbeddedDocuments(
      "Item",
      folder.contents.map(i => i.toObject())
    );
  }

  /** @override */
  async _processSubmitData(event, form, submitData, options = {}) {
    const changedField = event?.target?.name ?? "";
    const flat = foundry.utils.flattenObject(submitData ?? {});
    normalizeActorSubmit(this.actor, changedField, flat);
    return super._processSubmitData(event, form, foundry.utils.expandObject(flat), options);
  }

  /** @override */
  async close(options) {
    const v1 = this.#v1;
    if (v1) {
      try {
        await v1._teardownSheetHooks.call(this._adapterThis(v1));
      } catch (err) {
        console.warn("FaseripActorSheetV2 | v1 teardown failed", err);
      }
    }
    this.#v1 = null;
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Tab shim                                    */
  /* -------------------------------------------- */

  _activateTabsShim(html) {
    const root = html[0];
    if (!root) return;

    const shim = this.constructor.TABS_SHIM;
    const nav = root.querySelector(shim.nav);
    const content = root.querySelector(shim.content);
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
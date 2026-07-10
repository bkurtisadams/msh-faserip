// scripts/actor-sheet-v2.js
// FASERIP ActorSheetV2 — Slice 1 (scaffolding).
// Wraps the existing actor-sheet.html template as a single PART and delegates
// both data preparation and listener binding to the legacy v1 sheet via an
// adapter Proxy. Opt-in via the "Use V2 Character Sheet" world setting.
// Subsequent slices split parts, port listeners, and retire v1.

import { FaseripActorSheet } from "./actorSheet.js";
import { initSheetZoom } from "./modules/ui/sheet-zoom.js";

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
          case "position":    return v2.position;
          case "setPosition": return (...a) => v2.setPosition?.(...a);
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

          // V2-native saveEditor. v1's editor save callback (bound by
          // _activateEditor) calls this.saveEditor(name); v14's appv1 shim
          // routes that through submit() → _onSubmit chain that depends on
          // a rendered v1 instance, which we never have. Intercept here:
          // commit the active editor's content via its own save(), pull the
          // resulting HTML from the editor instance (or the form field it
          // wrote to), and update the live actor directly. Then tear the
          // editor down and re-render to restore the static view.
          case "saveEditor": return async (name, opts = {}) => {
            const ed = v1.editors?.[name];
            if (!ed) return;

            // ed.active is a boolean editing-state flag in v14's appv1 shim,
            // not the editor instance. The ProseMirrorEditor lives at
            // ed.instance, with .editor / .mce as fallbacks for older shims
            // and tinymce respectively.
            const editor = ed.instance ?? ed.editor ?? ed.mce ?? null;

            try { await editor?.save?.(); } catch (_) {}

            // Pull the new content from whichever source the active editor
            // surfaces; the form field and serializeString cover ProseMirror,
            // dom/innerHTML covers tinymce or fallback shapes, and
            // contentDivHTML is the last-resort writeback target.
            const content =
                 v2.element.querySelector(`[name="${name}"]`)?.value
              ?? editor?.serializeString?.()
              ?? editor?.serializeHTMLString?.()
              ?? editor?.view?.dom?.innerHTML
              ?? editor?.dom?.innerHTML
              ?? (typeof editor?.value === "string" ? editor.value : undefined)
              ?? v2.element.querySelector(`[data-edit="${name}"]`)?.innerHTML
              ?? null;

            if (content !== null && content !== undefined) {
              await v2.actor.update({ [name]: content });
            }

            try { editor?.destroy?.(); } catch (_) {}
            v1.editors[name] = null;
            await v2.render({ force: true });
          };
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
    // Shallow merge — legacy getData() returns a flat template context.
    // Deep mergeObject() recurses into the live Actor document and tries
    // to assign to read-only Collection getters (actor.items, etc.).
    // v1 keys (actor, system, items, flags, ...) intentionally win over
    // v2 base keys; the legacy template expects the v1 shape.
    return Object.assign(base, legacy);
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

    // Wire {{editor}} helper outputs (pencil-edit + save). ApplicationV2
    // doesn't auto-activate v1-style editor blocks, so we delegate to
    // v1's _activateEditor on each render.
    this._activateLegacyEditors();
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
    if (this._dragDropBound) return;
    const root = this.element;
    if (!root) return;

    root.addEventListener("dragover", ev => ev.preventDefault());
    root.addEventListener("drop", async ev => {
      ev.preventDefault();
      await this._onDrop(ev);
    });

    this._dragDropBound = true;
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
    if (this._editImageBound) return;
    this.element.addEventListener("click", ev => {
      const el = ev.target.closest("img[data-edit]");
      if (!el || !this.element.contains(el)) return;
      ev.preventDefault();
      this._onEditImage(el);
    });
    this._editImageBound = true;
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
    return new FilePickerClass({
      type: "image",
      current,
      callback: (path) => this.actor.update({ [attr]: path }),
      top: (this.position?.top ?? 0) + 40,
      left: (this.position?.left ?? 0) + 10
    }).render(true);
  }

  /** Activate v1-style {{editor}} helper outputs ({.editor-content[data-edit]})
   *  on the v2 sheet. v1's FormApplication._render wires the pencil-edit
   *  button and the eventual save → _onSubmit → _updateObject → actor.update
   *  chain. ApplicationV2 doesn't run that path, so we delegate to v1's
   *  _activateEditor through the proxy on each render. */
  _activateLegacyEditors() {
    if (!this.isEditable) return;
    const v1 = this._v1();
    if (typeof v1._activateEditor !== "function") return;
    const divs = this.element.querySelectorAll(".editor-content[data-edit]");
    for (const div of divs) {
      try {
        v1._activateEditor.call(this._adapterThis(v1), div);
      } catch (err) {
        console.warn(
          "FaseripActorSheetV2 | _activateEditor failed for",
          div.dataset.edit, err
        );
      }
    }
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
      case "Actor":        return false;
    }
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
// encounter-editor.js v0.1.0 - 2026-05-10
// EncounterEditor: pop-out window for editing a single encounter.
// Reuses TeamSheet's data shape and event handlers; the popout's
// activateListeners delegates to TeamSheet so all existing form
// handlers (foe edits, bonus changes, awards, etc.) fire inside
// the popout without duplication.

export class EncounterEditor extends Application {
  constructor(teamSheet, encId, options = {}) {
    super(options);
    this.teamSheet = teamSheet;
    this.encId = encId;
    this._openSections = new Set(["awards"]);
    // Re-render whenever the parent TeamSheet renders, so settings
    // updates triggered by delegated handlers flow through.
    this._teamRenderHook = Hooks.on("renderTeamSheet", () => {
      if (this.rendered) this.render(false);
    });
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "msh-encounter-editor",
      classes: ["faserip", "sheet", "team-tracker", "encounter-editor"],
      template: "systems/msh-faserip/templates/encounter-editor.html",
      width: 720,
      height: 720,
      resizable: true,
      title: "Encounter"
    });
  }

  get title() {
    const list = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const enc = list.find(e => e.id === this.encId);
    return enc?.name ? `Encounter — ${enc.name}` : "Encounter Editor";
  }

  getData() {
    const context = this.teamSheet.getData();
    const idx = (context.encounters || []).findIndex(e => e.id === this.encId);
    if (idx < 0) {
      return { ...context, enc: null, encIdx: -1, missing: true, sections: {} };
    }
    return {
      ...context,
      enc: context.encounters[idx],
      encIdx: idx,
      missing: false,
      sections: {
        foesOpen: this._openSections.has("foes"),
        crimesOpen: this._openSections.has("crimes"),
        awardsOpen: this._openSections.has("awards"),
        miscOpen: this._openSections.has("misc")
      }
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    // Delegate every encounter form handler to the parent TeamSheet.
    // Selectors fire on whichever DOM tree contains matching elements.
    this.teamSheet.activateListeners(html);

    // Popout-specific: section accordion toggles
    html.find('.ee-section-header').click(ev => {
      const sec = ev.currentTarget.closest('.ee-section');
      if (!sec) return;
      const key = sec.dataset.section;
      if (this._openSections.has(key)) this._openSections.delete(key);
      else this._openSections.add(key);
      sec.classList.toggle('open');
    });

    // Close button (titlebar close already provided by Application chrome,
    // but we add an explicit footer Done button for symmetry with Award)
    html.find('.ee-done').click(() => this.close());
  }

  async close(options) {
    if (this._teamRenderHook) Hooks.off("renderTeamSheet", this._teamRenderHook);
    this._teamRenderHook = null;
    return super.close(options);
  }
}

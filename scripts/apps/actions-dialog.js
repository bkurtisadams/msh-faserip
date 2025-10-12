// systems/msh-faserip/scripts/apps/actions-dialog.js
import { ActionsUI } from "../modules/actions/actions-ui.js";

export class ActionsDialog extends Application {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "actions-dialog",
    classes: ["msh", "actions-dialog"],
    popOut: true,          // Foundry window, *not* a browser window
    resizable: true,
    minimizable: true,
    width: 580,
    height: 540,
    template: "systems/msh-faserip/templates/apps/actions-dialog.hbs",
    title: "Actions"
  });

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  get title() {
    return `${this.actor?.name ?? "Actor"} — Actions`;
  }

  async getData() {
    // Provide whatever your Actions partial expects.
    // If your Actions tab needs the full sheet context, use getData() from the sheet.
    const sheetData = this.actor?.sheet?.getData ? await this.actor.sheet.getData() : {};
    return {
      actor: this.actor,
      system: this.actor.system,
      ...sheetData
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    // Bind the same click handlers your Actions tab uses
    ActionsUI.bind(html, this.actor);
  }
}

// Keep dialog in sync with actor changes
Hooks.on("updateActor", (actor) => {
  for (const win of Object.values(ui.windows)) {
    if (win instanceof ActionsDialog && win.actor?.id === actor.id) win.render(false);
  }
});

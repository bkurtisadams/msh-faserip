export class FaseripActorSheet extends ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip-sheet", "sheet", "actor"],
      template: "systems/msh-faserip/templates/actor-sheet.html",
      width: 600,
      height: 700,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }],
      submitOnChange: true,
      closeOnSubmit: false
    });
  }

  /** @override */
  getData() {
    const context = super.getData();
    const actorData = this.actor.toObject(false);
    
    context.system = actorData.system;
    return context;
  }

  /** @override */
  _updateObject(event, formData) {
    // Expand the form data
    const expandedData = foundry.utils.expandObject(formData);
    
    // Call the parent update
    return super._updateObject(event, expandedData);
  }

  // In actorSheet.js, add to the activateListeners function
activateListeners(html) {
  super.activateListeners(html);
  
  // Add Power button
  html.find('.add-power').click(async ev => {
    const itemData = {
      name: "New Power",
      type: "power",
      img: "icons/svg/lightning.svg" // Default icon for powers
    };
    await this.actor.createEmbeddedDocuments("Item", [itemData]);
  });
  
  // Browse Powers Compendium button
  html.find('.browse-compendium[data-type="powers"]').click(ev => {
    const pack = game.packs.find(p => p.metadata.name === "powers" && p.metadata.system === "msh-faserip");
    if (pack) {
      pack.render(true);
    } else {
      ui.notifications.warn("Powers compendium not found.");
    }
  });
  
  // Continue with other listeners...
}
}
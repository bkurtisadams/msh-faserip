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
}
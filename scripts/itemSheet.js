export class FaseripItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip-item-sheet"],
      width: 400,
      height: "auto",
      template: "systems/msh-faserip/templates/item-sheet.html",
      resizable: false
    });
  }

  getData() {
    const context = super.getData();

    // Correct initialization clearly
    context.item = this.item;
    context.system = this.item.system;

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
  }
}

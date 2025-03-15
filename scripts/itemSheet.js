export class FaseripItemSheet extends ItemSheet {
    static get defaultOptions() {
      return mergeObject(super.defaultOptions, {
        classes: ["faserip-item-sheet"],
        template: "systems/msh-faserip/templates/item-sheet.html",
        width: 500,
        height: "auto",
        resizable: false
      });
    }

    getData() {
      const context = super.getData();  // Retrieve existing sheet data safely
      context.system = this.actor.system; // add your system data clearly
      context.items = this.actor.items; // include actor's items clearly
      return context; 
    }
    

    activateListeners(html) {
      super.activateListeners(html);
    }
}

export class FaseripVehicleSheet extends ItemSheet {
    /** @override */
    static get defaultOptions() {
      return mergeObject(super.defaultOptions, {
        classes: ["faserip", "sheet", "item", "vehicle"],
        width: 520,
        height: 600,
        tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description"}],
        template: "systems/msh-faserip/templates/vehicle-sheet.html"
      });
    }
  
    /** @override */
    getData() {
      const context = super.getData();
      context.system = context.item.system;
      return context;
    }
  
    /** @override */
    activateListeners(html) {
      super.activateListeners(html);
      
      html.find('.cancel-button').click(ev => {
        this.close();
      });
    }
  }
export class FaseripVehicleSheet extends ItemSheet {
  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "item", "vehicle"],
      width: 600,
      height: 700,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "info" }],
      template: "systems/msh-faserip/templates/vehicle-sheet.html"
    });
  }

  /** @override */
  getData() {
    const context = super.getData();
    context.system = context.item.system;

    // Add allRanks for dropdowns in the sheet
    context.allRanks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
    ];

    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Cancel button closes the sheet
    html.find('.cancel-button').click(ev => {
      this.close();
    });

    // Tab switching
    html.find(".sheet-tabs a.item").click(ev => {
      const tab = $(ev.currentTarget);
      const target = tab.data("tab");
      html.find(".sheet-tabs a.item").removeClass("active");
      html.find(".tab").removeClass("active");
      tab.addClass("active");
      html.find(`.tab[data-tab='${target}']`).addClass("active");
    });
  }
}

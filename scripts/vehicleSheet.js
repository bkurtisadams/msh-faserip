// scripts/vehicleSheet.js v2.0.2 - 2026-04-19
// v2.0.2: v14 — extend foundry.appv1.sheets.ItemSheet (namespaced path)
// v2.0.1: v14 — replace bare mergeObject with foundry.utils.mergeObject
// v2.0.0: Stripped to stat card for compendium use — no tabs, no play-time fields
// v1.0.0: Initial vehicle item sheet

export class FaseripVehicleSheet extends foundry.appv1.sheets.ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "item", "vehicle"],
      width: 420,
      height: 480,
      template: "systems/msh-faserip/templates/vehicle-sheet.html"
    });
  }

  getData() {
    const context = super.getData();
    context.system = context.item.system;

    context.allRanks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
    ];

    context.vehicleTypes = [
      "Road", "Off-Road", "Railed", "GEV", "Air", "Space", "Water", "Submersible"
    ];

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('.cancel-button').click(ev => {
      this.close();
    });
  }
}

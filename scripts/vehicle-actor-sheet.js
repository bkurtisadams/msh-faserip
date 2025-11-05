// scripts/vehicle-actor-sheet.js
import { FaseripActorSheet } from "./actorSheet.js";

export class MSHVehicleActorSheet extends FaseripActorSheet {
  static get defaultOptions() {
    const opts = super.defaultOptions;
    opts.classes = (opts.classes ?? []).concat(["vehicle"]);
    // Point to the vehicle actor template
    opts.template = "systems/msh-faserip/templates/actor/vehicle-actor-sheet.html";
    opts.width = 720;
    opts.height = 680;
    opts.tabs = [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "info" }];
    return opts;
  }

  /** Provide helper arrays for ranks and a prefiltered list of mounted gear */
  getData(options = {}) {
    const data = super.getData(options);

    // Reuse your rank list from elsewhere if you already add it in super.getData().
    // If not, you can inject a simple fallback list here:
    data.allRanks = data.allRanks || [
      "Feeble","Poor","Typical","Good","Excellent","Remarkable","Incredible","Amazing","Monstrous",
      "Unearthly","Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000"
    ];

    // Complete vehicle types per rules
    data.vehicleTypes = ["Road","Off-Road","Railed","GEV","Air","Space","Water","Submersible"];

    // Mounted/Relevant items (can tighten this later)
      const items = this.actor.items?.contents ?? this.actor.items ?? [];
      data.mounted = items.filter(i =>
          ["equipment","weapon","vehicle-weapon","vehicle-system"].includes(i.type)
      );

        return data;
    };

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.find(".vehicle-damage-quick").on("click", async (ev) => {
      const amt = Number(ev.currentTarget.dataset.amt || 0);
      const s = this.actor.system ?? {};
      const next = Math.max(0, (Number(s.bodyHP) || 0) - Math.max(0, amt));
      await this.actor.update({
        "system.bodyHP": next,
        "system.resources.body.value": next
      });
    });
  }
}

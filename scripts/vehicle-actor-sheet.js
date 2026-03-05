// scripts/vehicle-actor-sheet.js v2.1.0 - 2026-03-05
// v2.1.0: Use Foundry v13 _onDropActor API instead of custom _onDrop parsing
// v2.0.0: Crew linking via actor UUID drag-drop, seating capacity, agility display
// v1.0.0: Initial vehicle actor sheet

import { FaseripActorSheet } from "./actorSheet.js";

export class MSHVehicleActorSheet extends FaseripActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip-sheet", "sheet", "actor", "vehicle"],
      template: "systems/msh-faserip/templates/actor/vehicle-actor-sheet.html",
      width: 720,
      height: 680,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "info" }],
      dragDrop: [
        { dragSelector: ".item[data-item-id]", dropSelector: null }
      ]
    });
  }

  getData(options = {}) {
    const data = super.getData(options);
    const sys = this.actor.system;

    data.allRanks = data.allRanks || [
      "Feeble","Poor","Typical","Good","Excellent","Remarkable","Incredible","Amazing","Monstrous",
      "Unearthly","Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000"
    ];

    data.vehicleTypes = ["Road","Off-Road","Railed","GEV","Air","Space","Water","Submersible"];

    const items = this.actor.items?.contents ?? this.actor.items ?? [];
    data.mounted = items.filter(i =>
      ["equipment","weapon","vehicle-weapon","vehicle-system"].includes(i.type)
    );

    // Resolve driver UUID to actor data
    data.driverActor = null;
    const driverUuid = sys.driverUuid || "";
    if (driverUuid) {
      const driverDoc = fromUuidSync(driverUuid);
      if (driverDoc) {
        data.driverActor = {
          name: driverDoc.name,
          img: driverDoc.img || "icons/svg/mystery-man.svg",
          uuid: driverUuid,
          agility: driverDoc.system?.abilities?.agility?.rank
            || driverDoc.system?.abilities?.agility?.value || "?"
        };
      }
    }

    // Resolve passenger UUIDs
    const pUuids = Array.isArray(sys.passengerUuids) ? sys.passengerUuids : [];
    data.passengerActors = [];
    for (const uuid of pUuids) {
      const doc = fromUuidSync(uuid);
      if (doc) {
        data.passengerActors.push({
          name: doc.name,
          img: doc.img || "icons/svg/mystery-man.svg",
          uuid
        });
      }
    }

    // Crew count (driver + passengers)
    data.crewCount = (data.driverActor ? 1 : 0) + data.passengerActors.length;

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // Quick damage buttons
    html.find(".vehicle-damage-quick").on("click", async (ev) => {
      const amt = Number(ev.currentTarget.dataset.amt || 0);
      const s = this.actor.system ?? {};
      const next = Math.max(0, (Number(s.bodyHP) || 0) - Math.max(0, amt));
      await this.actor.update({
        "system.bodyHP": next,
        "system.resources.body.value": next
      });
    });

    // Crew link — click name to open actor sheet
    html.find(".crew-link").on("click", async (ev) => {
      ev.preventDefault();
      const uuid = ev.currentTarget.dataset.uuid;
      if (!uuid) return;
      const doc = await fromUuid(uuid);
      doc?.sheet?.render(true);
    });

    // Crew remove — remove driver or passenger
    html.find(".crew-remove").on("click", async (ev) => {
      ev.preventDefault();
      const slot = ev.currentTarget.dataset.slot;
      if (slot === "driver") {
        await this.actor.update({
          "system.driverUuid": "",
          "system.driver": ""
        });
      } else if (slot === "passenger") {
        const uuid = ev.currentTarget.dataset.uuid;
        const current = Array.isArray(this.actor.system.passengerUuids)
          ? [...this.actor.system.passengerUuids] : [];
        const filtered = current.filter(u => u !== uuid);
        await this.actor.update({
          "system.passengerUuids": filtered,
          "system.passengers": filtered.map(u => {
            const d = fromUuidSync(u);
            return d?.name || u;
          }).join(", ")
        });
      }
    });
  }

  /**
   * Handle dropping an Actor onto the vehicle sheet.
   * Foundry v13 routes Actor drops here from _onDrop automatically.
   * Determines crew slot from the drop target element.
   * @param {DragEvent} event
   * @param {object} data - The drop data containing uuid and type
   * @returns {Promise<boolean|object>}
   */
  async _onDropActor(event, data) {
    if (!this.isEditable) return false;

    const uuid = data.uuid;
    if (!uuid) return false;

    const doc = await fromUuid(uuid);
    if (!doc) {
      ui.notifications?.warn("Could not resolve actor.");
      return false;
    }

    // Determine which slot was the drop target
    const dropZone = event.target.closest?.(".crew-drop-zone");
    const slot = dropZone?.dataset?.slot;

    // If not dropped on a crew zone, check if it's an actor being dropped
    // on the sheet generally — default to passenger
    if (!slot) {
      // Not on a crew drop zone — don't handle, let parent deal with it
      return super._onDropActor(event, data);
    }

    if (slot === "driver") {
      await this.actor.update({
        "system.driverUuid": uuid,
        "system.driver": doc.name
      });
      return doc;
    }

    if (slot === "passenger") {
      const current = Array.isArray(this.actor.system.passengerUuids)
        ? [...this.actor.system.passengerUuids] : [];
      const driverCount = this.actor.system.driverUuid ? 1 : 0;
      const capacity = Number(this.actor.system.seatingCapacity) || 5;

      if (current.includes(uuid)) {
        ui.notifications?.info(`${doc.name} is already a passenger.`);
        return false;
      }
      if (uuid === this.actor.system.driverUuid) {
        ui.notifications?.info(`${doc.name} is already the driver.`);
        return false;
      }
      if ((driverCount + current.length) >= capacity) {
        ui.notifications?.warn(`Vehicle is at capacity (${capacity} seats).`);
        return false;
      }

      current.push(uuid);
      await this.actor.update({
        "system.passengerUuids": current,
        "system.passengers": current.map(u => {
          const d = fromUuidSync(u);
          return d?.name || u;
        }).join(", ")
      });
      return doc;
    }

    return false;
  }
}

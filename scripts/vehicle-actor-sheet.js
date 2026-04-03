// scripts/vehicle-actor-sheet.js v3.0.1 - 2026-03-13
// v3.0.1: Fix button inline layout, horizontal tabs, clamp CS loss to 0+
// v3.0.0: Compact layout, effective ranks, current speed, OOC flag, FEAT/charging display, repair button
// v2.1.0: Use Foundry v13 _onDropActor API instead of custom _onDrop parsing
// v2.0.0: Crew linking via actor UUID drag-drop, seating capacity, agility display
// v1.0.0: Initial vehicle actor sheet

import { FaseripActorSheet } from "./actorSheet.js";
import {
  RANKS_ORDERED as RANK_ORDER, RANK_VALUES,
  shiftRank as _shiftRank, rankValue as rankVal
} from "./rules/rules-reference.js";

function shiftRank(name, steps) {
  // Vehicle sheet needs unclamped shift (vehicles can have Class 1000+ speed)
  const idx = RANK_ORDER.indexOf(name);
  if (idx < 0) return name;
  return RANK_ORDER[Math.max(0, Math.min(RANK_ORDER.length - 1, idx + steps))];
}

function lesserRank(a, b) {
  return rankVal(a) <= rankVal(b) ? a : b;
}

export class MSHVehicleActorSheet extends FaseripActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip-sheet", "sheet", "actor", "vehicle"],
      template: "systems/msh-faserip/templates/actor/vehicle-actor-sheet.html",
      width: 620,
      height: 580,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "crew" }],
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

    // --- Resolve driver ---
    data.driverActor = null;
    const driverUuid = sys.driverUuid || "";
    let driverAgility = null;
    if (driverUuid) {
      const driverDoc = fromUuidSync(driverUuid);
      if (driverDoc) {
        const agiRank = driverDoc.system?.abilities?.agility?.rank
          || driverDoc.system?.abilities?.agility?.value || null;
        driverAgility = agiRank;
        data.driverActor = {
          name: driverDoc.name,
          img: driverDoc.img || "icons/svg/mystery-man.svg",
          uuid: driverUuid,
          agility: agiRank || "?"
        };
      }
    }

    // --- Resolve passengers ---
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
    data.crewCount = (data.driverActor ? 1 : 0) + data.passengerActors.length;

    // --- Effective ranks after CS losses (abs so -1 or 1 both = 1 rank lost) ---
    const bodyCSLoss = Math.abs(Number(sys.bodyCSLoss) || 0);
    const speedCSLoss = Math.abs(Number(sys.speedCSLoss) || 0);
    const controlCSLoss = Math.abs(Number(sys.controlCSLoss) || 0);

    const effBody = bodyCSLoss > 0 ? shiftRank(sys.body || "Typical", -bodyCSLoss) : null;
    const effSpeed = speedCSLoss > 0 ? shiftRank(sys.speed || "Typical", -speedCSLoss) : null;
    const effControl = controlCSLoss > 0 ? shiftRank(sys.control || "Typical", -controlCSLoss) : null;

    data.effectiveBody = effBody;
    data.effectiveSpeed = effSpeed;
    data.effectiveControl = effControl;

    // --- Control FEAT rank = lesser(driver Agility, effective Control) ---
    const actualControl = effControl || sys.control || "Typical";
    if (driverAgility && RANK_ORDER.includes(driverAgility)) {
      data.effectiveControlFEAT = lesserRank(driverAgility, actualControl);
    } else {
      data.effectiveControlFEAT = null;
    }

    // --- Charging rank = lesser(Body, Speed) ---
    const actualBody = effBody || sys.body || "Typical";
    const actualSpeed = effSpeed || sys.speed || "Typical";
    data.chargingRank = lesserRank(actualBody, actualSpeed);

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

    // Quick repair button
    html.find(".vehicle-repair-quick").on("click", async (ev) => {
      const amt = Number(ev.currentTarget.dataset.amt || 0);
      const s = this.actor.system ?? {};
      const max = Number(s.bodyHPMax) || 0;
      const next = Math.min(max, (Number(s.bodyHP) || 0) + Math.max(0, amt));
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

    // Crew remove
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

    const dropZone = event.target.closest?.(".crew-drop-zone");
    const slot = dropZone?.dataset?.slot;

    if (!slot) {
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

// headquartersSheet.js v1.0.0 - 2026-03-02
import { BUILDING_TYPES, BUILDING_TYPE_MAP, ROOM_PACKAGES, STAFF_ROLES, SIZE_ROOMS } from "./hq-constants.js";

export class FaseripHeadquartersSheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "item", "headquarters"],
      width: 520,
      height: 580,
      template: "systems/msh-faserip/templates/hq-sheet.html",
      scrollY: [".hq-body"]
    });
  }

  getData() {
    const context = super.getData();
    context.system = context.item.system;
    context.isGM = game.user.isGM;

    // Building type categories for the grouped select
    context.buildingCategories = BUILDING_TYPES;
    context.currentBuildingType = BUILDING_TYPE_MAP[context.system.buildingType] || null;

    // Size options
    context.sizeOptions = SIZE_ROOMS;

    // All ranks for dropdowns
    context.allRanks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
    ];

    // Package definitions for the add-package dropdown
    context.packageDefs = ROOM_PACKAGES;

    // Enrich existing packages with definition data
    const packages = context.system.packages || [];
    context.packages = packages.map((pkg, idx) => {
      const def = ROOM_PACKAGES[pkg.type];
      if (!def) return { ...pkg, index: idx, name: pkg.type, tiers: [], tierData: null };
      const tierData = def.tiers[pkg.tier] || def.tiers[0];
      return {
        ...pkg,
        index: idx,
        name: def.name,
        icon: def.icon,
        rooms: def.rooms,
        tiers: def.tiers,
        tierData,
        tierIndex: pkg.tier || 0,
        maxTier: def.tiers.length - 1,
        canUpgrade: (pkg.tier || 0) < def.tiers.length - 1,
        canDowngrade: (pkg.tier || 0) > 0
      };
    });

    // Room capacity
    const sizeKey = context.system.size || "Small";
    const sizeInfo = SIZE_ROOMS[sizeKey];
    context.roomCapacity = sizeInfo ? sizeInfo.max : 3;
    context.roomsUsed = context.packages.reduce((sum, p) => sum + (p.rooms || 0) * (p.quantity || 1), 0);

    // Staff definitions
    context.staffDefs = STAFF_ROLES;
    context.staff = (context.system.staff || []).map((s, idx) => {
      const def = STAFF_ROLES[s.role];
      return {
        ...s,
        index: idx,
        name: def ? def.name : s.role,
        customName: s.name || "",
        icon: def ? def.icon : "fa-user",
        cost: def ? def.cost : "Typical"
      };
    });

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Cancel button
    html.find('.cancel-button').click(() => this.close());

    // Building type selector — auto-fill fields
    html.find('.building-type-select').change(async ev => {
      const key = ev.currentTarget.value;
      const bt = BUILDING_TYPE_MAP[key];
      if (!bt) {
        await this.item.update({ "system.buildingType": "" });
        return;
      }
      await this.item.update({
        "system.buildingType": key,
        "system.size": bt.size,
        "system.materialStrength": bt.material,
        "system.rentCost": bt.rentCost,
        "system.purchaseCost": bt.buyCost
      });
    });

    // Override selects (size, material, costs) — keep editable
    html.find('.size-select').change(async ev => {
      await this.item.update({ "system.size": ev.currentTarget.value });
    });

    html.find('.material-select').change(async ev => {
      await this.item.update({ "system.materialStrength": ev.currentTarget.value });
    });

    // --- Package controls ---
    html.find('.add-package-btn').click(async ev => {
      const select = html.find('.add-package-select');
      const type = select.val();
      if (!type || !ROOM_PACKAGES[type]) return;
      const packages = foundry.utils.deepClone(this.item.system.packages || []);
      packages.push({ type, tier: 0, quantity: 1 });
      await this.item.update({ "system.packages": packages });
    });

    html.find('.pkg-tier-up').click(async ev => {
      const idx = Number($(ev.currentTarget).closest('.pkg-row').data('index'));
      const packages = foundry.utils.deepClone(this.item.system.packages || []);
      const def = ROOM_PACKAGES[packages[idx].type];
      if (def && packages[idx].tier < def.tiers.length - 1) {
        packages[idx].tier++;
        await this.item.update({ "system.packages": packages });
      }
    });

    html.find('.pkg-tier-down').click(async ev => {
      const idx = Number($(ev.currentTarget).closest('.pkg-row').data('index'));
      const packages = foundry.utils.deepClone(this.item.system.packages || []);
      if (packages[idx].tier > 0) {
        packages[idx].tier--;
        await this.item.update({ "system.packages": packages });
      }
    });

    html.find('.pkg-qty-input').change(async ev => {
      const idx = Number($(ev.currentTarget).closest('.pkg-row').data('index'));
      const val = Math.max(1, parseInt(ev.currentTarget.value) || 1);
      const packages = foundry.utils.deepClone(this.item.system.packages || []);
      packages[idx].quantity = val;
      await this.item.update({ "system.packages": packages });
    });

    html.find('.pkg-delete').click(async ev => {
      const idx = Number($(ev.currentTarget).closest('.pkg-row').data('index'));
      const packages = foundry.utils.deepClone(this.item.system.packages || []);
      packages.splice(idx, 1);
      await this.item.update({ "system.packages": packages });
    });

    // --- Staff controls ---
    html.find('.add-staff-btn').click(async ev => {
      const select = html.find('.add-staff-select');
      const role = select.val();
      if (!role || !STAFF_ROLES[role]) return;
      const staff = foundry.utils.deepClone(this.item.system.staff || []);
      staff.push({ role, quantity: 1, name: "" });
      await this.item.update({ "system.staff": staff });
    });

    html.find('.staff-name-input').change(async ev => {
      const idx = Number($(ev.currentTarget).closest('.staff-row').data('index'));
      const staff = foundry.utils.deepClone(this.item.system.staff || []);
      staff[idx].name = ev.currentTarget.value.trim();
      await this.item.update({ "system.staff": staff });
    });

    html.find('.staff-qty-input').change(async ev => {
      const idx = Number($(ev.currentTarget).closest('.staff-row').data('index'));
      const val = Math.max(1, parseInt(ev.currentTarget.value) || 1);
      const staff = foundry.utils.deepClone(this.item.system.staff || []);
      staff[idx].quantity = val;
      await this.item.update({ "system.staff": staff });
    });

    html.find('.staff-delete').click(async ev => {
      const idx = Number($(ev.currentTarget).closest('.staff-row').data('index'));
      const staff = foundry.utils.deepClone(this.item.system.staff || []);
      staff.splice(idx, 1);
      await this.item.update({ "system.staff": staff });
    });
  }
}

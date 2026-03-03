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

    // Image button — open file picker
    html.find('.hq-img-btn').click(ev => {
      const fp = new FilePicker({
        type: "image",
        current: this.item.img,
        callback: path => this.item.update({ img: path })
      });
      fp.render(true);
    });

    // Resource FEAT button
    html.find('.hq-resource-feat').click(ev => {
      const sys = this.item.system;
      const isRented = sys.ownership === "rented";
      const costRank = isRented ? (sys.rentCost || "Typical") : (sys.purchaseCost || "Typical");
      const costType = isRented ? "Rent" : "Purchase";
      FaseripHeadquartersSheet.rollHQResourceFEAT(this.item.name, costRank, costType);
    });

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

    // Click package name to send chat card
    html.find('.pkg-name').click(ev => {
      const idx = Number($(ev.currentTarget).closest('.pkg-row').data('index'));
      const pkg = this.item.system.packages?.[idx];
      if (!pkg) return;
      FaseripHeadquartersSheet.sendPackageChatCard(pkg, this.item.name);
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

  static sendPackageChatCard(pkg, hqName) {
    const def = ROOM_PACKAGES[pkg.type];
    if (!def) return;
    const tier = def.tiers[pkg.tier || 0] || def.tiers[0];
    const qty = (pkg.quantity || 1) > 1 ? ` &times;${pkg.quantity}` : '';
    const abilityLine = tier.abilityRank
      ? `<div style="margin-top:4px;"><strong>Ability Rank:</strong> <span style="background:#5b7a3a;color:#fff;border-radius:3px;padding:1px 6px;font-weight:bold;font-size:11px;">${tier.abilityRank}</span></div>`
      : '';

    const content = `
      <div class="faserip-chat-card" style="border:1px solid #c0a070;border-radius:4px;padding:6px 8px;background:#faf8f2;">
        <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">${hqName || 'Headquarters'}</div>
        <div style="font-weight:bold;font-size:13px;color:#8b0000;">${def.name}${qty}</div>
        <div style="font-size:11px;color:#666;margin-top:2px;">
          <strong>${tier.label}</strong> — Cost: <strong>${tier.cost}</strong> — Rooms: ${def.rooms}
        </div>
        <div style="font-size:11px;margin-top:4px;">${tier.desc}</div>
        ${abilityLine}
      </div>
    `;

    ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker(),
      type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
  }

  static rollHQResourceFEAT(hqName, costRank, costType) {
    const ranks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000"
    ];

    // Build character picker — team members first, then all heroes
    const teamIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const heroes = game.actors.filter(a =>
      (a.type === "hero" || a.type === "npc") && a.hasPlayerOwner
    ).sort((a, b) => {
      const aTeam = teamIds.includes(a.id) ? 0 : 1;
      const bTeam = teamIds.includes(b.id) ? 0 : 1;
      return aTeam - bTeam || a.name.localeCompare(b.name);
    });

    const heroOpts = heroes.map(a => {
      const res = a.system.attributes?.resources;
      const tag = teamIds.includes(a.id) ? '' : ' (other)';
      return `<option value="${a.id}">${a.name}${tag} — ${res?.rank || '?'} (${res?.value || 0})</option>`;
    }).join('');

    const desc = `${hqName} — ${costType}`;
    const costIdx = ranks.indexOf(costRank);

    new Dialog({
      title: `Resource FEAT: ${costType}`,
      content: `<form style="font-size:12px;">
        <div class="form-group"><label>Character:</label>
          <select name="heroId" style="width:100%">${heroOpts}</select></div>
        <div class="form-group"><label>Cost Rank:</label>
          <select name="costRank" style="width:100%">${ranks.map(r =>
            `<option value="${r}" ${r === costRank ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div class="form-group"><label>Description:</label>
          <input type="text" name="desc" value="${desc}" style="width:100%" /></div>
        <div class="form-group"><label><input type="checkbox" name="bankLoan" /> Bank Loan (+1 rank purchase)</label></div>
      </form>`,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Roll",
          callback: async (html) => {
            const heroId = html.find('[name="heroId"]').val();
            const hero = game.actors.get(heroId);
            if (!hero) return ui.notifications.warn("Select a character");

            const itemRank = html.find('[name="costRank"]').val();
            const description = html.find('[name="desc"]').val() || desc;
            const bankLoan = html.find('[name="bankLoan"]').is(':checked');

            const resourceRank = hero.system.attributes?.resources?.rank;
            const resourceValue = hero.system.attributes?.resources?.value || 0;
            const resourceIdx = ranks.indexOf(resourceRank);
            const itemIdx = ranks.indexOf(itemRank);

            if (resourceIdx === -1 || itemIdx === -1) {
              return ui.notifications.error("Invalid rank");
            }

            if (itemIdx > resourceIdx + (bankLoan ? 1 : 0)) {
              return ui.notifications.warn("Cost rank exceeds Resources" + (bankLoan ? " even with bank loan" : "") + ".");
            }

            let featColorNeeded;
            const diff = resourceIdx - itemIdx;
            if (diff >= 3) featColorNeeded = "Automatic";
            else if (diff >= 1) featColorNeeded = "Green";
            else featColorNeeded = "Yellow";

            const roll = new Roll("1d100");
            await roll.evaluate();

            const resultColor = game.msh.rollUniversalTable(resourceRank, roll.total);
            const resultLower = resultColor.toLowerCase();
            let success = false;
            if (featColorNeeded === "Automatic") success = true;
            else if (featColorNeeded === "Green") success = ["green", "yellow", "red"].includes(resultLower);
            else if (featColorNeeded === "Yellow") success = ["yellow", "red"].includes(resultLower);

            const colorMap = { white: "#f8f8f8", green: "#4CAF50", yellow: "#FFC107", red: "#F44336" };
            const textColor = ["white", "yellow"].includes(resultLower) ? "#333" : "white";

            const chatContent = `
              <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;">
                <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
                  <strong>${hero.name} — Resource FEAT</strong>
                </div>
                <div style="padding:5px 10px;font-size:0.9em;">
                  <div>Resources: ${resourceRank} (${resourceValue})</div>
                  <div>${description}: <strong>${itemRank}</strong></div>
                  ${bankLoan ? '<div>Using Bank Loan</div>' : ''}
                  <div>Required: ${featColorNeeded}</div>
                  <div>Roll: ${roll.total}</div>
                </div>
                <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;
                  background-color:${colorMap[resultLower]};color:${textColor};">
                  ${resultColor.toUpperCase()}
                </div>
                <div style="padding:5px 10px;font-size:1.1em;text-align:center;font-weight:bold;color:${success ? '#4CAF50' : '#F44336'};">
                  ${success ? 'SUCCESS' : 'FAILURE'}
                </div>
                ${bankLoan && success ? `
                  <div style="padding:5px 10px;font-size:0.9em;background:#fffde7;border:1px solid #ffd54f;margin-top:5px;">
                    <strong>Bank loan approved</strong> — Monthly payment of ${ranks[Math.max(0, resourceIdx - 2)]} for ${itemIdx + 1} months.
                  </div>` : ''}
              </div>`;

            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: hero }),
              content: chatContent
            });

            // Log to karma history
            const history = foundry.utils.deepClone(hero.system.karma?.history || []);
            history.push({
              timestamp: new Date().toISOString(),
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: 0,
              type: "Resource FEAT",
              description: `${description} (${itemRank}) - ${success ? 'SUCCESS' : 'FAILED'}${bankLoan ? ' [Bank Loan]' : ''}`
            });
            if (typeof game.msh?.runAsGM === 'function') {
              game.msh.runAsGM({
                operation: 'update',
                targetActorUuid: hero.uuid,
                args: [{ "system.karma.history": history }]
              });
            } else {
              await hero.update({ "system.karma.history": history });
            }
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }).render(true);
  }
}

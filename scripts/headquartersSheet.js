// headquartersSheet.js v3.0.1 - 2026-04-19
// v3.0.1: Drop deprecated CONST.CHAT_MESSAGE_TYPES.OTHER on two chat
//         cards (the first card emitter and the rent-due whisper).
//         Removed in v13 (replaced by CHAT_MESSAGE_STYLES). Default
//         non-roll style is OTHER already.
// v3.0.0: Migrate to ApplicationV2 / ItemSheetV2 (v16 prep; v14 backward-compat shims gone in v16)
// v2.0.1 - 2026-04-03
import { BUILDING_TYPES, BUILDING_TYPE_MAP, ROOM_PACKAGES, STAFF_ROLES, SIZE_ROOMS } from "./hq-constants.js";
import { initSheetZoom } from './modules/ui/sheet-zoom.js';
import { RANKS_ORDERED as RANKS } from './rules/rules-reference.js';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

function _getGameDate() {
  try {
    const d = game.msh.getCampaignDateTime().date;
    return { date: d, formatted: `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}` };
  } catch { return { date: null, formatted: "" }; }
}

function _getGameMonth() {
  try {
    const d = game.msh.getCampaignDateTime().date;
    return { month: d.getMonth(), year: d.getFullYear() };
  } catch { return null; }
}

// Compare game date month/year to a stored date string like "3/15/1976"
function _computeRentStatus(lastPaidStr) {
  const now = _getGameMonth();
  if (!now) return "unknown";
  if (!lastPaidStr) return "new";
  const parts = lastPaidStr.split("/");
  if (parts.length < 3) return "new";
  const paidMonth = parseInt(parts[0]) - 1;
  const paidYear = parseInt(parts[2]);
  const monthsDiff = (now.year - paidYear) * 12 + (now.month - paidMonth);
  if (monthsDiff <= 0) return "current";
  if (monthsDiff === 1) return "due";
  return "overdue";
}

export class FaseripHeadquartersSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["faserip", "sheet", "item", "headquarters"],
    position: { width: 520, height: 580 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    main: { template: "systems/msh-faserip/templates/hq-sheet.html", scrollable: [".hq-body"] }
  };

  /** Use item name alone as window title (drops V2's "TYPES.Item.headquarters:" prefix) */
  get title() { return this.item?.name ?? super.title; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system;
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

    // Rent status
    const rentCost = context.system.rentCost || "";
    const locMod = context.system.locationModifier || "normal";
    if (rentCost && locMod !== "normal") {
      const idx = RANKS.indexOf(rentCost);
      if (idx >= 0) {
        const shift = locMod === "rich" ? 1 : -1;
        const adjusted = RANKS[Math.max(0, Math.min(RANKS.length - 1, idx + shift))];
        context.rentDisplayCost = `${adjusted}`;
      } else {
        context.rentDisplayCost = rentCost;
      }
    } else {
      context.rentDisplayCost = rentCost || "—";
    }

    const rentStatus = _computeRentStatus(context.system.rentLastPaidGameDate);
    context.rentStatusClass = `rent-${rentStatus}`;
    const statusLabels = { current: "CURRENT", due: "DUE", overdue: "OVERDUE", new: "NEW", unknown: "" };
    context.rentStatusLabel = statusLabels[rentStatus] || "";

    // Loan tracking
    context.hasLoan = (context.system.loanPaymentsRemaining || 0) > 0 && context.system.loanPaymentRank;

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    initSheetZoom(this);
    if (!this.isEditable) return;
    const html = $(this.element);

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

    // Resource FEAT button (for purchase)
    html.find('.hq-resource-feat').click(ev => {
      const sys = this.item.system;
      const isRented = sys.ownership === "rented";
      const costRank = isRented ? (sys.rentCost || "Typical") : (sys.purchaseCost || "Typical");
      const costType = isRented ? "Rent" : "Purchase";
      FaseripHeadquartersSheet.rollHQResourceFEAT(this.item, costRank, costType, false);
    });

    // Pay Rent button
    html.find('.hq-pay-rent').click(ev => {
      const sys = this.item.system;
      const rentCost = sys.rentCost || "Typical";
      // Apply location modifier
      const locMod = sys.locationModifier || "normal";
      let effectiveCost = rentCost;
      if (locMod !== "normal") {
        const idx = RANKS.indexOf(rentCost);
        if (idx >= 0) {
          const shift = locMod === "rich" ? 1 : -1;
          effectiveCost = RANKS[Math.max(0, Math.min(RANKS.length - 1, idx + shift))];
        }
      }
      FaseripHeadquartersSheet.rollHQResourceFEAT(this.item, effectiveCost, "Rent", true);
    });

    // Pay Loan button
    html.find('.hq-pay-loan').click(ev => {
      const sys = this.item.system;
      const loanRank = sys.loanPaymentRank || "Typical";
      FaseripHeadquartersSheet.rollHQResourceFEAT(this.item, loanRank, "Loan Payment", true, true);
    });

    // Rent last-paid date — manual save on blur to avoid submitOnChange re-render
    html.find('.hq-rent-date-input').on('blur', async ev => {
      const val = ev.currentTarget.value.trim();
      if (val !== (this.item.system.rentLastPaidGameDate || "")) {
        await this.item.update({ "system.rentLastPaidGameDate": val });
      }
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

    // --- JSON export/import ---
    html.find('.hq-export-json').click(ev => this._onExportJSON());
    html.find('.hq-import-json').click(ev => this._onImportJSON());
  }

  // ===== JSON EXPORT/IMPORT =====

  _onExportJSON() {
    const sys = foundry.utils.deepClone(this.item.system);
    const data = {
      name: this.item.name,
      img: this.item.img,
      system: sys
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.item.name.replace(/[^a-z0-9]/gi, '_')}_hq.json`;
    a.click();
    URL.revokeObjectURL(url);
    ui.notifications.info(`Exported ${this.item.name} HQ data`);
  }

  async _onImportJSON() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.system) {
          ui.notifications.error("Invalid HQ JSON — missing system data");
          return;
        }
        const confirmed = await Dialog.confirm({
          title: "Import HQ Data",
          content: `<p>Import <strong>${data.name || 'HQ'}</strong> data? This will overwrite current HQ configuration.</p>`
        });
        if (!confirmed) return;
        const updates = { system: data.system };
        if (data.name) updates.name = data.name;
        if (data.img) updates.img = data.img;
        await this.item.update(updates);
        ui.notifications.info(`Imported ${data.name || 'HQ'} data`);
      } catch (err) {
        console.error("[FASERIP ERROR] HQ JSON import failed:", err);
        ui.notifications.error("Failed to parse HQ JSON file");
      }
    };
    input.click();
  }

  // ===== CHAT CARDS =====

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
      speaker: ChatMessage.getSpeaker()
    });
  }

  // ===== RENT DUE CHAT CARD (called from team sheet Process Rent) =====

  static async sendRentDueChatCard(hqItem, ownerActorIds) {
    const sys = hqItem.system;
    const rentCost = sys.rentCost || "Typical";
    const locMod = sys.locationModifier || "normal";
    let effectiveCost = rentCost;
    if (locMod !== "normal") {
      const idx = RANKS.indexOf(rentCost);
      if (idx >= 0) {
        const shift = locMod === "rich" ? 1 : -1;
        effectiveCost = RANKS[Math.max(0, Math.min(RANKS.length - 1, idx + shift))];
      }
    }
    const gd = _getGameDate();
    const dateLine = gd.formatted ? `Due: ${gd.formatted}` : '';

    const content = `
      <div class="faserip-chat-card" style="border:1px solid #c0a070;border-radius:4px;padding:6px 8px;background:#fdf8f0;">
        <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Rent Due</div>
        <div style="font-weight:bold;font-size:13px;color:#8b0000;">${hqItem.name}</div>
        <div style="font-size:11px;color:#666;margin-top:2px;">
          ${sys.location || ''}
        </div>
        <div style="font-size:12px;margin-top:4px;">
          <strong>Rent: ${effectiveCost}/month</strong>
        </div>
        ${dateLine ? `<div style="font-size:11px;color:#666;margin-top:2px;">${dateLine}</div>` : ''}
        <div style="font-size:11px;margin-top:6px;padding:3px 6px;background:#fff3cd;border:1px solid #ffc107;border-radius:3px;">
          Resource FEAT vs <strong>${effectiveCost}</strong> required to cover rent.
        </div>
      </div>
    `;

    // Whisper to players who own the relevant actors
    const whisperIds = [];
    for (const actorId of ownerActorIds) {
      const actor = game.actors.get(actorId);
      if (!actor) continue;
      for (const user of game.users) {
        if (!user.isGM && actor.testUserPermission(user, "OWNER")) {
          if (!whisperIds.includes(user.id)) whisperIds.push(user.id);
        }
      }
    }
    // Always include GM
    for (const user of game.users) {
      if (user.isGM && !whisperIds.includes(user.id)) whisperIds.push(user.id);
    }

    await ChatMessage.create({
      content,
      speaker: { alias: "HQ Management" },
      whisper: whisperIds
    });
  }

  // ===== RESOURCE FEAT =====

  static rollHQResourceFEAT(hqItem, costRank, costType, isPayment, isLoan = false) {
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

    const hqName = hqItem.name || "Headquarters";
    const desc = `${hqName} — ${costType}`;
    const costIdx = RANKS.indexOf(costRank);
    const showBankLoan = !isPayment && !isLoan;

    new Dialog({
      title: `Resource FEAT: ${costType}`,
      content: `<form style="font-size:12px;">
        <div class="form-group"><label>Character:</label>
          <select name="heroId" style="width:100%">${heroOpts}</select></div>
        <div class="form-group"><label>Cost Rank:</label>
          <select name="costRank" style="width:100%">${RANKS.map(r =>
            `<option value="${r}" ${r === costRank ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div class="form-group"><label>Description:</label>
          <input type="text" name="desc" value="${desc}" style="width:100%" /></div>
        ${showBankLoan ? '<div class="form-group"><label><input type="checkbox" name="bankLoan" /> Bank Loan (+1 rank purchase)</label></div>' : ''}
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
            const bankLoan = showBankLoan && html.find('[name="bankLoan"]').is(':checked');

            const resourceRank = hero.system.attributes?.resources?.rank;
            const resourceValue = hero.system.attributes?.resources?.value || 0;
            const resourceIdx = RANKS.indexOf(resourceRank);
            const itemIdx = RANKS.indexOf(itemRank);

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

            const gd = _getGameDate();

            // Bank loan setup info
            let bankLoanHtml = '';
            let loanUpdates = {};
            if (bankLoan && success) {
              const loanPaymentRank = RANKS[Math.max(0, resourceIdx - 2)];
              const loanMonths = itemIdx + 1;
              bankLoanHtml = `
                <div style="padding:5px 10px;font-size:0.9em;background:#fffde7;border:1px solid #ffd54f;margin-top:5px;">
                  <strong>Bank loan approved</strong> — ${loanPaymentRank}/month for ${loanMonths} months.
                </div>`;
              loanUpdates = {
                "system.loanPaymentRank": loanPaymentRank,
                "system.loanPaymentsRemaining": loanMonths,
                "system.loanPaymentsTotal": loanMonths,
                "system.loanLastPaid": new Date().toISOString(),
                "system.loanLastPaidGameDate": gd.formatted
              };
            }

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
                ${bankLoanHtml}
              </div>`;

            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: hero }),
              content: chatContent
            });

            // Stamp rent/loan payment on success
            if (isPayment && success) {
              const hqUpdates = {};
              if (isLoan) {
                const remaining = Math.max(0, (hqItem.system.loanPaymentsRemaining || 1) - 1);
                hqUpdates["system.loanPaymentsRemaining"] = remaining;
                hqUpdates["system.loanLastPaid"] = new Date().toISOString();
                hqUpdates["system.loanLastPaidGameDate"] = gd.formatted;
                if (remaining === 0) {
                  hqUpdates["system.loanPaymentRank"] = "";
                  hqUpdates["system.loanPaymentsTotal"] = 0;
                }
              } else {
                hqUpdates["system.rentLastPaid"] = new Date().toISOString();
                hqUpdates["system.rentLastPaidGameDate"] = gd.formatted;
              }
              if (typeof game.msh?.runAsGM === 'function') {
                game.msh.runAsGM({
                  operation: 'updateItem',
                  targetItemUuid: hqItem.uuid,
                  args: [hqUpdates]
                });
              } else {
                await hqItem.update(hqUpdates);
              }
            }

            // Bank loan setup on HQ item
            if (Object.keys(loanUpdates).length) {
              if (typeof game.msh?.runAsGM === 'function') {
                game.msh.runAsGM({
                  operation: 'updateItem',
                  targetItemUuid: hqItem.uuid,
                  args: [loanUpdates]
                });
              } else {
                await hqItem.update(loanUpdates);
              }
            }

            // Log to karma history
            const history = foundry.utils.deepClone(hero.system.karma?.history || []);
            history.push({
              timestamp: new Date().toISOString(),
              realDate: new Date().toLocaleDateString(),
              gameDate: gd.formatted,
              amount: 0,
              type: "Resource FEAT",
              description: `${description} (${itemRank}) — Roll: ${roll.total} ${resultColor} — ${success ? 'SUCCESS' : 'FAILED'}${bankLoan ? ' [Bank Loan]' : ''}`
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

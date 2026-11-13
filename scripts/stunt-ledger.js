// scripts/stunt-ledger.js v1.0.0 - 2026-11-13
// v1.0.0: Shared Power Stunt helpers for the Stunts tab, the Edit Power
//         sheet and the stunt roller: attempt cost by parent power (Weather
//         Control 50, else 100), FEAT status by successes, live-rank table
//         rows, and the one Add Stunt dialog both sheets open.
import { powerStuntRequiredColor, POWER_STUNT_MASTERY } from "./lib/faserip-rules/faserip-karma.js";
import { shiftRank, RANK_VALUES, RANKS_ORDERED } from "./rules/rules-reference.js";

export const STUNT_KARMA_COST = 100;
const HALF_COST = ["weather control"];

export function stuntKarmaCost(power) {
  const type = String(power?.system?.type || "").toLowerCase();
  const name = String(power?.name || "").toLowerCase();
  return HALF_COST.some(k => type === k || name.includes(k)) ? 50 : STUNT_KARMA_COST;
}

export function stuntStatus(successes) {
  const n = Math.max(0, Number(successes) || 0);
  const c = powerStuntRequiredColor(n);
  if (c === "automatic") return { key: "mastered", label: "Mastered", feat: null };
  return { key: c, label: `${c.charAt(0).toUpperCase()}${c.slice(1)} FEAT`, feat: c };
}

export function successesToMastery(successes) {
  return Math.max(0, POWER_STUNT_MASTERY - (Number(successes) || 0));
}

export function stuntRow(actor, stunt, index, shiftFor = () => 0) {
  const power = stunt?.parentPowerId ? actor?.items?.get?.(stunt.parentPowerId) : null;
  const rank = power?.system?.rank || stunt?.rank || "Typical";
  const value = Number(power?.system?.value ?? stunt?.value) || RANK_VALUES[rank] || 0;
  const shift = Number(shiftFor(stunt)) || 0;
  const status = stuntStatus(stunt?.timesUsed);
  const cost = stuntKarmaCost(power);
  const effectRank = shift ? shiftRank(rank, shift) : rank;
  return {
    index,
    name: stunt?.name || "(unnamed)",
    description: stunt?.description || "",
    parentName: power?.name || stunt?.parentPower || "",
    parentPowerId: power ? power.id : (stunt?.parentPowerId || null),
    parentMissing: !!(stunt?.parentPowerId && !power),
    rank,
    value,
    shift,
    shiftLabel: shift ? `${shift > 0 ? "+" : ""}${shift}CS (${effectRank})` : "",
    successes: Math.max(0, Number(stunt?.timesUsed) || 0),
    toMastery: successesToMastery(stunt?.timesUsed),
    statusKey: status.key,
    statusLabel: status.label,
    mastered: status.key === "mastered",
    cost,
    costLabel: status.key === "mastered" ? "No cost" : `${cost} Karma`
  };
}

export function stuntRows(actor, shiftFor) {
  return (actor?.system?.stunts || []).map((s, i) => stuntRow(actor, s, i, shiftFor));
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function openAddStuntDialog(actor, { parentPowerId = null } = {}) {
  if (!actor) return ui.notifications.warn("This power must be on a character to add stunts.");
  const DialogV2 = foundry.applications.api.DialogV2;
  const powers = actor.items.filter(i => i.type === "power");
  const parent = parentPowerId ? actor.items.get(parentPowerId) : null;
  const powerOptions = powers.map(p =>
    `<option value="${p.id}" ${p.id === parentPowerId ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  const fallbackRank = parent?.system?.rank || "Typical";
  const rankOptions = RANKS_ORDERED.map(r =>
    `<option value="${r}" ${r === fallbackRank ? "selected" : ""}>${r}</option>`).join("");

  const created = await DialogV2.wait({
    window: { title: parent ? `Add Power Stunt: ${parent.name}` : "Add Power Stunt" },
    content: `
      <form class="faserip-add-stunt">
        <div class="form-group">
          <label>Stunt name</label>
          <input type="text" name="name" placeholder="e.g., Triple Teleport" autofocus>
        </div>
        <div class="form-group">
          <label>Parent power</label>
          <select name="parentPowerId">
            <option value="" ${parentPowerId ? "" : "selected"}>(None: general stunt)</option>
            ${powerOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Rank if no parent power</label>
          <select name="rank">${rankOptions}</select>
        </div>
        <div class="form-group">
          <label>Earlier successes</label>
          <input type="number" name="timesUsed" value="0" min="0" max="${POWER_STUNT_MASTERY}">
        </div>
        <p class="notes">Count earlier successful uses: for an established hero, each time the comics show the stunt; for a stunt a power grants at creation, as the Judge rules. 0 = red FEAT, 1-3 yellow, 4-9 green, ${POWER_STUNT_MASTERY} mastered.</p>
        <div class="form-group stacked">
          <label>Description</label>
          <textarea name="description" rows="4" placeholder="What the stunt does, its rank shift and FEAT if any"></textarea>
        </div>
      </form>`,
    buttons: [
      {
        action: "create",
        label: "Add Stunt",
        default: true,
        callback: async (event, button, dialog) => {
          const root = dialog.element;
          const name = root.querySelector('[name="name"]').value?.trim();
          if (!name) {
            ui.notifications.warn("Stunt name is required.");
            return false;
          }
          const pid = root.querySelector('[name="parentPowerId"]').value || null;
          const power = pid ? actor.items.get(pid) : null;
          const rank = power?.system?.rank || root.querySelector('[name="rank"]').value;
          const timesUsed = Math.min(POWER_STUNT_MASTERY,
            Math.max(0, parseInt(root.querySelector('[name="timesUsed"]').value) || 0));
          const stunts = foundry.utils.deepClone(actor.system.stunts || []);
          stunts.push({
            name,
            parentPowerId: pid,
            parentPower: power?.name || null,
            rank,
            value: Number(power?.system?.value) || RANK_VALUES[rank] || 0,
            description: root.querySelector('[name="description"]').value || "",
            timesUsed
          });
          await actor.update({ "system.stunts": stunts });
          ui.notifications.info(`Stunt "${name}" added to ${actor.name}'s Stunts tab.`);
          return true;
        }
      },
      { action: "cancel", icon: "fas fa-times", label: "Cancel" }
    ],
    rejectClose: false
  });
  return created === true;
}

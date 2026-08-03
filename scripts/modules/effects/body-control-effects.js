// scripts/modules/effects/body-control-effects.js v1.1.1 - 2026-07-04
// v1.1.1: 8a-ii state AEs — Phasing (intangible flag; mitigation zeroes non-
//         psychic damage), Invisibility + Blending (invisible status badge;
//         sensing left to GM per Kurt, no auto sense-gate). Density Shift-0
//         immunity still deferred to the mass-choice UI.
// scripts/modules/effects/body-control-effects.js v1.0.0 - 2026-07-04
// Auto-build state Active Effects from body-control powers (audit Step #8,
// slice 8a-i), mirroring defense-effects.js. Toggled by the power's isActive
// (the sheet's bolt); synced from the item create/update/delete hooks in
// init.js alongside syncDefenseEffects.
//
//   Growth    -> system.combatMods.defenseShift −tier  (easier to be hit)
//   Shrinking -> system.combatMods.defenseShift +tier  (harder to be hit)
//   Density Manipulation Self -> bodyArmor AE (physical+energy = rank), and at
//                 high mass (rank value > Endurance) −1CS Fighting/Agility
//   Plasticity -> bodyArmor AE (physical = rank; elastic/blunt)
//
// combatMods changes use the effect-engine string-mode convention
// ({ mode: "add", priority: 20 }). Body-armor AEs use the exact flag shape
// defense-effects.getBodyArmorFromEffects reads (effectCategory "defense",
// defenseType "bodyArmor", physical/energy/*Rank), so mitigation picks them up
// with no changes to the mitigation pipeline.
//
// Out of scope here (8a-ii / choice UI): Growth's Strength-as-rank, Shrinking's
// attacking bonus vs larger foes (target-relative), Density's Shift-0 immunity
// (lowest-mass choice), Phasing/Invisibility/Blending.

import { buildBodyArmorAE } from "./defense-effects.js";

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");
const rv = (r) => Number(game.msh?.getRankValue?.(r)) || Number(CONFIG.FASERIP?.rankValues?.[r]) || 0;
const bcId = (kind, itemId) => `bc-${kind}-${itemId}`;
const nameKey = (item) => String(item?.name || "").toLowerCase();

// Rank -> size tier (1/2/3). RAW Growth: Fe-Gd=+1, Rm-Am=+2, Mn+=+3 to be hit;
// Shrinking mirrors it. Excellent (between Good and Remarkable) defaults to
// tier 1 — flag to adjust if Kurt reads it as tier 2.
const TIER_2 = new Set(["Remarkable", "Incredible", "Amazing"]);
const TIER_3 = new Set(["Monstrous", "Unearthly", "Shift-X", "Shift-Y", "Shift-Z",
  "Class 1000", "Class 3000", "Class 5000", "Beyond"]);
function sizeTier(rank) {
  if (TIER_3.has(rank)) return 3;
  if (TIER_2.has(rank)) return 2;
  return 1;
}

function isKind(item, ...keys) {
  const k = nameKey(item);
  const t = String(item?.system?.type || "").toLowerCase();
  return keys.some(n => k === n || t === n);
}

// ── AE register / remove (dedup by flags.<scope>.ongoingId) ──────────────────
async function registerBcAE(actor, ongoingId, aeData, disabled) {
  const scope = SCOPE();
  aeData.flags = aeData.flags || {};
  aeData.flags[scope] = { ...(aeData.flags[scope] || {}), ongoingId };
  aeData.disabled = !!disabled;
  const existing = actor.effects.find(e => e.flags?.[scope]?.ongoingId === ongoingId);
  if (existing) {
    await actor.updateEmbeddedDocuments("ActiveEffect", [{ _id: existing.id, ...aeData }]);
  } else {
    await actor.createEmbeddedDocuments("ActiveEffect", [aeData]);
  }
}
async function removeBcAE(actor, ongoingId) {
  const scope = SCOPE();
  const gone = actor.effects.filter(e => e.flags?.[scope]?.ongoingId === ongoingId).map(e => e.id);
  if (gone.length) await actor.deleteEmbeddedDocuments("ActiveEffect", gone);
}

function buildShiftAE(item, ongoingId, label, changes) {
  const scope = SCOPE();
  return {
    name: label,
    img: item.img || "",
    changes,
    flags: { [scope]: { effectCategory: "bodyControl", ongoingId, powerItemId: item.id, powerName: item.name } }
  };
}
const ADD = (key, value) => ({ key, mode: "add", value: String(value), priority: 20 });

// Status/flag-based state AE (no changes) — for intangibility/concealment states.
function buildStateAE(item, ongoingId, label, { statuses = [], flags = {} } = {}) {
  const scope = SCOPE();
  return {
    name: label,
    img: item.img || "",
    changes: [],
    statuses,
    flags: { [scope]: { effectCategory: "bodyControl", ongoingId, powerItemId: item.id, powerName: item.name, ...flags } }
  };
}

/**
 * Sync body-control state AEs for a single power item.
 * Called from the item create/update/delete hooks (alongside syncDefenseEffects).
 */
export async function syncBodyControlEffects(actor, item, removing = false) {
  if (!actor || !item || item.type !== "power") return;
  const sys = item.system || {};
  const inactive = !removing && sys.activationType !== "passive" && sys.isActive === false;
  const rank = sys.rank || "Typical";
  const val = rv(rank);

  // ── Growth: easier to be hit (−tier defense shift) ──
  {
    const id = bcId("growth", item.id);
    if (!removing && isKind(item, "growth")) {
      const t = sizeTier(rank);
      await registerBcAE(actor, id, buildShiftAE(item, id, `Growth (size: +${t} to be hit)`, [
        ADD("system.combatMods.defenseShift", -t),
        ADD("system.combatMods.defenseShiftRanged", -t)
      ]), inactive);
    } else await removeBcAE(actor, id);
  }

  // ── Shrinking: harder to be hit (+tier defense shift) ──
  {
    const id = bcId("shrinking", item.id);
    if (!removing && isKind(item, "shrinking")) {
      const t = sizeTier(rank);
      await registerBcAE(actor, id, buildShiftAE(item, id, `Shrinking (size: −${t} to be hit)`, [
        ADD("system.combatMods.defenseShift", t),
        ADD("system.combatMods.defenseShiftRanged", t)
      ]), inactive);
    } else await removeBcAE(actor, id);
  }

  // ── Density Manipulation (Self): body armor = rank; high mass −1CS Fight/Agi ──
  {
    const baId = bcId("density-ba", item.id);
    const shiftId = bcId("density-shift", item.id);
    if (!removing && isKind(item, "density manipulation self", "density manipulation", "density manipulation (self)", "densityself")) {
      await registerBcAE(actor, baId, buildBodyArmorAE(item, {
        ongoingId: baId, physical: val, energy: val,
        physicalRank: rank, energyRank: rank, armorNature: "natural"
      }), inactive);
      const endVal = Number(actor.system?.abilities?.endurance?.value) || 0;
      if (val > endVal) {
        await registerBcAE(actor, shiftId, buildShiftAE(item, shiftId, "Density (high mass: −1CS Fight/Agi)", [
          ADD("system.combatMods.abilityShifts.fighting", -1),
          ADD("system.combatMods.abilityShifts.agility", -1)
        ]), inactive);
      } else await removeBcAE(actor, shiftId);
    } else { await removeBcAE(actor, baId); await removeBcAE(actor, shiftId); }
  }

  // ── Plasticity: body armor = rank (elastic; physical/blunt) ──
  {
    const id = bcId("plasticity-ba", item.id);
    if (!removing && isKind(item, "plasticity")) {
      await registerBcAE(actor, id, buildBodyArmorAE(item, {
        ongoingId: id, physical: val, energy: 0,
        physicalRank: rank, energyRank: "", armorNature: "natural"
      }), inactive);
    } else await removeBcAE(actor, id);
  }

  // ── Phasing: intangible — immune to all damage but psychic (RAW, Kurt).
  // mitigation reads flags.bodyControlType === "phasing" and zeroes non-mental
  // damage (mental attacks route through mental-action, not mitigation). ──
  {
    const id = bcId("phasing", item.id);
    if (!removing && isKind(item, "phasing")) {
      await registerBcAE(actor, id, buildStateAE(item, id,
        "Phasing (intangible — immune to non-psychic damage)",
        { flags: { bodyControlType: "phasing" } }), inactive);
    } else await removeBcAE(actor, id);
  }

  // ── Invisibility: applies the invisible status (status-only badge, per
  // Kurt). RAW sensing an invisible target (Monstrous Intuition FEAT) is left
  // to GM adjudication — deliberately NOT auto-gated in the attack flow. ──
  {
    const id = bcId("invisibility", item.id);
    if (!removing && isKind(item, "invisibility")) {
      await registerBcAE(actor, id, buildStateAE(item, id, "Invisibility",
        { statuses: ["invisible"], flags: { bodyControlType: "invisibility" } }), inactive);
    } else await removeBcAE(actor, id);
  }

  // ── Blending: hidden until you move or act (GM untoggles). Same invisible
  // status badge as Invisibility. ──
  {
    const id = bcId("blending", item.id);
    if (!removing && isKind(item, "blending")) {
      await registerBcAE(actor, id, buildStateAE(item, id, "Blending (hidden until you move or act)",
        { statuses: ["invisible"], flags: { bodyControlType: "blending" } }), inactive);
    } else await removeBcAE(actor, id);
  }
}

/** Bulk sync (e.g. on world load). */
export async function syncAllBodyControlEffects(actor) {
  if (!actor) return;
  for (const item of actor.items.filter(i => i.type === "power")) {
    await syncBodyControlEffects(actor, item, false);
  }
}

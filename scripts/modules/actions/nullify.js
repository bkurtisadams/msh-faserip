// scripts/modules/actions/nullify.js v2.0.0 - 2026-03-22
// v2.0.0: Area-effect nullification via AreaTemplate with scroll-wheel resize.
//         activateNullifyArea places AoE, rolls Endurance saves for all targets.
// v1.1.0: Use applyNullified from effect-engine for power suppression.
//         startAura now self-suppresses caster's inborn powers.
//         stopAura restores caster's powers via effect deletion hook.
// Foundry v13 helpers for the Nullification power (ES module)

import { applyEffect, applyNullified } from "../effects/effect-engine.js";
import { AreaTemplate } from "./area-template.js";
import { universalColor } from "./action-utils.js";
import { POWER_RANGE_VALUES } from "../dice/universal-table.js";

export const RANKS = [
  "Shift-0","Feeble","Poor","Typical","Good","Excellent","Remarkable","Incredible","Amazing",
  "Monstrous","Unearthly","Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
];
export const rIdx = (r) => Math.max(0, RANKS.findIndex(x => x.toLowerCase() === String(r||"").toLowerCase()));
const order = { white:0, green:1, yellow:2, red:3 };

const scope = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

export const isAuraMaintained = (actor) =>
  !!actor?.effects?.some(e => e.getFlag?.(scope(), "aura.nullify.active") === true);

export async function startAura(actor, originUuid=null) {
  // Create the aura maintenance effect on the caster
  const f = {}; f[scope()] = { aura: { nullify: { active: true } } };
  const auraResult = await actor?.createEmbeddedDocuments("ActiveEffect", [{
    name: "Nullification (Maintaining)", img: "icons/svg/silenced.svg",
    origin: originUuid, disabled: false, flags: f
  }]);

  // Self-suppress: disable caster's own inborn powers (except Nullifying Power itself)
  await applyNullified(actor, { rounds: null, originUuid, selfNullify: true });

  return auraResult;
}

export async function stopAura(actor) {
  // Remove the aura maintenance effect
  const eff = actor?.effects?.find(e => e.getFlag?.(scope(), "aura.nullify.active") === true);
  if (eff) await eff.delete();

  // Remove the self-suppression effect (restoreNullifiedPowers fires via deleteActiveEffect hook)
  const selfNull = actor?.effects?.find(e => {
    const flags = e.flags?.[scope()] || {};
    return flags.effectType === "nullified" && flags.selfNullify === true;
  });
  if (selfNull) await selfNull.delete();
}

export function requiredColorFromDelta(delta) {
  if (delta <= -2) return "green-auto";
  if (delta === -1) return "green";
  if (delta === 0)  return "yellow";
  if (delta === 1)  return "red";
  return "impossible";
}

export function meetsThreshold(rolledColor, requiredColor) {
  if (requiredColor === "green-auto") return true;
  if (requiredColor === "impossible") return false;
  return (order[String(rolledColor).toLowerCase()] >= order[String(requiredColor).toLowerCase()]);
}

export async function applyNullifiedEffect(targetActor, { maintained=false, originUuid=null, rounds=null } = {}) {
  if (maintained) {
    // Maintained aura = no duration (infinite until concentration broken)
    return applyNullified(targetActor, { rounds: null, originUuid, selfNullify: false });
  }
  
  // Temporary nullification = roll 1d10 for rounds
  const roll = await (new Roll("1d10")).evaluate();
  const r = rounds ?? roll.total ?? 10;
  
  return applyNullified(targetActor, { rounds: r, originUuid, selfNullify: false });
}

/** Resolve save & apply effect on failure for a single target. */
export async function resolveAndApply(attacker, target, { endRank, intensityRank, rolledColor, originUuid } = {}) {
  const delta = rIdx(intensityRank) - rIdx(endRank);
  const req = requiredColorFromDelta(delta);
  const ok  = meetsThreshold(rolledColor, req);
  if (!ok) {
    const maintained = isAuraMaintained(attacker);
    await applyNullifiedEffect(target, { maintained, originUuid });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      content: `<b>${target.name}</b> is <b>nullified</b>${maintained ? " (maintained aura)" : " (1–10 rounds)"}`
    });
  }
  return { requiredColor: req, meets: ok, delta };
}

/**
 * Area-effect nullification. Places a resizable AreaTemplate (scroll-wheel),
 * rolls Endurance FEAT for every token in range, applies Nullified on failures,
 * and self-suppresses the caster.
 *
 * @param {Actor} caster - the nullifier
 * @param {string} powerRank - rank name of the Nullifying Power (e.g. "Remarkable")
 * @param {string} [powerItemUuid] - UUID of the power item for origin tracking
 */
export async function activateNullifyArea(caster, powerRank, powerItemUuid = null) {
  if (!caster || !powerRank) return;

  const maxRange = POWER_RANGE_VALUES[powerRank] ?? POWER_RANGE_VALUES[
    Object.keys(POWER_RANGE_VALUES).find(k => k.toLowerCase() === powerRank.toLowerCase())
  ] ?? 4;

  // Place area template — GM can scroll-wheel to resize
  const casterToken = caster.getActiveTokens()?.[0];
  const startX = casterToken?.center?.x ?? 0;
  const startY = casterToken?.center?.y ?? 0;

  const template = await AreaTemplate.create({
    x: startX, y: startY,
    radiusInAreas: Math.max(1, maxRange),
    minRadiusInAreas: 1,
    scrollResize: true,
    label: "Nullify",
    fillColor: "#7b1fa2",
    fillAlpha: 0.2
  });
  if (!template) return; // cancelled

  // Collect tokens in the area (auto-targets them)
  const tokensInArea = await template.target();

  // Filter: skip caster, skip tokens without inborn powers
  const targets = tokensInArea.filter(t => {
    const a = t.actor;
    if (!a || a.id === caster.id) return false;
    // Must have at least one active inborn power
    return a.items.some(i =>
      i.type === "power" &&
      i.system?.isActive !== false &&
      (i.system?.source || "").toLowerCase() === "natural"
    );
  });

  if (targets.length === 0) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: caster }),
      content: `<b>${caster.name}</b> activates <b>Nullifying Power</b> (${powerRank}) — no valid targets in range.`
    });
    // Still self-suppress
    if (!isAuraMaintained(caster)) {
      await startAura(caster, powerItemUuid);
    }
    await template.dismiss();
    return;
  }

  // Roll Endurance FEAT for each target
  const results = [];
  const maintained = isAuraMaintained(caster);

  for (const token of targets) {
    const target = token.actor;
    const endRank = target.system?.abilities?.endurance?.rank || "Typical";
    const roll = await (new Roll("1d100")).evaluate();
    const total = roll.total;
    const color = universalColor(endRank, total);
    const colorLower = String(color || "white").toLowerCase();

    // Determine if the save succeeds
    const delta = rIdx(powerRank) - rIdx(endRank);
    const req = requiredColorFromDelta(delta);
    const saved = meetsThreshold(colorLower, req);

    let durationText = "";
    if (!saved) {
      if (maintained) {
        await applyNullifiedEffect(target, { maintained: true, originUuid: caster.uuid });
        durationText = "while in range";
      } else {
        const dRoll = await (new Roll("1d10")).evaluate();
        await applyNullifiedEffect(target, { maintained: false, originUuid: caster.uuid, rounds: dRoll.total });
        durationText = `${dRoll.total} rounds`;
      }
    }

    results.push({
      name: target.name,
      endRank,
      roll: total,
      color: colorLower,
      required: req,
      saved,
      durationText
    });
  }

  // Self-suppress the caster if not already maintaining
  if (!isAuraMaintained(caster)) {
    await startAura(caster, powerItemUuid);
  }

  // Build summary chat card
  const colorBg = { white: "#e0e0e0", green: "#c8e6c9", yellow: "#fff9c4", red: "#ffcdd2" };
  const rows = results.map(r => {
    const bg = colorBg[r.color] || "#e0e0e0";
    const status = r.saved
      ? `<span style="color:#2e7d32;font-weight:600;">Resisted</span>`
      : `<span style="color:#b71c1c;font-weight:600;">Nullified</span> (${r.durationText})`;
    return `<tr>
      <td style="padding:3px 6px;font-weight:600;">${r.name}</td>
      <td style="padding:3px 6px;text-align:center;">${r.endRank}</td>
      <td style="padding:3px 6px;text-align:center;background:${bg};border-radius:3px;">${r.roll} (${r.color})</td>
      <td style="padding:3px 6px;text-align:center;">${r.required}</td>
      <td style="padding:3px 6px;">${status}</td>
    </tr>`;
  }).join("");

  const nullifiedCount = results.filter(r => !r.saved).length;
  const resistedCount = results.filter(r => r.saved).length;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: caster }),
    content: `
      <div style="border:2px solid #7b1fa2;border-radius:6px;overflow:hidden;">
        <div style="background:#7b1fa2;color:#fff;padding:6px 10px;font-weight:700;font-size:13px;">
          Nullifying Power — ${powerRank} (${caster.name})
        </div>
        <div style="padding:6px;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <tr style="border-bottom:1px solid #ccc;">
              <th style="padding:3px 6px;text-align:left;">Target</th>
              <th style="padding:3px 6px;text-align:center;">End</th>
              <th style="padding:3px 6px;text-align:center;">Roll</th>
              <th style="padding:3px 6px;text-align:center;">Needed</th>
              <th style="padding:3px 6px;text-align:left;">Result</th>
            </tr>
            ${rows}
          </table>
          <div style="padding:4px 6px 2px;font-size:11px;color:#666;">
            ${nullifiedCount} nullified, ${resistedCount} resisted
          </div>
        </div>
      </div>`
  });

  // Dismiss the template after resolution
  await template.dismiss();
}
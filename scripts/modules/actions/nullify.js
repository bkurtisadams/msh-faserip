// scripts/modules/actions/nullify.js v3.0.1 - 2026-07-31
// v3.0.1: Fix auto-fail comment (intensity 2+ ranks above Endurance, not 3+).
// scripts/modules/actions/nullify.js v3.0.0 - 2026-03-22
// v3.0.0: Region-based aura. startAura/stopAura create/destroy a Scene Region
//         that moves with the caster token. Tokens entering/exiting the region
//         automatically roll saves and gain/lose the Nullified effect.
// v2.0.0: Area-effect nullification via AreaTemplate with scroll-wheel resize.
//         activateNullifyArea places AoE, rolls Endurance saves for all targets.
// v1.1.0: Use applyNullified from effect-engine for power suppression.
//         startAura now self-suppresses caster's inborn powers.
//         stopAura restores caster's powers via effect deletion hook.
// Foundry v13 helpers for the Nullification power (ES module)

import { applyEffect, applyNullified } from "../effects/effect-engine.js";
import { AreaTemplate } from "./area-template.js";
import { universalColor } from "./action-utils.js";
import { removeAllAuraEffects, drawAuraVisual, refreshAllAuraVisuals } from "./nullify-aura.js";
import { RANKS, rIdx, getNullifyRange, requiredColorFromDelta, meetsThreshold } from "./nullify-utils.js";

// Re-export so existing consumers (check-action.js, etc.) don't break
export { RANKS, rIdx, getNullifyRange, requiredColorFromDelta, meetsThreshold };

const scope = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

export const isAuraMaintained = (actor) =>
  !!actor?.effects?.some(e => e.getFlag?.(scope(), "aura.nullify.active") === true);

export async function startAura(actor, originUuid=null, powerRank=null) {
  // Create the aura maintenance effect on the caster
  const f = {}; f[scope()] = { aura: { nullify: { active: true, powerRank } } };
  const auraResult = await actor?.createEmbeddedDocuments("ActiveEffect", [{
    name: "Nullification (Maintaining)", img: "icons/svg/silenced.svg",
    origin: originUuid, disabled: false, flags: f
  }]);

  // Self-suppress: disable caster's own inborn powers (except Nullifying Power itself)
  await applyNullified(actor, { rounds: null, originUuid, selfNullify: true });

  // Draw PIXI aura visual on the caster token (moves automatically with token)
  if (powerRank) {
    try {
      const token = actor.getActiveTokens()?.[0];
      if (token) {
        drawAuraVisual(token, getNullifyRange(powerRank));
      }
    } catch (err) {
      console.error("[FASERIP ERROR] Failed to draw nullify aura visual:", err);
    }
  }

  return auraResult;
}

export async function stopAura(actor) {
  // Remove nullified effects from all tokens affected by this caster's aura
  try {
    await removeAllAuraEffects(actor.id);
  } catch (err) {
    console.error("[FASERIP ERROR] Failed to remove aura effects:", err);
  }

  // Remove the aura maintenance effect (triggers deleteActiveEffect hook → refreshes visuals)
  const eff = actor?.effects?.find(e => e.getFlag?.(scope(), "aura.nullify.active") === true);
  if (eff) await eff.delete();

  // Remove the self-suppression effect (restoreNullifiedPowers fires via deleteActiveEffect hook)
  const selfNull = actor?.effects?.find(e => {
    const flags = e.flags?.[scope()] || {};
    return flags.effectType === "nullified" && flags.selfNullify === true;
  });
  if (selfNull) await selfNull.delete();

  // Clean up the PIXI visual
  refreshAllAuraVisuals();
}

export async function applyNullifiedEffect(targetActor, { maintained=false, originUuid=null, rounds=null, auraCasterId=null } = {}) {
  if (maintained) {
    return applyNullified(targetActor, { rounds: null, originUuid, selfNullify: false, auraCasterId });
  }
  
  const r = rounds ?? (await (new Roll("1d10")).evaluate()).total ?? 10;
  
  return applyNullified(targetActor, { rounds: r, originUuid, selfNullify: false, auraCasterId });
}

/** Resolve save & apply effect on failure for a single target. */
export async function resolveAndApply(attacker, target, { endRank, intensityRank, rolledColor, originUuid } = {}) {
  const delta = rIdx(intensityRank) - rIdx(endRank);
  const req = requiredColorFromDelta(delta);
  const ok  = meetsThreshold(rolledColor, req);
  if (!ok) {
    // Check if the attacker OR any actor on the scene is maintaining a nullify aura
    let maintained = isAuraMaintained(attacker);
    let auraCasterId = attacker.id;
    if (!maintained && canvas?.tokens) {
      for (const t of canvas.tokens.placeables) {
        if (t.actor && isAuraMaintained(t.actor)) {
          maintained = true;
          auraCasterId = t.actor.id;
          break;
        }
      }
    }
    await applyNullifiedEffect(target, { maintained, originUuid, auraCasterId });
    const reqLabel = req === "auto-fail" ? "Impossible" : req === "auto-success" ? "Auto" : req.charAt(0).toUpperCase() + req.slice(1);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<div style="border:2px solid #7b1fa2;border-radius:4px;padding:6px;">
        <div style="font-weight:700;color:#7b1fa2;margin-bottom:4px;">${target.name} — Endurance FEAT vs Nullify</div>
        <div style="font-size:.9em;">
          Endurance: ${endRank} | Roll: ${rolledColor} — needed ${reqLabel}.
          <span style="color:#b71c1c;font-weight:600;">NULLIFIED</span>${maintained ? " (while in range)" : " (1–10 rounds)"}
        </div>
      </div>`
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

  const maxRange = getNullifyRange(powerRank);

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
      await startAura(caster, powerItemUuid, powerRank);
    }
    await template.dismiss();
    return;
  }

  // Self-suppress the caster BEFORE rolling saves — RAW: targets lose
  // powers "as long as the hero is in range" when actively maintaining.
  // The 1-10 round duration only applies after concentration is broken.
  if (!isAuraMaintained(caster)) {
    await startAura(caster, powerItemUuid, powerRank);
  }

  // Roll Endurance FEAT for each target
  const results = [];
  const maintained = true; // aura just started above

  for (const token of targets) {
    const target = token.actor;
    const endRank = target.system?.abilities?.endurance?.rank || "Typical";
    const endValue = target.system?.abilities?.endurance?.value ?? 0;
    const delta = rIdx(powerRank) - rIdx(endRank);
    const req = requiredColorFromDelta(delta);

    let total = 0, colorLower = "—", saved = false;

    if (req === "auto-fail") {
      // Intensity 2+ ranks above Endurance — impossible to resist, no roll
      saved = false;
      colorLower = "auto-fail";
    } else {
      const roll = await (new Roll("1d100")).evaluate();
      total = roll.total;
      const color = universalColor(endRank, total);
      colorLower = String(color || "white").toLowerCase();
      saved = meetsThreshold(colorLower, req);
    }

    let durationText = "";
    if (!saved) {
      if (maintained) {
        await applyNullifiedEffect(target, { maintained: true, originUuid: caster.uuid, auraCasterId: caster.id });
        durationText = "while in range";
      } else {
        const dRoll = await (new Roll("1d10")).evaluate();
        await applyNullifiedEffect(target, { maintained: false, originUuid: caster.uuid, rounds: dRoll.total, auraCasterId: caster.id });
        durationText = `${dRoll.total} rounds`;
      }
    }

    results.push({
      name: target.name,
      endRank,
      endValue,
      roll: total,
      color: colorLower,
      required: req,
      saved,
      durationText
    });
  }

  // Build summary chat card
  const colorBg = { white: "#e0e0e0", green: "#c8e6c9", yellow: "#fff9c4", red: "#ffcdd2" };
  const rows = results.map(r => {
    const bg = colorBg[r.color] || "#e0e0e0";
    const rollDisplay = r.color === "auto-fail" ? "—" : `${r.roll} (${r.color})`;
    const reqDisplay = r.required === "auto-fail" ? "Impossible" : r.required.charAt(0).toUpperCase() + r.required.slice(1);
    const statusLabel = r.saved ? "Resisted" : "Nullified";
    const statusColor = r.saved ? "#2e7d32" : "#b71c1c";
    const durationBit = r.saved ? "" : ` <span style="font-weight:400;color:#666;">${r.durationText}</span>`;
    const status = `<span style="color:${statusColor};font-weight:600;">${statusLabel}</span>${durationBit}`;
    return `<tr style="border-bottom:1px solid #eee;">
      <td style="padding:3px 4px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Endurance: ${r.endRank} ${r.endValue}">${r.name}</td>
      <td style="padding:3px 2px;text-align:center;background:${bg};border-radius:3px;">${rollDisplay}</td>
      <td style="padding:3px 2px;text-align:center;">${reqDisplay}</td>
      <td style="padding:3px 4px;">${status}</td>
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
          <table style="width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;">
            <colgroup>
              <col style="width:auto;" />
              <col style="width:56px;" />
              <col style="width:56px;" />
              <col style="width:68px;" />
            </colgroup>
            <tr style="border-bottom:1px solid #ccc;">
              <th style="padding:3px 4px;text-align:left;">Target</th>
              <th style="padding:3px 2px;text-align:center;">Roll</th>
              <th style="padding:3px 2px;text-align:center;">Needed</th>
              <th style="padding:3px 4px;text-align:left;">Result</th>
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
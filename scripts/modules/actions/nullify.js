// scripts/modules/actions/nullify.js v1.1.0 - 2026-03-19
// v1.1.0: Use applyNullified from effect-engine for power suppression.
//         startAura now self-suppresses caster's inborn powers.
//         stopAura restores caster's powers via effect deletion hook.
// Foundry v13 helpers for the Nullification power (ES module)

import { applyEffect, applyNullified } from "../effects/effect-engine.js";

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
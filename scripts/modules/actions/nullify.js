// scripts/modules/actions/nullify.js
// Foundry v13 helpers for the Nullification power (ES module)

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
  const f = {}; f[scope()] = { aura: { nullify: { active: true } } };
  return actor?.createEmbeddedDocuments("ActiveEffect", [{
    name: "Nullification (Maintaining)", icon: "icons/svg/silenced.svg",
    origin: originUuid, disabled: false, flags: f
  }]);
}

export async function stopAura(actor) {
  const eff = actor?.effects?.find(e => e.getFlag?.(scope(), "aura.nullify.active") === true);
  if (eff) return eff.delete();
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
  const f = {}; f[scope()] = { status: { nullified: true } };
  let duration = {};
  if (!maintained) {
    const roll = await (new Roll("1d10")).evaluate();
    const rollTotal = roll?.total ?? 10;
    const r = (rounds ?? rollTotal) ?? 10; // TS-friendly—no ?? mixed with ||
    duration = { rounds: r, startRound: game.combat?.round ?? 0, startTime: game.time.worldTime };
  }
  const effect = {
    name: "Nullified", icon: "icons/svg/silenced.svg",
    origin: originUuid, disabled: false, duration, flags: f
  };
  await targetActor.createEmbeddedDocuments("ActiveEffect", [effect]);
  return effect;
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

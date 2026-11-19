// power-sheet-actor-view.mjs v1.0.0 - 2026-11-19
// v1.0.0: Edit Power fields that read the owning character: Ultimate Skill
//         talent picker, Raise Lowest Ability picker + result, Karma costs,
//         and the Active Effects list (this power's effects and the
//         character's effects tied to it, with shred suppression).
import { valueToRank } from "./rules/rules-reference.js";
import { stuntKarmaCost } from "./stunt-ledger.js";

const SCOPE = () => globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";

export const ABILITIES = ["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Book: Weapon, Fighting, Scientific and Other talents qualify, except
// Student, Heir to Fortune and Leadership.
const ULTIMATE_CATEGORIES = { "Weapon Skills": "Weapon", "Fighting Skills": "Fighting", "Scientific Skills": "Scientific", "Other Talents": "Other" };
const ULTIMATE_EXCLUDED = ["student", "heir to fortune", "leadership"];
const CATEGORY_SHORT = { "Professional Skills": "Professional", "Mystic and Mental Skills": "Mystic" };

export function ultimateSkillEligibility(talent) {
  const cat = talent.system?.category || "";
  const short = ULTIMATE_CATEGORIES[cat];
  if (!short) return { ok: false, short: CATEGORY_SHORT[cat] || cat || "Uncategorised" };
  if (ULTIMATE_EXCLUDED.includes(String(talent.name).toLowerCase())) return { ok: false, short, excluded: true };
  return { ok: true, short };
}

export function buildUltimateSkillView(item) {
  const actor = item.actor;
  const chosenId = item.system?.ultimateSkillTalentId || "";
  if (!actor) return { hasActor: false, options: [], chosen: null };
  const talents = actor.items.filter(i => i.type === "talent").sort((a, b) => {
    const ea = ultimateSkillEligibility(a).ok, eb = ultimateSkillEligibility(b).ok;
    return ea === eb ? a.name.localeCompare(b.name) : (ea ? -1 : 1);
  });
  const options = talents.map(t => {
    const e = ultimateSkillEligibility(t);
    const label = e.ok ? `${t.name} (${e.short})`
      : e.excluded ? `${t.name}: not allowed` : `${t.name}: ${e.short}, not allowed`;
    return { id: t.id, label, disabled: !e.ok, selected: t.id === chosenId };
  });
  const chosen = actor.items.get(chosenId);
  return {
    hasActor: true, options, hasTalents: talents.length > 0,
    chosen: chosen ? { name: chosen.name, rank: item.system?.rank || "Unearthly" } : null
  };
}

/** Base (pre-effect) ability values of the owner. */
export function baseAbilities(actor) {
  const src = actor?._source?.system?.abilities || actor?.system?.abilities || {};
  return Object.fromEntries(ABILITIES.map(k => [k, Number(src[k]?.value) || 0]));
}

export function lowestAbilities(actor) {
  const base = baseAbilities(actor);
  const min = Math.min(...ABILITIES.map(k => base[k]));
  return ABILITIES.filter(k => base[k] === min);
}

export function buildRaiseLowestView(item) {
  const actor = item.actor;
  const rl = item.system?.raiseLowest || {};
  if (!actor) return { hasActor: false, options: [] };
  const base = baseAbilities(actor);
  const lowest = lowestAbilities(actor);
  const chosen = lowest.includes(rl.ability) ? rl.ability : lowest[0];
  const options = ABILITIES.map(k => ({
    key: k,
    label: `${cap(k)}: ${valueToRank(base[k])} (${base[k]})${lowest.includes(k) ? ", lowest" : ""}`,
    disabled: !lowest.includes(k),
    selected: k === chosen
  }));
  const from = base[chosen], to = from + 20;
  return {
    hasActor: true, options, ability: chosen, applied: rl.applied === true,
    result: `${cap(chosen)} ${from} → ${to} (${valueToRank(to)})`
  };
}

export function buildKarmaCostView(item) {
  const sys = item.system || {};
  return {
    perUse: Number(sys.karmaCost) || 0,
    stunt: Number(sys.stuntKarmaCost) > 0 ? Number(sys.stuntKarmaCost) : stuntKarmaCost(item)
  };
}

export function buildLinkedEffectsView(item) {
  const scope = SCOPE();
  const own = [...(item.effects ?? [])].map(e => ({
    name: e.name, source: e.transfer ? "Applies to character" : "This power",
    status: e.disabled ? "Off" : "On"
  }));
  const actor = item.actor;
  const linked = [];
  if (actor) {
    for (const e of actor.effects) {
      const f = e.flags?.[scope] || {};
      if (f.powerItemId !== item.id) continue;
      const by = e.shreddedBy || null;
      const byPower = by ? (by.flags?.[scope]?.shreddingPower || "") : "";
      linked.push({
        name: e.name,
        status: e.disabled ? "Off" : e.isSuppressed ? "Suppressed" : "Active",
        suppressed: !e.disabled && e.isSuppressed,
        by: by ? { name: by.name, power: byPower } : null
      });
    }
  }
  return { own, linked, hasActor: !!actor };
}

// faserip-rules initiative v0.1.0
// Initiative and the pre-action window (Players Book, "Time Scale — The
// Turn" and "Initiative"). Pure: callers supply the d10 rolls and the
// character facts; nothing here touches dice, Foundry, or the DOM.
//
// Turn sequence (book, six steps):
//   1 Judge notes NPC actions   2 players declare   3 roll initiative
//   4 pre-action FEATs (dodge/block/evade, Change Action, Judge events)
//   5 winning side acts         6 losing side acts
// Steps 4-6 are modelled by the caller's turn state; this module owns the
// numbers: modifiers, substitutions, talent bonuses, natural 1, ties.

import { rankForNumber } from './faserip-kernel.js';

export const INITIATIVE_VERSION = '0.1.0';
export const INITIATIVE_CERTIFIED = true;

// Initiative Modifier table, keyed on the side's highest Intuition rank
// NUMBER (the PDF text loses the table; values restored from the printed
// book). The printed 51-75 / 75+ rows overlap at 75: 75 is +5 (see
// ERRATA NOTE); +6 begins at 76.
export const INITIATIVE_MODIFIER_TABLE = [
  { min: 0,  max: 10,       mod: 0 },
  { min: 11, max: 20,       mod: 1 },
  { min: 21, max: 30,       mod: 2 },
  { min: 31, max: 40,       mod: 3 },
  { min: 41, max: 50,       mod: 4 },
  { min: 51, max: 75,       mod: 5 },
  { min: 76, max: Infinity, mod: 6 },
];

export function initiativeModifier(intuitionNumber) {
  const n = Number(intuitionNumber);
  if (!Number.isFinite(n) || n < 0) return 0;
  return INITIATIVE_MODIFIER_TABLE.find(r => n >= r.min && n <= r.max)?.mod ?? 0;
}

// A roll of "1" is always considered to be a "1": no modifier of any kind.
export const NATURAL_ONE = 1;

export function initiativeTotal(roll, modifier = 0) {
  const r = Number(roll);
  if (r === NATURAL_ONE) return NATURAL_ONE;
  return r + Number(modifier || 0);
}

// Powers that replace Intuition for initiative (power text): Combat Sense
// at its Power rank; Enhanced Senses only as the hearing variant (RULED
// 2026-09-03). The highest number wins; the source names what was used.
export function effectiveIntuition({ intuitionNumber = 0, combatSenseNumber = null, enhancedHearingNumber = null } = {}) {
  let value = Number(intuitionNumber) || 0;
  let source = 'Intuition';
  const cs = Number(combatSenseNumber);
  if (Number.isFinite(cs) && cs > value) { value = cs; source = 'Combat Sense'; }
  const eh = Number(enhancedHearingNumber);
  if (Number.isFinite(eh) && eh > value) { value = eh; source = 'Enhanced Hearing'; }
  return { value, source, rank: rankForNumber(value).key };
}

// Talent initiative bonuses (Talents chapter): Martial Arts E +1 when
// fighting unarmed; Weapons Specialist +1 when using the specialty weapon.
// Both depend on the declared attack context; with no context there is no
// bonus (RULED 2026-09-03 — the old "+1 assumed" is retired). A character
// cannot be both unarmed and wielding the specialty weapon, so the bonus
// never stacks past +1.
export const TALENT_INITIATIVE_BONUS = { martialArtsE: 1, weaponsSpecialist: 1 };

export function talentInitiativeBonus({ hasMartialArtsE = false, hasWeaponsSpecialist = false, context = null } = {}) {
  if (!context) return { bonus: 0, source: '' };
  if (hasMartialArtsE && context.unarmed) return { bonus: TALENT_INITIATIVE_BONUS.martialArtsE, source: 'MA-E' };
  if (hasWeaponsSpecialist && context.specialtyWeapon) return { bonus: TALENT_INITIATIVE_BONUS.weaponsSpecialist, source: 'Wpn Spec' };
  return { bonus: 0, source: '' };
}

// One character's effective initiative modifier: own Intuition modifier
// (after substitutions) plus own talent bonus.
export function characterInitiativeModifier(character = {}) {
  const intuition = effectiveIntuition(character);
  const intMod = initiativeModifier(intuition.value);
  const talent = talentInitiativeBonus(character);
  return {
    id: character.id ?? null,
    name: character.name ?? null,
    intuition: intuition.value,
    intuitionSource: intuition.source,
    intMod,
    talent,
    total: intMod + talent.bonus,
  };
}

// Side-based initiative: the side's modifier is based on the highest
// Intuition on that side. RULED 2026-09-03: each character's effective
// modifier is own Intuition modifier + own talent bonus and the side takes
// the highest — one character's Intuition is never combined with another
// character's talent. Ties on the total fall to the higher Intuition, then
// to the earlier entry.
export function sideInitiativeModifier(characters = []) {
  let best = null;
  for (const c of characters) {
    const m = characterInitiativeModifier(c);
    if (!best || m.total > best.total || (m.total === best.total && m.intuition > best.intuition)) best = m;
  }
  return best ?? { id: null, name: null, intuition: 0, intuitionSource: 'Intuition', intMod: 0, talent: { bonus: 0, source: '' }, total: 0 };
}

// Resolve one round of side initiative from the two d10 rolls. The book
// is silent on ties; RULED 2026-09-03: ties re-roll (both sides roll
// again, declarations unchanged).
export function resolveSideInitiative({ pc, npc } = {}) {
  const pcTotal = initiativeTotal(pc.roll, pc.modifier);
  const npcTotal = initiativeTotal(npc.roll, npc.modifier);
  const tie = pcTotal === npcTotal;
  return {
    pcTotal,
    npcTotal,
    tie,
    reroll: tie,
    winner: tie ? null : (pcTotal > npcTotal ? 'pc' : 'npc'),
    order: tie ? [] : (pcTotal > npcTotal ? ['pc', 'npc'] : ['npc', 'pc']),
  };
}

// Individual initiative (each character rolls 1d10 + own modifier; a
// msh-faserip option, not the book's side procedure). Returns entries with
// totals in descending order; equal totals share a position.
export function resolveIndividualInitiative(entries = []) {
  const scored = entries.map(e => ({ ...e, total: initiativeTotal(e.roll, e.modifier) }));
  scored.sort((a, b) => b.total - a.total);
  let position = 0;
  const ordered = scored.map((e, i) => {
    if (i === 0 || e.total !== scored[i - 1].total) position = i + 1;
    return { ...e, position };
  });
  const ties = [];
  for (const e of ordered) {
    const g = ties.find(t => t.total === e.total);
    if (g) g.ids.push(e.id); else ties.push({ total: e.total, ids: [e.id] });
  }
  return { order: ordered, ties: ties.filter(t => t.ids.length > 1) };
}

// Initiative is re-rolled every turn only while at least two combatants'
// actions can interfere with each other.
export function initiativeMatters({ pcEligible = 0, npcEligible = 0 } = {}) {
  return pcEligible > 0 && npcEligible > 0;
}

// Change Action (Initiative section): after seeing the initiative roll a
// character may change the declared action with a yellow Agility FEAT;
// FEATs made after changing are -1CS. The roll belongs to the pre-action
// phase. RULED 2026-09-03: the window closes once any combatant has acted.
export const CHANGE_ACTION = Object.freeze({
  ability: 'agility',
  requiredColor: 'yellow',
  penaltyCS: -1,
  phase: 'preaction',
  oncePerRound: true,
});

export function changeActionOutcome(color) {
  const success = color === 'yellow' || color === 'red';
  return { success, penaltyCS: success ? CHANGE_ACTION.penaltyCS : 0 };
}

// Pre-action ordering (step 4). RULED 2026-09-03: a declared Dodge, Block
// or Evade must be rolled before anyone attacks its owner; a declared
// Multiple Attacks FEAT gates only its own attacker.
export const PRE_ACTION_FEATS = Object.freeze({
  dodge:  { action: 'dodging',     ability: 'agility',  blocksAttacksOnOwner: true },
  block:  { action: 'blocking',    ability: 'strength', blocksAttacksOnOwner: true },
  evade:  { action: 'evading',     ability: 'fighting', blocksAttacksOnOwner: true },
  multi:  { action: 'multiattack', ability: 'fighting', blocksAttacksOnOwner: false },
});

export function preActionBlocksAttack(declaredType, resolved = false) {
  const feat = PRE_ACTION_FEATS[declaredType];
  if (!feat) return false;
  return feat.blocksAttacksOnOwner && !resolved;
}

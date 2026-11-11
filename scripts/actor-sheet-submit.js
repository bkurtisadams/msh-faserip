// scripts/actor-sheet-submit.js v1.0.0 - 2026-11-11
// Normalises a flat actor-sheet form submission before it is saved. Shared
// by the V1 sheet (_updateObject) and the V2 sheet (_processSubmitData).
// Pure apart from console.warn: no Foundry globals, importable from node.

import {
  RANKS_ORDERED as _RANKS, RANK_VALUES as _RANK_VALUES,
  normalizeRank, valueToRank, rankValueForStorage
} from './rules/rules-reference.js';

/**
 * @param {object} actor        The actor being edited (read only).
 * @param {string} changedField Name of the control that triggered the submit, or ''.
 * @param {object} formData     Flat form data keyed by dotted path. Mutated and returned.
 */
export function normalizeActorSubmit(actor, changedField, formData) {
  const abilityKeys = ['fighting', 'agility', 'strength', 'endurance', 'reason', 'intuition', 'psyche'];

  // Keep each current ability rank and rank number coherent. Rank changes
  // use the canonical standard number; manual number edits retain the typed
  // number and derive the rank from the printed Rank Range table.
  for (const ability of abilityKeys) {
    const rankPath = `system.abilities.${ability}.rank`;
    const valuePath = `system.abilities.${ability}.value`;

    if (changedField === rankPath) {
      const rank = normalizeRank(formData[rankPath] ?? actor.system.abilities?.[ability]?.rank);
      formData[rankPath] = rank;
      formData[valuePath] = rankValueForStorage(rank);
    } else if (changedField === valuePath) {
      const submittedValue = Number(formData[valuePath]);
      if (Number.isFinite(submittedValue)) {
        const value = Math.max(0, submittedValue);
        const rank = valueToRank(value);
        formData[rankPath] = rank;
        formData[valuePath] = rank === 'Beyond' ? rankValueForStorage(rank) : value;
      }
    }
  }

  // Keep Resources rank and numeric value synchronized without allowing
  // submitOnChange to race a rank-select update against a stale number.
  const resourceRankPath = "system.attributes.resources.rank";
  const resourceValuePath = "system.attributes.resources.value";
  const storedRank = normalizeRank(actor.system.attributes?.resources?.rank || "Typical");
  const storedValue = Number(actor.system.attributes?.resources?.value ?? 0);
  const submittedRank = normalizeRank(formData[resourceRankPath] ?? storedRank);
  const submittedValueRaw = formData[resourceValuePath];
  const submittedValue = Number(submittedValueRaw);
  const rankChanged = changedField === resourceRankPath || submittedRank !== storedRank;
  const valueChanged = changedField === resourceValuePath ||
    (submittedValueRaw !== undefined && Number.isFinite(submittedValue) && submittedValue !== storedValue);

  if (rankChanged) {
    formData[resourceRankPath] = submittedRank;
    formData[resourceValuePath] = rankValueForStorage(submittedRank);
  } else if (valueChanged && Number.isFinite(submittedValue)) {
    const normalizedValue = Math.max(0, submittedValue);
    const valueRank = valueToRank(normalizedValue);
    formData[resourceRankPath] = valueRank;
    formData[resourceValuePath] = valueRank === "Beyond"
      ? rankValueForStorage(valueRank)
      : normalizedValue;
  }

  // ── GUARD: Prevent effect-shifted ability display values from being persisted ──
  // The sheet display code overwrites rank selects and value inputs with shifted
  // visuals (e.g. Remarkable→Typical when grappled at -2CS). Despite removeAttr('name'),
  // Foundry's submitOnChange can race and include the shifted values in formData.
  // We only strip values that exactly match what the display code would have written
  // (the standard rank number for the shifted rank). Custom values pass through.
  const shifts = actor.system?.combatMods?.abilityShifts;
  if (shifts) {
    const RANKS = _RANKS;
    const rankValues = _RANK_VALUES;
    for (const ab of abilityKeys) {
      const cs = Number(shifts[ab]) || 0;
      if (cs === 0) continue;

      // Compute what the display code would have injected
      const baseRank = actor.system.abilities?.[ab]?.rank;
      if (!baseRank) continue;
      const baseIdx = RANKS.indexOf(baseRank);
      if (baseIdx < 0) continue;
      const shiftedIdx = Math.min(Math.max(baseIdx + cs, 0), RANKS.length - 1);
      const shiftedRank = RANKS[shiftedIdx];
      const shiftedValue = rankValues[shiftedRank] || 0;

      // Only strip if formData contains the exact shifted display values
      const fdRank = formData[`system.abilities.${ab}.rank`];
      const fdValue = formData[`system.abilities.${ab}.value`];
      if (fdRank === shiftedRank && fdRank !== baseRank) {
        console.warn(`[FASERIP] _updateObject guard: blocking shifted rank for ${ab}: ${fdRank} (base: ${baseRank})`);
        delete formData[`system.abilities.${ab}.rank`];
      }
      if (fdValue !== undefined && Number(fdValue) === shiftedValue && shiftedValue !== (actor.system.abilities[ab]?.value ?? -1)) {
        console.warn(`[FASERIP] _updateObject guard: blocking shifted value for ${ab}: ${fdValue} (stored: ${actor.system.abilities[ab]?.value})`);
        delete formData[`system.abilities.${ab}.value`];
      }
    }
  }

  return formData;
}

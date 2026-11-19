// power-limitations.mjs v1.0.0 - 2026-11-18
// Limitation section view model for the Edit Power sheet (Players' Book,
// Limitations). A limitation either raises a power's rank (optional, up to
// the limitation's maximum rank) or is required by the power type (no raise;
// its rank equals the Power rank). Rules surfaced as warnings, never blocks:
//   - raised rank above the limitation's maximum
//   - only one limit per character (required limitations are separate)
//   - no more than three powers raised by that limit
//   - a required limitation must be described

import { RANKS_ORDERED } from "./rules/rules-reference.js";
import { TYPES_REQUIRING_LIMITATION } from "./power-sheet-view.mjs";

export const LIMITATION_PRESETS = [
  { id: "daytime",      max: "Excellent",  label: "Limited to daytime use" },
  { id: "nighttime",    max: "Excellent",  label: "Limited to nighttime use" },
  { id: "three-day",    max: "Excellent",  label: "Only three times/day" },
  { id: "below-zero",   max: "Excellent",  label: "Doesn't work below 0°F" },
  { id: "one-material", max: "Remarkable", label: "Doesn't affect one type of material" },
  { id: "flame",        max: "Remarkable", label: "Doesn't work in presence of flame" },
  { id: "two-day",      max: "Remarkable", label: "Only two times/day" },
  { id: "color",        max: "Remarkable", label: "Doesn't affect a certain color" },
  { id: "no-organic",   max: "Incredible", label: "Doesn't affect organic material" },
  { id: "no-inorganic", max: "Incredible", label: "Doesn't affect inorganic matter" },
  { id: "vocal",        max: "Incredible", label: "Requires a vocal component" },
  { id: "full-damage",  max: "Incredible", label: "Cannot inflict less than Power rank damage" },
  { id: "two-hands",    max: "Incredible", label: "Requires two free hands" },
  { id: "one-matter",   max: "Amazing",    label: "Affects only one type of matter" },
  { id: "one-char",     max: "Amazing",    label: "Affects only one type of character" },
  { id: "once-week",    max: "Amazing",    label: "Only works once/week" },
  { id: "half-time",    max: "Amazing",    label: "Fails half the time" },
  { id: "no-atmos",     max: "Monstrous",  label: "Only works outside atmosphere" },
  { id: "only-cold",    max: "Monstrous",  label: "Only works below 0°" },
  { id: "knocks-out",   max: "Monstrous",  label: "Knocks hero unconscious 1-10 rounds" },
  { id: "dimension",    max: "Unearthly",  label: "Only functions in another dimension" },
  { id: "astral",       max: "Unearthly",  label: "Only functions on the Astral Plane" },
  { id: "once-ever",    max: "Unearthly",  label: "May be used once, period" },
  { id: "negates",      max: "Unearthly",  label: "Negates all other powers for one week" },
  { id: "hot",          max: "Unearthly",  label: "Only works at 200°+ temperatures" }
];

const MAX_GROUPS = ["Excellent", "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"];
const BASE_RANKS = ["Feeble", "Poor", "Typical", "Good", "Excellent", "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"];

const presetById = id => LIMITATION_PRESETS.find(p => p.id === id) || null;
const rankIdx = r => RANKS_ORDERED.indexOf(r);
const ordinal = n => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

export function isRequiredType(sys) {
  return sys?.limitationRequired === true || TYPES_REQUIRING_LIMITATION.includes(sys?.type || "");
}

export function limitationKind(sys) {
  if (isRequiredType(sys)) return "required";
  return sys?.limitation?.kind === "required" ? "required" : "raise";
}

function limitMaxRank(sys) {
  const lim = sys?.limitation || {};
  if (lim.preset === "custom") return lim.maxRank || "";
  return presetById(lim.preset)?.max || "";
}

function limitLabel(sys) {
  const lim = sys?.limitation || {};
  if (lim.preset === "custom") return (sys.limitations || "").trim() || "Custom limitation";
  return presetById(lim.preset)?.label || "";
}

function limitKey(sys) {
  const lim = sys?.limitation || {};
  if (lim.preset === "custom") return `custom:${(sys.limitations || "").trim().toLowerCase()}`;
  return lim.preset || "";
}

function isRaisingPower(item) {
  const sys = item?.system || {};
  return item?.type === "power" && sys.isLimited === true && limitationKind(sys) === "raise" && !!sys.limitation?.preset;
}

export function buildLimitationView(item) {
  const sys = item?.system || {};
  const lim = sys.limitation || {};
  const kind = limitationKind(sys);
  const required = kind === "required";
  const typeLocked = isRequiredType(sys);
  const rank = sys.rank || "";
  const maxRank = limitMaxRank(sys);
  const preset = lim.preset || "";
  const detail = (sys.limitations || sys.limitationDetail || "").trim();

  const others = (item?.actor?.items ?? []).filter(i => i.id !== item.id && isRaisingPower(i));
  const thisRaises = !required && sys.isLimited === true && !!preset;
  const raised = thisRaises ? [...others, item] : others;
  const charLimitSource = others[0] || (thisRaises ? item : null);
  const charLimitName = charLimitSource ? limitLabel(charLimitSource.system) : "";
  const charLimitKey = charLimitSource ? limitKey(charLimitSource.system) : "";
  const charLimitCount = raised.filter(i => limitKey(i.system) === charLimitKey).length;

  const warnings = [];
  if (sys.isLimited) {
    if (required) {
      if (!detail) warnings.push(`${sys.type || "This power"} requires a limitation. Describe it in Detail.`);
    } else if (!preset) {
      warnings.push("Pick the limitation from the list, or Custom.");
    } else {
      if (preset === "custom" && !maxRank) warnings.push("Custom limitation: set its Maximum rank.");
      if (maxRank && rank && rankIdx(rank) > rankIdx(maxRank)) {
        warnings.push(`Raised to ${rank}, above this limitation's maximum of ${maxRank}.`);
      }
      const otherKey = others.map(o => limitKey(o.system)).find(k => k && k !== limitKey(sys));
      if (otherKey) {
        const otherName = limitLabel(others.find(o => limitKey(o.system) === otherKey).system);
        warnings.push(`The character's limit is already "${otherName}". A character may have only one limit.`);
      }
      if (raised.length > 3) {
        warnings.push(`This would be the ${ordinal(raised.length)} power raised by a limit. No more than three should be.`);
      }
    }
  }

  const presetGroups = MAX_GROUPS.map(max => ({
    label: `Maximum ${max}`,
    options: LIMITATION_PRESETS.filter(p => p.max === max).map(p => ({ id: p.id, label: p.label, selected: p.id === preset }))
  }));

  const original = sys.preLimitationRank || rank;
  return {
    kind,
    required,
    typeLocked,
    typeLabel: sys.type || "this power",
    presetGroups,
    noPreset: !preset,
    isCustom: preset === "custom",
    originalOptions: BASE_RANKS.map(r => ({ value: r, selected: r === original })),
    maxOptions: BASE_RANKS.map(r => ({ value: r, selected: r === (lim.maxRank || "") })),
    raisedTo: rank,
    maxRank: maxRank || "—",
    requiredRank: rank ? `${rank} (= Power rank)` : "= Power rank",
    detail,
    charLimitName,
    raisedCount: charLimitCount,
    chips: raised.map(i => ({ name: i.name, current: i.id === item.id })),
    hasChips: raised.length > 0,
    warnings,
    warningCount: warnings.length,
    hasWarnings: warnings.length > 0,
    requiredOff: !sys.isLimited && typeLocked
  };
}

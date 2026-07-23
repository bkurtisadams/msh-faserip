// karma-rules.js v1.1.0 - 2026-07-23
// RAW category catalog for karma award line items. Each rule maps to a
// category from the Advanced Set karma rules, with base amount, allowed
// scopes, and optional caps. UI uses this to auto-set amounts and
// constrain scope choices when a rule is selected.
//
// baseAmount: null means no auto-set (amount is context-dependent).
// allowedScopes: subset of ["split","individual","per_hero"].
// cap: soft warning threshold — amounts above this show a RAW hint but are
//      not blocked.

// Canonical karma ledger math. history entries: positive = earned, negative =
// spend, zero = log-only (Resource/Popularity FEATs). value is the derived
// current karma. Every reconciliation site delegates here.
export function computeKarmaTotals(history, { advancement = 0 } = {}) {
  let earned = 0;
  let spent = 0;
  for (const ev of (Array.isArray(history) ? history : [])) {
    const amt = Number(ev?.amount) || 0;
    if (amt > 0) earned += amt;
    else if (amt < 0) spent += Math.abs(amt);
  }
  const adv = Number(advancement) || 0;
  return { earned, spent, value: Math.max(0, earned - spent - adv) };
}

export const KARMA_RULES = {
  custom: {
    label: "Custom",
    group: "Custom",
    baseAmount: null,
    allowedScopes: ["split", "individual", "per_hero"],
    cap: null
  },

  // HEROIC ACTIONS
  rescue: {
    label: "Rescue",
    group: "Heroic Actions",
    baseAmount: 20,
    allowedScopes: ["split", "individual", "per_hero"],
    cap: 100
  },
  defeatingFoe: {
    label: "Defeating Foe",
    group: "Heroic Actions",
    baseAmount: null,
    allowedScopes: ["split", "individual", "per_hero"],
    cap: null
  },
  stopCrime: {
    label: "Stop Crime",
    group: "Heroic Actions",
    baseAmount: null,
    allowedScopes: ["split", "individual", "per_hero"],
    cap: null
  },
  arrestCriminal: {
    label: "Arrest Criminal",
    group: "Heroic Actions",
    baseAmount: null,
    allowedScopes: ["split", "individual", "per_hero"],
    cap: null
  },
  permitCrime: {
    label: "Permit Crime (penalty)",
    group: "Heroic Actions",
    baseAmount: -5,
    allowedScopes: ["individual"],
    cap: null
  },
  publicDefeat: {
    label: "Public Defeat (penalty)",
    group: "Heroic Actions",
    baseAmount: -40,
    allowedScopes: ["individual", "per_hero"],
    cap: null
  },
  privateDefeat: {
    label: "Private Defeat (penalty)",
    group: "Heroic Actions",
    baseAmount: -20,
    allowedScopes: ["individual", "per_hero"],
    cap: null
  },
  propertyDamage: {
    label: "Property Damage (penalty)",
    group: "Heroic Actions",
    baseAmount: -5,
    allowedScopes: ["per_hero"],
    cap: null
  },

  // PERSONAL ACTIONS
  personalCommitment: {
    label: "Personal Commitment",
    group: "Personal Actions",
    baseAmount: 5,
    allowedScopes: ["individual", "per_hero"],
    cap: null
  },
  weeklyAward: {
    label: "Weekly Award",
    group: "Personal Actions",
    baseAmount: 10,
    allowedScopes: ["individual", "per_hero"],
    cap: 10
  },
  charityAppearance: {
    label: "Charity Appearance",
    group: "Personal Actions",
    baseAmount: null,
    allowedScopes: ["individual"],
    cap: 20
  },
  charityAct: {
    label: "Charity Act",
    group: "Personal Actions",
    baseAmount: null,
    allowedScopes: ["individual"],
    cap: 40
  },
  charityDonation: {
    label: "Charity Donation",
    group: "Personal Actions",
    baseAmount: null,
    allowedScopes: ["individual"],
    cap: null
  },
  failingCommitment: {
    label: "Failing Commitment (penalty)",
    group: "Personal Actions",
    baseAmount: -10,
    allowedScopes: ["individual"],
    cap: null
  },
  leavingEarly: {
    label: "Leaving Early (penalty)",
    group: "Personal Actions",
    baseAmount: -5,
    allowedScopes: ["individual"],
    cap: null
  },
  negativePopularity: {
    label: "Negative Popularity (penalty)",
    group: "Personal Actions",
    baseAmount: null,
    allowedScopes: ["individual"],
    cap: null
  },

  // GAMING ACTIONS
  rolePlayAward: {
    label: "Role-Play Award",
    group: "Gaming Actions",
    baseAmount: 10,
    allowedScopes: ["individual", "per_hero"],
    cap: 10
  },
  stumpJudge: {
    label: "Stump the Judge",
    group: "Gaming Actions",
    baseAmount: 15,
    allowedScopes: ["individual"],
    cap: 15
  },
  humorAward: {
    label: "Humor Award",
    group: "Gaming Actions",
    baseAmount: 5,
    allowedScopes: ["individual"],
    cap: 5
  }
};

const GROUP_ORDER = ["Heroic Actions", "Personal Actions", "Gaming Actions", "Custom"];

export function getRuleOptionsGrouped(currentRule = "custom") {
  const groups = {};
  for (const [key, rule] of Object.entries(KARMA_RULES)) {
    if (!groups[rule.group]) groups[rule.group] = [];
    groups[rule.group].push({
      value: key,
      label: rule.label,
      selected: key === currentRule
    });
  }
  return GROUP_ORDER
    .filter(g => groups[g])
    .map(g => ({ group: g, options: groups[g] }));
}

export function getAllowedScopesForRule(ruleKey) {
  return KARMA_RULES[ruleKey]?.allowedScopes || ["split", "individual", "per_hero"];
}

export function getBaseAmountForRule(ruleKey) {
  const val = KARMA_RULES[ruleKey]?.baseAmount;
  return val === undefined ? null : val;
}

export function getCapForRule(ruleKey) {
  return KARMA_RULES[ruleKey]?.cap ?? null;
}

export function getScopeOptionsForRule(ruleKey, currentScope = "split") {
  const allowed = new Set(getAllowedScopesForRule(ruleKey));
  const all = [
    { value: "split", label: "Split" },
    { value: "individual", label: "Individual" },
    { value: "per_hero", label: "Per hero" }
  ];
  return all.map(o => ({
    ...o,
    disabled: !allowed.has(o.value),
    selected: o.value === currentScope
  }));
}

// Normalize a rule key from user input (parser, imports). Accepts
// hyphens, underscores, spaces. Returns "custom" if unrecognized.
export function normalizeRuleKey(raw) {
  if (!raw) return "custom";
  const s = String(raw).toLowerCase().replace(/[-\s]+/g, "");
  const aliases = {
    custom: "custom",
    rescue: "rescue",
    defeatingfoe: "defeatingFoe", foe: "defeatingFoe",
    stopcrime: "stopCrime", stop: "stopCrime",
    arrestcriminal: "arrestCriminal", arrest: "arrestCriminal",
    permitcrime: "permitCrime", permit: "permitCrime",
    publicdefeat: "publicDefeat",
    privatedefeat: "privateDefeat",
    propertydamage: "propertyDamage",
    personalcommitment: "personalCommitment", commitment: "personalCommitment",
    weeklyaward: "weeklyAward", weekly: "weeklyAward",
    charityappearance: "charityAppearance",
    charityact: "charityAct",
    charitydonation: "charityDonation", donation: "charityDonation",
    failingcommitment: "failingCommitment", failing: "failingCommitment",
    leavingearly: "leavingEarly",
    negativepopularity: "negativePopularity",
    roleplayaward: "rolePlayAward", roleplay: "rolePlayAward", rp: "rolePlayAward",
    stumpthejudge: "stumpJudge", stumpjudge: "stumpJudge", stump: "stumpJudge",
    humoraward: "humorAward", humor: "humorAward"
  };
  return aliases[s] || "custom";
}

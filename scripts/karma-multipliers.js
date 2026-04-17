// karma-multipliers.js v1.1.0 - 2026-04-17
// v1.1.0: Full-share mode removed. groupMode is now only "split" (RAW) or
//         "pool". Legacy "full" values in saved settings are silently
//         migrated to "split" via getGroupAwardMode. GMs who want the
//         full-share behavior should set karmaMultiplier to expected
//         party size (e.g. 4 for a 4-hero table).
// v1.0.0: Central helper for category-based karma multipliers and group-award mode.
//         All karma award sites should route through computeKarmaAward() so that
//         tuning happens in one place.

const CATEGORY_BY_EVENT = {
  "Violent Crime - Stop": "combat", "Violent Crime - Arrest": "combat",
  "Destructive Crime - Stop": "combat", "Destructive Crime - Arrest": "combat",
  "Theft - Stop": "combat", "Theft - Arrest": "combat",
  "Robbery - Stop": "combat", "Robbery - Arrest": "combat",
  "Misdemeanor - Stop": "combat", "Misdemeanor - Arrest": "combat",
  "National Offense - Stop": "combat", "National Offense - Arrest": "combat",
  "Local Conspiracy - Stop": "combat", "Local Conspiracy - Arrest": "combat",
  "National Conspiracy - Stop": "combat", "National Conspiracy - Arrest": "combat",
  "Global Conspiracy - Stop": "combat", "Global Conspiracy - Arrest": "combat",
  "Other Crime - Stop": "combat", "Other Crime - Arrest": "combat",
  "Defeated Foe": "combat",
  "Encounter Award": "combat",

  "Rescue": "rescue", "Multiple Rescues (5+)": "rescue",

  "Personal Commitment": "personal", "Weekly Award": "personal",
  "Charity - Appearance": "personal", "Charity - Act": "personal",
  "Charity - Donation": "personal",

  "Role-Playing": "gaming", "Stump the Judge": "gaming",
  "Humor Award": "gaming", "Session Award": "gaming",

  "Failing Commitment": "penalty", "Leaving Early": "penalty",
  "Negative Popularity": "penalty",
  "Commit Violent Crime": "penalty", "Commit Destructive Crime": "penalty",
  "Commit Theft": "penalty", "Commit Robbery": "penalty",
  "Commit Misdemeanor": "penalty", "Commit National Offense": "penalty",
  "Commit Other Crime": "penalty",
  "Public Defeat": "penalty", "Private Defeat": "penalty",
  "Permit Violent Crime": "penalty", "Permit Destructive Crime": "penalty",
  "Permit Theft": "penalty", "Permit Robbery": "penalty",
  "Permit Misdemeanor": "penalty", "Permit National Offense": "penalty",
  "Permit Other Crime": "penalty",
  "Property Damage": "penalty",
  "Noble Death": "penalty", "Mysterious Death": "penalty",
  "Self-Destruction": "penalty",
  "Encounter Loss": "penalty"
};

export function getCategoryForEvent(eventType) {
  return CATEGORY_BY_EVENT[eventType] || null;
}

// Returns effective multiplier for a category. Falls back to legacy
// global karmaMultiplier when a category multiplier is unset (default 0
// means "use global"), so existing worlds keep current behavior.
export function getCategoryMultiplier(category) {
  const legacy = Number(game.settings.get("msh-faserip", "karmaMultiplier")) || 1;
  if (!category) return legacy;
  const key = `karmaMultiplier_${category}`;
  const val = Number(game.settings.get("msh-faserip", key));
  if (!val || val <= 0) return legacy;
  return val;
}

// Compute a single hero's final karma for an event.
// opts: { eventType, baseAmount, isGroup, heroCount, groupMode }
// groupMode: "split" | "pool" (pool is handled by caller)
// Penalties: multiplied only if the penalty category multiplier > 1 AND
// the event's category is "penalty". Otherwise kept at RAW.
export function computeKarmaAward(opts) {
  const { eventType, baseAmount, isGroup = false, heroCount = 1, groupMode = "split" } = opts;
  const category = getCategoryForEvent(eventType);
  const isLoss = baseAmount < 0;

  if (isLoss) {
    const penMult = getCategoryMultiplier("penalty");
    const mult = penMult > 1 ? penMult : 1;
    return { category, multiplier: mult, gross: Math.ceil(baseAmount * mult), perHero: Math.ceil(baseAmount * mult) };
  }

  const mult = getCategoryMultiplier(category);
  const gross = Math.floor(baseAmount * mult);

  if (!isGroup) return { category, multiplier: mult, gross, perHero: gross };

  if (groupMode === "pool") {
    return { category, multiplier: mult, gross, perHero: gross };
  }
  // split mode (RAW)
  const perHero = Math.floor(gross / Math.max(1, heroCount));
  return { category, multiplier: mult, gross, perHero };
}

// Group totals for encounter-style awards where baseAmount is pre-summed.
// Returns { perHero, groupTotal, multiplier, category }.
export function computeGroupAward(opts) {
  const { eventType = "Encounter Award", baseAmount, heroCount = 1, groupMode = "split" } = opts;
  const category = getCategoryForEvent(eventType);
  const mult = getCategoryMultiplier(category);
  const gross = Math.floor(baseAmount * mult);
  if (groupMode === "pool") {
    return { category, multiplier: mult, groupTotal: gross, perHero: gross };
  }
  const perHero = Math.floor(gross / Math.max(1, heroCount));
  return { category, multiplier: mult, groupTotal: gross, perHero };
}

export function computeLossAmount(baseAmount, heroCount = 1, groupMode = "split") {
  const penMult = getCategoryMultiplier("penalty");
  const mult = penMult > 1 ? penMult : 1;
  const gross = Math.ceil(baseAmount * mult);
  if (groupMode === "pool") return gross;
  return Math.ceil(gross / Math.max(1, heroCount));
}

export function getGroupAwardMode() {
  const raw = game.settings.get("msh-faserip", "groupAwardMode") || "split";
  // Migration: legacy "full" mode removed — fall back to split. Worlds that
  // used full share should set multiplier = expected party size instead.
  if (raw === "full") return "split";
  return raw;
}

export const CATEGORY_LABELS = {
  combat: "Combat / Heroic",
  rescue: "Rescue",
  personal: "Personal",
  gaming: "Gaming",
  penalty: "Penalty"
};

export const GROUP_MODE_LABELS = {
  split: "Split (RAW)",
  pool: "To karma pool"
};

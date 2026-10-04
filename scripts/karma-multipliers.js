// karma-multipliers.js v1.3.2 - 2026-10-04
// v1.3.2: "R+I+P Bonus" entries count as gaming awards.
// karma-multipliers.js v1.3.1 - 2026-10-03
// v1.3.1: fixed-bug: wrapUpLastWeekly registered with default null threw in
//         Foundry v14 (an Object setting may not default to null), which
//         stopped init before karmaMultiplier, defeatedVillains and the rest
//         registered, so battle report cards could not be edited. Default {}.
// karma-multipliers.js v1.3.0 - 2026-10-03
// v1.3.0: Hidden wrap-up settings: wrapUpLastWeekly (world time and game
//         date of the last weekly award) and wrapUpAwardedCommitments
//         (calendar commitment ids already paid). R+I+P hint no longer says
//         "at session end".
// karma-multipliers.js v1.2.0 - 2026-10-01
// v1.2.0: Karma settings cleanup. All karma settings register here
//         (registerKarmaSettings, called from init.js) so they sit together
//         in the settings window; migrateKarmaSettings carries old worlds over.
//         - Enable Team Karma Pool is the one pool switch: it routes encounter
//           karma to the pool (groupAwardMode retired, kept hidden for the
//           migration).
//         - Full Karma to Each Hero is a checkbox (fullKarmaEachHero);
//           combatAwardScope kept hidden for the migration.
//         - Multipliers are labelled house rules and default to 1 (RAW). A
//           category multiplier now multiplies ON TOP of the overall one;
//           losses use only the Penalty multiplier, and any value applies
//           (the old "only if > 1" special case is gone).
//         - Optional rules from the Karma chapter: spend in increments of 5,
//           and the locking pool.
//         - teamKarmaAwards / pendingKarmaAwards removed (never read).
// karma-multipliers.js v1.1.1 - 2026-09-02
// v1.1.1: Commit/Permit Local, National, Global Conspiracy categorized as
//         penalties (rows added to the Add Karma dialog in kernel slice 6a).
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
  "Humor Award": "gaming", "Session Award": "gaming", "R+I+P Bonus": "gaming",

  "Failing Commitment": "penalty", "Leaving Early": "penalty",
  "Negative Popularity": "penalty",
  "Commit Violent Crime": "penalty", "Commit Destructive Crime": "penalty",
  "Commit Theft": "penalty", "Commit Robbery": "penalty",
  "Commit Misdemeanor": "penalty", "Commit National Offense": "penalty",
  "Commit Local Conspiracy": "penalty", "Commit National Conspiracy": "penalty",
  "Commit Global Conspiracy": "penalty",
  "Commit Other Crime": "penalty",
  "Public Defeat": "penalty", "Private Defeat": "penalty",
  "Permit Violent Crime": "penalty", "Permit Destructive Crime": "penalty",
  "Permit Theft": "penalty", "Permit Robbery": "penalty",
  "Permit Misdemeanor": "penalty", "Permit National Offense": "penalty",
  "Permit Local Conspiracy": "penalty", "Permit National Conspiracy": "penalty",
  "Permit Global Conspiracy": "penalty",
  "Permit Other Crime": "penalty",
  "Property Damage": "penalty",
  "Noble Death": "penalty", "Mysterious Death": "penalty",
  "Self-Destruction": "penalty",
  "Encounter Loss": "penalty"
};

export function getCategoryForEvent(eventType) {
  return CATEGORY_BY_EVENT[eventType] || null;
}

// Effective multiplier (house rule; 1 = RAW). Awards: overall multiplier
// times the category's. Losses ("penalty"): the Penalty multiplier alone.
export function getCategoryMultiplier(category) {
  const read = (key) => {
    const v = Number(game.settings.get("msh-faserip", key));
    return v > 0 ? v : 1;
  };
  if (category === "penalty") return read("karmaMultiplier_penalty");
  const overall = read("karmaMultiplier");
  if (!category) return overall;
  return overall * read(`karmaMultiplier_${category}`);
}

// Compute a single hero's final karma for an event.
// opts: { eventType, baseAmount, isGroup, heroCount, groupMode }
// groupMode: "split" | "pool" (pool is handled by caller)
// Losses use the Penalty multiplier (1 = RAW).
export function computeKarmaAward(opts) {
  const { eventType, baseAmount, isGroup = false, heroCount = 1, groupMode = "split" } = opts;
  const category = getCategoryForEvent(eventType);
  const isLoss = baseAmount < 0;

  if (isLoss) {
    const mult = getCategoryMultiplier("penalty");
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
  const mult = getCategoryMultiplier("penalty");
  const gross = Math.ceil(baseAmount * mult);
  if (groupMode === "pool") return gross;
  return Math.ceil(gross / Math.max(1, heroCount));
}

// "pool" when the team karma pool is enabled, else "split" (RAW).
export function getGroupAwardMode() {
  return game.settings.get("msh-faserip", "useKarmaPool") ? "pool" : "split";
}

// "individual" when Full Karma to Each Hero is on, else "split" (RAW).
export function getCombatAwardScope() {
  return game.settings.get("msh-faserip", "fullKarmaEachHero") ? "individual" : "split";
}

/** Optional rule: Karma is spent in increments of 5. */
export function karmaIncrement() {
  try { return game.settings.get("msh-faserip", "karmaIncrementFive") ? 5 : 1; }
  catch (_) { return 1; }
}

/** Optional rule: the locking team pool. */
export function isKarmaPoolLocked() {
  try { return game.settings.get("msh-faserip", "karmaPoolLocked") === true; }
  catch (_) { return false; }
}

const MULT_CATEGORIES = [
  ["combat", "Combat / Heroic"], ["rescue", "Rescue"], ["personal", "Personal"],
  ["gaming", "Gaming"], ["penalty", "Penalty (losses)"]
];

/** Every karma setting, registered together so they group in the settings window. */
export function registerKarmaSettings() {
  const S = "msh-faserip";
  game.settings.register(S, "karmaPromptActorTypes", {
    name: "Karma Prompts for Non-Hero Actors",
    hint: "Which actor types are offered the Karma declaration prompt on resist FEATs (Slam/Stun/Kill checks, intensity saves, KO saves, death saves). Gated actors roll without Karma. Heroes are always prompted. Default skips NPCs but keeps villains (RAW: villains spend Karma, nameless NPCs don't).",
    scope: "world", config: true, type: String,
    choices: {
      all: "All Actors (Heroes, Villains, NPCs)",
      villainsOnly: "Heroes and Villains (skip NPCs)",
      heroesOnly: "Heroes Only (skip Villains and NPCs)"
    },
    default: "villainsOnly", requiresReload: false
  });
  game.settings.register(S, "useKarmaPool", {
    name: "Team Karma Pool",
    hint: "RAW option. On: the team has a shared karma pool, and encounter karma goes into it instead of being split among the heroes. A hero's loss comes from their own karma first, then the pool. Off: encounter karma is split among the heroes present.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(S, "karmaPoolLocked", {
    name: "Locking Pool (optional rule)",
    hint: "Optional rule from the Karma chapter. Nothing may be withdrawn from the team pool, pool karma may only be used on die rolls, and the pool is dissolved only by unanimous vote.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(S, "karmaIncrementFive", {
    name: "Spend Karma in Increments of 5 (optional rule)",
    hint: "Optional rule from the Karma chapter. Karma spent on a die roll after the roll is chosen in steps of 5 (minimum 10).",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(S, "fullKarmaEachHero", {
    name: "Full Karma to Each Hero (house rule)",
    hint: "Off (RAW): an encounter's karma is divided among the heroes present. On: every hero present gets the whole amount, as if they had soloed it — foes, crimes stopped and arrested, rescues, the GM Award and Split bonuses. Losses are always individual either way.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(S, "sessionRIPBonus", {
    name: "Session R+I+P Bonus (house rule)",
    hint: "Once per session, each hero may be awarded karma equal to Reason + Intuition + Psyche. Adds an R+I+P button to the Team Tracker. Not from the rulebook.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(S, "wrapUpLastWeekly", {
    scope: "world", config: false, type: Object, default: {}
  });
  game.settings.register(S, "wrapUpAwardedCommitments", {
    scope: "world", config: false, type: Array, default: []
  });
  game.settings.register(S, "karmaMultiplier", {
    name: "Karma Multiplier (house rule)",
    hint: "Multiplies every karma award. 1 = RAW. Also set from the Team Tracker header. Does not apply to losses.",
    scope: "world", config: true, type: Number,
    range: { min: 1, max: 10, step: 1 }, default: 1
  });
  for (const [cat, label] of MULT_CATEGORIES) {
    game.settings.register(S, `karmaMultiplier_${cat}`, {
      name: `Karma Multiplier: ${label} (house rule)`,
      hint: cat === "penalty"
        ? "Multiplies karma losses. 1 = RAW. The overall Karma Multiplier does not apply to losses."
        : "Multiplies this category on top of the overall Karma Multiplier. 1 = no change.",
      scope: "world", config: true, type: Number, default: 1
    });
  }
  // Retired; kept hidden so migrateKarmaSettings can read old worlds.
  game.settings.register(S, "groupAwardMode", { scope: "world", config: false, type: String, default: "split" });
  game.settings.register(S, "combatAwardScope", { scope: "world", config: false, type: String, default: "split" });
  game.settings.register(S, "karmaSettingsVersion", { scope: "world", config: false, type: Number, default: 0 });
}

/** One-time carry-over of the retired karma settings (GM, ready hook). */
export async function migrateKarmaSettings() {
  if (!game.user?.isGM) return;
  const S = "msh-faserip";
  if (Number(game.settings.get(S, "karmaSettingsVersion")) >= 1) return;
  if (game.settings.get(S, "groupAwardMode") === "pool") {
    await game.settings.set(S, "useKarmaPool", true);
  }
  if (game.settings.get(S, "combatAwardScope") === "individual") {
    await game.settings.set(S, "fullKarmaEachHero", true);
  }
  // Category multipliers used 0 = "same as overall" and replaced the overall
  // value; now 1 = no change and they multiply on top. Keep each world's
  // effective numbers the same.
  const overall = Number(game.settings.get(S, "karmaMultiplier")) || 1;
  for (const [cat] of MULT_CATEGORIES) {
    const key = `karmaMultiplier_${cat}`;
    const old = Number(game.settings.get(S, key)) || 0;
    let next = 1;
    if (old > 0) next = cat === "penalty" ? (old > 1 ? old : 1) : old / overall;
    await game.settings.set(S, key, next);
  }
  await game.settings.set(S, "karmaSettingsVersion", 1);
  console.log("[FASERIP] Karma settings migrated (v1)");
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

export const COMBAT_SCOPE_LABELS = {
  split: "Split (RAW)",
  individual: "Individual (full to each hero)"
};

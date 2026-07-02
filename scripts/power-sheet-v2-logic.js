// power-sheet-v2-logic.js v1.11.1 - 2026-07-02
// v1.11.1: Tighten fire/invulnerability presets. Fire-like attack powers
//          seed isEnergyAttack + specific fire/cold/etc. damage types, and
//          Invulnerability now seeds the defense/resistance flags needed for
//          defense AE creation once a resistance type is selected.
// v1.11.0: Canonical power type picker + conservative engine presets.
//          Selecting a power type now seeds only blank/default automation
//          fields (attack/defense/save/movement/control/mental/etc.) so
//          compendium powers and hand-created powers start wired to the
//          game engine without overwriting custom edits.
// v1.10.0: Slice N — data-driven section gating. Detection, Ability
//          Substitution, Movement, Control, Mental, and Transformation now
//          carry .ps2-section-check toggles bound to new flags (isSensePower,
//          isAbilitySubstitution, isMovementPower, isControlPower,
//          isMentalPower, isTransformPower). CATEGORY_FLAG_AUTO_TICK extended
//          so senses/movement/matterControl/energyControl/bodyControl/
//          mentalPowers auto-tick their primary section flag on category
//          change. No new handler needed — the generic .ps2-section-check
//          change handler covers them. Closes the Transformation-leak class
//          of bug (sections were JS-suggested only, with no per-section flag).
// v1.9.0: Slice I — Extra Body Parts structured field. #ps2-add-bodypart /
//         .ps2-remove-bodypart add/remove handlers manage the
//         system.extraBodyParts array ([{type, count, notes}]), mirroring
//         the bonusPowers list pattern. UI block lives in the Attack
//         section body; schema default [] added to template.json.
// v1.8.0: Slice H — Resistance UX rewrite. RESISTANCE_TYPE_DEFAULTS maps
//         resistance type -> { effect, minRank }. resistanceType change
//         handler auto-sets resistanceEffect + resistanceMinRank from the
//         map. resistanceEffect change handler keeps countsAsTwoPowers +
//         resistanceIsInvulnerability in sync with the "invulnerability"
//         option. Only sets values that are currently at defaults;
//         explicit user choices preserved.
// v1.7.1: Run section-visibility computation for read-only (compendium)
//         sheets too. Previously the call from itemSheet._onRender was
//         gated by isEditable, so compendium items leaked every section
//         (data-hidden never got set). Visibility is now read-only-safe;
//         the rest of the listener wiring is gated locally on
//         sheet.isEditable instead.
// v1.7.0: Category-driven section-flag auto-tick + sub-field defaults on
//         category CHANGE only (not on render). CATEGORY_FLAG_AUTO_TICK
//         maps category -> section flags to tick if currently unset.
//         CATEGORY_FIELD_DEFAULTS sets sensible sub-field defaults (e.g.
//         transformation.affects="self" for bodyControl) if currently
//         unset. Explicit user values always win.
// v1.6.0: Damage type auto-tick for ignoresNaturalArmor (touch-rotting) and
//         ignoresArtificialArmor (touch-corrosive). New armor-bypass flag
//         checkboxes in Attack section.
// v1.5.0: Symmetric armorPhysicalCustom pattern — orange-dot badge + reset
//         handler + manual-edit detection, mirroring armorEnergyCustom.
//         Rank change no longer overwrites armorPhysical when custom flag set.
// v1.4.1: Replace local RANK_VALUES with import from rules-reference.js
// v1.4.0: Attack section always visible so any power can opt into combat routing.
// v1.2.0: Collapsible Active Effects, Healing/Absorption toggle, bigger textareas
// v1.1.0: Rank→Value auto-fill, special strength type change handler, field reorder support
// Drop-in: call ps2ActivateListeners(html, itemSheet) from activateListeners

// Rank → value lookup (canonical source: rules-reference.js)
import { RANK_VALUES } from "./rules/rules-reference.js";

const CATEGORY_SECTIONS = {
  resistances:              ["defense"],
  senses:                   ["detection", "abilitySubstitution"],
  movement:                 ["movement"],
  matterControl:            ["control", "attack"],
  energyControl:            ["control", "attack", "defense"],
  bodyControl:              ["transformation", "defense", "abilitySubstitution"],
  distanceAttacks:          ["attack", "save"],
  mentalPowers:             ["mental", "save", "abilitySubstitution"],
  bodyAlterationsOffensive: ["attack", "save"],
  bodyAlterationsDefensive: ["defense", "healing"]
};


// Canonical Advanced Set power type list used by the V2 sheet. Keeping this
// next to the preset map avoids the old split-brain problem where the UI knew
// a type existed but no engine defaults were seeded when the type was chosen.
const POWER_TYPES_BY_CATEGORY = {
  resistances: [
    "Resistance to Fire/Heat", "Resistance to Fire and Heat", "Resistance to Cold", "Resistance to Electricity",
    "Resistance to Radiation", "Resistance to Toxins", "Resistance to Corrosives",
    "Resistance to Emotion Attacks", "Resistance to Mental Attacks",
    "Resistance to Magical Attacks", "Resistance to Disease", "Invulnerability"
  ],
  senses: [
    "Protected Senses", "Enhanced Senses", "Infravision", "Cosmic Awareness",
    "Combat Sense", "Computer Links", "Emotion Detection", "Energy Detection",
    "Magic Detection", "Magnetic Detection", "Mutant Detection", "Psionic Detection",
    "Astral Detection", "Tracking Ability"
  ],
  movement: [
    "Flight", "Gliding", "Leaping", "Wall-Crawling", "Lightning Speed",
    "Teleportation", "Levitation", "Swimming", "Climbing", "Digging",
    "Dimensional Travel"
  ],
  matterControl: [
    "Earth Control", "Air Control", "Fire Control", "Water Control",
    "Weather Control", "Animate Objects", "Density Manipulation Others",
    "Body Transformation Others", "Animal Transformation Others"
  ],
  energyControl: [
    "Magnetic Manipulation", "Electrical Manipulation", "Light Manipulation",
    "Sound Manipulation", "Darkforce Manipulation", "Gravity Manipulation",
    "Probability Manipulation", "Nullifying Power", "Energy Reflection", "Time Control"
  ],
  bodyControl: [
    "Growth", "Shrinking", "Density Manipulation Self", "Phasing", "Invisibility",
    "Plasticity", "Elongation", "Shape-Shifting", "Imitation", "Body Transformation",
    "Animal Transformation Self", "Raise Lowest Ability", "Blending", "Power Absorption",
    "Alter Ego"
  ],
  distanceAttacks: [
    "Projectile Missile", "Ensnaring Missile", "Ice Generation", "Fire Generation",
    "Energy Generation", "Sound Generation", "Stunning Missile", "Corrosive Missile",
    "Slashing Missile", "Nullifier Missile", "Darkforce Generation"
  ],
  mentalPowers: [
    "Telepathy", "Image Generation", "Telekinesis", "Mind Control", "Emotion Control",
    "Force Field Generation", "Animal Communication and Control", "Mechanical Intuition",
    "Animal Empathy", "Empathy", "Psi-Screen", "Mental Probe", "Animate Drawings",
    "Possession", "Transferral", "Astral Projection", "Psionic Attack", "Precognition",
    "Postcognition", "Plant Control", "Ultimate Skill"
  ],
  bodyAlterationsOffensive: [
    "Extra Body Parts", "Extra Attacks", "Energy Touch", "Paralyzing Touch",
    "Claws", "Rotting Touch", "Corrosive Touch", "Health-Drain Touch", "Blinding Touch"
  ],
  bodyAlterationsDefensive: [
    "Body Armor", "Water Breathing", "Absorption", "Regeneration", "Solar Regeneration",
    "Recovery", "Life Support", "Pheromones", "Damage Transfer", "Healing", "Immortality"
  ]
};

const CATEGORY_ENGINE_PRESETS = {
  resistances:              { activationType: "passive", isActive: true, isDefensePower: true, isResistance: true },
  senses:                   { activationType: "passive", isActive: true, isSensePower: true },
  movement:                 { activationType: "activated", isMovementPower: true, movement: { useRankSpeed: true } },
  matterControl:            { activationType: "activated", isControlPower: true, isAttackPower: true, range: "rank", damageSource: "rank" },
  energyControl:            { activationType: "activated", isControlPower: true, isAttackPower: true, range: "rank", damageSource: "rank" },
  bodyControl:              { activationType: "activated", isTransformPower: true, transformation: { affects: "self" } },
  distanceAttacks:          { activationType: "activated", isAttackPower: true, range: "rank", damageSource: "rank" },
  mentalPowers:             { activationType: "activated", isMentalPower: true, requiresSave: true, range: "rank", battleEffectsColumn: "Me", damageType: "mental", save: { ability: "psyche", intensity: "power-rank" } },
  bodyAlterationsOffensive: { activationType: "activated", isAttackPower: true, range: "touch", damageSource: "rank" },
  bodyAlterationsDefensive: { activationType: "passive", isActive: true, isDefensePower: true }
};

const POWER_ENGINE_PRESETS = {
  // Resistances
  "Resistance to Fire/Heat":        { resistanceType: "fire",        resistanceEffect: "damageReduction" },
  "Resistance to Fire and Heat":    { resistanceType: "fire",        resistanceEffect: "damageReduction" },
  "Resistance to Cold":             { resistanceType: "cold",        resistanceEffect: "damageReduction" },
  "Resistance to Electricity":      { resistanceType: "electricity", resistanceEffect: "damageReduction" },
  "Resistance to Radiation":        { resistanceType: "radiation",   resistanceEffect: "damageReduction" },
  "Resistance to Toxins":           { resistanceType: "toxin",       resistanceEffect: "featReplace", resistanceMinRank: "endurance+1" },
  "Resistance to Corrosives":       { resistanceType: "corrosive",   resistanceEffect: "damageReduction" },
  "Resistance to Emotion Attacks":  { resistanceType: "emotion",     resistanceEffect: "featReplace", resistanceMinRank: "intuition+1" },
  "Resistance to Mental Attacks":   { resistanceType: "mental",      resistanceEffect: "featReplace", resistanceMinRank: "psyche+1" },
  "Resistance to Magical Attacks":  { resistanceType: "magical",     resistanceEffect: "featReplace" },
  "Resistance to Disease":          { resistanceType: "disease",     resistanceEffect: "featReplace", resistanceMinRank: "endurance+1" },
  "Invulnerability":                { activationType: "passive", isActive: true, isDefensePower: true, isResistance: true, resistanceEffect: "invulnerability", resistanceIsInvulnerability: true, countsAsTwoPowers: true },

  // Senses
  "Protected Senses":    { detection: { protectedSense: "general" } },
  "Enhanced Senses":     { detection: { enhancedSense: "general" } },
  "Infravision":         { detection: { detectionType: "infravision", infravisionRange: 5 } },
  "Cosmic Awareness":    { detection: { cosmicAwareness: true }, isAbilitySubstitution: true },
  "Combat Sense":        { detection: { combatSense: true }, isAbilitySubstitution: true,
    abilitySubstitution: {
      fighting: { enabled: true, context: "Blocking" },
      agility: { enabled: true, context: "Dodging" },
      strength: { enabled: true, context: "Escaping" },
      intuition: { enabled: true, context: "Surprise" }
    }
  },
  "Computer Links":      { detection: { computerLinks: true }, isAbilitySubstitution: true, abilitySubstitution: { reason: { enabled: true, context: "Computer access/reprogramming" } } },
  "Emotion Detection":   { detection: { detectionType: "emotion" } },
  "Energy Detection":    { detection: { detectionType: "energy" } },
  "Magic Detection":     { detection: { detectionType: "magic" } },
  "Magnetic Detection":  { detection: { detectionType: "magnetic" } },
  "Mutant Detection":    { detection: { detectionType: "mutant" }, range: "rank" },
  "Psionic Detection":   { detection: { detectionType: "psionic" }, range: "rank" },
  "Astral Detection":    { detection: { detectionType: "astral" } },
  "Tracking Ability":    { detection: { canTrack: true, detectionType: "tracking" } },

  // Movement
  "Flight":              { movement: { type: "flight", useRankSpeed: true }, range: "" },
  "Gliding":             { movement: { type: "gliding", useRankSpeed: true }, range: "" },
  "Leaping":             { movement: { type: "leaping", useRankSpeed: true }, range: "", isAbilitySubstitution: true, abilitySubstitution: { strength: { enabled: true, context: "Leaping distance" } } },
  "Wall-Crawling":       { movement: { type: "wall-crawling", useRankSpeed: true }, range: "" },
  "Lightning Speed":     { movement: { type: "super-speed", useRankSpeed: true }, range: "", isAbilitySubstitution: true, abilitySubstitution: { agility: { enabled: true, context: "High-speed maneuvers" } } },
  "Teleportation":       { movement: { type: "teleportation", useRankSpeed: false }, range: "rank", requiresSave: true, save: { ability: "endurance", intensity: "power-rank", onFail: { effect: "custom", duration: "1-10", notes: "Passengers may be disoriented." } } },
  "Levitation":          { movement: { type: "levitation", useRankSpeed: true }, range: "" },
  "Swimming":            { movement: { type: "swimming", useRankSpeed: true }, range: "", hasBonusPowers: true, bonusPowers: [{ name: "Water Breathing", rankMod: "same" }] },
  "Climbing":            { movement: { type: "climbing", useRankSpeed: true }, range: "", isAbilitySubstitution: true, abilitySubstitution: { agility: { enabled: true, context: "Climbing/tangled movement" } } },
  "Digging":             { movement: { type: "tunneling", useRankSpeed: true, leavesTunnel: false }, range: "", hasBonusPowers: true, bonusPowers: [{ name: "Claws", rankMod: "same" }] },
  "Dimensional Travel":  { movement: { type: "dimensional", useRankSpeed: false }, range: "" },

  // Matter Control
  "Earth Control":       { control: { controlType: "earth", manipulateExisting: true, useAsShield: true, useAsWeapon: true, createConstructs: true }, battleEffectsColumn: "Fo", damageType: "physical-blunt" },
  "Air Control":         { control: { controlType: "air", manipulateExisting: true, useAsShield: true, useAsWeapon: true }, battleEffectsColumn: "Fo", damageType: "energy-force", hasBonusPowers: true, bonusPowers: [{ name: "Flight", rankMod: "same" }] },
  "Fire Control":        { control: { controlType: "fire", manipulateExisting: true, useAsShield: true, useAsWeapon: true }, isEnergyAttack: true, battleEffectsColumn: "En", damageType: "energy-fire", canPullPunch: true, canReduceEffect: true },
  "Water Control":       { control: { controlType: "water", manipulateExisting: true, useAsShield: true, useAsWeapon: true }, battleEffectsColumn: "Fo", damageType: "energy-force" },
  "Weather Control":     { control: { controlType: "weather", manipulateExisting: true, useAsShield: true, useAsWeapon: true }, battleEffectsColumn: "Fo", damageType: "energy-force" },
  "Animate Objects":     { control: { controlType: "animate", animateObjects: true }, battleEffectsColumn: "BA", damageSource: "material", damageType: "physical-blunt" },
  "Density Manipulation Others": { isControlPower: false, isAttackPower: false, isTransformPower: true, transformation: { affects: "others", transformType: "density", touchRequired: true, targetResistsWith: "endurance" }, requiresSave: true, save: { ability: "endurance", intensity: "power-rank", onFail: { effect: "weakened", duration: "1-10" } } },
  "Body Transformation Others":  { isControlPower: false, isAttackPower: false, isTransformPower: true, transformation: { affects: "others", transformType: "body", touchRequired: true, targetResistsWith: "endurance" }, requiresSave: true, save: { ability: "endurance", intensity: "power-rank", onFail: { effect: "custom", duration: "custom" } } },
  "Animal Transformation Others":{ isControlPower: false, isAttackPower: false, isTransformPower: true, transformation: { affects: "others", transformType: "animal", touchRequired: true, targetResistsWith: "psyche" }, requiresSave: true, save: { ability: "psyche", intensity: "power-rank", onFail: { effect: "custom", duration: "custom" } } },

  // Energy Control
  "Magnetic Manipulation":    { control: { controlType: "magnetism", manipulateExisting: true, useAsWeapon: true }, battleEffectsColumn: "Fo", damageType: "energy-force" },
  "Electrical Manipulation":  { control: { controlType: "electricity", manipulateExisting: true, useAsWeapon: true }, isEnergyAttack: true, battleEffectsColumn: "En", damageType: "energy-electricity", isDefensePower: true, isResistance: true, resistanceType: "electricity", resistanceEffect: "damageReduction" },
  "Light Manipulation":       { control: { controlType: "light", manipulateExisting: true, generateNew: true, useAsWeapon: true }, isEnergyAttack: true, battleEffectsColumn: "En", damageType: "energy-radiation", requiresSave: true, save: { ability: "endurance", intensity: "power-rank", onFail: { effect: "blinded", duration: "1-10" } } },
  "Sound Manipulation":       { control: { controlType: "sound", manipulateExisting: true, useAsShield: true, useAsWeapon: true }, battleEffectsColumn: "Fo", damageType: "energy-sound", isDefensePower: true, isResistance: true, resistanceType: "sound", resistanceEffect: "damageReduction" },
  "Darkforce Manipulation":   { control: { controlType: "darkforce", manipulateExisting: true, generateNew: true, useAsShield: true, useAsWeapon: true }, isEnergyAttack: true, battleEffectsColumn: "En", damageType: "energy-darkforce" },
  "Gravity Manipulation":     { control: { controlType: "gravity", manipulateExisting: true, useAsWeapon: true }, battleEffectsColumn: "Fo", damageType: "energy-force", requiresSave: true, save: { ability: "strength", intensity: "power-rank", onFail: { effect: "slammed", duration: "1-10" } } },
  "Probability Manipulation": { control: { controlType: "probability", manipulateExisting: true }, isAttackPower: false, requiresSave: false, specialMechanics: "Good/Bad Luck die-order manipulation; Judge limitation required." },
  "Nullifying Power":         { isMentalPower: true, isAttackPower: false, requiresSave: true, range: "rank", battleEffectsColumn: "Me", damageType: "mental", save: { ability: "endurance", intensity: "power-rank", onFail: { effect: "nullified", duration: "1-10" } } },
  "Energy Reflection":        { activationType: "passive", isActive: true, isControlPower: false, isAttackPower: false, isDefensePower: true, isResistance: true, isEnergyReflection: true, range: "", energyReflectionType: "energy", energyReflectionRank: "full", resistanceType: "energy", resistanceEffect: "invulnerability", resistanceIsInvulnerability: true },
  "Time Control":             { countsAsTwoPowers: true, specialMechanics: "Counts as two powers; each time stunt should be tracked separately." },

  // Body Control
  "Growth":                   { transformation: { affects: "self", transformType: "size" }, isAbilitySubstitution: true, abilitySubstitution: { strength: { enabled: true, context: "Strength FEATs while grown" } } },
  "Shrinking":                { transformation: { affects: "self", transformType: "size" } },
  "Density Manipulation Self":{ transformation: { affects: "self", transformType: "density" }, isDefensePower: true, isBodyArmor: true, bodyArmorType: "both", damageSource: "rank", battleEffectsColumn: "Ch" },
  "Phasing":                  { transformation: { affects: "self", transformType: "phasing" }, isDefensePower: true, specialMechanics: "Physical immunity while phased; electronics disruption is a power stunt." },
  "Invisibility":             { transformation: { affects: "self", transformType: "invisibility" } },
  "Plasticity":               { transformation: { affects: "self", transformType: "plasticity" }, isDefensePower: true, isBodyArmor: true, bodyArmorType: "both", hasBonusPowers: true, bonusPowers: [{ name: "Elongation", rankMod: "same" }] },
  "Elongation":               { transformation: { affects: "self", transformType: "elongation" }, isAttackPower: true, battleEffectsColumn: "Gp", damageSource: "strength", range: "rank" },
  "Shape-Shifting":           { transformation: { affects: "self", transformType: "shape" } },
  "Imitation":                { transformation: { affects: "self", transformType: "imitation" } },
  "Body Transformation":      { transformation: { affects: "self", transformType: "body" }, isDefensePower: true, isBodyArmor: true },
  "Animal Transformation Self": { transformation: { affects: "self", transformType: "animal" } },
  "Raise Lowest Ability":     { isTransformPower: false, specialMechanics: "One lowest ability is raised by 20 points; choose next power from complete list." },
  "Blending":                 { transformation: { affects: "self", transformType: "blending" } },
  "Power Absorption":         { transformation: { affects: "others", transformType: "body", touchRequired: true, targetResistsWith: "psyche" }, requiresSave: true, save: { ability: "psyche", intensity: "power-rank", onFail: { effect: "weakened", duration: "custom" } } },
  "Alter Ego":                { specialMechanics: "Separate normal persona; track Karma/Popularity separately." },

  // Distance Attacks
  "Projectile Missile":       { battleEffectsColumn: "S", damageType: "physical-blunt", canPullPunch: false, canReduceEffect: false },
  "Ensnaring Missile":        { battleEffectsColumn: "Gp", specialStrengthType: "ensnare", requiresSave: true, save: { ability: "strength", intensity: "power-rank", onFail: { effect: "grabbed", duration: "escape" } } },
  "Ice Generation":           { isEnergyAttack: true, battleEffectsColumn: "TB", damageType: "energy-cold", canPullPunch: true, canReduceEffect: true },
  "Fire Generation":          { isEnergyAttack: true, battleEffectsColumn: "En", damageType: "energy-fire", canPullPunch: true, canReduceEffect: true },
  "Energy Generation":        { isEnergyAttack: true, battleEffectsColumn: "En", damageType: "energy-generic", canPullPunch: true, canReduceEffect: true },
  "Sound Generation":         { isEnergyAttack: true, battleEffectsColumn: "Fo", damageType: "energy-sound", canPullPunch: true, canReduceEffect: true },
  "Stunning Missile":         { isEnergyAttack: true, battleEffectsColumn: "Fo", damageType: "energy-force", requiresSave: true, save: { ability: "endurance", intensity: "power-rank", onFail: { effect: "unconscious", duration: "1-10" } } },
  "Corrosive Missile":        { battleEffectsColumn: "En", damageType: "corrosive", continuingDamage: true, continuingDamageRounds: 3, canPullPunch: false, canReduceEffect: false },
  "Slashing Missile":         { battleEffectsColumn: "TE", damageType: "physical-edged", canPullPunch: false, canReduceEffect: false },
  "Nullifier Missile":        { battleEffectsColumn: "Fo", requiresSave: true, save: { ability: "psyche", intensity: "power-rank", onFail: { effect: "nullified", duration: "custom" } } },
  "Darkforce Generation":     { isEnergyAttack: true, battleEffectsColumn: "En", damageType: "energy-darkforce", canPullPunch: true, canReduceEffect: true },

  // Mental Powers
  "Telepathy":                         { mental: { telepathy: true }, requiresSave: false },
  "Image Generation":                  { mental: { imageGeneration: true }, requiresSave: true, save: { ability: "intuition", intensity: "power-rank", onFail: { effect: "custom", duration: "custom" } } },
  "Telekinesis":                       { isAttackPower: true, battleEffectsColumn: "Fo", damageSource: "rank", damageType: "energy-force", specialStrengthType: "tk" },
  "Mind Control":                      { mental: { mindControl: true }, requiresSave: true, save: { ability: "psyche", intensity: "power-rank", onFail: { effect: "custom", duration: "custom" } } },
  "Emotion Control":                   { mental: { emotionControl: true }, requiresSave: true, save: { ability: "intuition", intensity: "power-rank", onFail: { effect: "custom", duration: "custom" } } },
  "Force Field Generation":            { isDefensePower: true, isForceField: true, forceFieldType: "projected", battleEffectsColumn: "Fo", damageType: "energy-force" },
  "Animal Communication and Control":  { mental: { mindControl: true }, requiresSave: true, save: { ability: "psyche", intensity: "power-rank", onFail: { effect: "custom", duration: "custom" } } },
  "Mechanical Intuition":              { mental: { mechanicalIntuition: true }, isAbilitySubstitution: true, abilitySubstitution: { reason: { enabled: true, context: "Machine/computer intuition" } }, requiresSave: false },
  "Animal Empathy":                    { mental: { empathy: true }, requiresSave: false },
  "Empathy":                           { mental: { empathy: true }, requiresSave: false },
  "Psi-Screen":                        { activationType: "passive", isActive: true, isDefensePower: true, mental: { psiScreen: true }, requiresSave: false, resistanceType: "mental", resistanceEffect: "featReplace" },
  "Mental Probe":                      { mental: { mentalProbe: true }, requiresSave: true, save: { ability: "psyche", intensity: "power-rank", onFail: { effect: "custom", duration: "custom" } } },
  "Animate Drawings":                  { mental: { animateDrawings: true }, requiresSave: false },
  "Possession":                        { mental: { possession: true }, requiresSave: true, save: { ability: "psyche", intensity: "power-rank", onFail: { effect: "custom", duration: "custom" } } },
  "Transferral":                       { mental: { transferral: true }, requiresSave: true, save: { ability: "psyche", intensity: "power-rank", onFail: { effect: "custom", duration: "custom" } } },
  "Astral Projection":                 { mental: { astralProjection: true }, requiresSave: false },
  "Psionic Attack":                    { mental: { psionicAttack: true }, requiresSave: true, damageType: "mental", battleEffectsColumn: "Me", save: { ability: "psyche", intensity: "power-rank", onFail: { effect: "stunned", duration: "1-10" } } },
  "Precognition":                      { mental: { precognition: true }, requiresSave: false },
  "Postcognition":                     { mental: { postcognition: true }, requiresSave: false },
  "Plant Control":                     { mental: { mindControl: true }, requiresSave: true, save: { ability: "psyche", intensity: "power-rank", onFail: { effect: "custom", duration: "custom" } } },
  "Ultimate Skill":                    { isAbilitySubstitution: true, requiresSave: false, specialMechanics: "Record the selected skill/field; use power rank instead of normal ability for that specialty." },

  // Body Alterations / Offensive
  "Extra Body Parts":       { extraBodyParts: [{ type: "", count: 1, notes: "" }] },
  "Extra Attacks":          { extraAttacks: true, specialMechanics: "Use power rank to determine additional attacks." },
  "Energy Touch":           { battleEffectsColumn: "En", damageType: "touch-energy", canPullPunch: true, canReduceEffect: true },
  "Paralyzing Touch":       { battleEffectsColumn: "BA", damageType: "touch-paralyzing", isParalyzingTouch: true, requiresSave: true, save: { ability: "endurance", intensity: "power-rank", onFail: { effect: "paralyzed", duration: "1-10" } } },
  "Claws":                  { battleEffectsColumn: "EA", damageType: "physical-edged", specialStrengthType: "claw", ignoresArtificialArmor: true, canPullPunch: false, canReduceEffect: false },
  "Rotting Touch":          { battleEffectsColumn: "En", damageType: "touch-rotting", ignoresNaturalArmor: true, continuingDamage: true, continuingDamageRounds: 3, canPullPunch: false, canReduceEffect: false },
  "Corrosive Touch":        { battleEffectsColumn: "En", damageType: "touch-corrosive", ignoresArtificialArmor: true, continuingDamage: true, continuingDamageRounds: 3, canPullPunch: false, canReduceEffect: false },
  "Health-Drain Touch":     { battleEffectsColumn: "BA", damageType: "touch-healthdrain", isHealthDrain: true, canPullPunch: false, canReduceEffect: false },
  "Blinding Touch":         { battleEffectsColumn: "BA", damageType: "touch-blinding", isBlindingTouch: true, requiresSave: true, save: { ability: "endurance", intensity: "power-rank", onFail: { effect: "blinded", duration: "1-10" } } },

  // Body Alterations / Defensive
  "Body Armor":             { isBodyArmor: true, bodyArmorType: "both", armorNature: "natural" },
  "Water Breathing":        { isWaterBreathing: true, isDefensePower: false, specialMechanics: "Allows breathing underwater; no damage mitigation." },
  "Absorption":             { absorptionType: "energy", absorptionConvertsToHealth: true, isDefensePower: true },
  "Regeneration":           { regenerationType: "rest" },
  "Solar Regeneration":     { regenerationType: "solar" },
  "Recovery":               { hasRecoveryPower: true },
  "Life Support":           { isLifeSupport: true, isDefensePower: false },
  "Pheromones":             { bodyDefensive: { pheromones: true }, isDefensePower: false, requiresSave: true, save: { ability: "endurance", intensity: "power-rank", onFail: { effect: "custom", duration: "1-10" } } },
  "Damage Transfer":        { isDamageTransfer: true, healingType: "touch", range: "touch" },
  "Healing":                { isHealingPower: true, healingType: "touch", range: "touch" },
  "Immortality":            { isImmortality: true, isDefensePower: false, specialMechanics: "Immortality is campaign/Judge-facing; no direct mitigation." }
};

// Schema defaults treated as "blank" for conservative preset application. This
// lets a newly-created power with default Endurance save be changed to a Psyche
// save for mental powers, while preserving any user-edited non-default value.
const PRESET_DEFAULTS = {
  activationType: "activated",
  isActive: true,
  range: "",
  area: 0,
  duration: "",
  customDuration: "",
  isAttackPower: false,
  battleEffectsColumn: "",
  damageSource: "rank",
  damageType: "",
  damage: 0,
  canPullPunch: false,
  canReduceEffect: false,
  armorPiercing: false,
  ignoresNaturalArmor: false,
  ignoresArtificialArmor: false,
  bypassForceField: false,
  continuingDamage: false,
  continuingDamageRounds: 3,
  extraAttacks: false,
  extraBodyParts: [],
  specialStrengthType: "",
  requiresSave: false,
  save: { ability: "endurance", intensity: "power-rank", fixedRank: "", onFail: { effect: "stunned", duration: "1-10", notes: "" }, rerollOnKarmaLoss: false, rerollOnLifeThreat: false },
  isDefensePower: false,
  isBodyArmor: false,
  bodyArmorType: "both",
  armorNature: "natural",
  armorPhysical: 0,
  armorEnergy: 0,
  isForceField: false,
  forceFieldType: "personal",
  forceFieldCoverage: 0,
  isResistance: false,
  resistanceType: "",
  resistanceEffect: "damageReduction",
  resistanceIsInvulnerability: false,
  resistanceMinRank: "",
  isEnergyReflection: false,
  energyReflectionType: "",
  energyReflectionRank: "full",
  countsAsTwoPowers: false,
  isSensePower: false,
  isAbilitySubstitution: false,
  isMovementPower: false,
  isControlPower: false,
  isMentalPower: false,
  isTransformPower: false,
  detection: { enhancedSense: "", protectedSense: "", detectionType: "", infravisionRange: 0, combatSense: false, cosmicAwareness: false, computerLinks: false, canTrack: false },
  abilitySubstitution: {
    fighting: { enabled: false, context: "" }, agility: { enabled: false, context: "" },
    strength: { enabled: false, context: "" }, endurance: { enabled: false, context: "" },
    reason: { enabled: false, context: "" }, intuition: { enabled: false, context: "" },
    psyche: { enabled: false, context: "" }
  },
  movement: { type: "", areasPerRound: 0, useRankSpeed: false, leavesTunnel: false },
  control: { controlType: "", controlSpecific: "", manipulateExisting: false, generateNew: false, useAsShield: false, useAsWeapon: false, createConstructs: false, animateObjects: false },
  mental: { telepathy: false, mentalProbe: false, mindControl: false, emotionControl: false, empathy: false, psiScreen: false, imageGeneration: false, possession: false, astralProjection: false, psionicAttack: false, transferral: false, animateDrawings: false, precognition: false, postcognition: false, mechanicalIntuition: false, emotionType: "", singleEmotionBonus: false },
  transformation: { affects: "self", transformType: "", targetMaterial: "", targetResistsWith: "", duration: "concentration", touchRequired: false, retainsMental: true, retainsPowers: false },
  bodyDefensive: { pheromones: false },
  isWaterBreathing: false,
  healingType: "",
  regenerationType: "",
  absorptionType: "",
  absorptionSpecific: "",
  absorptionConvertsToHealth: false,
  absorptionCanRedirect: false,
  hasRecoveryPower: false,
  isDamageTransfer: false,
  isHealingPower: false,
  isHealthDrain: false,
  isParalyzingTouch: false,
  isBlindingTouch: false,
  isLifeSupport: false,
  isImmortality: false,
  hasBonusPowers: false,
  bonusPowers: [],
  specialMechanics: ""
};

function clonePresetValue(value) {
  return foundry.utils.deepClone(value);
}

function flattenPreset(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flattenPreset(value, path, out);
    else out[path] = value;
  }
  return out;
}

function valuesEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function isBlankPresetTarget(system, path) {
  const current = foundry.utils.getProperty(system, path);
  const defaultValue = foundry.utils.getProperty(PRESET_DEFAULTS, path);
  if (current === undefined || current === null || current === "") return true;
  if (Array.isArray(current) && current.length === 0) return true;
  return valuesEqual(current, defaultValue);
}

function populatePowerTypeOptions(html, category, selectedType = "") {
  const select = html.find('#ps2-type');
  if (!select.length) return;
  const types = POWER_TYPES_BY_CATEGORY[category] || [];
  select.empty();
  select.append($('<option value="">-- Select Type --</option>'));
  for (const type of types) {
    select.append($('<option></option>').attr('value', type).text(type));
  }

  if (selectedType && !types.includes(selectedType)) {
    select.append($('<option></option>').attr('value', selectedType).text(`${selectedType} (legacy/custom)`));
  }
  select.val(selectedType || "");
}

function buildPowerPresetUpdates(system, category, type) {
  const updates = {};
  const preset = foundry.utils.mergeObject(
    foundry.utils.deepClone(CATEGORY_ENGINE_PRESETS[category] || {}),
    foundry.utils.deepClone(POWER_ENGINE_PRESETS[type] || {}),
    { inplace: false }
  );

  for (const [path, value] of Object.entries(flattenPreset(preset))) {
    if (isBlankPresetTarget(system, path)) {
      updates[`system.${path}`] = clonePresetValue(value);
    }
  }
  return updates;
}

// Category -> suggested activationType
// passive = always-on (Body Armor, Resistances, Senses)
// activated = toggled on/off (Flight, Energy Blasts)
const CATEGORY_ACTIVATION_TYPE = {
  resistances:              "passive",
  senses:                   "passive",
  bodyAlterationsDefensive: "passive",
  movement:                 "activated",
  matterControl:            "activated",
  energyControl:            "activated",
  bodyControl:              "activated",
  distanceAttacks:          "activated",
  mentalPowers:             "activated",
  bodyAlterationsOffensive: "activated"
};

// When a category is selected, auto-check these section toggles and sub-toggles
// so the user doesn't have to manually dig through 3 layers of checkboxes.
// Keys = category value, values = { sections: [section-check data-section values],
//                                    subs: [sub-check data-sub values] }
const CATEGORY_AUTO_EXPAND = {
  resistances:              { sections: ["defense"], subs: ["resistance"] },
  bodyAlterationsDefensive: { sections: ["defense"], subs: [] },
  mentalPowers:             { sections: ["save"], subs: [] },
  distanceAttacks:          { sections: ["save"], subs: [] },
  bodyAlterationsOffensive: { sections: ["save"], subs: [] }
};

// Category -> section flags to auto-tick on category CHANGE (not on render).
// Only ticks flags that are currently unset. Explicit user choices always win.
const CATEGORY_FLAG_AUTO_TICK = {
  resistances:              { isDefensePower: true, isResistance: true },
  senses:                   { isSensePower: true },
  movement:                 { isMovementPower: true },
  matterControl:            { isControlPower: true },
  energyControl:            { isControlPower: true },
  bodyControl:              { isTransformPower: true },
  mentalPowers:             { isMentalPower: true },
  bodyAlterationsDefensive: { isDefensePower: true },
  distanceAttacks:          { isAttackPower: true },
  bodyAlterationsOffensive: { isAttackPower: true }
};

// Category -> sensible sub-field defaults. Same "unset only" rule.
const CATEGORY_FIELD_DEFAULTS = {
  bodyControl: { "transformation.affects": "self" }
};

// Resistance type -> derived defaults per Players' Book pp. 71.
// Used by the #ps2-resistance-type change handler to seed resistanceEffect
// and resistanceMinRank. Damage-based resistances (fire/cold/electricity/
// radiation/corrosive) reduce damage by rank #; ability-based resistances
// (toxin/disease/emotion/mental/magical) replace the relevant FEAT ability
// and may impose a minimum-rank rule against that ability +1CS.
const RESISTANCE_TYPE_DEFAULTS = {
  fire:        { effect: "damageReduction", minRank: "" },
  cold:        { effect: "damageReduction", minRank: "" },
  electricity: { effect: "damageReduction", minRank: "" },
  radiation:   { effect: "damageReduction", minRank: "" },
  corrosive:   { effect: "damageReduction", minRank: "" },
  toxin:       { effect: "featReplace",     minRank: "endurance+1" },
  disease:     { effect: "featReplace",     minRank: "endurance+1" },
  emotion:     { effect: "featReplace",     minRank: "intuition+1" },
  mental:      { effect: "featReplace",     minRank: "psyche+1" },
  magical:     { effect: "featReplace",     minRank: "" }
};

// Sections always shown regardless of category
const ALWAYS_VISIBLE = ["attack", "limitation", "bonusPowers", "magic"];

// All toggleable section keys
const ALL_SECTIONS = [
  "attack", "defense", "save", "detection",
  "abilitySubstitution", "movement", "control", "mental",
  "transformation", "healing", "magic", "limitation", "bonusPowers"
];

function updateSectionVisibility(html, category) {
  const suggested = CATEGORY_SECTIONS[category] || [];
  for (const key of ALL_SECTIONS) {
    const el = html.find(`.ps2-section[data-section="${key}"]`);
    if (!el.length) continue;
    const isAlways = ALWAYS_VISIBLE.includes(key);
    const isSuggested = suggested.includes(key);
    const toggle = el.find('.ps2-section-check');
    const userEnabled = toggle.length ? toggle.prop('checked') : false;
    const show = isAlways || isSuggested || userEnabled;
    el.attr('data-hidden', show ? 'false' : 'true');
    el.attr('data-suggested', isSuggested ? 'true' : 'false');
  }
  // Auto-expand section bodies and sub-sections for this category
  // We force-show the section body so it's *available* for the category, but
  // do NOT auto-check the underlying toggle — that would flip the persisted
  // system flag (e.g. requiresSave) on every sheet open, overriding the user's
  // explicit choice. The toggle stays as authored; visibility is just the hint.
  const autoExp = CATEGORY_AUTO_EXPAND[category];
  if (autoExp) {
    for (const sectionKey of autoExp.sections) {
      const sectionEl = html.find(`.ps2-section[data-section="${sectionKey}"]`);
      sectionEl.attr("data-hidden", "false");
      sectionEl.attr("data-suggested", "true");
      sectionEl.find('.ps2-section-body').show();
    }
    for (const subKey of autoExp.subs) {
      html.find(`.ps2-sub-body[data-sub="${subKey}"]`).show();
    }
  }
}

export function ps2ActivateListeners(html, sheet) {
  // Visibility computation runs for both editable and read-only sheets so
  // compendium-opened items honor category-driven section gating. Without
  // this, the early-return in itemSheet._onRender for !isEditable would
  // leave every section visible because data-hidden never gets set.
  const category = html.find('#ps2-category').val();
  const selectedType = sheet.item?.system?.type || html.find('#ps2-type').data('current') || "";
  populatePowerTypeOptions(html, category, selectedType);
  updateSectionVisibility(html, category);

  // Everything below requires write access (data migrations + event handlers).
  if (!sheet.isEditable) return;

  // One-time migration: infer specialStrengthType from existing fields
  const sys = sheet.item?.system ?? {};
  if (!sys.specialStrengthType) {
    const inferred = sys.clawMaterialStrength ? "claw"
      : sys.telekinesisStrength ? "tk"
      : sys.ensnaringStrength ? "ensnare"
      : "";
    if (inferred) {
      sheet.item.update({ "system.specialStrengthType": inferred }, { render: false });
    }
  }

  // Category change -> re-evaluate visibility, repopulate the canonical
  // type list, and seed category-level engine defaults. Only blank/default
  // fields are changed; explicit user choices survive.
  html.find('#ps2-category').on('change', async ev => {
    const cat = ev.currentTarget.value;
    const existingType = sheet.item.system?.type || "";
    const validTypes = POWER_TYPES_BY_CATEGORY[cat] || [];
    const keepType = existingType && validTypes.includes(existingType);
    const selectedType = keepType ? existingType : "";

    populatePowerTypeOptions(html, cat, selectedType);
    updateSectionVisibility(html, cat);

    const updates = {
      "system.category": cat
    };
    if (!keepType && existingType) updates["system.type"] = "";

    // Do not seed category-only automation before a type is chosen. Many
    // categories contain exceptions (e.g. Telepathy, Probability Manipulation,
    // Water Breathing), and a broad category preset would otherwise leave
    // stale attack/save/defense flags that the conservative preset logic should
    // not later overwrite.
    if (selectedType) {
      Object.assign(updates, buildPowerPresetUpdates(sheet.item.system, cat, selectedType));
    }

    if (Object.keys(updates).length) {
      await sheet.item.update(updates);
    }
  });

  // Type change -> apply the canonical power-to-engine-default map. This is
  // the main automation preset layer: type selection seeds attack routing,
  // defense flags, save defaults, movement/control/mental flags, and special
  // action flags without clobbering already-customized fields.
  html.find('#ps2-type').on('change', async ev => {
    const type = ev.currentTarget.value;
    const cat = html.find('#ps2-category').val();
    const updates = {
      "system.type": type
    };
    Object.assign(updates, buildPowerPresetUpdates(sheet.item.system, cat, type));
    await sheet.item.update(updates);
  });

  // Activation type change -> if set to passive, force isActive true + enable AEs
  html.find('.ps2-activation-type').on('change', async ev => {
    const val = ev.currentTarget.value;
    if (val === "passive") {
      await sheet.item.update({
        "system.activationType": val,
        "system.isActive": true
      });
      // Enable all transfer AEs for passive powers
      const transferEffects = sheet.item.effects.filter(e => e.transfer);
      if (transferEffects.length) {
        const updates = transferEffects.map(e => ({ _id: e.id, disabled: false }));
        await sheet.item.updateEmbeddedDocuments("ActiveEffect", updates);
      }
    }
  });

  // Section toggle checkboxes -> show/hide body
  html.find('.ps2-section-check').on('change', ev => {
    const cb = ev.currentTarget;
    const section = cb.dataset.section;
    const body = html.find(`.ps2-section[data-section="${section}"] .ps2-section-body`);
    if (cb.checked) {
      body.slideDown(150);
      // If user manually enables a hidden section, make it visible
      html.find(`.ps2-section[data-section="${section}"]`).attr('data-hidden', 'false');
    } else {
      body.slideUp(150);
    }
  });

  // Sub-section toggles (body armor, force field, etc.)
  html.find('.ps2-sub-check').on('change', ev => {
    const cb = ev.currentTarget;
    const sub = cb.dataset.sub;
    const body = html.find(`.ps2-sub-body[data-sub="${sub}"]`);
    cb.checked ? body.slideDown(120) : body.slideUp(120);
  });

  // Damage source -> enable/disable fixed damage field
  html.find('#ps2-dmg-source').on('change', ev => {
    const isFixed = ev.currentTarget.value === 'fixed';
    html.find('input[name="system.damage"]').prop('disabled', !isFixed);
  });

  // Damage type -> auto-tick ignore-armor flags for rotting/corrosive touch
  html.find('#ps2-dmg-type').on('change', async ev => {
    const val = ev.currentTarget.value;
    const updates = { "system.damageType": val };
    if (val === "touch-rotting") {
      updates["system.ignoresNaturalArmor"] = true;
    } else if (val === "touch-corrosive") {
      updates["system.ignoresArtificialArmor"] = true;
    }
    await sheet.item.update(updates);
  });

  // Resistance type -> auto-set effect + minRank from RESISTANCE_TYPE_DEFAULTS.
  // Per Players' Book pp. 71. Damage-based types use damageReduction; ability-
  // based types use featReplace with a minimum-rank rule. Overrides any
  // existing effect/minRank to keep them aligned with the chosen type.
  html.find('#ps2-resistance-type').on('change', async ev => {
    const val = ev.currentTarget.value;
    const updates = { "system.resistanceType": val };
    const defaults = RESISTANCE_TYPE_DEFAULTS[val];
    if (defaults) {
      // Don't override an explicit invulnerability — that's a separate choice
      // from the type's natural effect.
      if (sheet.item.system.resistanceEffect !== "invulnerability") {
        updates["system.resistanceEffect"] = defaults.effect;
      }
      updates["system.resistanceMinRank"] = defaults.minRank;
    }
    await sheet.item.update(updates);
  });

  // Resistance effect -> keep countsAsTwoPowers + isInvulnerability in sync
  // with the "invulnerability" option. Invulnerability costs 2 power slots
  // per rulebook ("The initial choosing of Invulnerability counts as two
  // choices").
  html.find('#ps2-resistance-effect').on('change', async ev => {
    const val = ev.currentTarget.value;
    const updates = { "system.resistanceEffect": val };
    if (val === "invulnerability") {
      updates["system.resistanceIsInvulnerability"] = true;
      if (!sheet.item.system.countsAsTwoPowers) {
        updates["system.countsAsTwoPowers"] = true;
      }
    } else {
      updates["system.resistanceIsInvulnerability"] = false;
      // Don't auto-untick countsAsTwoPowers — user may have set it for
      // another reason (e.g. Time Control also counts as two).
    }
    await sheet.item.update(updates);
  });

  // Rank change -> auto-fill Value from lookup
  html.find('#ps2-rank').on('change', async ev => {
    const rank = ev.currentTarget.value;
    const val = (CONFIG.FASERIP?.rankValues?.[rank] ?? RANK_VALUES[rank]) ?? "";
    html.find('#ps2-value').val(val);
    // Auto-fill armor fields if this is a body armor power
    const updates = { "system.rank": rank, "system.value": Number(val) || 0 };
    if (sheet.item.system.isBodyArmor) {
      const numVal = Number(val) || 0;
      if (!sheet.item.system.armorPhysicalCustom) {
        updates["system.armorPhysical"] = numVal;
      }
      if (!sheet.item.system.armorEnergyCustom) {
        updates["system.armorEnergy"] = Math.max(0, numVal - 20);
      }
    }
    await sheet.item.update(updates);
  });

  // Body Armor: detect manual physical edit -> set custom flag
  html.find('#ps2-armor-phys').on('change', async ev => {
    const newPhys = Number(ev.currentTarget.value) || 0;
    const rankVal = sheet.item.system.value || 0;
    const isCustom = newPhys !== rankVal;
    if (isCustom !== (sheet.item.system.armorPhysicalCustom || false)) {
      await sheet.item.update({ "system.armorPhysicalCustom": isCustom });
    }
  });

  // Body Armor: reset physical to default on badge click
  html.find('[data-action="reset-armor-physical"]').on('click', async ev => {
    ev.preventDefault();
    ev.stopPropagation();
    const rankVal = sheet.item.system.value || 0;
    await sheet.item.update({
      "system.armorPhysical": rankVal,
      "system.armorPhysicalCustom": false
    });
  });

  // Body Armor: detect manual energy edit -> set custom flag
  html.find('#ps2-armor-energy').on('change', async ev => {
    const newEnergy = Number(ev.currentTarget.value) || 0;
    const rankVal = sheet.item.system.value || 0;
    const defaultEnergy = Math.max(0, rankVal - 20);
    const isCustom = newEnergy !== defaultEnergy;
    if (isCustom !== (sheet.item.system.armorEnergyCustom || false)) {
      await sheet.item.update({ "system.armorEnergyCustom": isCustom });
    }
  });

  // Body Armor: reset energy to default on badge click
  html.find('[data-action="reset-armor-energy"]').on('click', async ev => {
    ev.preventDefault();
    ev.stopPropagation();
    const rankVal = sheet.item.system.value || 0;
    await sheet.item.update({
      "system.armorEnergy": Math.max(0, rankVal - 20),
      "system.armorEnergyCustom": false
    });
  });

  // Special strength type change -> re-render to show correct sub-select
  html.find('#ps2-special-str-type').on('change', async ev => {
    await sheet.item.update({ "system.specialStrengthType": ev.currentTarget.value }, { render: false });
    sheet.render(true);
  });

  // Bonus powers: add
  html.find('#ps2-add-bonus').on('click', async () => {
    const item = sheet.item;
    const list = foundry.utils.deepClone(item.system.bonusPowers || []);
    list.push({ name: "", rankMod: "same" });
    await item.update({ "system.bonusPowers": list });
  });

  // Bonus powers: remove
  html.find('.ps2-remove-bonus').on('click', async ev => {
    const idx = Number(ev.currentTarget.dataset.index);
    const item = sheet.item;
    const list = foundry.utils.deepClone(item.system.bonusPowers || []);
    list.splice(idx, 1);
    await item.update({ "system.bonusPowers": list });
  });

  // Extra Body Parts: add
  html.find('#ps2-add-bodypart').on('click', async () => {
    const item = sheet.item;
    const list = foundry.utils.deepClone(item.system.extraBodyParts || []);
    list.push({ type: "", count: 1, notes: "" });
    await item.update({ "system.extraBodyParts": list });
  });

  // Extra Body Parts: remove
  html.find('.ps2-remove-bodypart').on('click', async ev => {
    const idx = Number(ev.currentTarget.dataset.index);
    const item = sheet.item;
    const list = foundry.utils.deepClone(item.system.extraBodyParts || []);
    list.splice(idx, 1);
    await item.update({ "system.extraBodyParts": list });
  });

  // SFX preview (reuse existing pattern)
  html.find('.sfx-preview').on('click', ev => {
    const btn = ev.currentTarget;
    const field = btn.dataset.sfxField;
    const volField = btn.dataset.volumeField;
    const path = html.find(`input[name="${field}"]`).val();
    if (!path) return;
    const vol = (Number(html.find(`input[name="${volField}"]`).val()) || 80) / 100;
    const audio = new Audio(path);
    audio.volume = vol;
    audio.play().catch(() => {});
  });

  // VFX preview — reads form values (so unsaved edits preview correctly)
  html.find('.vfx-preview').on('click', async ev => {
    ev.preventDefault();
    const preset   = html.find('select[name="system.vfx.preset"]').val() || "";
    const color    = html.find('input[name="system.vfx.color"]').val() || "";
    const asset    = html.find('input[name="system.vfx.asset"]').val() || "";
    const impact   = html.find('input[name="system.vfx.impact"]').val() || "";
    const scale    = Number(html.find('input[name="system.vfx.scale"]').val()) || 1;
    const duration = Number(html.find('input[name="system.vfx.duration"]').val()) || 1000;
    if (game.msh?.fx?.preview) {
      await game.msh.fx.preview({ preset, color, asset, impact, scale, duration });
    } else {
      ui.notifications?.warn("FX service unavailable.");
    }
  });

  // File picker buttons — V2 dropped V1's automatic class="file-picker"
  // binding, so sheets have to wire them up themselves.
  // Covers both <button class="file-picker"> rows (SFX hit/miss, VFX
  // asset/impact) and the portrait <img data-edit="img"> in the header.
  const FilePickerImpl = foundry.applications.apps?.FilePicker?.implementation ?? FilePicker;

  html.find('button.file-picker').on('click', ev => {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const target = btn.dataset.target;
    if (!target) return;
    const input = html.find(`input[name="${target}"]`);
    new FilePickerImpl({
      type: btn.dataset.type || "imagevideo",
      current: input.val() || "",
      callback: path => {
        input.val(path).trigger("change");
      }
    }).render(true);
  });

  html.find('img[data-edit]').on('click', ev => {
    ev.preventDefault();
    const img = ev.currentTarget;
    const field = img.dataset.edit;
    if (!field) return;
    new FilePickerImpl({
      type: "image",
      current: img.getAttribute("src") || "",
      callback: path => {
        sheet.item.update({ [field]: path });
      }
    }).render(true);
  });

  // Active Effects: auto-expand if effects exist, collapse if none
  const effectsFieldset = html.find('.ps2-effects-fieldset');
  const effectsBody = html.find('.ps2-effects-body');
  const hasEffects = effectsBody.find('.ps2-effect-row').length > 0;
  if (hasEffects) {
    effectsBody.show();
    effectsFieldset.attr('data-expanded', 'true');
  }
  html.find('.ps2-effects-expand').on('click', ev => {
    ev.preventDefault();
    const expanded = effectsFieldset.attr('data-expanded') === 'true';
    if (expanded) {
      effectsBody.slideUp(150);
      effectsFieldset.attr('data-expanded', 'false');
    } else {
      effectsBody.slideDown(150);
      effectsFieldset.attr('data-expanded', 'true');
    }
  });

  // Persistent textarea heights (localStorage keyed by item ID + field name)
  const itemId = sheet.item?.id ?? 'unknown';
  html.find('.ps2-textarea').each(function () {
    const ta = this;
    const $ta = $(ta);
    const field = $ta.attr('name');
    if (!field) return;
    const key = `ps2-ta-${itemId}-${field}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      ta.style.height = saved + 'px';
      ta.removeAttribute('rows');
    }
    // Save on drag-resize (mouseup after resize changes offsetHeight)
    let lastH = ta.offsetHeight;
    $ta.on('mouseup', () => {
      if (ta.offsetHeight !== lastH) {
        lastH = ta.offsetHeight;
        localStorage.setItem(key, lastH);
      }
    });
  });
}

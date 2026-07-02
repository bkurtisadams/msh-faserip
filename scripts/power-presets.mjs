// Canonical Advanced Set power type list used by the V2 sheet. Keeping this
// next to the preset map avoids the old split-brain problem where the UI knew
// a type existed but no engine defaults were seeded when the type was chosen.
export const POWER_TYPES_BY_CATEGORY = {
  resistances: [
    "Resistance to Fire/Heat", "Resistance to Cold", "Resistance to Electricity",
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

export const CATEGORY_ENGINE_PRESETS = {
  resistances:              { activationType: "passive", isActive: true, isDefensePower: true, isResistance: true },
  senses:                   { activationType: "passive", isActive: true, isSensePower: true },
  movement:                 { activationType: "activated", isMovementPower: true, movement: { useRankSpeed: true } },
  matterControl:            { activationType: "activated", isControlPower: true, isAttackPower: true, range: "rank", damageSource: "rank" },
  energyControl:            { activationType: "activated", isControlPower: true, isAttackPower: true, range: "rank", damageSource: "rank" },
  bodyControl:              { activationType: "activated", isTransformPower: true, transformation: { affects: "self" } },
  distanceAttacks:          { activationType: "activated", isAttackPower: true, range: "rank", damageSource: "rank" },
  mentalPowers:             { activationType: "activated", isMentalPower: true, range: "rank" },
  bodyAlterationsOffensive: { activationType: "activated", isAttackPower: true, range: "touch", damageSource: "rank" },
  bodyAlterationsDefensive: { activationType: "passive", isActive: true, isDefensePower: true }
};

export const POWER_ENGINE_PRESETS = {
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
  "Absorption":             { absorptionType: "energy", absorptionConvertsToHealth: true, isDefensePower: true, isResistance: false },
  "Regeneration":           { regenerationType: "rest", isDefensePower: false },
  "Solar Regeneration":     { regenerationType: "solar", isDefensePower: false },
  "Recovery":               { hasRecoveryPower: true, isDefensePower: false },
  "Life Support":           { isLifeSupport: true, isDefensePower: false },
  "Pheromones":             { bodyDefensive: { pheromones: true }, isDefensePower: false, requiresSave: true, save: { ability: "endurance", intensity: "power-rank", onFail: { effect: "custom", duration: "1-10" } } },
  "Damage Transfer":        { isDamageTransfer: true, healingType: "touch", range: "touch" },
  "Healing":                { isHealingPower: true, healingType: "touch", range: "touch" },
  "Immortality":            { isImmortality: true, isDefensePower: false, specialMechanics: "Immortality is campaign/Judge-facing; no direct mitigation." }
};

// Schema defaults treated as "blank" for conservative preset application. This
// lets a newly-created power with default Endurance save be changed to a Psyche
// save for mental powers, while preserving any user-edited non-default value.
export const PRESET_DEFAULTS = {
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

export function clonePresetValue(value) {
  return foundry.utils.deepClone(value);
}

export function flattenPreset(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flattenPreset(value, path, out);
    else out[path] = value;
  }
  return out;
}

export function valuesEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function isBlankPresetTarget(system, path) {
  const current = foundry.utils.getProperty(system, path);
  const defaultValue = foundry.utils.getProperty(PRESET_DEFAULTS, path);
  if (current === undefined || current === null || current === "") return true;
  if (Array.isArray(current) && current.length === 0) return true;
  return valuesEqual(current, defaultValue);
}

export function populatePowerTypeOptions(html, category, selectedType = "") {
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

export function buildPowerPresetUpdates(system, category, type) {
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



export const POWER_NAME_ALIASES = {
  "Resistance to Fire and Heat": "Resistance to Fire/Heat",
  "Resistance to Fire/Heat": "Resistance to Fire/Heat",
  "Mechanical intuition": "Mechanical Intuition",
  "Mechanical Intuition": "Mechanical Intuition",
  "Nullifying": "Nullifying Power",
  "Nullifying Power": "Nullifying Power",
  "Body Transformation — Self": "Body Transformation",
  "Body Transformation - Self": "Body Transformation",
  "Animal Transformation — Self": "Animal Transformation Self",
  "Animal Transformation - Self": "Animal Transformation Self"
};

export function normalizePowerTypeName(name = "") {
  const trimmed = String(name || "").replace(/\s+/g, " ").trim();
  return POWER_NAME_ALIASES[trimmed] || trimmed;
}

export function getPowerCategoryForType(type = "") {
  const normalized = normalizePowerTypeName(type);
  for (const [category, types] of Object.entries(POWER_TYPES_BY_CATEGORY)) {
    if (types.includes(normalized)) return category;
  }
  return "";
}

const POWER_ICON_OVERRIDES = {
  "Resistance to Fire/Heat": "resistance-fire",
  "Resistance to Fire and Heat": "resistance-fire",
  "Resistance to Cold": "resistance-cold",
  "Resistance to Electricity": "resistance-electricity",
  "Resistance to Radiation": "resistance-radiation",
  "Resistance to Toxins": "resistance-toxin",
  "Resistance to Corrosives": "resistance-corrosive",
  "Resistance to Emotion Attacks": "resistance-emotion",
  "Resistance to Mental Attacks": "resistance-mental",
  "Resistance to Magical Attacks": "resistance-magical",
  "Resistance to Disease": "resistance-disease",
  "Invulnerability": "invulnerability",
  "Fire Generation": "energy-fire",
  "Fire Control": "energy-fire",
  "Ice Generation": "energy-cold",
  "Electrical Manipulation": "energy-electricity",
  "Sound Generation": "energy-sound",
  "Sound Manipulation": "energy-sound",
  "Darkforce Generation": "energy-darkforce",
  "Darkforce Manipulation": "energy-darkforce",
  "Corrosive Missile": "corrosive",
  "Slashing Missile": "slashing",
  "Projectile Missile": "projectile",
  "Ensnaring Missile": "ensnaring",
  "Stunning Missile": "stun",
  "Nullifier Missile": "nullify",
  "Nullifying Power": "nullify",
  "Energy Reflection": "energy-reflection",
  "Body Armor": "body-armor",
  "Force Field Generation": "force-field",
  "Absorption": "absorption",
  "Healing": "healing",
  "Recovery": "recovery",
  "Regeneration": "regeneration",
  "Solar Regeneration": "solar-regeneration",
  "Damage Transfer": "damage-transfer",
  "Health-Drain Touch": "health-drain",
  "Paralyzing Touch": "paralyzing-touch",
  "Blinding Touch": "blinding-touch",
  "Claws": "claws",
  "Energy Touch": "energy-touch",
  "Flight": "movement-flight",
  "Gliding": "movement-flight",
  "Teleportation": "movement-teleport",
  "Dimensional Travel": "movement-dimensional",
  "Lightning Speed": "movement-speed",
  "Growth": "growth",
  "Shrinking": "shrinking",
  "Phasing": "phasing",
  "Invisibility": "invisibility",
  "Telepathy": "mental-telepathy",
  "Mind Control": "mental-control",
  "Emotion Control": "mental-emotion",
  "Psi-Screen": "psi-screen",
  "Psionic Attack": "psionic-attack",
  "Ultimate Skill": "ultimate-skill"
};

const CATEGORY_ICON_NAMES = {
  resistances: "category-resistance",
  senses: "category-senses",
  movement: "category-movement",
  matterControl: "category-control",
  energyControl: "category-energy-control",
  bodyControl: "category-transformation",
  distanceAttacks: "category-attack",
  mentalPowers: "category-mental",
  bodyAlterationsOffensive: "category-offensive-body",
  bodyAlterationsDefensive: "category-defensive-body"
};

export function getPowerIconPath(type = "", category = "") {
  const normalized = normalizePowerTypeName(type);
  const iconName = POWER_ICON_OVERRIDES[normalized] || CATEGORY_ICON_NAMES[category] || "category-power";
  return `systems/msh-faserip/assets/icons/powers/${iconName}.svg`;
}

// scripts/data-models.js v2.4.8 - 2026-11-19
// v2.4.8: Power KEYS equipmentId, equipmentName (equipment-granted powers).
// v2.4.7: Power KEYS densityMode, raiseLowest, resistanceTypes,
//         stuntKarmaCost, ultimateSkillTalentId (Edit Power new fields).
// v2.4.6: absorptionConvertsToHealth / absorptionCanRedirect keys removed
//         from the power model (retired with RAW Absorption, 2026-09-09).

const SYSTEM_ID = "msh-faserip";

/**
 * Permissive base: declares each known top-level system key as an AnyField,
 * which accepts/returns any value unchanged. Declaring the key preserves it
 * under V14; AnyField keeps nested data uncoerced.
 */
class PermissiveDataModel extends foundry.abstract.TypeDataModel {
  static KEYS = [];

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};
    for (const key of this.KEYS) {
      schema[key] = new fields.AnyField({ required: false, nullable: true });
    }
    return schema;
  }
}

// ── Actor types ──
class FaseripHeroData extends PermissiveDataModel {
  static KEYS = [
    "abilities", "age", "attributes", "base", "characterType", "chargen", "combatMode",
    "combatMods", "description", "details", "dob", "eyeColor", "group", "hairColor",
    "handedness", "health", "height", "history", "identity", "identityType", "initiative",
    "isMutant", "karma", "legalStatus", "maritalStatus", "movement", "nationality",
    "occupation", "origin", "placeOfBirth", "player", "powerOrigin", "prototypeToken",
    "race", "resistances", "sex", "shotsRemaining", "stunts", "weight"
  ];
}

class FaseripVillainData extends PermissiveDataModel {
  static KEYS = [
    "abilities", "age", "attributes", "base", "characterType", "chargen", "combatMode",
    "combatMods", "description", "details", "dob", "eyeColor", "group", "hairColor",
    "handedness", "health", "height", "history", "identity", "identityType", "initiative",
    "isMutant", "karma", "legalStatus", "maritalStatus", "movement", "nationality",
    "occupation", "origin", "placeOfBirth", "player", "powerOrigin", "prototypeToken",
    "race", "resistances", "sex", "shotsRemaining", "stunts", "weight"
  ];
}

class FaseripNPCData extends PermissiveDataModel {
  static KEYS = [
    "abilities", "age", "attributes", "base", "characterType", "chargen", "combatMode",
    "combatMods", "description", "details", "dob", "eyeColor", "group", "hairColor",
    "handedness", "health", "height", "history", "identity", "identityType", "initiative",
    "isMutant", "karma", "legalStatus", "maritalStatus", "movement", "nationality",
    "occupation", "origin", "placeOfBirth", "player", "powerOrigin", "prototypeToken",
    "race", "resistances", "sex", "shotsRemaining", "stunts", "weight"
  ];
}

class FaseripVehicleActorData extends PermissiveDataModel {
  static KEYS = [
    "age", "base", "body", "bodyCSLoss", "bodyHP", "bodyHPMax", "compartmented", "control",
    "controlCSLoss", "cost", "currentSpeed", "damageLog", "description", "dob", "driver",
    "driverUuid", "eyeColor", "features", "group", "hairColor", "handedness", "height",
    "history", "identity", "identityType", "legalStatus", "maritalStatus", "nationality",
    "occupation", "origin", "outOfControl", "passengerUuids", "passengers", "player",
    "protection", "race", "resources", "seatingCapacity", "sex", "speed", "speedCSLoss",
    "type", "weight"
  ];
}

// ── Item types ──
class FaseripPowerData extends PermissiveDataModel {
  static KEYS = [
    "abilitySubstitution", "absorptionSpecific", "absorptionType", "actionType", "activationType", "animal",
    "area", "areasPerRound", "armorEnergy", "armorEnergyCustom", "armorNature",
    "armorPhysical", "armorPhysicalCustom", "armorPiercing", "armorUseRankValue",
    "attackAbility", "attackType", "battleEffectsColumn", "bodyArmorType", "bodyDefensive",
    "bonusFrom", "bonusPowers", "bypassForceField", "calculatedRange", "canPullPunch",
    "canReduceEffect", "category", "categoryRoll", "clawMaterialStrength",
    "columnShiftBonus", "continuingDamage", "continuingDamageRounds", "control",
    "controlQuantity", "controlStrength", "countsAsTwoPowers", "customDuration",
    "customRange", "damage", "densityMode", "damageSource", "damageType", "defenseType", "depoweredRank",
    "description", "detection", "duration", "durationRounds", "effectAnimation",
    "effectColor", "effectNotes", "effectVariant", "energyReflectionRank",
    "energyReflectionType", "ensnaringStrength", "equipmentId", "equipmentName", "extraAttacks", "extraBodyParts",
    "forceFieldCoverage", "forceFieldPersonal", "forceFieldType", "gmNotes",
    "grantedByEquipment", "hardware", "hasBonusPowers", "hasRecoveryPower", "healingMaxPerDay",
    "healingType", "ignoresArtificialArmor", "ignoresNaturalArmor", "initialRank",
    "initialRoll", "initialValue", "isAbilitySubstitution", "isActive", "isAttackPower",
    "isBluntAttack", "isBodyArmor", "isBonus", "isChargingAttack", "isControlPower",
    "isDamageTransfer", "isDefensePower", "isDetectionPower", "isEdgedAttack",
    "isEnergyAttack", "isEnergyReflection", "isForceAttack", "isForceField",
    "isGrabbingAttack", "isGrapplingAttack", "isHealingPower", "isHealthDrain",
    "isImmortality", "isLifeSupport", "isLimited", "isMagic", "isMentalAttack",
    "isMentalPower", "isParalyzingTouch", "isBlindingTouch",
    "isMovementPower", "isReactivePower", "isResistance", "isSensePower",
    "isShootingAttack", "isStarred", "isThrowingBlunt", "isThrowingEdged",
    "isTransformPower", "isTransformation", "isWaterBreathing", "karmaCost", "karmaLoss",
    "lifeSupport", "lifeSupportDurationType", "lifeSupportEnvironments",
    "lifeSupportHours", "lifeSupportTurns", "limitRankMax", "limitation",
    "limitationColumnShift", "limitationDetail", "limitationRequired", "limitations",
    "limitedReset", "magic", "mental", "mentalEffect", "movement", "notes",
    "overridePullPunch", "preLimitationRank", "primaryEffect", "protectionValue", "range",
    "raiseLowest", "rangeAreas", "rank", "rankRule", "rankRuleAbility", "rankValue", "reactive",
    "recoveryRate", "regenerationRate", "regenerationType", "replacesAbility",
    "requiresConcentration", "requiresSave", "resistanceEffect", "resistanceIsConductive",
    "resistanceIsInvulnerability", "resistanceMinRank", "resistanceNotes",
    "resistanceSpecific", "resistanceType", "resistanceTypes", "resistanceValue", "save", "sfx", "source",
    "sourceBook", "sourcePage", "specialMechanics", "specialStrengthType", "speed",
    "stunningIntensity", "stuntKarmaCost", "stunts", "subtype", "summary", "targetResistsWith",
    "telekinesiStrength", "telekinesisStrength", "teleportAccuracy", "transformation",
    "type", "ultimateSkillTalentId", "usesPerScene", "value", "vfx"
  ];
}

class FaseripTalentData extends PermissiveDataModel {
  static KEYS = [
    "ability", "abilityModified", "appliesTo", "bonus", "category", "categoryRoll",
    "description", "effect", "grantsContact", "isCumulative", "isWeaponTalent", "modifier",
    "notes", "rankOverride", "specialty", "type"
  ];
}

class FaseripContactData extends PermissiveDataModel {
  static KEYS = [
    "contactType", "description", "disposition", "location", "notes", "resourceRank",
    "services", "specialties", "specialty", "type"
  ];
}

class FaseripEquipmentData extends PermissiveDataModel {
  static KEYS = [
    "abilityModifiers", "ammoType", "apMode", "areaRadius", "armorEnergy", "armorPiercing",
    "armorPiercingCS", "attackModes", "attackType", "broken", "burst", "burstScatter",
    "bypassForceField", "canisterSubType", "category", "continuingDamage",
    "continuingDamageRandom", "continuingDamageRounds", "controlType", "coverage",
    "customAbilities", "damage", "damageType", "description", "deviceFunctions",
    "duration", "durationUnit", "entangling", "gearType", "grenadeDamage",
    "grenadeDamageType", "grenadeIntensity", "grenadeRadius", "grenadeType",
    "guidanceSystem", "intensityDescription", "intensityDuration", "intensityEffect", "intensityRank",
    "isGrenade", "isIllegal", "isMissile", "legality", "linkedAbility", "materialStrength",
    "militaryOnly", "missileBody", "missileControl", "missileDamage", "missileDamageType",
    "missileSecondaryDamage", "missileSpeed", "missileType", "movementSpeed",
    "movementType", "noRangePenalty", "notes", "oneHandedUse", "payload", "payloadDamage",
    "payloadType", "powerRange", "powerRank", "powerType", "powers", "price", "protection",
    "protectionValue", "range", "rank", "rate", "rechargeLabel", "reloadSfx", "reloadTime",
    "requiresTwoOperators", "resistances", "scatter", "sensoryRange", "sensoryType", "sfx",
    "shots", "shotsRemaining", "specialAmmo", "stationary", "stunIntensity", "subtype",
    "throwable", "treatAsPower", "twoMan", "usesPowerPack", "value", "variantType", "vfx",
    "weaponPowerRank", "weaponType"
  ];
}

class FaseripVehicleItemData extends PermissiveDataModel {
  static KEYS = [
    "body", "bodyCSLoss", "bodyHP", "bodyHPMax", "cargo", "chase", "collision",
    "compartmented", "control", "controlCSLoss", "cost", "damageLog", "description",
    "driver", "driverUuid", "effects", "features", "fuel", "handling", "materialStrength",
    "movement", "notes", "passengerUuids", "passengers", "protection", "range",
    "resources", "seatingCapacity", "seats", "size", "speed", "speedCSLoss", "type",
    "weaponNotes", "weapons"
  ];
}

class FaseripHeadquartersData extends PermissiveDataModel {
  static KEYS = [
    "buildingType", "description", "features", "isRichArea", "loanLastPaid",
    "loanLastPaidGameDate", "loanPaymentRank", "loanPaymentsRemaining",
    "loanPaymentsTotal", "location", "locationModifier", "materialStrength", "notes",
    "ownership", "packages", "purchaseCost", "rentCost", "rentLastPaid",
    "rentLastPaidGameDate", "rentalCost", "size", "staff"
  ];
}

// Flip to true to re-register the TypeDataModels (see v2.4.2 note).
const REGISTER_DATA_MODELS = false;

export function registerDataModels() {
  if (!REGISTER_DATA_MODELS) {
    console.log(`[FASERIP] Data models disabled; template.json governs (${SYSTEM_ID}, V14 deprecation period).`);
    return;
  }
  CONFIG.Actor.dataModels = Object.assign(CONFIG.Actor.dataModels ?? {}, {
    hero: FaseripHeroData,
    villain: FaseripVillainData,
    npc: FaseripNPCData,
    vehicle: FaseripVehicleActorData,
  });
  CONFIG.Item.dataModels = Object.assign(CONFIG.Item.dataModels ?? {}, {
    power: FaseripPowerData,
    talent: FaseripTalentData,
    contact: FaseripContactData,
    equipment: FaseripEquipmentData,
    vehicle: FaseripVehicleItemData,
    headquarters: FaseripHeadquartersData,
  });
  console.log(`[FASERIP] Registered permissive TypeDataModels for ${SYSTEM_ID}.`);
}

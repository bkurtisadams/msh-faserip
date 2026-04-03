// actor.js v1.3.1 - 2026-04-03
// v1.3.1: Replace local RANK_ORDER with import from rules-reference.js
// v1.3.0: Fix karma display — max = R+I+P (computed), value = available lifetime karma (derived)
// v1.2.1: Remove dead disposition code (now handled in preCreateActor hook)
// v1.2.0: Remove daily karma system - karma now uses lifetime only
// v1.1.0: Initialize combatMods in prepareBaseData before Active Effects are applied

import { RANKS_ORDERED, normalizeRank } from "./rules/rules-reference.js";

export class FaseripActor extends Actor {
  prepareData() {
    super.prepareData();

    // Minimal preparation of data
    const system = this.system;

    // Vehicle actors have no abilities/health/karma — skip character prep
    if (this.type === "vehicle") return;
    
    // Initialize only if missing completely
    if (!system.abilities) {
      system.abilities = {
        fighting: { value: 10, rank: "Typical" },
        agility: { value: 10, rank: "Typical" },
        strength: { value: 10, rank: "Typical" },
        endurance: { value: 10, rank: "Typical" },
        reason: { value: 10, rank: "Typical" },
        intuition: { value: 10, rank: "Typical" },
        psyche: { value: 10, rank: "Typical" }
      };
    }

    if (!system.attributes) {
      system.attributes = {
        health: { value: 40, max: 40 },
        karma: { value: 30, max: 30 }
      };
    }

    // Calculate Health (sum of Fighting, Agility, Strength, Endurance) using BASE values
    // Ability shift boosts are applied as display-only on the actor sheet
    const healthMax = 
      parseInt(system.abilities.fighting.value || 0) +
      parseInt(system.abilities.agility.value || 0) +
      parseInt(system.abilities.strength.value || 0) +
      parseInt(system.abilities.endurance.value || 0);

    // Update the health max value
    system.attributes.health.max = healthMax;

    // Only initialize Health value if it's missing completely
    if (typeof system.attributes.health.value !== 'number') {
      system.attributes.health.value = healthMax;
    }

    // Calculate Karma (sum of Reason, Intuition, Psyche)
    const karmaMax = 
      parseInt(system.abilities.reason.value || 0) +
      parseInt(system.abilities.intuition.value || 0) +
      parseInt(system.abilities.psyche.value || 0);

    // Initialize karma sub-fields if missing
    if (!system.karma) {
      system.karma = {
        advancement: 0,
        advancementPurpose: "",
        advancementDetail: "",
        pool: 0,
        poolName: "",
        poolMembers: [],
        lifetime: 0,
        history: []
      };
    }

    // Calculate AVAILABLE karma (lifetime minus spent minus funds)
    const lifetimeSpent = this._calculateTotalSpentLifetime(system.karma.history);
    const advancementFund = system.karma.advancement || 0;
    const karmaPool = system.karma.pool || 0;
    const availableLifetimeKarma = Math.max(0, system.karma.lifetime - lifetimeSpent - advancementFund - karmaPool);

    // karma.max = R+I+P (base starting karma, for reference display)
    // karma.value is persisted in DB — managed by karma.js, combat-handler, rolls.js, etc.
    // Do NOT overwrite it here.
    system.attributes.karma.max = karmaMax;

    // Store available lifetime karma separately for other uses
    system.karma.availableLifetime = availableLifetimeKarma;

    // Set Resources value based on rank
    if (system.attributes.resources) {
      const resourcesRank = system.attributes.resources.rank || "Typical";
      const rankRanges = {
        "Shift-0": { min: 0, max: 1, default: 0 },
        "Feeble": { min: 2, max: 3, default: 2 },
        "Poor": { min: 4, max: 5, default: 4 },
        "Typical": { min: 6, max: 9, default: 6 },
        "Good": { min: 10, max: 19, default: 10 },
        "Excellent": { min: 20, max: 29, default: 20 },
        "Remarkable": { min: 30, max: 39, default: 30 },
        "Incredible": { min: 40, max: 49, default: 40 },
        "Amazing": { min: 50, max: 74, default: 50 },
        "Monstrous": { min: 75, max: 99, default: 75 },
        "Unearthly": { min: 100, max: 149, default: 100 },
        "Shift-X": { min: 150, max: 199, default: 150 },
        "Shift-Y": { min: 200, max: 499, default: 200 },
        "Shift-Z": { min: 500, max: 999, default: 500 },
        "Class 1000": { min: 1000, max: 2999, default: 1000 },
        "Class 3000": { min: 3000, max: 4999, default: 3000 },
        "Class 5000": { min: 5000, max: 9999, default: 5000 },
        "Beyond": { min: 10000, max: Infinity, default: 10000 }
      };

      if (!system.attributes.resources.value) {
        system.attributes.resources.value = rankRanges[resourcesRank]?.default || 6;
      }
    }

    // Initialize resistances if not present
    if (!system.resistances) {
      system.resistances = [];
    }
  }

  prepareBaseData() {
    super.prepareBaseData();
    
    // Initialize combatMods structure BEFORE Active Effects are applied
    // This ensures the target paths exist for AE changes
    // Only for character actors, not vehicles
    if (this.type !== "vehicle") {
      const system = this.system;
      if (!system.combatMods) {
        system.combatMods = {};
      }
      // Ensure all properties exist with defaults (AE changes require target path to exist)
      // IMPORTANT: Use = 0, not ?? 0. Active Effects with ADD mode accumulate on top of the
      // base value each data prep cycle. Using ?? preserves the previous cycle's result,
      // causing the effect to stack on itself every render.
      system.combatMods.attackShift = 0;
      system.combatMods.defenseShift = 0;
      system.combatMods.defenseShiftRanged = 0;
      system.combatMods.movementMult = 1;
      system.combatMods.selfPenaltyCS = 0;
      system.combatMods.canAct = true;
      system.combatMods.canMove = true;
      
      // Initialize nested abilityShifts
      if (!system.combatMods.abilityShifts) {
        system.combatMods.abilityShifts = {};
      }
      system.combatMods.abilityShifts.fighting = 0;
      system.combatMods.abilityShifts.agility = 0;
      system.combatMods.abilityShifts.strength = 0;
      system.combatMods.abilityShifts.endurance = 0;
      system.combatMods.abilityShifts.reason = 0;
      system.combatMods.abilityShifts.intuition = 0;
      system.combatMods.abilityShifts.psyche = 0;
    }
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    if (this.type === "vehicle") {
      const s = this.system ?? {};
      s.resources ??= {};
      const val = Number.isFinite(s.bodyHP)    ? Number(s.bodyHP)    : 0;
      const max = Number.isFinite(s.bodyHPMax) ? Number(s.bodyHPMax) : 0;
      s.resources.body = { value: val, max };
    }
  }

  async applyVehicleDamage(amount = 0) {
    if (this.type !== "vehicle") return this;
    const s = this.system ?? {};
    const next = Math.max(0, (Number(s.bodyHP) || 0) - Math.max(0, Number(amount) || 0));
    return this.update({
      "system.bodyHP": next,
      "system.resources.body.value": next
    });
  }

  // Getter for available lifetime karma (for bottom left display)
  get availableKarma() {
    const lifetimeSpent = this._calculateTotalSpentLifetime(this.system.karma?.history || []);
    const advancementFund = this.system.karma?.advancement || 0;
    return Math.max(0, (this.system.karma?.lifetime || 0) - lifetimeSpent - advancementFund);
  }

  get currentKarma() {
    if (!this.system.abilities) return 0;
    const reason = this.system.abilities.reason?.value || 0;
    const intuition = this.system.abilities.intuition?.value || 0;
    const psyche = this.system.abilities.psyche?.value || 0;
    return reason + intuition + psyche;
  }

  // Helper method to calculate total spent karma
  _calculateTotalSpentLifetime(history) {
    if (!history || !history.length) return 0;

    let totalSpent = 0;
    history.forEach(event => {
      if (event.amount < 0) {
        totalSpent += Math.abs(event.amount);
      }
    });
    return totalSpent;
  }

  // Movement data tables
  static MOVEMENT_DATA = {
    // Land/Water speed by rank: { areas/round, mph }
    landSpeed: {
      "Feeble": { areas: 1, mph: 15 },
      "Poor": { areas: 2, mph: 30 },
      "Typical": { areas: 3, mph: 45 },
      "Good": { areas: 4, mph: 60 },
      "Excellent": { areas: 5, mph: 75 },
      "Remarkable": { areas: 6, mph: 90 },
      "Incredible": { areas: 7, mph: 105 },
      "Amazing": { areas: 8, mph: 120 },
      "Monstrous": { areas: 9, mph: 135 },
      "Unearthly": { areas: 10, mph: 150 },
      "Shift-X": { areas: 12, mph: 180 },
      "Shift X": { areas: 12, mph: 180 },
      "Shift-Y": { areas: 14, mph: 210 },
      "Shift Y": { areas: 14, mph: 210 },
      "Shift-Z": { areas: 16, mph: 240 },
      "Shift Z": { areas: 16, mph: 240 },
      "Class 1000": { areas: 32, mph: 480 },
      "Class 3000": { areas: 50, mph: 750 },
      "Class 5000": { areas: 100, mph: 1500 }
    },
    // Air speed by rank: { areas/round, mph, groundAreas (for low altitude) }
    airSpeed: {
      "Feeble": { areas: 2, mph: 30, groundAreas: 1 },
      "Poor": { areas: 4, mph: 60, groundAreas: 2 },
      "Typical": { areas: 6, mph: 90, groundAreas: 3 },
      "Good": { areas: 8, mph: 120, groundAreas: 4 },
      "Excellent": { areas: 10, mph: 150, groundAreas: 5 },
      "Remarkable": { areas: 15, mph: 225, groundAreas: 6 },
      "Incredible": { areas: 20, mph: 300, groundAreas: 7 },
      "Amazing": { areas: 25, mph: 375, groundAreas: 8 },
      "Monstrous": { areas: 30, mph: 450, groundAreas: 9 },
      "Unearthly": { areas: 40, mph: 600, groundAreas: 10 },
      "Shift-X": { areas: 50, mph: 750, groundAreas: 12 },
      "Shift-Y": { areas: 100, mph: 1500, groundAreas: 14 },
      "Shift-Z": { areas: 200, mph: 3750, groundAreas: 16 }
    },
    // Leaping by Strength rank: feet and fractional areas/floors (1 area = 132', 1 floor = 15')
    leaping: {
      "Feeble": { upFeet: 2, acrossFeet: 2, downFeet: 3, upFloors: 0.1, acrossAreas: 0, downFloors: 0.2 },
      "Poor": { upFeet: 4, acrossFeet: 4, downFeet: 8, upFloors: 0.3, acrossAreas: 0, downFloors: 0.5 },
      "Typical": { upFeet: 6, acrossFeet: 6, downFeet: 9, upFloors: 0.4, acrossAreas: 0, downFloors: 0.6 },
      "Good": { upFeet: 10, acrossFeet: 10, downFeet: 15, upFloors: 0.7, acrossAreas: 0.1, downFloors: 1 },
      "Excellent": { upFeet: 20, acrossFeet: 20, downFeet: 30, upFloors: 1.3, acrossAreas: 0.2, downFloors: 2 },
      "Remarkable": { upFeet: 30, acrossFeet: 30, downFeet: 45, upFloors: 2, acrossAreas: 0.2, downFloors: 3 },
      "Incredible": { upFeet: 40, acrossFeet: 40, downFeet: 60, upFloors: 2.7, acrossAreas: 0.3, downFloors: 4 },
      "Amazing": { upFeet: 50, acrossFeet: 50, downFeet: 75, upFloors: 3.3, acrossAreas: 0.4, downFloors: 5 },
      "Monstrous": { upFeet: 75, acrossFeet: 75, downFeet: 105, upFloors: 5, acrossAreas: 0.6, downFloors: 7 },
      "Unearthly": { upFeet: 100, acrossFeet: 100, downFeet: 150, upFloors: 6.7, acrossAreas: 0.8, downFloors: 10 },
      "Shift-X": { upFeet: 150, acrossFeet: 150, downFeet: 225, upFloors: 10, acrossAreas: 1.1, downFloors: 15 },
      "Shift X": { upFeet: 150, acrossFeet: 150, downFeet: 225, upFloors: 10, acrossAreas: 1.1, downFloors: 15 },
      "Shift-Y": { upFeet: 200, acrossFeet: 200, downFeet: 300, upFloors: 13.3, acrossAreas: 1.5, downFloors: 20 },
      "Shift Y": { upFeet: 200, acrossFeet: 200, downFeet: 300, upFloors: 13.3, acrossAreas: 1.5, downFloors: 20 },
      "Shift-Z": { upFeet: 500, acrossFeet: 500, downFeet: 750, upFloors: 33.3, acrossAreas: 3.8, downFloors: 50 },
      "Shift Z": { upFeet: 500, acrossFeet: 500, downFeet: 750, upFloors: 33.3, acrossAreas: 3.8, downFloors: 50 },
      "Class 1000": { upFeet: 1000, acrossFeet: 1000, downFeet: 1500, upFloors: 66.7, acrossAreas: 7.6, downFloors: 100 },
      "Class 3000": { upFeet: 3000, acrossFeet: 3000, downFeet: 4500, upFloors: 200, acrossAreas: 22.7, downFloors: 300 },
      "Class 5000": { upFeet: 5000, acrossFeet: 5000, downFeet: 7500, upFloors: 333.3, acrossAreas: 37.9, downFloors: 500 }
    },
    // Rank numbers for exhaustion calculations
    rankNumbers: {
      "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10, "Excellent": 20,
      "Remarkable": 30, "Incredible": 40, "Amazing": 50, "Monstrous": 75,
      "Unearthly": 100, "Shift-X": 150, "Shift X": 150, "Shift-Y": 200, 
      "Shift Y": 200, "Shift-Z": 500, "Shift Z": 500,
      "Class 1000": 1000, "Class 3000": 3000, "Class 5000": 5000
    }
  };

  // Rank order for calculating "N ranks lower" cruising speed — uses canonical list
  static RANK_ORDER = RANKS_ORDERED;

  // Get rank N levels lower (for cruising speed calculation)
  static getRankLower(rank, levels = 2) {
    const n = normalizeRank(rank);
    const index = FaseripActor.RANK_ORDER.indexOf(n);
    if (index === -1) return "Feeble";
    const newIndex = Math.max(0, index - levels);
    return FaseripActor.RANK_ORDER[newIndex];
  }

  // Get cruising speed (2 ranks lower) for flight - no exhaustion checks
  static getCruisingFlight(flightAreas) {
    const flightInfo = FaseripActor.getFlightInfo(flightAreas);
    if (!flightInfo) return null;
    const cruisingRank = FaseripActor.getRankLower(flightInfo.rank, 2);
    const cruisingData = FaseripActor.MOVEMENT_DATA.airSpeed[cruisingRank];
    return cruisingData ? { rank: cruisingRank, ...cruisingData } : null;
  }

  // Get cruising speed (2 ranks lower) for land speed - no exhaustion checks
  static getCruisingLand(landAreas) {
    let currentRank = "Typical";
    for (const [rank, data] of Object.entries(FaseripActor.MOVEMENT_DATA.landSpeed)) {
      if (data.areas === landAreas) {
        currentRank = rank;
        break;
      }
    }
    const cruisingRank = FaseripActor.getRankLower(currentRank, 2);
    const cruisingData = FaseripActor.MOVEMENT_DATA.landSpeed[cruisingRank];
    return cruisingData ? { rank: cruisingRank, ...cruisingData } : null;
  }
  
  // Lookup flight rank and ground speed from air areas/turn
  static getFlightInfo(airAreas) {
    for (const [rank, data] of Object.entries(FaseripActor.MOVEMENT_DATA.airSpeed)) {
      if (data.areas === airAreas) {
        return { rank, ...data };
      }
    }
    // If no exact match, find closest
    let closest = { rank: "Typical", areas: 6, mph: 90, groundAreas: 3 };
    for (const [rank, data] of Object.entries(FaseripActor.MOVEMENT_DATA.airSpeed)) {
      if (data.areas <= airAreas && data.areas > closest.areas) {
        closest = { rank, ...data };
      }
    }
    return closest;
  }

  // Calculate suggested movement (areas/turn) based on Endurance rank
  get suggestedMovement() {
    const enduranceRank = this.system.abilities?.endurance?.rank || "Typical";
    const oneAreaRanks = ["Feeble"];
    const twoAreaRanks = ["Poor", "Typical", "Good", "Excellent"];
    if (oneAreaRanks.includes(enduranceRank)) return 1;
    if (twoAreaRanks.includes(enduranceRank)) return 2;
    return 3;
  }

  // Get leaping data based on Strength rank
  get leapingData() {
    const strengthRank = this.system.abilities?.strength?.rank || "Typical";
    return FaseripActor.MOVEMENT_DATA.leaping[strengthRank] || { upFeet: 6, acrossFeet: 6, downFeet: 9, upFloors: 0.4, acrossAreas: 0, downFloors: 0.6 };
  }

  // Get exhaustion threshold (turns before first FEAT check)
  get exhaustionThreshold() {
    const enduranceRank = this.system.abilities?.endurance?.rank || "Typical";
    return FaseripActor.MOVEMENT_DATA.rankNumbers[enduranceRank] || 6;
  }

  // Get comprehensive movement info for chat card
  get movementInfo() {
    const endRank = this.system.abilities?.endurance?.rank || "Typical";
    const strRank = this.system.abilities?.strength?.rank || "Typical";
    const movement = this.system.movement || {};
    
    const runAreas = movement.run || this.suggestedMovement;
    const swimAreas = movement.swim || 1;
    const flyAreas = movement.fly || 0;
    
    return {
      run: { areas: runAreas, mph: runAreas * 15 },
      swim: { areas: swimAreas, mph: swimAreas * 15 },
      fly: { areas: flyAreas, mph: flyAreas * 15 },
      leap: this.leapingData,
      exhaustion: {
        threshold: this.exhaustionThreshold,
        enduranceRank: endRank
      },
      acceleration: this.suggestedMovement,
      strengthRank: strRank
    };
  }
}
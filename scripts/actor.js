// actor.js v1.8.0 - 2026-09-04
// v1.8.0: MOVEMENT_DATA (land/air/leaping/rankNumbers) derived from the
//         faserip-rules movement kernel instead of hand-copied tables.
// actor.js v1.7.0 - 2026-08-01
// v1.7.0: Resources use canonical standard rank numbers; preserve Shift-0
//         value 0 and remove the conflicting local rank-range table.
// v1.6.0: Fix pool double-subtract in availableLifetime (pool contributions
//         are negative history entries, already inside spent). Delegate all
//         spent math to computeKarmaTotals; remove _calculateTotalSpentLifetime
//         and dead currentKarma getter. Fix getFlightInfo closest-match
//         overshoot below Typical. Normalize ranks in movement getters.
// actor.js v1.5.0 - 2026-07-23
// actor.js v1.4.0 - 2026-05-15
// v1.4.0: Karma reconciliation moved into prepareDerivedData. The displayed
//         system.attributes.karma.value is now derived from karma.history
//         every prep (formula: max(0, sumPositive - sumAbsNegative -
//         advancement)). karma.lifetime is also re-synced to sumPositive.
//         Empty-history actors are skipped to preserve the chargen baseline
//         on legacy data; chargen now seeds a starting-karma history entry
//         so new actors derive correctly from creation. Spend code paths
//         no longer need to write attributes.karma.value alongside
//         karma.history — history is the only source of truth.
// actor.js v1.3.1 - 2026-04-03
// v1.3.1: Replace local RANK_ORDER with import from rules-reference.js
// v1.3.0: Fix karma display — max = R+I+P (computed), value = available lifetime karma (derived)
// v1.2.1: Remove dead disposition code (now handled in preCreateActor hook)
// v1.2.0: Remove daily karma system - karma now uses lifetime only
// v1.1.0: Initialize combatMods in prepareBaseData before Active Effects are applied

import { RANKS_ORDERED, normalizeRank, rankValueForStorage } from "./rules/rules-reference.js";
import { RANKS as KERNEL_RANKS } from "./lib/faserip-rules/faserip-kernel.js";
import { LONG_DISTANCE, LEAP_TABLE, AREA_YARDS, FLOOR_FEET } from "./lib/faserip-rules/faserip-movement.js";
import { computeKarmaTotals } from "./karma-rules.js";

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

    // Calculate AVAILABLE karma. Pool contributions are negative history
    // entries (karma.js), so they are already inside spent — do not
    // subtract karma.pool again.
    const { spent: lifetimeSpent } = computeKarmaTotals(system.karma.history);
    const advancementFund = system.karma.advancement || 0;
    const availableLifetimeKarma = Math.max(0, system.karma.lifetime - lifetimeSpent - advancementFund);

    // karma.max = R+I+P (base starting karma, for reference display)
    // karma.value is persisted in DB — managed by karma.js, combat-handler, rolls.js, etc.
    // Do NOT overwrite it here.
    system.attributes.karma.max = karmaMax;

    // Store available lifetime karma separately for other uses
    system.karma.availableLifetime = availableLifetimeKarma;

    // Resources rank and rank number are independently editable, but missing
    // values initialize from the canonical Standard Rank Number table. A
    // legitimate Shift-0 value of 0 must never be treated as missing.
    if (system.attributes.resources) {
      const resourcesRank = normalizeRank(system.attributes.resources.rank || "Typical");
      system.attributes.resources.rank = resourcesRank;

      const rawResourceValue = system.attributes.resources.value;
      const resourceValueMissing = rawResourceValue === null ||
        rawResourceValue === undefined || rawResourceValue === "" ||
        !Number.isFinite(Number(rawResourceValue));

      if (resourceValueMissing) {
        system.attributes.resources.value = rankValueForStorage(resourcesRank);
      }

      // Resource Points derived values (for template display)
      const rpTable = {
        "Shift-0": { weekly: 0, max: 0 },
        "Feeble": { weekly: 2, max: 10 }, "Poor": { weekly: 4, max: 20 },
        "Typical": { weekly: 6, max: 50 }, "Good": { weekly: 10, max: 100 },
        "Excellent": { weekly: 20, max: 500 }, "Remarkable": { weekly: 30, max: 1000 },
        "Incredible": { weekly: 40, max: 5000 }, "Amazing": { weekly: 50, max: Infinity },
        "Monstrous": { weekly: 75, max: Infinity }, "Unearthly": { weekly: 100, max: Infinity },
        "Shift-X": { weekly: 150, max: Infinity }, "Shift-Y": { weekly: 200, max: Infinity },
        "Shift-Z": { weekly: 500, max: Infinity }, "Class 1000": { weekly: 1000, max: Infinity },
        "Class 3000": { weekly: 3000, max: Infinity }, "Class 5000": { weekly: 5000, max: Infinity },
        "Beyond": { weekly: 10000, max: Infinity }
      };
      const rpData = rpTable[resourcesRank] || { weekly: 6, max: 50 };
      system.attributes.resources.weeklyRate = rpData.weekly;
      system.attributes.resources.maxPoints = rpData.max;
      // Initialize points if missing
      if (system.attributes.resources.points == null) {
        system.attributes.resources.points = 0;
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

    // Karma reconciliation: history is the source of truth. Recompute the
    // displayed current-karma value on every prep so spend-paths that only
    // write history (stunts, equipment use, action dialogs, vehicle control,
    // dying stabilize, etc.) keep the header in sync without each site
    // having to remember to write both fields. Empty-history actors are
    // skipped to preserve the chargen baseline on legacy actors that
    // pre-date the chargen seed entry.
    const k = this.system?.karma;
    const attrK = this.system?.attributes?.karma;
    const history = k?.history;
    if (attrK && Array.isArray(history) && history.length > 0) {
      const { earned, spent, value } = computeKarmaTotals(history, { advancement: k?.advancement });
      // Belt-and-braces for unseeded ledgers: a history holding only
      // zero-amount log entries (Resource/Popularity FEATs) carries no
      // baseline, so reconciling from it would zero a legacy actor's karma.
      if (earned > 0 || spent > 0) {
        attrK.value = value;
        k.lifetime  = earned;
      }
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
    const k = this.system.karma;
    const spent = computeKarmaTotals(k?.history).spent;
    return Math.max(0, (k?.lifetime || 0) - spent - (k?.advancement || 0));
  }

  // Movement data tables — derived from the faserip-rules kernel (Long
  // Distance Movement and Leaping tables). Hyphen and space rank names both
  // resolve. 1 area = 132', 1 floor = 15'.
  static MOVEMENT_DATA = (() => {
    const r1 = (n) => Math.round(n * 10) / 10;
    const names = (key) => {
      const n = normalizeRank(KERNEL_RANKS.find(r => r.key === key).name);
      return n.includes('-') ? [n, n.replace('-', ' ')] : [n];
    };
    const landSpeed = {}, airSpeed = {}, leaping = {}, rankNumbers = {};
    for (const r of KERNEL_RANKS) {
      const ld = LONG_DISTANCE[r.key];
      const lp = LEAP_TABLE[r.key];
      for (const n of names(r.key)) {
        if (ld) landSpeed[n] = { areas: ld.land, mph: ld.landMph };
        if (ld && typeof ld.air === 'number' && !n.includes(' ')) airSpeed[n] = { areas: ld.air, mph: ld.airMph, groundAreas: ld.land };
        if (lp) leaping[n] = {
          upFeet: lp.up, acrossFeet: lp.across, downFeet: lp.down,
          upFloors: r1(lp.up / FLOOR_FEET), acrossAreas: r1(lp.across / (AREA_YARDS * 3)), downFloors: r1(lp.down / FLOOR_FEET)
        };
        if (r.key !== 'SH0' && Number.isFinite(r.standard)) rankNumbers[n] = r.standard;
      }
    }
    return { landSpeed, airSpeed, leaping, rankNumbers };
  })();

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
    // If no exact match, use the highest entry not exceeding airAreas
    let closest = null;
    for (const [rank, data] of Object.entries(FaseripActor.MOVEMENT_DATA.airSpeed)) {
      if (data.areas <= airAreas && (!closest || data.areas > closest.areas)) {
        closest = { rank, ...data };
      }
    }
    return closest ?? { rank: "Feeble", ...FaseripActor.MOVEMENT_DATA.airSpeed["Feeble"] };
  }

  // Calculate suggested movement (areas/turn) based on Endurance rank
  get suggestedMovement() {
    const enduranceRank = normalizeRank(this.system.abilities?.endurance?.rank || "Typical");
    const oneAreaRanks = ["Feeble"];
    const twoAreaRanks = ["Poor", "Typical", "Good", "Excellent"];
    if (oneAreaRanks.includes(enduranceRank)) return 1;
    if (twoAreaRanks.includes(enduranceRank)) return 2;
    return 3;
  }

  // Get leaping data based on Strength rank
  get leapingData() {
    const strengthRank = normalizeRank(this.system.abilities?.strength?.rank || "Typical");
    return FaseripActor.MOVEMENT_DATA.leaping[strengthRank] || { upFeet: 6, acrossFeet: 6, downFeet: 9, upFloors: 0.4, acrossAreas: 0, downFloors: 0.6 };
  }

  // Get exhaustion threshold (turns before first FEAT check)
  get exhaustionThreshold() {
    const enduranceRank = normalizeRank(this.system.abilities?.endurance?.rank || "Typical");
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
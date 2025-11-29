// In actor.js, modify the prepareData method
export class FaseripActor extends Actor {
  prepareData() {
    super.prepareData();

    // Minimal preparation of data
    const system = this.system;
    
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

    // Calculate Health (sum of Fighting, Agility, Strength, Endurance)
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

    // Update the karma max value
    system.attributes.karma.max = karmaMax;

    // Only initialize Karma value if it's missing completely
    if (typeof system.attributes.karma.value !== 'number') {
      system.attributes.karma.value = karmaMax;
    }

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
        history: [],
        dailyKarmaUsed: 0,
        dailyKarmaMax: 0
      };
    }

    // Set dailyKarmaMax based on R+I+P
    system.karma.dailyKarmaMax = karmaMax;

    // Calculate AVAILABLE karma (for bottom left display) - this is lifetime karma
    const lifetimeSpent = this._calculateTotalSpentLifetime(system.karma.history);
    const advancementFund = system.karma.advancement || 0;
    const karmaPool = system.karma.pool || 0;
    const availableLifetimeKarma = Math.max(0, system.karma.lifetime - lifetimeSpent - advancementFund - karmaPool);

    // Calculate karma for the Health/Karma display (next to Health)
    const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
    let displayKarmaValue = 0;

    if (dailyKarmaEnabled) {
      const dailyRemaining = Math.max(0, system.karma.dailyKarmaMax - (system.karma.dailyKarmaUsed || 0));
      displayKarmaValue = dailyRemaining;
      // Remove the if statement that switches to lifetime karma
    } else {
      displayKarmaValue = availableLifetimeKarma;
    }

    // Set the attributes.karma.value to the display karma
    system.attributes.karma.value = displayKarmaValue;

    // Store available lifetime karma separately for bottom display
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

  // ADD THIS NEW METHOD - This will set proper default dispositions
  // In actor.js - Update the prepareBaseData method
  prepareBaseData() {
    super.prepareBaseData();
    
    // ALWAYS set the correct disposition based on actor type (remove the undefined check)
    let defaultDisposition;
    switch (this.type) {
      case "hero":
        defaultDisposition = CONST.TOKEN_DISPOSITIONS.FRIENDLY; // 1
        break;
      case "villain":
        defaultDisposition = CONST.TOKEN_DISPOSITIONS.HOSTILE; // -1
        break;
      case "npc":
      case "vehicle":
        defaultDisposition = CONST.TOKEN_DISPOSITIONS.NEUTRAL; // 0
        // Optional safety: set token bar mapping if not present (helps existing worlds)
        if (!this.prototypeToken?.bar1?.attribute) {
          this.prototypeToken.updateSource({ bar1: { attribute: "system.resources.body" } });
        }
        break;

      default:
        defaultDisposition = CONST.TOKEN_DISPOSITIONS.NEUTRAL; // 0
        break;
    }
    
    // Force set the disposition if it's wrong
    /* if (this.prototypeToken.disposition !== defaultDisposition) {
      console.log(`FASERIP: Correcting disposition for ${this.type} "${this.name}" from ${this.prototypeToken.disposition} to ${defaultDisposition}`);
      this.prototypeToken.updateSource({ disposition: defaultDisposition });
    } */
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
    const karmaPool = this.system.karma?.pool || 0;
    return Math.max(0, (this.system.karma?.lifetime || 0) - lifetimeSpent - advancementFund - karmaPool);
  }

  get currentKarma() {
    const reason = this.system.abilities.reason?.value || 0;
    const intuition = this.system.abilities.intuition?.value || 0;
    const psyche = this.system.abilities.psyche?.value || 0;
    return reason + intuition + psyche;
  }

  // Helper method to calculate total spent karma, excluding "Daily Roll" entries
  _calculateTotalSpentLifetime(history) {
    if (!history || !history.length) return 0;

    let totalSpent = 0;
    history.forEach(event => {
      // Only count negative amounts (spending), and ignore daily roll entries completely
      if (event.amount < 0 && event.type !== "Daily Roll") {
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
    // Leaping by Strength rank: { horizontal areas, vertical floors up, safe fall floors }
    leaping: {
      "Feeble": { horizontal: 0, vertical: 0, safeFall: 1 },
      "Poor": { horizontal: 0, vertical: 0, safeFall: 1 },
      "Typical": { horizontal: 0, vertical: 1, safeFall: 1 },
      "Good": { horizontal: 1, vertical: 1, safeFall: 1 },
      "Excellent": { horizontal: 1, vertical: 1, safeFall: 2 },
      "Remarkable": { horizontal: 2, vertical: 1, safeFall: 2 },
      "Incredible": { horizontal: 3, vertical: 2, safeFall: 3 },
      "Amazing": { horizontal: 4, vertical: 2, safeFall: 3 },
      "Monstrous": { horizontal: 5, vertical: 3, safeFall: 5 },
      "Unearthly": { horizontal: 6, vertical: 3, safeFall: 6 },
      "Shift-X": { horizontal: 8, vertical: 4, safeFall: 8 },
      "Shift X": { horizontal: 8, vertical: 4, safeFall: 8 },
      "Shift-Y": { horizontal: 10, vertical: 5, safeFall: 10 },
      "Shift Y": { horizontal: 10, vertical: 5, safeFall: 10 },
      "Shift-Z": { horizontal: 15, vertical: 8, safeFall: 15 },
      "Shift Z": { horizontal: 15, vertical: 8, safeFall: 15 },
      "Class 1000": { horizontal: 30, vertical: 15, safeFall: 30 },
      "Class 3000": { horizontal: 50, vertical: 25, safeFall: 50 },
      "Class 5000": { horizontal: 100, vertical: 50, safeFall: 100 }
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
    return FaseripActor.MOVEMENT_DATA.leaping[strengthRank] || { horizontal: 0, vertical: 1, safeFall: 1 };
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
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
      if (dailyRemaining <= 0) {
        displayKarmaValue = availableLifetimeKarma;
      }
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
      default:
        defaultDisposition = CONST.TOKEN_DISPOSITIONS.NEUTRAL; // 0
        break;
    }
    
    // Force set the disposition if it's wrong
    if (this.prototypeToken.disposition !== defaultDisposition) {
      console.log(`FASERIP: Correcting disposition for ${this.type} "${this.name}" from ${this.prototypeToken.disposition} to ${defaultDisposition}`);
      this.prototypeToken.updateSource({ disposition: defaultDisposition });
    }
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
      if (event.amount < 0) {
        totalSpent += Math.abs(event.amount);
      }
    });
    return totalSpent;
  }
}
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
    
    // Set health value to max if not already set or if current exceeds max
    if (!system.attributes.health.value || system.attributes.health.value > healthMax) {
      system.attributes.health.value = healthMax;
    }
    
    // Calculate Karma (sum of Reason, Intuition, Psyche)
    const karmaMax = 
      parseInt(system.abilities.reason.value || 0) +
      parseInt(system.abilities.intuition.value || 0) +
      parseInt(system.abilities.psyche.value || 0);
    
    // Update the karma max value
    system.attributes.karma.max = karmaMax;
    
    // Set karma value to max if not already set or if current exceeds max
    if (!system.attributes.karma.value || system.attributes.karma.value > karmaMax) {
      system.attributes.karma.value = karmaMax;
    }

      // Set Resources value based on rank
  if (system.attributes.resources) {
    const resourcesRank = system.attributes.resources.rank || "Typical";
    // Map rank names to values
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
    
    // If value is not set, use the default for the current rank
    if (!system.attributes.resources.value) {
      system.attributes.resources.value = rankRanges[resourcesRank]?.default || 6;
    }
  }

  // initialize Resistances
  if (!system.resistances) {
    system.resistances = [];
  }

  }
}
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
  }
}
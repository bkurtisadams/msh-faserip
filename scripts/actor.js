export class FaseripActor extends Actor {
  prepareData() {
    super.prepareData();

    // Get the actor data
    const system = this.system;

    // Initialize abilities if not present
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

    // Initialize attributes if not present
    if (!system.attributes) {
      system.attributes = {
        health: { value: 40, max: 40 },
        karma: { value: 30, max: 30 },
        resources: { rank: "Typical" },
        popularity: { value: 0, max: 100 }
      };
    }

    // Initialize other required properties
    if (!system.karma) {
      system.karma = {
        advancement: 0,
        pool: 30,
        lifetime: 0
      };
    }

    if (!system.movement) {
      system.movement = {
        run: 1,
        swim: 1,
        fly: 0,
        teleport: 0
      };
    }

    // Calculate Health (F + A + S + E)
    const fVal = parseInt(system.abilities.fighting?.value) || 0;
    const aVal = parseInt(system.abilities.agility?.value) || 0;
    const sVal = parseInt(system.abilities.strength?.value) || 0;
    const eVal = parseInt(system.abilities.endurance?.value) || 0;
    system.attributes.health.max = fVal + aVal + sVal + eVal;

    // Calculate Karma (R + I + P)
    const rVal = parseInt(system.abilities.reason?.value) || 0;
    const iVal = parseInt(system.abilities.intuition?.value) || 0;
    const pVal = parseInt(system.abilities.psyche?.value) || 0;
    system.attributes.karma.max = rVal + iVal + pVal;
  }
}
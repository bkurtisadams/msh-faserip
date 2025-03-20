// Add this at the top of actor.js
export class FaseripActorModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      identity: new fields.StringField({initial: ""}),
      identityType: new fields.StringField({initial: "secret", choices: ["secret", "public"]}),
      player: new fields.StringField(),
      group: new fields.StringField(),
      base: new fields.StringField(),
      age: new fields.StringField(),
      origin: new fields.StringField(),
      description: new fields.StringField(),
      abilities: new fields.SchemaField({
        fighting: new fields.SchemaField({
          value: new fields.NumberField({initial: 10, integer: true}),
          initialRoll: new fields.StringField(),
          initialRank: new fields.StringField(),
          rank: new fields.StringField({initial: "Good"})
        }),
        agility: new fields.SchemaField({
          value: new fields.NumberField({initial: 10, integer: true}),
          initialRoll: new fields.StringField(),
          initialRank: new fields.StringField(),
          rank: new fields.StringField({initial: "Good"})
        }),
        strength: new fields.SchemaField({
          value: new fields.NumberField({initial: 10, integer: true}),
          initialRoll: new fields.StringField(),
          initialRank: new fields.StringField(),
          rank: new fields.StringField({initial: "Good"})
        }),
        endurance: new fields.SchemaField({
          value: new fields.NumberField({initial: 10, integer: true}),
          initialRoll: new fields.StringField(),
          initialRank: new fields.StringField(),
          rank: new fields.StringField({initial: "Good"})
        }),
        reason: new fields.SchemaField({
          value: new fields.NumberField({initial: 10, integer: true}),
          initialRoll: new fields.StringField(),
          initialRank: new fields.StringField(),
          rank: new fields.StringField({initial: "Good"})
        }),
        intuition: new fields.SchemaField({
          value: new fields.NumberField({initial: 10, integer: true}),
          initialRoll: new fields.StringField(),
          initialRank: new fields.StringField(),
          rank: new fields.StringField({initial: "Good"})
        }),
        psyche: new fields.SchemaField({
          value: new fields.NumberField({initial: 10, integer: true}),
          initialRoll: new fields.StringField(),
          initialRank: new fields.StringField(),
          rank: new fields.StringField({initial: "Good"})
        })
      }),
      attributes: new fields.SchemaField({
        health: new fields.SchemaField({
          value: new fields.NumberField({initial: 40, integer: true}),
          max: new fields.NumberField({initial: 40, integer: true})
        }),
        karma: new fields.SchemaField({
          value: new fields.NumberField({initial: 30, integer: true}),
          max: new fields.NumberField({initial: 30, integer: true})
        }),
        resources: new fields.SchemaField({
          rank: new fields.StringField({initial: "Typical"}),
          value: new fields.NumberField({initial: 6, integer: true})
        }),
        popularity: new fields.SchemaField({
          value: new fields.NumberField({initial: 10, integer: true}),
          max: new fields.NumberField({initial: 100, integer: true})
        })
      }),
      movement: new fields.SchemaField({
        run: new fields.NumberField({initial: 1, integer: true}),
        swim: new fields.NumberField({initial: 1, integer: true}),
        fly: new fields.NumberField({initial: 0, integer: true}),
        teleport: new fields.NumberField({initial: 0, integer: true})
      }),
      karma: new fields.SchemaField({
        advancement: new fields.NumberField({initial: 0, integer: true}),
        pool: new fields.NumberField({initial: 30, integer: true}),
        lifetime: new fields.NumberField({initial: 0, integer: true}),
        history: new fields.ArrayField(new fields.ObjectField())
      }),
      resistances: new fields.ArrayField(new fields.SchemaField({
        type: new fields.StringField({choices: ["physical", "energy", "mental", "magical"]}),
        rank: new fields.StringField(),
        value: new fields.NumberField({integer: true})
      }))
    };
  }
}

export class FaseripActor extends Actor {
  prepareData() {
    super.prepareData();
  
    // Get the actor data
    const system = this.system;
  
    // Initialize abilities with complete structure
    if (!system.abilities) {
      system.abilities = {};
    }
    
    // Ensure each ability has all required properties
    const abilityKeys = ['fighting', 'agility', 'strength', 'endurance', 'reason', 'intuition', 'psyche'];
    abilityKeys.forEach(key => {
      if (!system.abilities[key]) {
        system.abilities[key] = {};
      }
      
      // Set default values if missing - use undefined checks instead of falsy checks
      if (system.abilities[key].value === undefined) system.abilities[key].value = 10;
      if (system.abilities[key].rank === undefined) system.abilities[key].rank = "Typical";
      if (system.abilities[key].initialRoll === undefined) system.abilities[key].initialRoll = "";
      if (system.abilities[key].initialRank === undefined) system.abilities[key].initialRank = "";
    });
  
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
  
    // Calculate derived stats - only update max values, not current values
    if (system.attributes && system.attributes.health) {
      const fVal = parseInt(system.abilities.fighting?.value) || 0;
      const aVal = parseInt(system.abilities.agility?.value) || 0;
      const sVal = parseInt(system.abilities.strength?.value) || 0;
      const eVal = parseInt(system.abilities.endurance?.value) || 0;
      system.attributes.health.max = fVal + aVal + sVal + eVal;
    }
  
    if (system.attributes && system.attributes.karma) {
      const rVal = parseInt(system.abilities.reason?.value) || 0;
      const iVal = parseInt(system.abilities.intuition?.value) || 0;
      const pVal = parseInt(system.abilities.psyche?.value) || 0;
      system.attributes.karma.max = rVal + iVal + pVal;
    }
  }
}
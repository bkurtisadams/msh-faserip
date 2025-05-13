// In init.js
import { FaseripActor } from './actor.js';
import { FaseripItem } from './item.js';
import { FaseripActorSheet } from './actorSheet.js';
import { FaseripItemSheet } from './itemSheet.js';
import { FaseripEquipmentSheet } from './equipment.js';
import { FaseripRolls } from './rolls.js';
import { rollUniversalTable } from './universalTable.js';  // Import your function
import { openUniversalTableDialog } from './rolls.js';
import { rollUniversalAction } from './rolls.js';
import { FaseripInitiative } from './faserip-initiative.js';
import { CombatHandler } from './combat-handler.js';

Hooks.once("init", async () => {
  console.log("Marvel Super Heroes (FASERIP) system initializing...");

  CONFIG.FASERIP = CONFIG.FASERIP || {};
  CONFIG.FASERIP.rankValues = {
    "Shift 0": 0, "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10, "Excellent": 20,
    "Remarkable": 30, "Incredible": 40, "Amazing": 50, "Monstrous": 75,
    "Unearthly": 100, "Shift X": 150, "Shift Y": 200, "Shift Z": 500,
    "Class 1000": 1000, "Class 3000": 3000, "Class 5000": 5000, "Beyond": 9999
  };

  await loadTemplates([
    "systems/msh-faserip/templates/universal-table.html",
    "systems/msh-faserip/templates/universal-rank-table.hbs"
  ]);

  // Create game.msh namespace
  game.msh = game.msh || {};
  game.msh.rollUniversalAction = rollUniversalAction;
  // Add the rollUniversalTable function to the namespace
  game.msh.rollUniversalTable = rollUniversalTable;

   // Add the open dialog function safely inside the hook
   game.msh.openUniversalTableDialog = openUniversalTableDialog;
  
  // Add the roll functions to the namespace
  game.msh.rollPower = FaseripRolls.rollPower;
  game.msh.rollTalent = FaseripRolls.rollTalent;
  game.msh.rollContact = FaseripRolls.rollContact;
  game.msh.rollEquipment = FaseripRolls.rollEquipment;

  // Add the CombatHandler to the namespace
  game.msh.CombatHandler = CombatHandler;

  // Initialize faserip initiative
  FaseripInitiative.init();

  game.msh.rollFaseripInitiative = () => {
    if (!game.combat) {
      ui.notifications.warn("No active combat encounter");
      return;
    }
    
    FaseripInitiative.rollSideInitiative(game.combat);
  };
  
  // Add the vehicle control roll function
  game.msh.rollVehicleControl = (actor, vehicle) => {
    if (actor && actor.sheet && actor.sheet._rollVehicleControl) {
      return actor.sheet._rollVehicleControl(vehicle);
    } else {
      ui.notifications.warn("Could not access vehicle control roll function");
    }
  };
  
  // Updated rollItemMacro function
  // Define the rollItemMacro function (in your init.js)
  game.msh.rollItemMacro = async function(actorId, itemId) {
    const actor = game.actors.get(actorId);
    if (!actor) {
      return ui.notifications.warn(`Actor ${actorId} not found`);
    }
  
    const item = actor.items.get(itemId);
    if (!item) {
      return ui.notifications.warn(`Item ${itemId} not found`);
    }
  
    switch (item.type) {
      case "power": return game.msh.rollPower(actor, item);
      case "talent": return game.msh.rollTalent(actor, item);
      case "contact": return game.msh.rollContact(actor, item);
      case "equipment": return game.msh.rollEquipment(actor, item);
      case "vehicle": return actor.sheet._rollVehicleControl(item); // vehicle added
      default:
        return ui.notifications.warn(`Cannot roll item of type: ${item.type}`);
    }
  };
      
  // Register Handlebars helpers
  Handlebars.registerHelper('getFlag', function(object, scope, flag) {
    return object.getFlag(scope, flag);
  });

  Handlebars.registerHelper('abbreviateRank', function(rank) {
    const rankMap = {
      "Shift-0": "Sh-0",
      "Feeble": "Fe",
      "Poor": "Pr",
      "Typical": "Ty",
      "Good": "Gd",
      "Excellent": "Ex",
      "Remarkable": "Rm",
      "Incredible": "In",
      "Amazing": "Am",
      "Monstrous": "Mn",
      "Unearthly": "Un",
      "Shift-X": "Sh-X",
      "Shift-Y": "Sh-Y",
      "Shift-Z": "Sh-Z",
      "Class 1000": "1000",
      "Class 3000": "3000",
      "Class 5000": "5000",
      "Beyond": "B"
    };
    return rankMap[rank] || rank;
  });

  // Register document classes
  CONFIG.Actor.documentClass = FaseripActor;
  CONFIG.Item.documentClass = FaseripItem;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Items.unregisterSheet("core", ItemSheet);

  Actors.registerSheet("msh-faserip", FaseripActorSheet, { makeDefault: true });
  
  // Make sure to register vehicle items with FaseripItemSheet
  Items.registerSheet("msh-faserip", FaseripItemSheet, { 
    types: ["power", "talent", "contact", "headquarters", "vehicle"],
    makeDefault: true 
  });
  
  Items.registerSheet("msh-faserip", FaseripEquipmentSheet, { 
    types: ["equipment"], 
    makeDefault: true 
  });

  // end of hooks.once
});

// Add the hotbarDrop hook at module level (like in the older file)
Hooks.on('hotbarDrop', (bar, data, slot) => {
  console.log("📦 hotbarDrop received:", data);
  
  if (data.type === "Item" && data.actorId) {
    createFaseripItemMacro(data, slot);
    return false; // Prevent default handling
  }
  else if (data.type === "UniversalTable" && data.actorId) {
    createUniversalTableMacro(data, slot);
    return false; // Prevent default handling
  }
  return true; // Allow default handling for other drop types
});

// Define the function to create a macro
async function createFaseripItemMacro(data, slot) {
  // Try to get the item from UUID first
  let item;
  if (data.uuid) {
    try {
      item = await fromUuid(data.uuid);
    } catch (error) {
      console.error("Error retrieving item from UUID:", error);
    }
  }
  
  // If UUID approach fails, fall back to the old method
  if (!item) {
    const actor = game.actors.get(data.actorId);
    if (!actor) return ui.notifications.warn("Actor not found");
    
    item = actor.items.get(data.itemId);
    if (!item) return ui.notifications.warn("Item not found");
  }
  
  // Get the parent actor (works for both regular and token actors)
  const parent = item.parent;
  console.log(`Creating macro for ${item.name} (${parent.name})`);
  
  // Create a command that uses UUID for token actors, or falls back to actorId/itemId for compatibility
  const command = `// Try UUID method first
  const item = await fromUuid("${data.uuid}");
  if (item) {
    // Determine which roll function to use based on item type
    switch (item.type) {
      case "power": game.msh.rollPower(item.parent, item); break;
      case "talent": game.msh.rollTalent(item.parent, item); break;
      case "contact": game.msh.rollContact(item.parent, item); break;
      case "equipment": game.msh.rollEquipment(item.parent, item); break;
      case "vehicle": game.msh.rollVehicleControl(item.parent, item); break;
      default: ui.notifications.warn(\`Cannot roll item of type: \${item.type}\`);
    }
  } else {
    // Fall back to original method
    game.msh.rollItemMacro("${data.actorId}", "${data.itemId}");
  }`;
  
  // Create the macro
  const macroName = `${item.name} (${parent.name})`;
  let macro = game.macros.find(m => m.name === macroName && m.command === command);
  
  if (!macro) {
    macro = await Macro.create({
      name: macroName,
      type: "script",
      img: item.img || "icons/svg/dice-target.svg",
      command: command,
      flags: {"faserip.itemMacro": true}
    });
  }
  
  // Assign to hotbar slot
  game.user.assignHotbarMacro(macro, slot);
  return true;
}

// Define the function to create a Universal Table macro
async function createUniversalTableMacro(data, slot) {
  // Get reference to our Actor
  const actor = game.actors.get(data.actorId);
  if (!actor) return ui.notifications.warn("Actor not found");
  
  console.log(`Creating Universal Table macro for ${actor.name}`);
  
  // Create a command string that calls the openUniversalTableDialog function
  const command = `game.msh.openUniversalTableDialog(game.actors.get("${data.actorId}"));`;
  
  // Create the macro
  const macroName = `Universal Table (${actor.name})`;
  let macro = game.macros.find(m => m.name === macroName && m.command === command);
  
  if (!macro) {
    macro = await Macro.create({
      name: macroName,
      type: "script",
      img: data.data?.img || "icons/svg/d20-grey.svg", 
      command: command,
      flags: {"faserip.universalTableMacro": true}
    });
  }
  
  // Assign to hotbar slot
  game.user.assignHotbarMacro(macro, slot);
  return true;
}
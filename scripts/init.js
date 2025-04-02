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

Hooks.once("init", async () => {
  console.log("Marvel Super Heroes (FASERIP) system initializing...");

  await loadTemplates([
    "systems/msh-faserip/templates/universal-table.html",
    "systems/msh-faserip/templates/universal-rank-table.hbs"
  ]);

  // Create the game.msh namespace if it doesn't exist
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
  
  // Updated rollItemMacro function
  game.msh.rollItemMacro = async function(actorId, itemId) {
    // Get the actor
    const actor = game.actors.get(actorId);
    if (!actor) return ui.notifications.warn(`Actor could not be found.`);
    
    // Get the item from the actor
    const item = actor.items.get(itemId);
    if (!item) return ui.notifications.warn(`Item ${itemId} could not be found on ${actor.name}.`);
    
    // Call the item's roll method directly - no need to open the sheet
    return item.rollItem();
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

// Add the hotbarDrop hook
Hooks.on('hotbarDrop', async (bar, data, slot) => {
  // Handle dropping Universal Table action macros
  if (data.type === "Macro" && data.id) {
    const macro = game.macros.get(data.id);
    if (macro) {
      game.user.assignHotbarMacro(macro, slot);
      return false;
    }
  }

  // Handle dropping items (your existing logic)
  if (data.type === "Item" && data.actorId) {
    createFaseripItemMacro(data, slot);
    return false;
  }

  return true;
});

// Define the function to create a macro
async function createFaseripItemMacro(data, slot) {
  // Get references to our Actor and Item
  const actor = game.actors.get(data.actorId);
  if (!actor) return ui.notifications.warn("Actor not found");
  
  const item = actor.items.get(data.itemId);
  if (!item) return ui.notifications.warn("Item not found");
  
  // Create a command string that will call our rollItemMacro function
  const command = `game.msh.rollItemMacro("${data.actorId}", "${data.itemId}");`;
  
  // Create the macro
  const macroName = `${item.name} (${actor.name})`;
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
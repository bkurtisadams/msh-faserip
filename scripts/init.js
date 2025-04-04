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
      const actor = game.actors.get(actorId);
      if (!actor) return ui.notifications.warn(`Actor could not be found.`);
    
      const item = actor.items.get(itemId);
      if (!item) return ui.notifications.warn(`Item ${itemId} could not be found on ${actor.name}.`);
    
      switch (item.type) {
        case "power":
          return game.msh.rollPower(actor, item);
        case "talent":
          return game.msh.rollTalent(actor, item);
        case "contact":
          return game.msh.rollContact(actor, item);
        case "equipment":
          return game.msh.rollEquipment(actor, item);
        default:
          ui.notifications.warn(`Cannot roll item of type: ${item.type}`);
          return null;
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

// Handle hotbar drops
Hooks.on("hotbarDrop", async (bar, data, slot) => {
  if (data.type !== "Item") return false;

  const item = await Item.fromDropData(data);
  if (!item || !item.parent) {
    ui.notifications.warn("You can only create macros for owned Items.");
    return false;
  }

  const command = `game.msh.rollItemMacro("${item.parent.id}", "${item.id}");`;
  const macroName = `${item.name} (${item.parent.name})`;

  let macro = game.macros.find(m => m.name === macroName && m.command === command);
  if (!macro) {
    macro = await Macro.create({
      name: macroName,
      type: "script",
      img: item.img || "icons/svg/dice-target.svg",
      command,
      flags: { "faserip.itemMacro": true }
    });
  }

  game.user.assignHotbarMacro(macro, slot);
  return false; // ⬅️ This is what prevents the default behavior
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

Hooks.once("ready", () => {
  Hooks.on("hotbarDrop", async (bar, data, slot) => {
    // Ensure this is an Item from an Actor
    if (data.type !== "Item" || !data.uuid?.startsWith("Actor.")) return true;

    // Resolve the item from the UUID
    const item = await Item.fromDropData(data);
    if (!item || !item.parent) {
      ui.notifications.warn("You can only create macros for owned items.");
      return false;
    }

    const actor = item.parent;
    const command = `game.msh.rollItemMacro("${actor.id}", "${item.id}");`;
    const macroName = `${item.name} (${actor.name})`;

    let macro = game.macros.find(m => m.name === macroName && m.command === command);
    if (!macro) {
      macro = await Macro.create({
        name: macroName,
        type: "script",
        img: item.img || "icons/svg/dice-target.svg",
        command,
        flags: { "msh-faserip.itemMacro": true }
      });
    }

    await game.user.assignHotbarMacro(macro, slot);
    return false; // ✅ Prevents Foundry's default document macro
  });
});

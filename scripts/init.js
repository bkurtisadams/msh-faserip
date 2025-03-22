// In init.js
import { FaseripActor } from './actor.js';
import { FaseripItem } from './item.js';
import { FaseripActorSheet } from './actorSheet.js';
import { FaseripItemSheet } from './itemSheet.js';
import { rollUniversalTable } from './universalTable.js';  // Import your function

Hooks.once("init", () => {
  console.log("Marvel Super Heroes (FASERIP) system initializing...");

  // Create the game.msh namespace if it doesn't exist
  game.msh = game.msh || {};
  
  // Add the rollUniversalTable function to the namespace
  game.msh.rollUniversalTable = rollUniversalTable;

  game.msh.rollItemMacro = rollItemMacro;

  // Register Handlebars helpers
  Handlebars.registerHelper('getFlag', function(object, scope, flag) {
    return object.getFlag(scope, flag);
  });

  // Register document classes
  CONFIG.Actor.documentClass = FaseripActor;
  CONFIG.Item.documentClass = FaseripItem;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Items.unregisterSheet("core", ItemSheet);
  
  Actors.registerSheet("msh-faserip", FaseripActorSheet, { makeDefault: true });
  Items.registerSheet("msh-faserip", FaseripItemSheet, { makeDefault: true });
});

// In init.js, add this after your existing Hooks.once("init", ...) block

// Handle dropping items onto the hotbar to create macros
Hooks.on("hotbarDrop", (bar, data, slot) => {
  // Only handle item drops
  if (data.type !== "Item") return;
  
  // Get the item data
  createItemMacro(data, slot);
  
  // Return true to indicate the drop was handled
  return true;
});

/**
 * Create a macro from an Item drop.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createItemMacro(data, slot) {
  // Get the item from the provided data
  const item = await fromUuid(data.uuid);
  if (!item) return;
  
  // Create the macro command
  const command = `game.msh.rollItemMacro("${item.name}");`;
  
  // Create the macro
  let macro = game.macros.find(m => (m.name === item.name) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: { "msh-faserip": { "itemMacro": true } }
    });
  }
  
  // Assign the macro to the hotbar slot
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Roll a power/item directly from a macro.
 * @param {string} itemName
 * @return {Promise}
 */
async function rollItemMacro(itemName) {
  // Get the active actor (character)
  const speaker = ChatMessage.getSpeaker();
  let actor;
  
  // Try to get the actor from the speaker data
  if (speaker.token) actor = game.actors.tokens[speaker.token];
  if (!actor) actor = game.actors.get(speaker.actor);
  
  // If no actor is found, show an error
  if (!actor) {
    ui.notifications.warn(`Your character needs to be selected to use this macro.`);
    return;
  }
  
  // Find the item on the actor
  const item = actor.items.find(i => i.name === itemName);
  if (!item) {
    ui.notifications.warn(`Your selected character doesn't have the ${itemName} power.`);
    return;
  }
  
  // Roll the item
  return item.rollItem();
}
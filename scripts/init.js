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
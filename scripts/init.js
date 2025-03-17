import { FaseripActor } from './actor.js';
import { FaseripItem } from './item.js';
import { FaseripActorSheet } from './actorSheet.js';
import { FaseripItemSheet } from './itemSheet.js';
import { rollFeat } from './macros.js';
import { rollUniversalTable } from "./universalTable.js";

Hooks.once("init", () => {
  console.log("Marvel Super Heroes (FASERIP) system initializing...");

  // Register document classes
  CONFIG.Actor.documentClass = FaseripActor;
  CONFIG.Item.documentClass = FaseripItem;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Items.unregisterSheet("core", ItemSheet);
  
  Actors.registerSheet("msh-faserip", FaseripActorSheet, { makeDefault: true });
  Items.registerSheet("msh-faserip", FaseripItemSheet, { makeDefault: true });

  // Register Handlebars helpers
  Handlebars.registerHelper('capitalize', function(str) {
    if (typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  });
  
  Handlebars.registerHelper('eq', function(a, b) {
    return a === b;
  });
  
  Handlebars.registerHelper('groupBy', function(items, key) {
    const groups = items.reduce((result, item) => {
      (result[item[key]] = result[item[key]] || []).push(item);
      return result;
    }, {});
    return Object.entries(groups).map(([type, items]) => ({ type, items }));
  });

  // Register system macros
  game.msh = {
    rollFeat: rollFeat,
    rollUniversalTable: rollUniversalTable
  };

  console.log("Marvel Super Heroes (FASERIP) system initialized!");
});

// Add a debug hook to help troubleshoot sheet rendering
Hooks.on("renderActorSheet", (app, html, data) => {
  console.log("Actor sheet rendered:", app.actor.name);
  console.log("HTML length:", html.html().length);
  console.log("Sheet data:", data);
});
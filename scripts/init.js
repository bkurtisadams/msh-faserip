import { FaseripActor } from './actor.js';
import { FaseripItem } from './item.js';
import { FaseripActorSheet } from './actorSheet.js';
import { FaseripItemSheet } from './itemSheet.js';
import { rollFeat } from './macros.js';
import { rollUniversalTable } from "./universalTable.js";

Hooks.once("init", () => {

  // Register custom Document Classes explicitly
  CONFIG.Actor.documentClass = FaseripActor;
  CONFIG.Item.documentClass = FaseripItem;

  // Unregister default sheets explicitly
  Actors.unregisterSheet("core", ActorSheet);
  Items.unregisterSheet("core", ItemSheet);

  // Register your custom Sheets clearly
  Actors.registerSheet("msh-faserip", FaseripActorSheet, { makeDefault: true });
  Items.registerSheet("msh-faserip", FaseripItemSheet, { makeDefault: true });

  // Register Handlebars helpers explicitly
  Handlebars.registerHelper('capitalize', (str) => {
    if (typeof str !== "string" || !str.length) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  Handlebars.registerHelper('groupBy', (items, key) => {
    const groups = items.reduce((result, item) => {
      (result[item[key]] = result[item[key]] || []).push(item);
      return result;
    }, {});
    return Object.entries(groups).map(([type, items]) => ({ type, items }));
  });

  // Explicitly attach your macro functions to game namespace clearly
  game.msh = {
    rollFeat: rollFeat,
    rollUniversalTable: rollUniversalTable
  };

  console.log("Marvel Super Heroes (FASERIP) system initialized!");
});
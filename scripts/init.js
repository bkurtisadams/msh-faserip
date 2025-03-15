import { FaseripActor } from './actor.js';
import { FaseripItem } from './item.js';
import { FaseripActorSheet } from './actorSheet.js';
import { FaseripItemSheet } from './itemSheet.js';

Hooks.once("init", () => {

  // Register custom Document Classes
  CONFIG.Actor.documentClass = FaseripActor;
  CONFIG.Item.documentClass = FaseripItem;

  // Unregister default sheets
  Actors.unregisterSheet("core", ActorSheet);
  Items.unregisterSheet("core", ItemSheet);

  // Register custom Sheets
  Actors.registerSheet("msh-faserip", FaseripActorSheet, { makeDefault: true });
  Items.registerSheet("msh-faserip", FaseripItemSheet, { makeDefault: true });

  // Register Handlebars helpers
  Handlebars.registerHelper('capitalize', (str) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  Handlebars.registerHelper('groupBy', function(items, key) {
    const groups = items.reduce((result, item) => {
      (result[item[key]] = result[item[key]] || []).push(item);
      return result;
    }, {});

    return Object.entries(groups).map(([type, items]) => ({ type, items }));
  });

  console.log("Marvel Super Heroes (FASERIP) system initialized!");
});

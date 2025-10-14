// In init.js
import * as GMUtils from './gm-utils.js';
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
import { initializeSlamHandlers } from './charge-damage.js';
import { installActionChatHandlers } from "./modules/actions/chat-hooks.js";
import { openCollisionDamageDialog } from './modules/actions/collision-damage.js';


Hooks.once("init", async () => {
  console.log("FASERIP DEBUG: init hook is running!"); // <-- DEBUG CONSOLE LOG
  console.log("Marvel Super Heroes (FASERIP) system initializing...");

  // Initialize the game.msh namespace early
  game.msh = game.msh || {};

  game.msh.FaseripActorSheet = FaseripActorSheet;

  CONFIG.FASERIP = CONFIG.FASERIP || {};

  // keyboard control to open Universal Table dialog
  game.keybindings.register("msh-faserip", "openUniversalTable", {
    name: "Open Universal Table",
    hint: "Opens the Universal Table using selected token, open sheet, or fallback actor",
    category: "FASERIP",
    editable: [{ key: "KeyU", modifiers: ["Control"] }],
    onDown: () => {
      const sheet = Object.values(ui.windows).find(w => w instanceof game.msh.FaseripActorSheet);
      const actor =
        sheet?.actor ??
        canvas.tokens.controlled[0]?.actor ??
        game.actors.find(a => a.type === "hero" || a.type === "npc") ??
        game.actors.contents[0]; // fallback to any actor

      if (actor) {
        game.msh.openUniversalTableDialog?.(actor);
      } else {
        ui.notifications.warn("No actor found to use for Universal Table.");
      }

      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  // Team control button
  // Add this after the keybinding registration and before the settings registration
  Hooks.on("getSceneControlButtons", function(controlsData) {
    console.log("FASERIP | getSceneControlButtons fired:", controlsData);

    // 1. Normalize whatever Foundry passed in into an array of group-objects
    let groupsArray;
    if (Array.isArray(controlsData)) {
      groupsArray = controlsData;
    } else if (controlsData && typeof controlsData === "object") {
      groupsArray = Object.values(controlsData);
    } else {
      console.error("FASERIP | Unexpected controlsData shape:", controlsData);
      return;
    }

    // 2. Find the "tokens" group
    const tokenGroup = groupsArray.find(g => g.name === "tokens" || g.name === "token");
    console.log("FASERIP | tokenGroup from hook:", tokenGroup);
    if (!tokenGroup) {
      console.error("FASERIP | Token controls not found");
      return;
    }

    // 3. Build a plain object keyed by each existing tool's name
    //    (This works whether tokenGroup.tools was originally an array or an object.)
    const existingToolsObj = {};
    if (tokenGroup.tools) {
      // If tokenGroup.tools is array-like, values() gives numeric indices first
      // If it's already an object, values() gives its property values
      for (const t of Object.values(tokenGroup.tools)) {
        if (t && t.name) existingToolsObj[t.name] = t;
      }
    }

    // 4. Insert your Team Management button under the "faserip-team" key
    if (!existingToolsObj["faserip-team"]) {
      existingToolsObj["faserip-team"] = {
        name: "faserip-team",
        title: "Team Management",
        icon: "fas fa-users-crown",
        visible: true,
        button: true,
        onClick: () => {
          console.log("FASERIP | Team Management onClick triggered!");
          import('./teamSheet.js').then(module => {
            const teamSheet = new module.TeamSheet();
            teamSheet.render(true);
          }).catch(error => {
            console.error("FASERIP: Error importing teamSheet:", error);
            ui.notifications.error("Could not load Team Sheet");
          });
        }
      };
      console.log("FASERIP | Added 'faserip-team' to tools object");
    } else {
      console.log("FASERIP | 'faserip-team' already existed, skipping re-insert");
    }

    // 5. Assign the reconstructed tools-object back onto tokenGroup.tools
    tokenGroup.tools = existingToolsObj;

    console.log("FASERIP | tokenGroup.tools has been rebuilt:", tokenGroup.tools);
  });

  // <-- NEW/MODIFIED SECTION START -->
  // Register system settings
  game.settings.register("msh-faserip", "debugMode", {
    name: "Debug Mode",
    hint: "Enable detailed console logging for troubleshooting",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register('msh-faserip', 'dailyKarmaEnabled', {
    name: "Enable Daily Karma",
    hint: "If enabled, characters gain temporary Karma equal to their Reason+Intuition+Psyche at the start of each session, used before their lifetime Karma pool.",
    scope: "world", // Can be 'world' or 'client'
    config: true,   // Show in system settings UI
    type: Boolean,  // Use the JavaScript Boolean class, not a string "Boolean"
    default: false, // Default value
  });

  game.settings.register('msh-faserip', 'maxStunDuration', {
    name: "Maximum Stun Duration",
    hint: "House rule: Cap the maximum rounds a character can be stunned (White result on Stun check rolls 1d10). Set to 10 for RAW, or lower (e.g., 3-5) to keep combats moving.",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    range: {
      min: 1,
      max: 10,
      step: 1
    }
  });

  game.settings.register("msh-faserip", "unitsPerArea", {
    name: "Distance per Area",
    hint: "How many scene distance units equal 1 Area. Examples: 132 for feet, ~40 for meters, 1 if your scene units are Areas.",
    scope: "world",
    config: true,
    type: Number,
    default: 132
  });

  console.log("FASERIP DEBUG: dailyKarmaEnabled setting registered."); // <-- DEBUG CONSOLE LOG
  // <-- NEW/MODIFIED SECTION END -->

  game.settings.register("msh-faserip", "teamKarmaPoolTotal", {
    name: "Team Karma Pool Total",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });
  
  game.settings.register("msh-faserip", "teamMembers", {
      name: "Team Members",
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

    game.settings.register("msh-faserip", "karmaMultiplier", {
      name: "Karma Multiplier",
      scope: "world",
      config: false,
      type: Number,
      default: 1
    });

    // Add this new one:
    game.settings.register("msh-faserip", "teamKarmaAwards", {
      name: "Team Karma Awards History",
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

  console.log("FASERIP DEBUG: Team settings registered.");

  // Register custom grappling effects so they show token HUD icons and work with ActiveEffect.statuses
  CONFIG.statusEffects.push(
    {
      id: "partial-hold",
      label: "Partial Hold",
      icon: "icons/svg/net.svg", // Use existing Foundry icon
      flags: { "msh-faserip": { grappling: true } }
    },
    {
      id: "full-hold", 
      label: "Full Hold",
      icon: "icons/svg/paralysis.svg", // Use existing Foundry icon
      flags: { "msh-faserip": { grappling: true } }
    }
  );

  CONFIG.FASERIP.rankValues = {
    "Shift-0": 0, 
    "Feeble": 2, 
    "Poor": 4, 
    "Typical": 6, 
    "Good": 10, 
    "Excellent": 20,
    "Remarkable": 30, 
    "Incredible": 40, 
    "Amazing": 50, 
    "Monstrous": 75,
    "Unearthly": 100, 
    "Shift X": 150, 
    "Shift Y": 200, 
    "Shift Z": 500,
    "Class 1000": 1000, 
    "Class 3000": 3000, 
    "Class 5000": 5000, 
    "Beyond": 9999,
    
    // Add these alternative formats that might be generated:
    "Shift-X": 150,
    "Shift-Y": 200, 
    "Shift-Z": 500,
    "Class1000": 1000,
    "Class3000": 3000,
    "Class5000": 5000
  };

  // Add after the rankValues definition in init.js

  CONFIG.FASERIP.damageTypes = {
    // Physical
    "physical-blunt": "Physical: Blunt",
    "physical-edged": "Physical: Edged",
    
    // Energy - these need to bypass physical armor
    "energy-force": "Energy: Force",
    "energy-generic": "Energy: Generic",
    "energy-fire": "Energy: Fire/Heat",
    "energy-cold": "Energy: Cold/Ice",
    "energy-electricity": "Energy: Electricity",
    "energy-sound": "Energy: Sound/Sonic",
    "energy-light": "Energy: Light",
    "energy-radiation": "Energy: Radiation",
    "energy-darkforce": "Energy: Darkforce",
    
    // Special
    "corrosive": "Corrosive/Acid",
    "mental": "Mental/Psionic",
    "nullification": "Nullification",
    
    // Touch Attacks
    "touch-energy": "Touch: Energy",
    "touch-paralyzing": "Touch: Paralyzing",
    "touch-rotting": "Touch: Rotting (organic)",
    "touch-corrosive": "Touch: Corrosive (inorganic)",
    "touch-healthdrain": "Touch: Health Drain",
    "touch-blinding": "Touch: Blinding"
  };

  CONFIG.FASERIP.resistanceTypes = {
    "fire": "Fire/Heat",
    "cold": "Cold/Ice",
    "electricity": "Electricity",
    "radiation": "Radiation",
    "toxins": "Toxins/Poison",
    "corrosives": "Corrosives/Acid",
    "emotion": "Emotion Attacks",
    "mental": "Mental Attacks",
    "magic": "Magical Attacks",
    "disease": "Disease"
  };

  CONFIG.FASERIP.attackTypes = {
    "ranged-energy": "Ranged: Energy Blast",
    "ranged-force": "Ranged: Force Blast",
    "ranged-projectile": "Ranged: Projectile",
    "ranged-thrown": "Ranged: Thrown Weapon",
    "melee-blunt": "Melee: Blunt Attack",
    "melee-edged": "Melee: Edged Attack",
    "touch": "Touch Attack",
    "mental": "Mental Attack",
    "grapple": "Grappling",
    "charging": "Charging Attack"
  };

  CONFIG.FASERIP.primaryEffects = {
    "damage": "Deals Damage",
    "stun": "Stunning Effect",
    "nullification": "Power Nullification",
    "control-mind": "Mind Control",
    "control-emotion": "Emotion Control",
    "control-animal": "Animal Control",
    "control-plant": "Plant Control",
    "healing": "Healing",
    "support": "Support/Buff",
    "transformation": "Transformation",
    "detection": "Detection/Sensing",
    "teleportation": "Teleportation",
    "illusion": "Illusion/Image",
    "force-field": "Force Field"
  };

  CONFIG.FASERIP.bodyArmorTypes = {
    "physical": "Physical Only",
    "energy": "Energy Only",
    "both": "Both Physical & Energy"
  };

  CONFIG.FASERIP.resistanceEffects = {
    "columnShift": "Column Shift Bonus",
    "damageReduction": "Damage Reduction",
    "immunity": "Immunity (if rank exceeds attack)"
  };

  // Helper function to check if damage type is energy-based
  CONFIG.FASERIP.isEnergyDamage = function(damageType) {
    return damageType && (
      damageType.startsWith("energy-") || 
      damageType === "mental" ||
      damageType === "touch-energy"
    );
  };

  // Helper function to check if damage type is physical
  CONFIG.FASERIP.isPhysicalDamage = function(damageType) {
    return damageType && damageType.startsWith("physical-");
  };

  // Helper function to get appropriate armor value
  CONFIG.FASERIP.getApplicableArmor = function(armorPhysical, armorEnergy, damageType) {
    if (this.isEnergyDamage(damageType)) {
      return armorEnergy || 0;
    } else if (this.isPhysicalDamage(damageType)) {
      return armorPhysical || 0;
    }
    // For special damage types, use physical as default
    return armorPhysical || 0;
  };

  await loadTemplates([
    "systems/msh-faserip/templates/universal-table.html",
    "systems/msh-faserip/templates/universal-rank-table.hbs"
  ]);

  // Create game.msh namespace
  game.msh = game.msh || {};

  game.msh.getRankValue = function(rankName) {
    if (!rankName) return 0;
    
    // Normalize the rank name
    let normalizedRank = rankName.toString().trim();
    
    // Handle "Class" ranks - remove spaces
    if (normalizedRank.includes("Class ")) {
      normalizedRank = normalizedRank.replace("Class ", "Class");
    }
    
    // Try direct lookup first
    if (CONFIG.FASERIP.rankValues[normalizedRank] !== undefined) {
      return CONFIG.FASERIP.rankValues[normalizedRank];
    }
    
    // Try common variations
    const variations = [
      normalizedRank,
      normalizedRank.replace(/\s+/g, ""), // Remove all spaces
      normalizedRank.replace(/\s+/g, " "), // Normalize spaces
      normalizedRank.replace("-", " "),    // Replace hyphens with spaces
      normalizedRank.replace(" ", "-")     // Replace spaces with hyphens
    ];
    
    for (const variation of variations) {
      if (CONFIG.FASERIP.rankValues[variation] !== undefined) {
        return CONFIG.FASERIP.rankValues[variation];
      }
    }
    
    console.warn(`Rank "${rankName}" not found in CONFIG.FASERIP.rankValues`);
    return 0;
  };

  game.msh.getRankName = function(rankValue) {
    // Find the rank name that corresponds to this value
    for (const [name, value] of Object.entries(CONFIG.FASERIP.rankValues)) {
      if (value === rankValue) {
        return name;
      }
    }
    return "Unknown";
  };
  
  game.msh.getActorPowers = function(actor) {
    const items = actor.items.contents ?? actor.items;

    const powers = items
      .filter(i => i.type === "power")
      .map(i => foundry.utils.duplicate(i.system));

    for (let item of items) {
      if (item.type === "equipment" && Array.isArray(item.system.powers)) {
        for (let power of item.system.powers) {
          if (power.grantedByEquipment) {
            powers.push(foundry.utils.duplicate(power));
          }
        }
      }
    }

    for (let power of powers) {
      if (typeof power.value === "undefined" && power.rank) {
        power.value = game.msh.getRankValue(power.rank) ?? 0;
      }
    }

    return powers;
  };

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

  // Add the collision damage dialog
  game.msh.openCollisionDamageDialog = openCollisionDamageDialog;

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

  Handlebars.registerHelper('some', function(array, property) {
    if (!Array.isArray(array)) return false;
    return array.some(item => {
      const value = property.split('.').reduce((obj, key) => obj?.[key], item);
      return Array.isArray(value) ? value.length > 0 : value;
    });
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

Hooks.on("preCreateActor", (document, data, options, userId) => {
  console.log("FASERIP: preCreateActor - Type:", document.type);
  console.log("FASERIP: preCreateActor - Data before fix:", data.prototypeToken);
  
  // Initialize prototypeToken if it doesn't exist
  if (!data.prototypeToken) {
    data.prototypeToken = {};
  }
  
  // Force the correct disposition based on actor type
  switch (document.type) {
    case "hero":
      data.prototypeToken.disposition = CONST.TOKEN_DISPOSITIONS.FRIENDLY; // 1
      console.log("FASERIP: Forcing hero disposition to FRIENDLY (1)");
      break;
    case "villain":
      data.prototypeToken.disposition = CONST.TOKEN_DISPOSITIONS.HOSTILE; // -1
      console.log("FASERIP: Forcing villain disposition to HOSTILE (-1)");
      break;
    case "npc":
    default:
      data.prototypeToken.disposition = CONST.TOKEN_DISPOSITIONS.NEUTRAL; // 0
      console.log("FASERIP: Forcing NPC disposition to NEUTRAL (0)");
      break;
  }
  
  console.log("FASERIP: preCreateActor - Data after fix:", data.prototypeToken);
});

// CONSOLIDATED READY HOOK - All ready logic in one place
Hooks.once("ready", async () => {
  game.msh ??= {};

  // SocketLib + GM handlers
  try {
    GMUtils.registerSocket();
    console.log("MSH FASERIP | Socket/GM registered");
  } catch (e) {
    console.warn("MSH FASERIP | Socket/GM registration failed:", e);
  }

  // Slam collision handlers (optional, safe)
  try {
    initializeSlamHandlers?.();
    console.log("MSH FASERIP | Slam handlers ready");
  } catch (e) {
    console.warn("MSH FASERIP | Slam handler init failed:", e);
  }

  // Fix prototype token overrides (only if needed)
  try {
    const o = game.settings.get("core", "prototypeTokenOverrides") ?? {};
    const needsFix = o.hero?.disposition !== undefined || o.villain?.disposition !== undefined || o.npc?.disposition !== undefined;
    if (needsFix) {
      const fixed = {
        base: o.base ?? {},
        hero: { ...(o.hero ?? {}) },
        villain: { ...(o.villain ?? {}) },
        npc: { ...(o.npc ?? {}) }
      };
      delete fixed.hero.disposition;
      delete fixed.villain.disposition;
      delete fixed.npc.disposition;
      await game.settings.set("core", "prototypeTokenOverrides", fixed);
      console.log("MSH FASERIP | Cleared disposition overrides");
    }
  } catch (e) {
    console.warn("MSH FASERIP | Could not adjust prototypeTokenOverrides:", e);
  }

  // Chat hooks (checks + breaking FEAT)
  try {
    installActionChatHandlers();
  } catch (e) {
    console.warn("MSH FASERIP | Failed to install chat hooks:", e);
  }
});

// Add the hotbarDrop hook at module level (like in the older file)
Hooks.on('hotbarDrop', (bar, data, slot) => {
  console.log("📦 hotbarDrop received:", data);
  
  if (data.type === "Item" && data.actorId) {
    createFaseripItemMacro(data, slot);
    return false;
  }
  else if (data.type === "UniversalTable" && data.actorId) {
    createUniversalTableMacro(data, slot);
    return false;
  }
  else if (data.type === "UniversalAction" && data.actionCode) {
    createUniversalActionMacro(data, slot);
    return false;
  }
  
  return true;
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
      case "power": game.msh.rollPower(item.parent, item, {useDirectRoll: false}); break;
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

async function createUniversalActionMacro(data, slot) {
  const { actionCode, actionName, actorId, actorName, iconName } = data;
  
  const command = `// Universal Action Macro
const actor = game.user.character || canvas.tokens.controlled[0]?.actor || game.actors.get("${actorId}");
if (!actor) {
  return ui.notifications.warn("Select a token or assign a character first.");
}

const savedCS = actor.getFlag("msh-faserip", "cs_${actionCode}") || 0;
const savedKarma = actor.getFlag("msh-faserip", "karma_${actionCode}") || 0;

// Call the same function that generates multi-target options in the dialog
game.msh.rollUniversalAction("${actionCode}", actor.id, savedCS, savedKarma);`;

  const macroName = `${actionName} (${actorName})`;
  let macro = game.macros.find(m => m.name === macroName && m.command === command);
  
  if (!macro) {
    const img = `systems/msh-faserip/assets/icons/actions/${iconName}.png`;
    
    macro = await Macro.create({
      name: macroName,
      type: "script",
      command: command,
      img: img,
      flags: {"faserip.universalActionMacro": true}
    });
  }
  
  game.user.assignHotbarMacro(macro, slot);
  return true;
}
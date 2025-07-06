// File: systems/msh-faserip/rolls.js
import { applyColumnShiftToRank } from './actorSheet.js';
import { CombatHandler } from './combat-handler.js';
import { runAsGM } from './gm-utils.js';
import { calculateChargeDamage, getBodyArmorValue, processChargeAttack } from './charge-damage.js';

// ============================================
// HELPER FUNCTIONS (OUTSIDE THE CLASS)
// ============================================
/**
 * Check if all selected targets are adjacent to the attacker
 * @param {Token} attackerToken - The attacking token
 * @param {Array} targetTokens - Array of target tokens
 * @returns {Object} - {valid: boolean, invalidTargets: Array}
 */
function validateAdjacentTargets(attackerToken, targetTokens) {
  console.log("🎯 validateAdjacentTargets called (Fixed version)");
  console.log("  attackerToken:", attackerToken?.name);
  console.log("  targetTokens:", targetTokens?.map(t => t.name));
  
  if (!attackerToken || !targetTokens || targetTokens.length < 2) {
    console.log("  ❌ Invalid input - missing attacker or insufficient targets");
    return { valid: false, invalidTargets: targetTokens || [] };
  }

  const invalidTargets = [];
  const gridSize = canvas.scene.grid.size; // This is the pixel size of one grid square
  
  console.log("  Grid size (pixels):", gridSize);
  
  for (const targetToken of targetTokens) {
    // Calculate distance in pixels using the new API
    const pathResult = canvas.grid.measurePath([attackerToken.center, targetToken.center]);
    const distance = pathResult.distance;
    
    // Convert to grid squares by dividing by grid size in pixels
    const areas = distance / gridSize;
    
    console.log(`  Distance to ${targetToken.name}: ${distance} pixels = ${areas.toFixed(1)} areas`);
    
    // Target must be within 1.5 areas (adjacent including diagonals)
    if (areas > 1.5) {
      console.log(`  ❌ ${targetToken.name} is NOT adjacent (${areas.toFixed(1)} areas away)`);
      invalidTargets.push(targetToken);
    } else {
      console.log(`  ✅ ${targetToken.name} is adjacent (${areas.toFixed(1)} areas away)`);
    }
  }
  
  const result = {
    valid: invalidTargets.length === 0,
    invalidTargets: invalidTargets
  };
  
  console.log("  Final result:", result.valid ? "✅ All targets adjacent" : "❌ Some targets not adjacent");
  return result;
}

/**
 * Check if an attack type is valid for multiple adjacent targets
 * @param {String} actionCode - The action code (e.g., "BA", "Es", "En", "Fo")
 * @returns {Boolean}
 */
function isValidMultiTargetAttack(actionCode) {
  console.log("🎯 isValidMultiTargetAttack called with:", actionCode);
  // Per FASERIP rules: Blunt Slugfest, Escaping, Energy and Force Powers
  const validActions = ["BA", "Es", "En", "Fo"];
  const result = validActions.includes(actionCode);
  console.log("🎯 isValidMultiTargetAttack result:", result);
  return result;
}

/**
 * Check if an attack type is valid for multiple attacks
 * @param {String} actionCode - The action code
 * @returns {Boolean}
 */
function isValidMultipleAttack(actionCode) {
  console.log("🎯 isValidMultipleAttack called with:", actionCode);
  // Per FASERIP rules: Slugfest attacks and Shooting only
  const validActions = ["BA", "EA", "Sh"]; // Slugfest (BA, EA) and Shooting (Sh)
  const result = validActions.includes(actionCode);
  console.log("🎯 isValidMultipleAttack result:", result);
  return result;
}

/**
 * Generate the HTML for multiple target/attack options
 * @param {String} actionType - Current action type to validate against
 * @returns {String} - HTML string for the options section
 */
/**
 * Generate the HTML for multiple target/attack options
 * @param {String} actionCode - Current action code to validate against
 * @returns {String} - HTML string for the options section
 */
function generateMultiTargetOptionsHTML(actionCode) {
  console.log("🎯 generateMultiTargetOptionsHTML called with actionCode:", actionCode);
  
  const targetCount = game.user.targets.size;
  const validMultiTarget = isValidMultiTargetAttack(actionCode);
  const validMultiAttack = isValidMultipleAttack(actionCode);
  
  console.log("🎯 targetCount:", targetCount);
  console.log("🎯 validMultiTarget:", validMultiTarget);
  console.log("🎯 validMultiAttack:", validMultiAttack);
  
  // Only show if at least one option is valid
  if (!validMultiTarget && !validMultiAttack) {
    console.log("🎯 No valid options, returning empty string");
    return "";
  }
  
  console.log("🎯 Generating HTML for multiple target options");
  
  let html = `
    <div style="margin-bottom: 10px; padding: 8px; background: #e8f4f8; border: 1px solid #b8d4da; border-radius: 3px;">
      <div style="font-weight: bold; margin-bottom: 5px; color: #2c5aa0;">Multiple Target Options:</div>
  `;
  
  // Single Roll Multiple Targets option
  if (validMultiTarget) {
    html += `
      <div style="margin-bottom: 5px;">
        <label>
          <input type="checkbox" id="multi-adjacent" name="multiAdjacent" style="margin-right: 5px;">
          Multiple Adjacent Targets (-4CS, single roll affects all)
        </label>
        <div style="font-size: 0.8em; color: #666; margin-left: 20px;">
          Targets selected: ${targetCount} | All must be adjacent to attacker
        </div>
        <div style="font-size: 0.8em; color: #888; margin-left: 20px;">
          Valid for: Blunt Attack, Escaping, Energy, Force
        </div>
      </div>
    `;
  }
  
  // Multiple Attacks option  
  if (validMultiAttack) {
    html += `
      <div style="margin-bottom: 5px;">
        <label>
          <input type="checkbox" id="multi-attacks" name="multiAttacks" style="margin-right: 5px;">
          Multiple Attacks (requires Fighting FEAT)
        </label>
        <div id="multi-attacks-options" style="margin-left: 20px; display: none;">
          <label style="display: block; margin: 3px 0;">
            <input type="radio" name="attackCount" value="2" checked style="margin-right: 5px;">
            2 Attacks (Remarkable FEAT, -1CS each)
          </label>
          <label style="display: block; margin: 3px 0;">
            <input type="radio" name="attackCount" value="3" style="margin-right: 5px;">
            3 Attacks (Amazing FEAT, -1CS each)
          </label>
        </div>
        <div style="font-size: 0.8em; color: #888; margin-left: 20px;">
          Valid for: Slugfest (Blunt, Edged) and Shooting attacks only
        </div>
      </div>
    `;
  }
  
  html += `</div>`;
  return html;
}

/**
 * Add event handlers for multiple target/attack options
 * @param {jQuery} html - The dialog HTML element
 */
function addMultiTargetEventHandlers(html) {
  console.log("🎨 addMultiTargetEventHandlers called");
  
  const actionSelect = html.find('#action');
  const multiAdjacentCheckbox = html.find('#multi-adjacent');
  const multiAttacksCheckbox = html.find('#multi-attacks');
  const multiAttacksOptions = html.find('#multi-attacks-options');

  // Get the action from the dialog title instead of a select box
  const dialogTitle = html.closest('.dialog').find('.window-title').text();
  const actionMatch = dialogTitle.match(/Roll: (\w+)/);
  const currentAction = actionMatch ? actionMatch[1] : null;
  
  console.log("🎨 Current action from dialog title:", currentAction);

  // Function to update option availability based on action type
  function updateMultiOptions() {
    const selectedAction = currentAction; // Use the action from title, not a select
    
    console.log("🎨 updateMultiOptions called with action:", selectedAction);
    
    // Check if action is valid for multiple adjacent targets
    const validMultiTarget = isValidMultiTargetAttack(selectedAction);
    const validMultiAttack = isValidMultipleAttack(selectedAction);
    
    console.log("🎨 validMultiTarget:", validMultiTarget);
    console.log("🎨 validMultiAttack:", validMultiAttack);
    
    multiAdjacentCheckbox.prop('disabled', !validMultiTarget);
    if (!validMultiTarget) {
      multiAdjacentCheckbox.prop('checked', false);
    }
    
    multiAttacksCheckbox.prop('disabled', !validMultiAttack);
    if (!validMultiAttack) {
      multiAttacksCheckbox.prop('checked', false);
      multiAttacksOptions.hide();
    }
  }

  // Mutual exclusion: if one is checked, disable the other
  multiAdjacentCheckbox.on('change', function() {
    console.log("🎨 multiAdjacent checkbox changed:", this.checked);
    if (this.checked) {
      multiAttacksCheckbox.prop('disabled', true).prop('checked', false);
      multiAttacksOptions.hide();
    } else {
      const validMultiAttack = isValidMultipleAttack(currentAction);
      multiAttacksCheckbox.prop('disabled', !validMultiAttack);
    }
  });

  multiAttacksCheckbox.on('change', function() {
    console.log("🎨 multiAttacks checkbox changed:", this.checked);
    if (this.checked) {
      multiAdjacentCheckbox.prop('disabled', true).prop('checked', false);
      multiAttacksOptions.show();
    } else {
      multiAttacksOptions.hide();
      const validMultiTarget = isValidMultiTargetAttack(currentAction);
      multiAdjacentCheckbox.prop('disabled', !validMultiTarget);
    }
  });

  // Initial update
  updateMultiOptions();
}

// ============================================
// CONSTANTS AND DATA (OUTSIDE THE CLASS)  
// ============================================
const actionTypes = [
  { code: "BA", label: "Blunt Attacks" },
  { code: "EA", label: "Edged Attacks" },
  { code: "Sh", label: "Shooting Attacks" },
  { code: "TE", label: "Throwing Edged" },
  { code: "TB", label: "Throwing Blunt" },
  { code: "En", label: "Energy" },
  { code: "Fo", label: "Force" },
  { code: "Gp", label: "Grappling" },
  { code: "Gb", label: "Grabbing" },
  { code: "Es", label: "Escaping" },
  { code: "Ch", label: "Charging" },
  { code: "Do", label: "Dodging" },
  { code: "Ev", label: "Evading" },
  { code: "Bl", label: "Blocking" },
  { code: "Ca", label: "Catching" },
  { code: "St", label: "Stun?" },
  { code: "Sl", label: "Slam?" },
  { code: "Ki", label: "Kill?" }
];

const ACTION_ABILITY_MAP = {
  BA: "fighting",
  EA: "fighting",
  Sh: "agility",
  TE: "agility",
  TB: "agility",
  En: "agility",
  Fo: "agility",
  Gp: "strength",
  Gb: "strength",
  Es: "strength",
  Ch: "endurance",
  Do: "agility",
  Ev: "fighting",
  Bl: "strength",
  Ca: "agility",
  St: "endurance",
  Sl: "endurance",
  Ki: "endurance"
};

const ACTION_RESULT_LABELS = {
  BA: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
  EA: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
  Sh: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
  TE: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
  TB: { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" },
  En: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
  Fo: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
  Gp: { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" },
  Gb: { white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
  Es: { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
  Ch: { white: "None", green: "Slam", yellow: "Slam", red: "Stun" },
  Do: { white: "Autohit", green: "-2 CS", yellow: "-4 CS", red: "-6 CS" },
  Ev: { white: "Autohit", green: "Evasion", yellow: "+1 CS", red: "+2 CS" },
  Bl: { white: "Autohit", green: "+4 CS", yellow: "+2 CS", red: "+1 CS" },
  Ca: { white: "Miss", green: "Catch", yellow: "Catch", red: "No" },
  St: { white: "1–10", green: "1", yellow: "Damage", red: "No" },
  Sl: { white: "Gr. Slam", green: "1 area", yellow: "Stagger", red: "No" },
  Ki: { white: "End. Loss", green: "E/S", yellow: "No", red: "No" }
};
                            // 0      Feeble  Poor   Typical  Good    Ex      Rm      In      Am       Mn    Un      Sh X     Sh Y    Sh Z    1000   3000     5000   Beyond
export const rankRows = [
  { label: "01", colors:    ["white","white","white","white","white","white","white","white","white","white","white","white","white","white","white","white","white","white"] },
  { label: "02–03", colors: ["white","white","white","white","white","white","white","white","white","white","white","white","white","green","green","green","green","green"] },
  { label: "04–06", colors: ["white","white","white","white","white","white","white","white","white","white","white","white","white","green","green","green","green","green"] },
  { label: "07–10", colors: ["white","white","white","white","white","white","white","white","white","white","white","white","green","green","green","green","green","green"] },
  { label: "11–15", colors: ["white","white","white","white","white","white","white","white","white","white","white","green","green","green","green","green","green","green"] },
  { label: "16–20", colors: ["white","white","white","white","white","white","white","white","white","white","green","green","green","green","green","green","green","green"] },
  { label: "21–25", colors: ["white","white","white","white","white","white","white","white","white","green","green","green","green","green","green","green","green","yellow"] },
  { label: "26–30", colors: ["white","white","white","white","white","white","white","white","green","green","green","green","green","green","green","green","yellow","yellow"] },
  { label: "31–35", colors: ["white","white","white","white","white","white","white","green","green","green","green","green","green","green","green","yellow","yellow","yellow"] },
  { label: "36–40", colors: ["white","white","white","white","white","white","green","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow"] },
  { label: "41–45", colors: ["white","white","white","white","white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow"] },
  { label: "46–50", colors: ["white","white","white","white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"] },
  { label: "51–55", colors: ["white","white","white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"] },
  { label: "56–60", colors: ["white","white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"] },
  { label: "61–65", colors: ["white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"   ,"red"] },
  { label: "66–70", colors: ["green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"   ,"red"  ,"red"] },
  { label: "71–75", colors: ["green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"  ,"red"   ,"red"  ,"red"] },
  { label: "76–80", colors: ["green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"  ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "81–85", colors: ["green","green","green","yellow","yellow","yellow","yellow","yellow","yellow" ,"yellow","yellow","red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "86–90", colors: ["green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "91–94", colors: ["green","yellow","yellow","yellow","yellow","yellow","yellow","red"  ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "95–97", colors: ["yellow","yellow","yellow","yellow","yellow","red"  ,"red"  ,"red"   ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "98–99", colors: ["yellow","yellow","yellow","red"   ,"red"   ,"red"  ,"red"  ,"red"   ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "100", colors:   ["red"   ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"  ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] }
];

// Power Rank Range Table (based on "Faserip Combat 02.txt")
const POWER_RANGE_VALUES = {
  "Shift-0": 0, "Feeble": 0, "Poor": 1, "Typical": 2, "Good": 4,
  "Excellent": 6, "Remarkable": 8, "Incredible": 10, "Amazing": 20,
  "Monstrous": 40, "Unearthly": 60, "Shift X": 80, "Shift Y": 160,
  "Shift Z": 400,
  // Converted miles to areas (1 mile = 1760 yards/areas)
  "Class 1000": 176000,   // 100 miles
  "Class 3000": 17600000, // 10,000 miles
  "Class 5000": 1760000000, // 1,000,000 miles
  "Beyond": Infinity      // Unlimited
};

// ============================================
// MAIN CLASS DEFINITION
// ============================================
export class FaseripRolls {
  /**
  * Roll a power
  * @param {Actor} actor - The actor who owns the power
  * @param {Item} power - The power item to roll
  * @param {Object} options - Optional configuration for the roll
  */
  static async rollPower(actor, power, options = {}) {
    if (!actor || !power) {
      ui.notifications.error("Actor or power not found");
      return;
    }

    // Define action types and results based on color
    const ACTIONS = {
      "Blunt Attack (BA)": { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
      "Edged Attack (EA)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
      "Shooting Attack (Sh)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
      "Throwing Edged (TE)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
      "Throwing Blunt (TB)": { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" },
      "Energy (En)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
      "Force (Fo)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
      "Grappling (GP)": { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" },
      "Grabbing (Gb)": { white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
      "Escaping (ES)": { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
      "Mental Attack": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" },
      "General Power Use": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" }
    };
    
    // Get saved power settings or use defaults
    const savedActionType = power.getFlag("msh-faserip", "lastActionType");
    const validActionType = Object.keys(ACTIONS).includes(savedActionType) ? savedActionType : "General Power Use";
    const savedColumnShift = power.getFlag("msh-faserip", "lastColumnShift") || 0;
    const savedDamageCS = power.getFlag("msh-faserip", "lastDamageCS") || 0; // Add this line
    const savedDamageType = power.getFlag("msh-faserip", "lastDamageType") || "Energy-Energy"; // Add this line
    const skipDiceRoll = power.getFlag("msh-faserip", "skipDiceRoll") || false;

    // --- INITIAL DISTANCE FOR DIALOG ---
    let initialDistance = 0;
    const targetTokenForInitialDialog = game.user.targets.first();
    if (targetTokenForInitialDialog && canvas.tokens.controlled.length > 0) {
      const controlledToken = canvas.tokens.controlled[0];
      const ray = new foundry.canvas.geometry.Ray(controlledToken.center, targetTokenForInitialDialog.center);
      initialDistance = Math.round(ray.distance / canvas.scene.grid.size);
    }
    // --- END INITIAL DISTANCE ---

    // If this is a direct roll (macro called with options or dialog submitted)
    // Check if CTRL is pressed or if this is a direct roll call
    if (options.useDirectRoll || game.keyboard.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL)) {
      // Optional notification that CTRL quick roll is being used
      if (game.keyboard.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL)) {
        ui.notifications.info("Quick roll with saved settings (CTRL pressed)");
      }
      // Use provided options from dialog or direct call
      const actionType = options.actionType || savedActionType;
      const rawColumnShift = options.columnShift ?? savedColumnShift;
      const karma = options.karma || 0;
      const skipDice = options.skipDice ?? skipDiceRoll;
      const damageCS = options.damageCS ?? savedDamageCS;
      const damageType = options.damageType || savedDamageType;

      // --- RECALCULATE RANGE PENALTY FOR THE ACTUAL ROLL ---
      const currentTarget = game.user.targets.first();
      const powerRangeData = calculatePowerRangeInfo(actor, power, currentTarget);

      // Check if out of range first
      if (powerRangeData.outOfRange) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `
            <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px;">
              <div style="padding: 5px 10px; color: #cc0000; font-weight: bold; font-size: 1.1em;">
                ${power.name} - OUT OF RANGE
              </div>
              <div style="padding: 5px 10px;">
                Target is ${powerRangeData.distance} areas away, but ${power.name} has base range of ${powerRangeData.maxRange} areas.
              </div>
            </div>
          `
        });
        return { outOfRange: true };
      }

      const powerRangePenalty = powerRangeData.penalty;
      const powerRangeInfo = powerRangeData.info;
      // --- END RECALCULATE ---

      let totalColumnShift = rawColumnShift - powerRangePenalty; // Apply range penalty here
      // Apply -4CS penalty for multiple adjacent targets
      if (options.multiAdjacent) {
        totalColumnShift -= 4;
        console.log("Applied -4CS penalty for multiple adjacent targets");
      }

      // Get the power's rank and value
      const powerRank = power.system.rank || "Typical"; // ADD THIS LINE
      const powerValue = power.system.value || 6;

      // Apply column shifts to get effective rank
      let effectiveRank = powerRank;
      if (totalColumnShift !== 0) { // Use totalColumnShift here
        const ranks = [
          "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
          "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
          "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
        ];
        const index = ranks.indexOf(powerRank);
        if (index !== -1) {
          const newIndex = Math.min(Math.max(index + totalColumnShift, 0), ranks.length - 1); // Use totalColumnShift here
          effectiveRank = ranks[newIndex];
          console.log(`Applied ${totalColumnShift} column shifts to ${powerRank}, now ${effectiveRank}`);
        }
      }

      // Calculate damage rank based on damage CS
      const damageRankResult = damageCS ? applyColumnShiftToRank(powerRank, powerValue, damageCS) : null;
      const damageRankName = damageRankResult?.rank;
      const damageRankValue = damageRankResult?.value;

      // Create the roll
      const roll = new Roll("1d100");

      // Evaluate the roll
      await roll.evaluate();

      // Display the dice roll with flavor text if not skipped
      if (!skipDice) {
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          flavor: `${actor.name} uses ${power.name}`,
          rollMode: game.settings.get("core", "rollMode")
        });
      }

      // Calculate the result
      let cappedTotal = roll.total;
      let karmaUsed = 0;

// <-- NEW/MODIFIED SECTION START -->
      const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
      let dailyKarmaUsedAmount = 0;
      let lifetimeKarmaUsedAmount = 0;

      if (karma > 0) {
        if (dailyKarmaEnabled && actor.system.karma.dailyKarmaUsed < actor.system.karma.dailyKarmaMax) {
          const dailyKarmaRemaining = actor.system.karma.dailyKarmaMax - actor.system.karma.dailyKarmaUsed;
          const karmaFromDaily = Math.min(karma, dailyKarmaRemaining);
          
          dailyKarmaUsedAmount = karmaFromDaily;
          karmaUsed += karmaFromDaily;

          await runAsGM({
            operation: 'update',
            targetActorUuid: actor.uuid,
            args: [{ "system.karma.dailyKarmaUsed": actor.system.karma.dailyKarmaUsed + dailyKarmaUsedAmount }]
          });

          const remainingKarmaToSpend = karma - karmaFromDaily;
          if (remainingKarmaToSpend > 0) {
            cappedTotal = Math.min(100, roll.total + remainingKarmaToSpend);
            lifetimeKarmaUsedAmount = cappedTotal - roll.total;
            karmaUsed += lifetimeKarmaUsedAmount;
          } else {
            cappedTotal = Math.min(100, roll.total + karmaFromDaily);
          }
        } else {
          cappedTotal = Math.min(100, roll.total + karma);
          lifetimeKarmaUsedAmount = cappedTotal - roll.total;
          karmaUsed = cappedTotal - roll.total; // Corrected to only add to karmaUsed if lifetime karma used
        }
      } else {
        cappedTotal = roll.total;
      }

      const historyUpdates = [];
      if (dailyKarmaUsedAmount > 0) {
        historyUpdates.push({
          realDate: new Date().toLocaleDateString(),
          gameDate: "",
          amount: -dailyKarmaUsedAmount,
          type: "Daily Roll",
          description: `Spent daily karma on ${power.name}`
        });
      }
      if (lifetimeKarmaUsedAmount > 0) {
        historyUpdates.push({
          realDate: new Date().toLocaleDateString(),
          gameDate: "",
          amount: -lifetimeKarmaUsedAmount,
          type: "Die Roll",
          description: `Spent lifetime karma on ${power.name}`
        });
      }

      if (historyUpdates.length > 0) {
        const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
        const newHistory = currentHistory.concat(historyUpdates);
        
        await runAsGM({
          operation: 'update',
          targetActorUuid: actor.uuid,
          args: [{ "system.karma.history": newHistory }]
        });
        await FaseripRolls._updateCurrentKarma(actor); // Update displayed karma
      }
      
      // <-- NEW/MODIFIED SECTION END -->

      // DEBUG: Log the universal table call
      console.log("🎲 DEBUG: About to call rollUniversalTable");
      console.log("🎲 DEBUG: effectiveRank:", effectiveRank);
      console.log("🎲 DEBUG: cappedTotal:", cappedTotal);
      console.log("🎲 DEBUG: Original roll:", roll.total);
      console.log("🎲 DEBUG: Karma used:", karmaUsed);
      console.log("🎲 DEBUG: Power rank:", powerRank);
      console.log("🎲 DEBUG: Total column shift:", totalColumnShift);

      const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);

      console.log("🎲 DEBUG: rollUniversalTable returned:", resultColor);
      console.log("🎲 DEBUG: resultColor.toLowerCase():", resultColor.toLowerCase());

      // Get the result text based on action type and color

      // Get the result text based on action type and color
      let resultText = "";
      if (ACTIONS[actionType]) {
        resultText = ACTIONS[actionType][resultColor.toLowerCase()];
      } else {
        resultText = resultColor.toUpperCase();
      }

      // Create chat message styled to match screenshot
      let content = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${actor.name} - ${power.name} (${actionType})</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Base Rank: ${powerRank} (${powerValue})</div>
            <div>Column Shift: ${totalColumnShift > 0 ? "+" : ""}${totalColumnShift} → ${effectiveRank}</div>
            ${powerRangeInfo}
            ${damageCS !== 0 && damageRankName
              ? `<div>Damage Column Shift: ${damageCS > 0 ? "+" : ""}${damageCS}CS → <strong>${damageRankName} (${damageRankValue})</strong></div>`
              : ""}
            <div>Roll: ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8 !important' :
            resultColor.toLowerCase() === 'green' ? '#4CAF50 !important' :
              resultColor.toLowerCase() === 'yellow' ? '#FFC107 !important' :
                '#F44336 !important'};
            color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
            ${resultText} (${resultColor.toUpperCase()})
          </div>
        </div>
      `;

      // Send to chat
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: content
      });

      // COMBAT HANDLER INTEGRATION
      // Check if we have target(s) to apply damage to
      if (options.multiAdjacent && game.user.targets.size > 1) {
        // Multiple adjacent targets - single roll with -4CS, applied to all
        const targets = Array.from(game.user.targets);
        console.log(`Processing multiple adjacent targets: ${targets.map(t => t.name).join(', ')}`);
        
        for (const target of targets) {
          if (resultColor.toLowerCase() !== "white") {
            let finalDamageType = damageType;
            if (!finalDamageType) {
              if (actionType.includes("Blunt")) {
                finalDamageType = "Physical-Blunt";
              } else if (actionType.includes("Edged")) {
                finalDamageType = "Physical-Edged";
              } else if (actionType.includes("Force")) {
                finalDamageType = "Force";
              } else if (actionType.includes("Mental")) {
                finalDamageType = "Mental";
              } else if (power.system.type) {
                const powerTypeStr = power.system.type.toLowerCase();
                if (powerTypeStr.includes("force")) {
                  finalDamageType = "Force";
                } else if (powerTypeStr.includes("mental") || powerTypeStr.includes("psi")) {
                  finalDamageType = "Mental";
                } else if (powerTypeStr.includes("phys")) {
                  finalDamageType = "Physical-Blunt";
                } else {
                  finalDamageType = "Energy-Energy";
                }
              }
            }
            
            const canBeStun = actionType.includes("Blunt") || 
                            actionType.includes("Force") || 
                            resultText.toLowerCase().includes("stun");
            
            const canBeSlam = actionType.includes("Blunt") || 
                            resultText.toLowerCase().includes("slam");
            
            const canBeKill = actionType.includes("Edged") || 
                    actionType.includes("Energy") || 
                    actionType.includes("Shooting");
            
            //const baseDamage = damageCS && damageRankValue ? damageRankValue : powerValue;
            let baseDamage;
            if (actionType.includes("Blunt")) {
              baseDamage = actor.system.abilities.strength.value || 0;
            } else {
              baseDamage = damageCS && damageRankValue ? damageRankValue : powerValue;
            }
            
            await game.msh.CombatHandler.processAttack({
              attacker: actor,
              target: target.actor,
              baseDamage: baseDamage,
              damageType: finalDamageType,
              sourceName: power.name,
              canBeStun,
              canBeSlam,
              canBeKill,
              originalRollResult: resultColor.toLowerCase()
            });
          }
        }
      } else if (options.multiAttacks) {
        // Handle multiple attacks (this will be more complex)
        console.log("Multiple attacks not yet implemented");
        ui.notifications.info("Multiple attacks feature not yet implemented.");
      } else {
        // Single target (existing code)
        const target = game.user.targets.first()?.actor;

        if (target && resultColor.toLowerCase() !== "white") {
          let finalDamageType = damageType;
          if (!finalDamageType) {
            if (actionType.includes("Blunt")) {
              finalDamageType = "Physical-Blunt";
            } else if (actionType.includes("Edged")) {
              finalDamageType = "Physical-Edged";
            } else if (actionType.includes("Force")) {
              finalDamageType = "Force";
            } else if (actionType.includes("Mental")) {
              finalDamageType = "Mental";
            } else if (power.system.type) {
              const powerTypeStr = power.system.type.toLowerCase();
              if (powerTypeStr.includes("force")) {
                finalDamageType = "Force";
              } else if (powerTypeStr.includes("mental") || powerTypeStr.includes("psi")) {
                finalDamageType = "Mental";
              } else if (powerTypeStr.includes("phys")) {
                finalDamageType = "Physical-Blunt";
              } else {
                finalDamageType = "Energy-Energy";
              }
            }
          }
          
          const canBeStun = actionType.includes("Blunt") || 
                          actionType.includes("Force") || 
                          resultText.toLowerCase().includes("stun");
          
          const canBeSlam = actionType.includes("Blunt") || 
                          resultText.toLowerCase().includes("slam");
          
          const canBeKill = actionType.includes("Edged") || 
                  actionType.includes("Energy") || 
                  actionType.includes("Shooting");
          
          // FIX: Blunt attacks use Strength for damage, not power value
          let baseDamage;
          if (actionType.includes("Blunt")) {
            baseDamage = actor.system.abilities.strength.value || 0;
          } else {
            baseDamage = damageCS && damageRankValue ? damageRankValue : powerValue;
          }
          
          await game.msh.CombatHandler.processAttack({
            attacker: actor,
            target: target,
            baseDamage: baseDamage,
            damageType: finalDamageType,
            sourceName: power.name,
            canBeStun,
            canBeSlam,
            canBeKill,
            originalRollResult: resultColor.toLowerCase()
          });
        } else if (resultColor.toLowerCase() !== "white" && !target) {
          ui.notifications.info("No target selected. Damage not applied.");
        }
      }

      return { roll, resultColor, resultText };
    } else {
      // First call - show dialog to select options
      // Define action types from the Universal Table
      /* const ACTIONS = {
        "Blunt Attack (BA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" } },
        "Edged Attack (EA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" } },
        "Shooting Attack (Sh)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" } },
        "Throwing Edged (TE)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" } },
        "Throwing Blunt (TB)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" } },
        "Energy (En)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" } },
        "Force (Fo)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" } },
        "Grappling (GP)": { ability: "strength", results: { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" } },
        "Grabbing (Gb)": { ability: "strength", results: { white: "Miss", green: "Take", yellow: "Grab", red: "Break" } },
        "Escaping (ES)": { ability: "strength", results: { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" } },
        "Mental Attack": { ability: "psyche", results: { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" } },
        "General Power Use": { ability: "none", results: { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" } }
      }; */

      // Determine the default damage type based on power type
      let defaultDamageType = "Energy-Energy";
      if (power.system.type) {
        const powerTypeStr = power.system.type.toLowerCase();
        if (powerTypeStr.includes("force")) {
          defaultDamageType = "Force";
        } else if (powerTypeStr.includes("mental") || powerTypeStr.includes("psi")) {
          defaultDamageType = "Mental";
        } else if (powerTypeStr.includes("phys")) {
          defaultDamageType = "Physical-Blunt";
        }
      }

    const powerType = power.system.type?.toLowerCase() || "";
    const powerSpecialty = power.system.specialty?.toLowerCase() || "";

    const isNonCombatPower = powerType.includes("mental") || powerType.includes("scientific") || powerType.includes("mystic");

    const isSelected = (type) => {
      if (savedDamageType === type) return true;
      if (type === "None" && isNonCombatPower) return true;
      return false;
    };

    // --- RECALCULATE powerRangeInfo FOR DIALOG CONTENT ---
    const initialTarget = game.user.targets.first();
    const dialogRangeData = calculatePowerRangeInfo(actor, power, initialTarget);
    const dialogPowerRangeInfo = dialogRangeData.info;
    // --- END RECALCULATE ---

    // Create dialog for roll options
    // Enhanced dialog content with multiple target/attack options
    let dialogContent = `
      <div style="background: #f0e8d8; padding: 10px; border-radius: 5px;">
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Action Type:</label>
          <select id="action" name="action" style="width: 180px;">
            ${Object.keys(ACTIONS).map(action =>
              `<option value="${action}" ${action === validActionType ? 'selected' : ''}>
                ${action}
              </option>`
            ).join('')}
          </select>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Power Range:</label>
          <input type="text" value="${POWER_RANGE_VALUES[power.system.rank || 'Typical']} areas" style="width: 80px;" readonly>
          <span style="color: #666; font-size: 0.9em;">(${power.system.rank || 'Typical'} rank)</span>
        </div>
        <div style="margin-bottom: 10px;">
          <div style="padding: 5px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 3px; font-size: 0.9em;">
            ${dialogPowerRangeInfo}
          </div>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Column Shift:</label>
          <input type="number" id="shift" name="shift" value="${savedColumnShift}" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
        </div>
        
        <!-- Multiple Target Options -->
        <div style="margin-bottom: 10px; padding: 8px; background: #e8f4f8; border: 1px solid #b8d4da; border-radius: 3px;">
          <div style="font-weight: bold; margin-bottom: 5px; color: #2c5aa0;">Multiple Target Options:</div>
          <div style="margin-bottom: 5px;">
            <label>
              <input type="checkbox" id="multi-adjacent" name="multiAdjacent" style="margin-right: 5px;">
              Multiple Adjacent Targets (-4CS, single roll affects all)
            </label>
            <div id="multi-adjacent-note" style="font-size: 0.8em; color: #666; margin-left: 20px; display: none;">
              Valid for: Blunt, Escaping, Energy, Force attacks only
            </div>
          </div>
          <div style="margin-bottom: 5px;">
            <label>
              <input type="checkbox" id="multi-attacks" name="multiAttacks" style="margin-right: 5px;">
              Multiple Attacks (requires Fighting FEAT)
            </label>
            <div id="multi-attacks-options" style="margin-left: 20px; display: none;">
              <label style="display: block; margin: 3px 0;">
                <input type="radio" name="attackCount" value="2" checked style="margin-right: 5px;">
                2 Attacks (Remarkable FEAT, -1CS each)
              </label>
              <label style="display: block; margin: 3px 0;">
                <input type="radio" name="attackCount" value="3" style="margin-right: 5px;">
                3 Attacks (Amazing FEAT, -1CS each)
              </label>
            </div>
            <div id="multi-attacks-note" style="font-size: 0.8em; color: #666; margin-left: 20px; display: none;">
              Valid for: Slugfest and Shooting attacks only
            </div>
          </div>
        </div>
        
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Damage CS:</label>
          <input type="number" id="damage-cs" name="damageCs" value="${savedDamageCS}" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(modifies damage rank)</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Damage Type:</label>
          <select id="damage-type" name="damageType" style="width: 180px;">
            <option value="None" ${isSelected("None") ? "selected" : ""}>No Damage</option>
            <option value="Physical-Blunt" ${isSelected("Physical-Blunt") ? "selected" : ""}>Physical (Blunt)</option>
            <option value="Physical-Edged" ${isSelected("Physical-Edged") ? "selected" : ""}>Physical (Edged)</option>
            <option value="Energy-Energy" ${isSelected("Energy-Energy") ? "selected" : ""}>Energy</option>
            <option value="Force" ${isSelected("Force") ? "selected" : ""}>Force</option>
            <option value="Mental" ${isSelected("Mental") ? "selected" : ""}>Mental</option>
          </select>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Karma Points:</label>
          <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
        </div>
        <div>
          <label>
            <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
            Skip dice animation
          </label>
        </div>
        <div style="margin-top: 10px;">
          <label>
            <input type="checkbox" id="save-settings" name="saveSettings" checked> 
            Remember these settings for future rolls
          </label>
        </div>
      </div>`;


      return new Dialog({
        title: `Power Roll: ${power.name} (${power.system.rank})`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const actionType = html.find('[name="action"]').val();
              const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
              const damageCS = parseInt(html.find('[name="damageCs"]').val()) || 0;
              const damageType = html.find('[name="damageType"]').val();
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const skipDice = html.find('[name="skipDice"]').is(':checked');
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');
              
              // Get multiple target/attack options
              const multiAdjacent = html.find('[name="multiAdjacent"]').is(':checked');
              const multiAttacks = html.find('[name="multiAttacks"]').is(':checked');
              const attackCount = parseInt(html.find('[name="attackCount"]:checked').val()) || 2;

              console.log("=== DIALOG CALLBACK DEBUG ===");
              console.log("multiAdjacent:", multiAdjacent);
              console.log("multiAttacks:", multiAttacks);
              console.log("attackCount:", attackCount);
              console.log("Selected targets:", Array.from(game.user.targets).map(t => t.name));
              console.log("=============================");

              // Extract action code from action type
              const actionCodeMatch = actionType.match(/\(([^)]+)\)/);
              const actionCode = actionCodeMatch ? actionCodeMatch[1] : actionType.split(' ')[0].substring(0, 2).toUpperCase();
              
              // VALIDATE MULTIPLE ADJACENT TARGETS
              if (multiAdjacent) {
                // Check if action type is valid
                if (!isValidMultiTargetAttack(actionCode)) {
                  ui.notifications.warn(`${actionType} cannot be used for multiple adjacent targets!`);
                  return;
                }
                
                const targetTokens = Array.from(game.user.targets);
                if (targetTokens.length < 2) {
                  ui.notifications.warn("Multiple adjacent targets requires at least 2 targets selected!");
                  return;
                }
                
                const attackerToken = canvas.tokens.controlled[0];
                if (!attackerToken) {
                  ui.notifications.warn("No attacker token selected!");
                  return;
                }
                
                const validation = validateAdjacentTargets(attackerToken, targetTokens);
                if (!validation.valid) {
                  ui.notifications.warn(`Some targets are not adjacent: ${validation.invalidTargets.map(t => t.name).join(', ')}`);
                  return;
                }
              }

              // VALIDATE MULTIPLE ATTACKS
              if (multiAttacks) {
                // Check if action type is valid
                if (!isValidMultipleAttack(actionCode)) {
                  ui.notifications.warn(`${actionType} cannot be used for multiple attacks!`);
                  return;
                }
                
                // Need at least one target
                if (game.user.targets.size === 0) {
                  ui.notifications.warn("Select at least one target for multiple attacks!");
                  return;
                }
              }

              // Mutual exclusion check
              if (multiAdjacent && multiAttacks) {
                ui.notifications.warn("Cannot use both multiple adjacent targets and multiple attacks at the same time!");
                return;
              }

              // Save settings if requested
              if (saveSettings) {
                await power.setFlag("msh-faserip", "lastActionType", actionType);
                await power.setFlag("msh-faserip", "lastColumnShift", columnShift);
                await power.setFlag("msh-faserip", "lastDamageCS", damageCS);
                await power.setFlag("msh-faserip", "lastDamageType", damageType);
                await power.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              }

              // Handle multiple attacks first (requires Fighting FEAT)
              if (multiAttacks) {
                return await processMultipleAttackSequence(actor, power, {
                  actionType,
                  columnShift,
                  damageCS,
                  damageType,
                  karma,
                  skipDice,
                  attackCount
                });
              }

              // Call this method again but with the gathered options
              return FaseripRolls.rollPower(actor, power, {
                useDirectRoll: true,
                actionType: actionType,
                columnShift: columnShift,
                damageCS: damageCS,
                damageType: damageType,
                karma: karma,
                skipDice: skipDice,
                multiAdjacent: multiAdjacent,
                multiAttacks: multiAttacks,
                attackCount: attackCount
              });
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll",
        render: (html) => {
          // Get references to the multiple target elements
          const actionSelect = html.find('#action');
          const multiAdjacentCheckbox = html.find('#multi-adjacent');
          const multiAttacksCheckbox = html.find('#multi-attacks');
          const multiAttacksOptions = html.find('#multi-attacks-options');

          // Function to update option availability based on action type
          function updateMultiOptions() {
            const selectedAction = actionSelect.val();
            
            // Extract action code from the selected action
            const actionCodeMatch = selectedAction.match(/\(([^)]+)\)/);
            const actionCode = actionCodeMatch ? actionCodeMatch[1] : selectedAction.split(' ')[0].substring(0, 2).toUpperCase();
            
            console.log("🎨 updateMultiOptions called with action:", selectedAction, "code:", actionCode);
            
            // Check if action is valid for multiple adjacent targets
            const validMultiTarget = isValidMultiTargetAttack(actionCode);
            const validMultiAttack = isValidMultipleAttack(actionCode);
            
            console.log("🎨 validMultiTarget:", validMultiTarget);
            console.log("🎨 validMultiAttack:", validMultiAttack);
            
            multiAdjacentCheckbox.prop('disabled', !validMultiTarget);
            if (!validMultiTarget) {
              multiAdjacentCheckbox.prop('checked', false);
            }
            
            multiAttacksCheckbox.prop('disabled', !validMultiAttack);
            if (!validMultiAttack) {
              multiAttacksCheckbox.prop('checked', false);
              multiAttacksOptions.hide();
            }
          }

          // Mutual exclusion: if one is checked, disable the other
          multiAdjacentCheckbox.on('change', function() {
            console.log("🎨 multiAdjacent checkbox changed:", this.checked);
            if (this.checked) {
              multiAttacksCheckbox.prop('disabled', true).prop('checked', false);
              multiAttacksOptions.hide();
            } else {
              const selectedAction = actionSelect.val();
              const actionCodeMatch = selectedAction.match(/\(([^)]+)\)/);
              const actionCode = actionCodeMatch ? actionCodeMatch[1] : selectedAction.split(' ')[0].substring(0, 2).toUpperCase();
              const validMultiAttack = isValidMultipleAttack(actionCode);
              multiAttacksCheckbox.prop('disabled', !validMultiAttack);
            }
          });

          multiAttacksCheckbox.on('change', function() {
            console.log("🎨 multiAttacks checkbox changed:", this.checked);
            if (this.checked) {
              multiAdjacentCheckbox.prop('disabled', true).prop('checked', false);
              multiAttacksOptions.show();
            } else {
              multiAttacksOptions.hide();
              const selectedAction = actionSelect.val();
              const actionCodeMatch = selectedAction.match(/\(([^)]+)\)/);
              const actionCode = actionCodeMatch ? actionCodeMatch[1] : selectedAction.split(' ')[0].substring(0, 2).toUpperCase();
              const validMultiTarget = isValidMultiTargetAttack(actionCode);
              multiAdjacentCheckbox.prop('disabled', !validMultiTarget);
            }
          });

          // Update options when action type changes
          actionSelect.on('change', updateMultiOptions);
          
          // Initial update
          updateMultiOptions();
        }
      }).render(true);
    }
  }
  

  /**
   * Roll a talent
   * @param {Actor} actor - The actor who owns the talent
   * @param {Item} talent - The talent item to roll
   * @param {Object} options - Optional configuration for the roll
   */
  static async rollTalent(actor, talent, options = {}) {
    if (!actor || !talent) {
      ui.notifications.error("Actor or talent not found");
      return;
    }

    // Get talent bonus as column shift value
    let talentBonus = 0;
    switch (talent.system.bonus) {
      case "+1CS": talentBonus = 1; break;
      case "+2CS": talentBonus = 2; break;
      case "+3CS": talentBonus = 3; break;
      case "Special": talentBonus = 1; break; // Default for special
      default: talentBonus = 0;
    }

    // Get saved talent settings
    const savedActionType = talent.getFlag("msh-faserip", "lastActionType") || "";
    const savedExtraShift = talent.getFlag("msh-faserip", "lastExtraShift") || 0;
    const savedDamageCS = talent.getFlag("msh-faserip", "lastDamageCS") || 0;
    const savedDamageType = talent.getFlag("msh-faserip", "lastDamageType") || "Physical-Blunt";
    const skipDiceRoll = talent.getFlag("msh-faserip", "skipDiceRoll") || false;

    // If this is a direct roll (called after dialog or with options)
    // Check if CTRL is pressed or if this is a direct roll call
    if (options.useDirectRoll || game.keyboard.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL)) {
      // Optional notification that CTRL quick roll is being used
      if (game.keyboard.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL)) {
        ui.notifications.info("Quick roll with saved settings (CTRL pressed)");
      }
      // Use provided options from dialog or direct call
      const actionType = options.actionType || savedActionType;
      const extraShift = options.extraShift ?? savedExtraShift;
      const damageCS = options.damageCS ?? savedDamageCS;
      const damageType = options.damageType || savedDamageType;
      const karma = options.karma || 0;
      const skipDice = options.skipDice ?? skipDiceRoll;

      // Total column shift is talent bonus plus any extra shifts
      let totalColumnShift = talentBonus + extraShift;

      if (options.multiAdjacent) {
        totalColumnShift -= 4;
        console.log("Applied -4CS penalty for multi-adjacent talent attack");
      }

      // Get ability information
      let abilityModified = talent.system.abilityModified;
      let abilityRank = abilityModified ? actor.system.abilities[abilityModified].rank : "Typical";
      let abilityValue = abilityModified ? actor.system.abilities[abilityModified].value : 6;

      // Apply column shifts to get effective rank
      let effectiveRank = abilityRank;
      if (totalColumnShift !== 0) {
        const ranks = [
          "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
          "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
          "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
        ];
        const index = ranks.indexOf(abilityRank);
        if (index !== -1) {
          const newIndex = Math.min(Math.max(index + totalColumnShift, 0), ranks.length - 1);
          effectiveRank = ranks[newIndex];
          console.log(`Applied ${totalColumnShift} column shifts to ${abilityRank}, now ${effectiveRank}`);
        }
      }

      // Calculate damage rank based on damage CS
      const damageRankResult = damageCS ? applyColumnShiftToRank(abilityRank, abilityValue, damageCS) : null;
      const damageRankName = damageRankResult?.rank;
      const damageRankValue = damageRankResult?.value;

      // Create the roll
      const roll = new Roll("1d100");

      // Evaluate the roll
      await roll.evaluate();

      // Display the dice roll with flavor text if not skipped
      if (!skipDice) {
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          flavor: `${actor.name} uses ${talent.name}`,
          rollMode: game.settings.get("core", "rollMode")
        });
      }

      // Calculate the result
      let cappedTotal = roll.total;
      let karmaUsed = 0;

// <-- NEW/MODIFIED SECTION START -->
      const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
      let dailyKarmaUsedAmount = 0;
      let lifetimeKarmaUsedAmount = 0;

      if (karma > 0) {
        if (dailyKarmaEnabled && actor.system.karma.dailyKarmaUsed < actor.system.karma.dailyKarmaMax) {
          const dailyKarmaRemaining = actor.system.karma.dailyKarmaMax - actor.system.karma.dailyKarmaUsed;
          const karmaFromDaily = Math.min(karma, dailyKarmaRemaining);
          
          dailyKarmaUsedAmount = karmaFromDaily;
          karmaUsed += karmaFromDaily;

          await runAsGM({
            operation: 'update',
            targetActorUuid: actor.uuid,
            args: [{ "system.karma.dailyKarmaUsed": actor.system.karma.dailyKarmaUsed + dailyKarmaUsedAmount }]
          });

          const remainingKarmaToSpend = karma - karmaFromDaily;
          if (remainingKarmaToSpend > 0) {
            cappedTotal = Math.min(100, roll.total + remainingKarmaToSpend);
            lifetimeKarmaUsedAmount = cappedTotal - roll.total;
            karmaUsed += lifetimeKarmaUsedAmount;
          } else {
            cappedTotal = Math.min(100, roll.total + karmaFromDaily);
          }
        } else {
          cappedTotal = Math.min(100, roll.total + karma);
          lifetimeKarmaUsedAmount = cappedTotal - roll.total;
          karmaUsed = lifetimeKarmaUsedAmount;
        }
      } else {
        cappedTotal = roll.total;
      }

      const historyUpdates = [];
      if (dailyKarmaUsedAmount > 0) {
        historyUpdates.push({
          realDate: new Date().toLocaleDateString(),
          gameDate: "",
          amount: -dailyKarmaUsedAmount,
          type: "Daily Roll",
          description: `Spent daily karma on ${talent.name} (Talent)`
        });
      }
      if (lifetimeKarmaUsedAmount > 0) {
        historyUpdates.push({
          realDate: new Date().toLocaleDateString(),
          gameDate: "",
          amount: -lifetimeKarmaUsedAmount,
          type: "Die Roll",
          description: `Spent lifetime karma on ${talent.name} (Talent)`
        });
      }

      if (historyUpdates.length > 0) {
        const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
        const newHistory = currentHistory.concat(historyUpdates);
        
        await runAsGM({
          operation: 'update',
          targetActorUuid: actor.uuid,
          args: [{ "system.karma.history": newHistory }]
        });
        await FaseripRolls._updateCurrentKarma(actor); // Update displayed karma
      }
      // <-- NEW/MODIFIED SECTION END -->

      const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);

      // Format ability name for display
      const abilityName = abilityModified ?
        abilityModified.charAt(0).toUpperCase() + abilityModified.slice(1) :
        "None";

      // Define action types and results based on color
      const ACTIONS = {
        // Combat results
        "Blunt Attack (BA)": { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
        "Edged Attack (EA)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
        "Shooting Attack (Sh)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
        "Throwing Edged (TE)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
        "Throwing Blunt (TB)": { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" },
        "Energy (En)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
        "Force (Fo)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
        "Grappling (GP)": { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" },
        "Grabbing (Gb)": { white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
        "Escaping (ES)": { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },

        // Non-combat results
        "Knowledge Check": { white: "No Knowledge", green: "Basic Knowledge", yellow: "Good Knowledge", red: "Expert Knowledge" },
        "Practical Application": { white: "Failure", green: "Basic Success", yellow: "Good Success", red: "Excellent Success" },
        "Analysis": { white: "Failed Analysis", green: "Basic Analysis", yellow: "Detailed Analysis", red: "Complete Analysis" },
        "Research": { white: "No Results", green: "Basic Results", yellow: "Good Results", red: "Breakthrough" },
        "Technical Application": { white: "Failure", green: "Works Minimally", yellow: "Works Well", red: "Works Perfectly" },
        "Mental Power": { white: "No Effect", green: "Minor Effect", yellow: "Moderate Effect", red: "Major Effect" },
        "Mystical Knowledge": { white: "No Insight", green: "Minor Insight", yellow: "Significant Insight", red: "Complete Insight" },
        "Skill Use": { white: "Failure", green: "Basic Success", yellow: "Good Success", red: "Excellent Success" }
      };

      // Get the result text - if action type doesn't have specific results, use color names
      let resultText = "";
      if (ACTIONS[actionType]) {
        resultText = ACTIONS[actionType][resultColor.toLowerCase()];
      } else {
        resultText = resultColor.toUpperCase();
      }

      // Create chat message styled to match screenshot
      let content = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${actor.name} - ${abilityName} Roll (${actionType})</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Base Rank: ${abilityRank} (${abilityValue})</div>
            <div>Column Shift: ${totalColumnShift} → ${effectiveRank}</div>
            ${damageCS !== 0 && damageRankName
              ? `<div>Damage Column Shift: ${damageCS > 0 ? "+" : ""}${damageCS}CS → <strong>${damageRankName} (${damageRankValue})</strong></div>`
              : ""}
            <div>Roll: ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; background-color: ${
            resultText.toLowerCase().includes('partial') ? '#FFC107' :
            resultText.toLowerCase().includes('hold') ? '#F44336' :
            resultText.toLowerCase().includes('escape') ? '#FFC107' :
            resultText.toLowerCase().includes('reverse') ? '#F44336' :
            resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
            resultColor.toLowerCase() === 'green' ? '#4CAF50' :
            resultColor.toLowerCase() === 'yellow' ? '#FFC107' :
            '#F44336'
          }; color: ${
            resultText.toLowerCase().includes('partial') || 
            resultText.toLowerCase().includes('escape') ||
            resultColor.toLowerCase() === 'white' || 
            resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'
          };">
            ${resultText} (${resultColor.toUpperCase()})
          </div>
        </div>
        `;

      // Send to chat
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: content
      });

      // --- COMBAT HANDLER INTEGRATION ---
      const wrestlingActions = ["Grappling (GP)", "Grabbing (Gb)", "Escaping (ES)"];
      const isCombatAction = actionType.toLowerCase().includes("attack") || wrestlingActions.includes(actionType);

      if (resultColor.toLowerCase() !== "white" && isCombatAction) {
        // Skip damage processing if damage type is "None"
        if (damageType === "None") {
          return { roll, resultColor, resultText };
        }

        if (options.multiAdjacent && game.user.targets.size > 1) {
          const targets = Array.from(game.user.targets);
          for (const targetToken of targets) {
            const targetActor = targetToken.actor;
            if (targetActor) {
              let finalDamageType = damageType;
              if (!finalDamageType) {
                if (actionType.includes("Blunt")) {
                  finalDamageType = "Physical-Blunt";
                } else if (actionType.includes("Edged")) {
                  finalDamageType = "Physical-Edged";
                } else {
                  const talentSpecialty = talent.system.specialty?.toLowerCase() || "";
                  if (talentSpecialty.includes("blunt")) {
                    finalDamageType = "Physical-Blunt";
                  } else if (talentSpecialty.includes("sharp") || talentSpecialty.includes("edged")) {
                    finalDamageType = "Physical-Edged";
                  } else {
                    finalDamageType = "Physical-Blunt";
                  }
                }
              }
              
              const canBeStun = actionType.includes("Blunt") || actionType.includes("Force") || resultText.toLowerCase().includes("stun");
              const canBeSlam = actionType.includes("Blunt") || resultText.toLowerCase().includes("slam");
              const canBeKill = actionType.includes("Edged") || actionType.includes("Energy") || actionType.includes("Shooting");
              const baseDamage = damageCS && damageRankValue ? damageRankValue : abilityValue;
              
              await game.msh.CombatHandler.processAttack({
                attacker: actor, target: targetActor, baseDamage,
                damageType: finalDamageType, sourceName: talent.name,
                canBeStun, canBeSlam, canBeKill, originalRollResult: resultColor.toLowerCase()
              });
            }
          }
        } else {
          const target = game.user.targets.first()?.actor;
          if (target) {
            if (wrestlingActions.includes(actionType)) {
              const actionCode = actionType.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
              await game.msh.CombatHandler.processWrestlingAction({
                attacker: actor, target, actionType: actionCode,
                resultColor: resultColor.toLowerCase(), sourceName: talent.name
              });
            } else {
              let finalDamageType = damageType;
              if (!finalDamageType) {
                if (actionType.includes("Blunt")) {
                  finalDamageType = "Physical-Blunt";
                } else if (actionType.includes("Edged")) {
                  finalDamageType = "Physical-Edged";
                } else {
                  const talentSpecialty = talent.system.specialty?.toLowerCase() || "";
                  if (talentSpecialty.includes("blunt")) {
                    finalDamageType = "Physical-Blunt";
                  } else if (talentSpecialty.includes("sharp") || talentSpecialty.includes("edged")) {
                    finalDamageType = "Physical-Edged";
                  } else {
                    finalDamageType = "Physical-Blunt";
                  }
                }
              }
              
              const canBeStun = actionType.includes("Blunt") || actionType.includes("Force") || resultText.toLowerCase().includes("stun");
              const canBeSlam = actionType.includes("Blunt") || resultText.toLowerCase().includes("slam");
              const canBeKill = actionType.includes("Edged") || actionType.includes("Energy") || actionType.includes("Shooting");
              const baseDamage = damageCS && damageRankValue ? damageRankValue : abilityValue;
              
              await game.msh.CombatHandler.processAttack({
                attacker: actor, target, baseDamage,
                damageType: finalDamageType, sourceName: talent.name,
                canBeStun, canBeSlam, canBeKill, originalRollResult: resultColor.toLowerCase()
              });
            }
          } else {
            ui.notifications.info("No target selected. Effect not applied.");
          }
        }
      }

      return { roll, resultColor, resultText };
    } else {
      // First call - show dialog to select options
      // Define action options based on talent type
      let actionOptions = [];

      // Get talent type and specialty
      const talentType = talent.system.type || "";
      const talentSpecialty = talent.system.specialty || "";

      // Assign appropriate action types based on talent type
      if (talentType === "Weapon Skill") {
        // Weapon skill actions
        if (talentSpecialty === "Blunt Weapons") {
          actionOptions = [
            { value: "Blunt Attack (BA)", label: "Blunt Attack (BA)" }
          ];
        } else if (talentSpecialty === "Sharp Weapons" || talentSpecialty === "Edged Weapons") {
          actionOptions = [
            { value: "Edged Attack (EA)", label: "Edged Attack (EA)" }
          ];
        } else if (talentSpecialty === "Thrown Weapons" || talentSpecialty === "Bows") {
          actionOptions = [
            { value: "Shooting Attack (Sh)", label: "Shooting Attack (Sh)" }
          ];
        } else {
          // Generic weapon options
          actionOptions = [
            { value: "Blunt Attack (BA)", label: "Blunt Attack (BA)" },
            { value: "Edged Attack (EA)", label: "Edged Attack (EA)" },
            { value: "Shooting Attack (Sh)", label: "Shooting Attack (Sh)" }
          ];
        }
      } else if (talentType === "Fighting Skill") {
        // Fighting skill actions
        actionOptions = [
          { value: "Grappling (GP)", label: "Grappling (GP)" },
          { value: "Grabbing (Gb)", label: "Grabbing (Gb)" },
          { value: "Escaping (ES)", label: "Escaping (ES)" },
          { value: "Blunt Attack (BA)", label: "Blunt Attack (BA)" }
        ];
      } else if (talentType === "Professional Skill") {
        // Professional skill actions
        actionOptions = [
          { value: "Knowledge Check", label: "Knowledge Check" },
          { value: "Practical Application", label: "Practical Application" }
        ];
      } else if (talentType === "Scientific Skill") {
        // Scientific skill actions
        actionOptions = [
          { value: "Analysis", label: "Analysis" },
          { value: "Research", label: "Research" },
          { value: "Technical Application", label: "Technical Application" }
        ];
      } else if (talentType === "Mystic/Mental Skill") {
        // Mystic/Mental skill actions
        actionOptions = [
          { value: "Mental Power", label: "Mental Power" },
          { value: "Mystical Knowledge", label: "Mystical Knowledge" }
        ];
      } else {
        // Default/generic options
        actionOptions = [
          { value: "Skill Use", label: "Skill Use" },
          { value: "Knowledge Check", label: "Knowledge Check" }
        ];
      }

      // Create action type options HTML
      const actionOptionsHTML = actionOptions.map(option =>
        `<option value="${option.value}" ${option.value === savedActionType ? 'selected' : ''}>${option.label}</option>`
      ).join('');

      // Get ability information for display
      let abilityModified = talent.system.abilityModified || "none";
      let abilityLabel = abilityModified ?
        abilityModified.charAt(0).toUpperCase() + abilityModified.slice(1) :
        "None";

      // Determine if talent is non-combat (used to default damage type to "None")
      const isNonCombatTalent = ["Professional Skill", "Scientific Skill", "Mystic/Mental Skill"].includes(talentType);

      // Determine default selection for each damage type
      const isSelected = (type) => {
        if (savedDamageType === type) return true;
        if (type === "None" && isNonCombatTalent) return true;
        return false;
      };

      const damageOptionsHTML = `
        <option value="None" ${isSelected("None") ? "selected" : ""}>No Damage</option>
        <option value="Physical-Blunt" ${isSelected("Physical-Blunt") ? "selected" : ""}>Physical (Blunt)</option>
        <option value="Physical-Edged" ${isSelected("Physical-Edged") ? "selected" : ""}>Physical (Edged)</option>
        <option value="Energy-Energy" ${isSelected("Energy-Energy") ? "selected" : ""}>Energy</option>
        <option value="Force" ${isSelected("Force") ? "selected" : ""}>Force</option>
        <option value="Mental" ${isSelected("Mental") ? "selected" : ""}>Mental</option>
      `;

      // Create dialog for roll options
      // Debug the action code extraction
      console.log("🎯 actionOptions[0]:", actionOptions[0]);
      const firstActionCode = actionOptions[0].value.match(/\(([^)]+)\)/)?.[1] || "";
      console.log("🎯 firstActionCode:", firstActionCode);

      // If we still can't extract it, try a fallback
      let actionCodeToUse = firstActionCode;
      if (!actionCodeToUse && actionOptions[0].value.includes("Blunt Attack")) {
        actionCodeToUse = "BA";
      } else if (!actionCodeToUse && actionOptions[0].value.includes("Edged Attack")) {
        actionCodeToUse = "EA";
      } else if (!actionCodeToUse && actionOptions[0].value.includes("Grappling")) {
        actionCodeToUse = "Gp";
      }

      console.log("🎯 actionCodeToUse:", actionCodeToUse);
      const multiTargetOptionsHTML = generateMultiTargetOptionsHTML(actionCodeToUse);
      console.log("🎯 multiTargetOptionsHTML:", multiTargetOptionsHTML);

      // Create dialog for roll options
      let dialogContent = `
        <div id="multi-target-container">${multiTargetOptionsHTML}</div>
        <div style="background: #f0e8d8; padding: 10px; border-radius: 5px;">
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Action Type:</label>
            <select id="action-type" name="actionType" style="width: 180px;">
              ${actionOptionsHTML}
            </select>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Talent Bonus:</label>
            <input type="number" id="talent-bonus" name="talentBonus" value="${talentBonus}" style="width: 50px;" readonly>
            <span style="color: #666; font-size: 0.9em;">(${talent.system.bonus})</span>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Ability Modified:</label>
            <input type="text" id="ability-modified" value="${abilityLabel}" style="width: 120px;" readonly>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Extra Column Shift:</label>
            <input type="number" id="shift" name="shift" value="${savedExtraShift}" style="width: 50px;">
            <span style="color: #666; font-size: 0.9em;">(additional +/- CS)</span>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Damage CS:</label>
            <input type="number" id="damage-cs" name="damageCs" value="${savedDamageCS}" style="width: 50px;">
            <span style="color: #666; font-size: 0.9em;">(modifies damage rank)</span>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Damage Type:</label>
            <select id="damage-type" name="damageType" style="width: 180px;">
              ${damageOptionsHTML}
            </select>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Karma Points:</label>
            <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
          </div>
          <div style="margin-bottom: 10px;">
            <label>
              <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
              Skip dice animation
            </label>
          </div>
          <div style="margin-top: 10px;">
            <label>
              <input type="checkbox" id="save-settings" name="saveSettings" checked> 
              Remember these settings for future rolls
            </label>
          </div>
        </div>`;


      return new Dialog({
        title: `Talent Roll: ${talent.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const actionType = html.find('[name="actionType"]').val();
              const extraShift = parseInt(html.find('[name="shift"]').val()) || 0;
              const damageCS = parseInt(html.find('[name="damageCs"]').val()) || 0;
              const damageType = html.find('[name="damageType"]').val();
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const skipDice = html.find('[name="skipDice"]').is(':checked');
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');
              const multiAdjacent = html.find('[name="multiAdjacent"]').is(':checked');
              const multiAttacks = html.find('[name="multiAttacks"]').is(':checked');
              const attackCount = parseInt(html.find('[name="attackCount"]:checked').val()) || 2;
              
              const actionCode = actionType.match(/\(([^)]+)\)/)?.[1] || "";
              if (multiAdjacent && !isValidMultiTargetAttack(actionCode)) return ui.notifications.warn("This action cannot target multiple adjacent foes.");
              if (multiAttacks && !isValidMultipleAttack(actionCode)) return ui.notifications.warn("This action cannot be used for multiple attacks.");
              if (multiAdjacent && multiAttacks) return ui.notifications.warn("Cannot use both multi-target options at once.");

              // Save settings if requested
              if (saveSettings) {
                await talent.setFlag("msh-faserip", "lastActionType", actionType);
                await talent.setFlag("msh-faserip", "lastExtraShift", extraShift);
                await talent.setFlag("msh-faserip", "lastDamageCS", damageCS);
                await talent.setFlag("msh-faserip", "lastDamageType", damageType);
                await talent.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              }

              if (multiAttacks) {
                return await processMultipleTalentAttackSequence(actor, talent, {
                  actionType, extraShift, damageCS, damageType, karma, skipDice, attackCount
                });
              }

              return FaseripRolls.rollTalent(actor, talent, {
                useDirectRoll: true,
                actionType, extraShift, damageCS, damageType, karma, skipDice, multiAdjacent
              });
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll",
        render: (html) => {
          const actionSelect = html.find('#action-type');
          const multiContainer = html.find('#multi-target-container');

          function updateMultiOptions() {
            const selectedAction = actionSelect.val();
            const actionCode = selectedAction.match(/\(([^)]+)\)/)?.[1] || "";
            const newOptionsHTML = generateMultiTargetOptionsHTML(actionCode);
            multiContainer.html(newOptionsHTML);
            
            const multiAdjacentCheckbox = multiContainer.find('#multi-adjacent');
            const multiAttacksCheckbox = multiContainer.find('#multi-attacks');
            const multiAttacksOptions = multiContainer.find('#multi-attacks-options');

            multiAdjacentCheckbox.on('change', function() {
              if (this.checked) multiAttacksCheckbox.prop('disabled', true).prop('checked', false).trigger('change');
              else multiAttacksCheckbox.prop('disabled', !isValidMultipleAttack(actionCode));
            });

            multiAttacksCheckbox.on('change', function() {
              if (this.checked) {
                multiAdjacentCheckbox.prop('disabled', true).prop('checked', false);
                multiAttacksOptions.show();
              } else {
                multiAttacksOptions.hide();
                multiAdjacentCheckbox.prop('disabled', !isValidMultiTargetAttack(actionCode));
              }
            });
          }
          
          actionSelect.on('change', updateMultiOptions);
          updateMultiOptions();
        }
      }).render(true);
    }
  }

  /**
   * Roll a contact
   * @param {Actor} actor - The actor who owns the contact
   * @param {Item} contact - The contact item to roll
   * @param {Object} options - Optional configuration for the roll
   */
  static async rollContact(actor, contact, options = {}) {
    if (!actor || !contact) {
      ui.notifications.error("Actor or contact not found");
      return;
    }

    // Get saved contact settings
    const savedActionType = contact.getFlag("msh-faserip", "lastActionType") || "Availability";
    const savedColumnShift = contact.getFlag("msh-faserip", "lastColumnShift") || 0;
    const skipDiceRoll = contact.getFlag("msh-faserip", "skipDiceRoll") || false;

    // If this is a direct roll (called after dialog or with options)
    // Check if CTRL is pressed or if this is a direct roll call
    if (options.useDirectRoll || game.keyboard.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL)) {
      // Optional notification that CTRL quick roll is being used
      if (game.keyboard.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL)) {
        ui.notifications.info("Quick roll with saved settings (CTRL pressed)");
      }
      // Use provided options
      const actionType = options.actionType || savedActionType;
      const columnShift = options.columnShift ?? savedColumnShift;
      const karma = options.karma || 0;
      const skipDice = options.skipDice ?? skipDiceRoll;

      // Get the hero's popularity
      const heroPopularity = actor.system.attributes?.popularity?.value || 0;
      const heroPopularityRank = actor.system.attributes?.popularity?.rank || "Typical";
      const isMutant = actor.system.powerOrigin === "mutant" || actor.system.isMutant;

      // Get contact type
      const contactType = contact.system.type || "General";

      // Determine effective disposition (normally Friendly, but affected by negative popularity)
      let effectiveDisposition = "Friendly";
      if (heroPopularity < 0) {
        effectiveDisposition = "Neutral";
      }

      // Map disposition to required FEAT color
      let requiredFeatColor;
      switch (effectiveDisposition) {
        case "Friendly": requiredFeatColor = "Green"; break;
        case "Neutral": requiredFeatColor = "Yellow"; break;
        case "Suspicious": requiredFeatColor = "Red"; break;
        case "Hostile": requiredFeatColor = "Impossible"; break;
      }

      // Apply column shifts to get effective rank
      let effectiveRank = heroPopularityRank;
      if (columnShift !== 0) {
        const ranks = [
          "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
          "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
        ];
        const index = ranks.indexOf(effectiveRank);
        if (index !== -1) {
          const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
          effectiveRank = ranks[newIndex];
          console.log(`Applied ${columnShift} column shifts to ${heroPopularityRank}, now ${effectiveRank}`);
        }
      }

      // Apply mutant penalty if applicable
      if (isMutant) {
        // Apply a -1CS to reflect mutant penalty
        const ranks = [
          "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
          "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
        ];
        const index = ranks.indexOf(effectiveRank);
        if (index > 0) { // Don't go below Shift-0
          effectiveRank = ranks[index - 1];
          console.log(`Applied -1CS mutant penalty, now ${effectiveRank}`);
        }
      }

      // Create the roll
      const roll = new Roll("1d100");

      // Evaluate the roll
      await roll.evaluate();

      // Display the dice roll with flavor text if not skipped
      if (!skipDice) {
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          flavor: `${actor.name} contacts ${contact.name}`,
          rollMode: game.settings.get("core", "rollMode")
        });
      }

      // Calculate the result
      let cappedTotal = roll.total;
      let karmaUsed = 0;

// <-- NEW/MODIFIED SECTION START -->
      const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
      let dailyKarmaUsedAmount = 0;
      let lifetimeKarmaUsedAmount = 0;

      if (karma > 0) {
        if (dailyKarmaEnabled && actor.system.karma.dailyKarmaUsed < actor.system.karma.dailyKarmaMax) {
          const dailyKarmaRemaining = actor.system.karma.dailyKarmaMax - actor.system.karma.dailyKarmaUsed;
          const karmaFromDaily = Math.min(karma, dailyKarmaRemaining);
          
          dailyKarmaUsedAmount = karmaFromDaily;
          karmaUsed += karmaFromDaily;

          await runAsGM({
            operation: 'update',
            targetActorUuid: actor.uuid,
            args: [{ "system.karma.dailyKarmaUsed": actor.system.karma.dailyKarmaUsed + dailyKarmaUsedAmount }]
          });

          const remainingKarmaToSpend = karma - karmaFromDaily;
          if (remainingKarmaToSpend > 0) {
            cappedTotal = Math.min(100, roll.total + remainingKarmaToSpend);
            lifetimeKarmaUsedAmount = cappedTotal - roll.total;
            karmaUsed += lifetimeKarmaUsedAmount;
          } else {
            cappedTotal = Math.min(100, roll.total + karmaFromDaily);
          }
        } else {
          cappedTotal = Math.min(100, roll.total + karma);
          lifetimeKarmaUsedAmount = cappedTotal - roll.total;
          karmaUsed = lifetimeKarmaUsedAmount;
        }
      } else {
        cappedTotal = roll.total;
      }

      const historyUpdates = [];
      if (dailyKarmaUsedAmount > 0) {
        historyUpdates.push({
          realDate: new Date().toLocaleDateString(),
          gameDate: "",
          amount: -dailyKarmaUsedAmount,
          type: "Daily Roll",
          description: `Spent daily karma on ${contact.name} (Contact)`
        });
      }
      if (lifetimeKarmaUsedAmount > 0) {
        historyUpdates.push({
          realDate: new Date().toLocaleDateString(),
          gameDate: "",
          amount: -lifetimeKarmaUsedAmount,
          type: "Die Roll",
          description: `Spent lifetime karma on ${contact.name} (Contact)`
        });
      }

      if (historyUpdates.length > 0) {
        const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
        const newHistory = currentHistory.concat(historyUpdates);
        
        await runAsGM({
          operation: 'update',
          targetActorUuid: actor.uuid,
          args: [{ "system.karma.history": newHistory }]
        });
        await FaseripRolls._updateCurrentKarma(actor); // Update displayed karma
      }
      // <-- NEW/MODIFIED SECTION END -->

      const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);

      // Check if the result meets the required FEAT color
      let meetsFeatRequirement = false;
      switch (requiredFeatColor) {
        case "Green":
          meetsFeatRequirement = (resultColor.toLowerCase() === "green" || resultColor.toLowerCase() === "yellow" || resultColor.toLowerCase() === "red");
          break;
        case "Yellow":
          meetsFeatRequirement = (resultColor.toLowerCase() === "yellow" || resultColor.toLowerCase() === "red");
          break;
        case "Red":
          meetsFeatRequirement = (resultColor.toLowerCase() === "red");
          break;
        case "Impossible":
          meetsFeatRequirement = false; // Always fails
          break;
      }

      // Determine resource level based on contact type (simplified for brevity)
      let resourceLevel = "Typical";
      switch (contactType) {
        case "Law Enforcement": resourceLevel = "Remarkable"; break;
        case "Military": resourceLevel = "Amazing"; break;
        case "Business World": resourceLevel = "Incredible"; break;
        case "Journalism": resourceLevel = "Poor"; break;
        case "Scientific": resourceLevel = "Good"; break;
        case "State": resourceLevel = "Remarkable"; break;
        case "National": resourceLevel = "Monstrous"; break;
        case "International": resourceLevel = "Monstrous"; break;
        case "Planetary": resourceLevel = "Unearthly"; break;
        default: resourceLevel = "Typical";
      }

      // Define all possible results by color 
      const ALL_RESULTS = {
        "Availability": {
          white: "Unavailable",
          green: "Available (Limited)",
          yellow: "Available",
          red: "Eager to Help"
        },
        "Information": {
          white: "No Information",
          green: "Basic Information",
          yellow: "Good Information",
          red: "Detailed Information"
        },
        "Equipment": {
          white: "No Equipment",
          green: "Basic Equipment",
          yellow: `Good Equipment (up to ${resourceLevel} rank)`,
          red: `Excellent Equipment (up to ${resourceLevel} rank)`
        },
        "Assistance": {
          white: "No Assistance",
          green: "Limited Assistance",
          yellow: "Direct Assistance",
          red: "Above and Beyond"
        },
        "Favor": {
          white: "Refuses",
          green: "Small Favor Only",
          yellow: "Willing to Help",
          red: "Goes Above and Beyond"
        }
      };

      // Determine the result text
      let resultText;
      if (meetsFeatRequirement) {
        // If requirement met, use the result corresponding to the color rolled
        resultText = ALL_RESULTS[actionType][resultColor.toLowerCase()];
      } else {
        // If requirement not met, show the "failure" result regardless of color
        if (actionType === "Availability") resultText = "Unavailable";
        else if (actionType === "Information") resultText = "No Information";
        else if (actionType === "Equipment") resultText = "No Equipment";
        else if (actionType === "Assistance") resultText = "No Assistance";
        else if (actionType === "Favor") resultText = "Refuses";
      }

      // Create chat message styled to match others
      let content = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${actor.name} - ${contactType} Contact: ${contact.name} (${actionType})</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Popularity: ${heroPopularityRank} (${heroPopularity})</div>
            <div>Disposition: ${effectiveDisposition} (Required: ${requiredFeatColor})</div>
            ${isMutant ? '<div style="color: #aa0000;">Mutant Penalty Applied (-1CS)</div>' : ''}
            <div>Effective Rank: ${heroPopularityRank} ${columnShift !== 0 ? `→ ${effectiveRank} (${columnShift > 0 ? '+' : ''}${columnShift}CS)` : ''}</div>
            <div>Roll: ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
          resultColor.toLowerCase() === 'green' ? '#4CAF50' :
            resultColor.toLowerCase() === 'yellow' ? '#FFC107' :
              '#F44336'}; 
            color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
            ${resultText} (${resultColor.toUpperCase()})
          </div>
          ${!meetsFeatRequirement ?
          `<div style="padding: 5px 10px; font-size: 0.9em; color: #aa0000;">Failed to meet required ${requiredFeatColor} result for ${effectiveDisposition} contact</div>` : ''}
          ${heroPopularity < 0 ?
          '<div style="padding: 5px 10px; font-size: 0.9em; color: #aa0000;">Negative popularity affects contact relations</div>' : ''}
        </div>
      `;

      // Send to chat
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: content
      });

      // If hero has negative popularity, using contacts costs Karma
      if (heroPopularity < 0) {
        ui.notifications.warn("Negative popularity: Using contacts costs Karma!");
        // You could implement Karma reduction here if desired
      }

      return { roll, resultColor, resultText, meetsFeatRequirement };
    } else {
      // First call - show dialog to select options
      // Define contact action types
      const actionOptions = [
        { value: "Availability", label: "Availability" },
        { value: "Information", label: "Information Request" },
        { value: "Equipment", label: "Equipment Request" },
        { value: "Assistance", label: "Request Assistance" },
        { value: "Favor", label: "Request Favor" }
      ];

      // Create action type options HTML
      const actionOptionsHTML = actionOptions.map(option =>
        `<option value="${option.value}" ${option.value === savedActionType ? 'selected' : ''}>${option.label}</option>`
      ).join('');

      // Get the hero's popularity for display
      const heroPopularity = actor.system.attributes?.popularity?.value || 0;
      const heroPopularityRank = actor.system.attributes?.popularity?.rank || "Typical";
      const isMutant = actor.system.powerOrigin === "mutant" || actor.system.isMutant;

      // Determine effective disposition (normally Friendly, but affected by negative popularity)
      let effectiveDisposition = "Friendly";
      if (heroPopularity < 0) {
        effectiveDisposition = "Neutral";
      }

      // Map disposition to required FEAT color
      let requiredFeatColor;
      switch (effectiveDisposition) {
        case "Friendly": requiredFeatColor = "Green"; break;
        case "Neutral": requiredFeatColor = "Yellow"; break;
        case "Suspicious": requiredFeatColor = "Red"; break;
        case "Hostile": requiredFeatColor = "Impossible"; break;
      }

      // Create dialog for roll options
      let dialogContent = `
      <div style="background: #f0e8d8; padding: 10px; border-radius: 5px;">
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Request Type:</label>
          <select id="action-type" name="actionType" style="width: 180px;">
            ${actionOptionsHTML}
          </select>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Popularity:</label>
          <input type="text" id="popularity-rank" value="${heroPopularityRank}" style="width: 100px;" readonly>
          <span style="margin-left: 5px;">(${heroPopularity})</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Disposition:</label>
          <input type="text" id="disposition" value="${effectiveDisposition}" style="width: 100px;" readonly>
          ${heroPopularity < 0 ?
          '<span style="color: #aa0000; font-size: 0.9em;"> (Modified due to negative popularity)</span>' : ''}
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Required Result:</label>
          <input type="text" id="required-result" value="${requiredFeatColor}" style="width: 100px;" readonly>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Column Shift:</label>
          <input type="number" id="shift" name="shift" value="${savedColumnShift}" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Karma Points:</label>
          <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
        </div>
        <div style="margin-bottom: 10px;">
          <label>
            <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
            Skip dice animation
          </label>
        </div>
        <div style="margin-top: 10px;">
          <label>
            <input type="checkbox" id="save-settings" name="saveSettings" checked> 
            Remember these settings for future rolls
          </label>
        </div>
      </div>`;

      return new Dialog({
        title: `Contact Roll: ${contact.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const actionType = html.find('[name="actionType"]').val();
              const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const skipDice = html.find('[name="skipDice"]').is(':checked');
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');

              // Save settings if requested
              if (saveSettings) {
                await contact.setFlag("msh-faserip", "lastActionType", actionType);
                await contact.setFlag("msh-faserip", "lastColumnShift", columnShift);
                await contact.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              }

              // Call this method again but with the gathered options
              return FaseripRolls.rollContact(actor, contact, {
                useDirectRoll: true,
                actionType: actionType,
                columnShift: columnShift,
                karma: karma,
                skipDice: skipDice
              });
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll"
      }).render(true);
    }
  }

  /**
* Roll equipment
* @param {Actor} actor - The actor who owns the equipment
* @param {Item} equipment - The equipment item to roll
* @param {Object} options - Optional configuration for the roll
*/
  static async rollEquipment(actor, equipment, options = {}) {
    console.log("rollEquipment called", equipment); // Debug

    if (!actor || !equipment) {
      ui.notifications.error("Actor or equipment not found");
      return;
    }

    // GET AMMO TYPE FIRST - Move this to the top level
    let currentAmmoType = "standard"; // default
    if (equipment.system.category === "weapon") {
      console.log("Weapon system properties:", Object.keys(equipment.system));
      console.log("Full weapon system data:", equipment.system);
      if (equipment.system.currentAmmo) {
        currentAmmoType = equipment.system.currentAmmo.toLowerCase();
      } else if (equipment.system.ammoType) {
        currentAmmoType = equipment.system.ammoType.toLowerCase();
      }
      console.log(`Weapon ${equipment.name} loaded with: ${currentAmmoType} ammunition`);
      
      // Also add debug to see what's available
      console.log("Weapon system properties:", Object.keys(equipment.system));
    }

    // Get saved equipment settings - ADD THIS SECTION
    const savedActionType = equipment.getFlag("msh-faserip", "lastActionType") || "";
    const savedColumnShift = equipment.getFlag("msh-faserip", "lastColumnShift") || 0;
    const skipDiceRoll = equipment.getFlag("msh-faserip", "skipDiceRoll") || false;

    // Get equipment information
    const category = equipment.system.category || "gear";

    // Check ammunition at the very beginning for weapons
    if (category === "weapon" && equipment.system.shots) {
      // Explicitly parse as integer and handle missing/undefined values
      const currentShots = equipment.system.shotsRemaining !== undefined ?
        parseInt(equipment.system.shotsRemaining) : 0;

      console.log("Weapon shots check:", equipment.name, currentShots); // Debug

      if (currentShots <= 0) {
        // Weapon is out of ammo - show notification and chat message
        ui.notifications.warn(`${equipment.name} is out of ammunition! Reload required.`);

        // Create a chat message about being out of ammo
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `
              <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                <div style="padding: 5px 10px; font-size: 1.1em; color: #8b0000; text-align: center;">
                  <strong>${equipment.name} is out of ammunition!</strong>
                </div>
                <div style="padding: 5px 10px; text-align: center;">
                  <em>Manual reload required before firing again.</em>
                </div>
              </div>
            `
        });

        // Return early without rolling dice or performing the attack
        return { outOfAmmo: true };
      }
    }

    // Handle different equipment categories
    if (category === "weapon") {
      // Roll for weapon attack
      const rank = equipment.system.materialStrength || "Typical";
      const damage = equipment.system.damage || "-";
      const damageType = equipment.system.damageType || "Blunt";
      const range = equipment.system.range || "None";
      // Get the weapon type from the equipment
      const weaponType = equipment.system.weaponType || "";

      // Check ammunition at the very beginning for weapons
      if (equipment.system.shots) {
        const currentShots = equipment.system.shotsRemaining !== undefined ?
          parseInt(equipment.system.shotsRemaining) : 0;

        if (currentShots <= 0) {
          // ... existing out of ammo code ...
          return { outOfAmmo: true };
        }
      }

      // Determine default action based on weapon type
      let defaultAction = "Shooting Attack (Sh)";
      if (weaponType === "melee" && damageType === "BA") {
        defaultAction = "Blunt Attack (BA)";
      } else if (weaponType === "melee" && damageType === "EA") {
        defaultAction = "Edged Attack (EA)";
      } else if (weaponType === "thrown" && damageType === "BA") {
        defaultAction = "Throwing Blunt (TB)";
      } else if (weaponType === "thrown" && damageType === "EA") {
        defaultAction = "Throwing Edged (TE)";
      } else if (weaponType === "energy" || damageType === "E") {
        defaultAction = "Energy (En)";
      } else if (weaponType === "force" || damageType === "F") {
        defaultAction = "Force (Fo)";
      } else if (weaponType === "grappling" || damageType === "GP") {
        defaultAction = "Grappling (GP)";
      } else if (weaponType === "grabbing" || damageType === "Gb") {
        defaultAction = "Grabbing (Gb)";
      }
      else if (damageType === "Stun" || equipment.system.stunIntensity) {
        defaultAction = "Stunning Attack";
      }

      // Define action types from the Universal Table
      const ACTIONS = {
        "Blunt Attack (BA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" }},
        "Edged Attack (EA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" }},
        "Shooting Attack (Sh)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" }},
        "Throwing Edged (TE)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" }},
        "Throwing Blunt (TB)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" }},
        "Energy (En)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" }},
        "Force (Fo)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" }},
        "Grappling (GP)": { ability: "strength", results: { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" }},
        "Grabbing (Gb)": { ability: "strength", results: { white: "Miss", green: "Take", yellow: "Grab", red: "Break" }},
        "Escaping (Es)": { ability: "strength", results: { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" }},
        "Stunning Attack": { ability: "agility", results: { white: "No Effect", green: "Partial Effect", yellow: "Stun", red: "Knockout" }}
      };

      // If this is a macro or direct call with options provided
      // Check if CTRL is pressed or if this is a direct roll call
      if (options.useDirectRoll || game.keyboard.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL)) {
        console.log("=== ROLL EQUIPMENT DEBUG ===");
        console.log("Received options:", options);
        console.log("Ammo type from options:", options.ammoType);
        console.log("============================");
        // Optional notification that CTRL quick roll is being used
        if (game.keyboard.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL)) {
          ui.notifications.info("Quick roll with saved settings (CTRL pressed)");
        }

        const actionName = options.actionType || savedActionType || defaultAction;
        const action = ACTIONS[actionName];
        const shift = parseInt(options.columnShift) || savedColumnShift || 0; // Define shift FIRST
        const karma = parseInt(options.karma) || 0;
        const skipDice = options.skipDice ?? skipDiceRoll;

        // NOW calculate range data using the defined shift value
        const rangeData = calculateRangeInfo(actor, equipment, game.user.targets.first());

        // Check if out of range first
        if (rangeData.outOfRange) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px;">
                <div style="padding: 5px 10px; color: #cc0000; font-weight: bold; font-size: 1.1em;">
                  ${equipment.name} - OUT OF RANGE
                </div>
                <div style="padding: 5px 10px;">
                  Target is ${rangeData.distance} areas away, but ${equipment.name} has maximum range of ${rangeData.maxRange} areas.
                </div>
              </div>
            `
          });
          return { outOfRange: true };
        }

        // Apply range penalty to column shift and multi-target penalties
        let totalShift = shift - rangeData.penalty; // Now shift is defined

        // Apply -4CS penalty for multiple adjacent targets
        if (options.multiAdjacent) {
          totalShift -= 4;
          console.log("Applied -4CS penalty for multiple adjacent targets");
        }

        // Get the ability to use (fighting or agility)
        const abilityKey = action.ability || "fighting";
        const abilityRank = actor.system.abilities[abilityKey].rank || "Typical";
        const abilityValue = actor.system.abilities[abilityKey].value || 10;

        // Apply column shifts if needed
        let effectiveRank = abilityRank;
        if (totalShift !== 0) {
          const ranks = [
            "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
            "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
          ];
          const index = ranks.indexOf(abilityRank);
          if (index !== -1) {
            const newIndex = Math.min(Math.max(index + totalShift, 0), ranks.length - 1); // Use totalShift here
            effectiveRank = ranks[newIndex];
          }
        }

        // Create the roll and evaluate it
        const roll = new Roll("1d100");
        await roll.evaluate();

        // Display the dice roll with flavor text if not skipped
        if (!skipDice) {
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            flavor: `${actor.name} equipment ${equipment.name}`,
            rollMode: game.settings.get("core", "rollMode")
          });
        }

        // Calculate the result
        let cappedTotal = roll.total;
        let karmaUsed = 0;

        // <-- NEW/MODIFIED SECTION START (same karma handling as rollPower) -->
        const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
        let dailyKarmaUsedAmount = 0;
        let lifetimeKarmaUsedAmount = 0;

        if (karma > 0) {
          if (dailyKarmaEnabled && actor.system.karma.dailyKarmaUsed < actor.system.karma.dailyKarmaMax) {
            const dailyKarmaRemaining = actor.system.karma.dailyKarmaMax - actor.system.karma.dailyKarmaUsed;
            const karmaFromDaily = Math.min(karma, dailyKarmaRemaining);
            
            dailyKarmaUsedAmount = karmaFromDaily;
            karmaUsed += karmaFromDaily;

            await runAsGM({
              operation: 'update',
              targetActorUuid: actor.uuid,
              args: [{ "system.karma.dailyKarmaUsed": actor.system.karma.dailyKarmaUsed + dailyKarmaUsedAmount }]
            });

            const remainingKarmaToSpend = karma - karmaFromDaily;
            if (remainingKarmaToSpend > 0) {
              cappedTotal = Math.min(100, roll.total + remainingKarmaToSpend);
              lifetimeKarmaUsedAmount = cappedTotal - roll.total;
              karmaUsed += lifetimeKarmaUsedAmount;
            } else {
              cappedTotal = Math.min(100, roll.total + karmaFromDaily);
            }
          } else {
            cappedTotal = Math.min(100, roll.total + karma);
            lifetimeKarmaUsedAmount = cappedTotal - roll.total;
            karmaUsed = lifetimeKarmaUsedAmount;
          }
        } else {
          cappedTotal = roll.total;
        }

        const historyUpdates = [];
        if (dailyKarmaUsedAmount > 0) {
          historyUpdates.push({
            realDate: new Date().toLocaleDateString(),
            gameDate: "",
            amount: -dailyKarmaUsedAmount,
            type: "Daily Roll",
            description: `Spent daily karma on ${equipment.name} (Equipment)`
          });
        }
        if (lifetimeKarmaUsedAmount > 0) {
          historyUpdates.push({
            realDate: new Date().toLocaleDateString(),
            gameDate: "",
            amount: -lifetimeKarmaUsedAmount,
            type: "Die Roll",
            description: `Spent lifetime karma on ${equipment.name} (Equipment)`
          });
        }

        if (historyUpdates.length > 0) {
          const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
          const newHistory = currentHistory.concat(historyUpdates);
          
          await runAsGM({
            operation: 'update',
            targetActorUuid: actor.uuid,
            args: [{ "system.karma.history": newHistory }]
          });
          await FaseripRolls._updateCurrentKarma(actor); // Update displayed karma
        }
        // <-- NEW/MODIFIED SECTION END -->

        // ✅ Now use cappedTotal instead of totalRoll
        const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
        const effect = action.results[resultColor.toLowerCase()];

        // Get grenade properties if applicable
        let additionalInfo = "";
        const isGrenade = equipment.name.toLowerCase().includes("grenade") ||
          equipment.system.weaponType === "grenade";
        if (isGrenade && equipment.system.grenadeType) {
          additionalInfo += `<div><strong>Grenade Type:</strong> ${equipment.system.grenadeType}</div>`;
          if (equipment.system.grenadeRadius) {
            additionalInfo += `<div><strong>Blast Radius:</strong> ${equipment.system.grenadeRadius} areas</div>`;
          }
          if (equipment.system.grenadeIntensity) {
            additionalInfo += `<div><strong>Intensity:</strong> ${equipment.system.grenadeIntensity}</div>`;
          }
          if (equipment.system.grenadeDamage) {
            additionalInfo += `<div><strong>Damage:</strong> ${equipment.system.grenadeDamage} ${equipment.system.grenadeDamageType ? `(${equipment.system.grenadeDamageType})` : ''}</div>`;
          }
        }

        const isMissileLauncher = equipment.name.toLowerCase().includes("missile") ||
          equipment.system.weaponType === "missile";
        if (isMissileLauncher && equipment.system.missileType) { // Corrected check to isMissileLauncher
          additionalInfo += `<div><strong>Missile Type:</strong> ${equipment.system.missileType}</div>`;
          if (equipment.system.guidanceSystem) {
            additionalInfo += `<div><strong>Guidance:</strong> ${equipment.system.guidanceSystem}</div>`;
          }
          if (equipment.system.payloadType) {
            additionalInfo += `<div><strong>Payload:</strong> ${equipment.system.payloadType}</div>`;
          }
          if (equipment.system.missileDamage) {
            additionalInfo += `<div><strong>Damage:</strong> ${equipment.system.missileDamage} ${equipment.system.missileDamageType ? `(${equipment.system.missileDamageType})` : ''}</div>`;
            if (equipment.system.missileSecondaryDamage) {
              additionalInfo += `<div><strong>Secondary Damage:</strong> ${equipment.system.missileSecondaryDamage} to adjacent areas</div>`;
            }
          }
        }

        // Special ammo effects
        if (equipment.system.ammoType !== "Standard") {
          let ammoEffect = "";
          switch (equipment.system.ammoType) {
            case "Mercy":
              ammoEffect = "Target must make Endurance FEAT vs Remarkable drug or be knocked out for 1-10 rounds";
              break;
            case "AP":
              ammoEffect = "Reduces target Body Armor by 2 CS";
              break;
            case "Rubber":
              ammoEffect = "Inflicts Slugfest damage instead of Shooting damage";
              break;
            case "Explosive":
              ammoEffect = "Double normal damage";
              break;
            case "Heat-Seeker":
              ammoEffect = "Seeks hottest source, no penalty for range";
              break;
          }
          if (ammoEffect) {
            additionalInfo += `<div><strong>Ammo Effect:</strong> ${ammoEffect}</div>`;
          }
        }

        const baseDamage = isNaN(Number(equipment.system.damage)) ? 0 : Number(equipment.system.damage);

        // Create a single enhanced message that includes the roll and all information
        const messageContent = `
          <div>
            <h3 style="color: #8B0000; margin: 0 0 5px 0; font-size: 1.1em;">${actor.name} - ${equipment.name} (${actionName})</h3>
            <div style="margin-bottom: 5px; font-size: 0.9em;">
              <div>Attack Ability: ${abilityKey} → ${abilityRank} (${abilityValue})</div>
              <div>Base Damage: ${baseDamage} (${equipment.system.damage})</div>
              ${rangeData.info}
              <div>Column Shift: ${totalShift !== 0 ? `${totalShift > 0 ? "+" : ""}${totalShift} → ${effectiveRank}` : "None"}</div>

              <div>Roll: ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>

              ${equipment.system.ammoType ? `<div>Ammo Type: ${equipment.system.ammoType}</div>` : ''}
              ${additionalInfo}
            </div>
            <div style="
              background-color: ${resultColor.toLowerCase() === 'white' ? '#FFFFFF' :
            resultColor.toLowerCase() === 'green' ? '#4CAF50' :
              resultColor.toLowerCase() === 'yellow' ? '#FFC107' :
                '#F44336'
          }; 
              color: ${resultColor.toLowerCase() === 'white' ? '#000000' :
            resultColor.toLowerCase() === 'yellow' ? '#000000' : '#FFFFFF'
          };
              padding: 8px;
              text-align: center;
              font-weight: bold;
              font-size: 1.1em;
              border-radius: 3px;
              border: ${resultColor.toLowerCase() === 'white' ? '1px solid #CCCCCC' : 'none'};
            ">
              ${effect} (${resultColor.toUpperCase()})
            </div>
          </div>
          `;

        // Display the enhanced message with the roll
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: messageContent,
          roll: roll
        });

        // MULTI-TARGET COMBAT HANDLER INTEGRATION
        // Check if we have target(s) to apply damage to
        if (options.multiAdjacent && game.user.targets.size > 1) {
          // Multiple adjacent targets - single roll with -4CS, applied to all
          const targets = Array.from(game.user.targets);
          console.log(`Processing multiple adjacent targets: ${targets.map(t => t.name).join(', ')}`);
          
          for (const target of targets) {
            if (resultColor.toLowerCase() !== "white") {
              let baseDamage;
              const rawDamage = equipment.system.damage;

              if (typeof rawDamage === "number") {
                baseDamage = rawDamage;
              } else if (!isNaN(rawDamage)) {
                baseDamage = parseInt(rawDamage);
              } else {
                baseDamage = CONFIG.FASERIP.rankValues[rawDamage] || 0;
              }

              // DAMAGE TYPE NORMALIZATION HERE
              // Normalize damage types for combat handler
              let normalizedDamageType;
              const weaponType = equipment.system.weaponType || "";
              const rawDamageType = equipment.system.damageType || "";

              // Normalize damage types for shooting weapons
              if (weaponType === "shooting" || actionName.includes("Shooting")) {
                normalizedDamageType = "Physical-Shooting";
              } else if (actionName.includes("Blunt")) {
                normalizedDamageType = "Physical-Blunt";
              } else if (actionName.includes("Edged")) {
                normalizedDamageType = "Physical-Edged";
              } else if (actionName.includes("Energy")) {
                normalizedDamageType = "Energy-Energy";
              } else if (actionName.includes("Force")) {
                normalizedDamageType = "Force";
              } else {
                // Default based on weapon type
                normalizedDamageType = "Physical-Shooting"; // Most weapons are shooting
              }

              console.log(`Weapon damage type: "${rawDamageType}" → "${normalizedDamageType}"`);

              const actionNameLower = actionName.toLowerCase();
              const effectLower = effect?.toLowerCase() || "";

              // Apply FASERIP rules: only certain attack types can kill
              const canBeKill = (actionNameLower.includes("edged") || 
                                actionNameLower.includes("shooting") || 
                                actionNameLower.includes("energy")) && 
                                effectLower.includes("kill");

              const canBeSlam = (actionNameLower.includes("blunt") || 
                                actionNameLower.includes("shooting")) && 
                                effectLower.includes("slam");

              const canBeStun = effectLower.includes("stun") || actionNameLower.includes("stunning");
              
              await CombatHandler.processAttack({
                attacker: actor,
                target: target.actor,
                baseDamage: baseDamage,
                damageType: normalizedDamageType, // Use the normalized type
                sourceName: equipment.name,
                canBeStun: canBeStun,
                canBeSlam: canBeSlam,
                canBeKill: canBeKill,
                originalRollResult: resultColor.toLowerCase()
              }, {
                ammoType: currentAmmoType, // Use the determined ammo type instead of options.ammoType
                skipDefenseDialog: false
              });
            }
          }
        } else if (options.multiAttacks) {
          // Handle multiple attacks (this will be more complex)
          console.log("Multiple attacks not yet implemented for equipment");
          ui.notifications.info("Multiple attacks feature not yet implemented for equipment.");
        } else {
          // Single target (existing code)
          const target = game.user.targets.first()?.actor;
          if (target) {
            let baseDamage;
            const rawDamage = equipment.system.damage;

            if (typeof rawDamage === "number") {
              baseDamage = rawDamage;
            } else if (!isNaN(rawDamage)) {
              baseDamage = parseInt(rawDamage);
            } else {
              baseDamage = CONFIG.FASERIP.rankValues[rawDamage] || 0;
            }

            // DAMAGE TYPE NORMALIZATION HERE
            // Normalize damage types for combat handler
            let normalizedDamageType;
            const weaponType = equipment.system.weaponType || "";
            const rawDamageType = equipment.system.damageType || "";

            // Normalize damage types for shooting weapons
            if (weaponType === "shooting" || actionName.includes("Shooting")) {
              normalizedDamageType = "Physical-Shooting";
            } else if (actionName.includes("Blunt")) {
              normalizedDamageType = "Physical-Blunt";
            } else if (actionName.includes("Edged")) {
              normalizedDamageType = "Physical-Edged";
            } else if (actionName.includes("Energy")) {
              normalizedDamageType = "Energy-Energy";
            } else if (actionName.includes("Force")) {
              normalizedDamageType = "Force";
            } else {
              // Default based on weapon type
              normalizedDamageType = "Physical-Shooting"; // Most weapons are shooting
            }

            console.log(`Weapon damage type: "${rawDamageType}" → "${normalizedDamageType}"`);

            // END OF DAMAGE TYPE NORMALIZATION ↑

            const actionNameLower = actionName.toLowerCase();
            const effectLower = effect?.toLowerCase() || "";

            // Apply FASERIP rules: only certain attack types can kill
            const canBeKill = (actionNameLower.includes("edged") || 
                              actionNameLower.includes("shooting") || 
                              actionNameLower.includes("energy")) && 
                              effectLower.includes("kill");

            const canBeSlam = (actionNameLower.includes("blunt") || 
                              actionNameLower.includes("shooting")) && 
                              effectLower.includes("slam");

            const canBeStun = effectLower.includes("stun") || actionNameLower.includes("stunning");


            // Around line 2580 in rollEquipment function
            if (effectLower === "miss") {
              console.log("🛑 No damage — attack result is Miss.");
            } else {
              // Add debugging for ammo type
              console.log("Equipment roll options:", options); // Debug line
              console.log("Ammo type being passed:", options.ammoType || "standard"); // Debug line
              
              await CombatHandler.processAttack({
                attacker: actor,
                target: target,
                baseDamage: baseDamage,
                damageType: normalizedDamageType, // Use the normalized type
                sourceName: equipment.name,
                canBeStun: effectLower.includes("stun") || actionName.toLowerCase().includes("stunning"),
                canBeSlam: effectLower.includes("slam"),
                canBeKill: effectLower.includes("kill"),
                originalRollResult: resultColor.toLowerCase()
              }, {
                ammoType: currentAmmoType, // Use the determined ammo type instead of options.ammoType
                skipDefenseDialog: false
              });
            }
          } else if (resultColor.toLowerCase() !== "white" && !target) {
            ui.notifications.info("No target selected. Damage not applied.");
          }
        }

        // After the roll is complete and the chat message is created, update ammunition:
        if (category === "weapon" && equipment.system.shots) {
          const currentShots = equipment.system.shotsRemaining !== undefined ?
            parseInt(equipment.system.shotsRemaining) : 0;

          if (currentShots > 0) {
            // Decrement ammunition
            const newShots = currentShots - 1;
            console.log(`${equipment.name}: Reducing ammo from ${currentShots} to ${newShots}`);

            try {
              // Method 1: Direct item update
              await equipment.update({ "system.shotsRemaining": newShots });

              // Method 2: Actor embedded document update (as a backup)
              await actor.updateEmbeddedDocuments("Item", [{
                _id: equipment.id,
                "system.shotsRemaining": newShots
              }]);

              console.log("Ammunition updated successfully");
            } catch (error) {
              console.error("Failed to update ammunition:", error);
            }
          }
        }

        return { roll, resultColor, effect };
      }

      // Otherwise show dialog for interactive roll
      // Create dialog for roll options with multi-target support
      let dialogContent = `
        <div style="background: #f0e8d8; padding: 10px; border-radius: 5px;">
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Action Type:</label>
            <select id="action" name="action" style="width: 180px;">
              ${Object.keys(ACTIONS).map(action =>
          `<option value="${action}" ${action === defaultAction ? 'selected' : ''}>${action}</option>`
        ).join('')}
            </select>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Column Shift:</label>
            <input type="number" id="shift" name="shift" value="0" style="width: 50px;">
            <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
          </div>

          <!-- Multiple Target Options -->
          <div style="margin-bottom: 10px; padding: 8px; background: #e8f4f8; border: 1px solid #b8d4da; border-radius: 3px;">
            <div style="font-weight: bold; margin-bottom: 5px; color: #2c5aa0;">Multiple Target Options:</div>
            <div style="margin-bottom: 5px;">
              <label>
                <input type="checkbox" id="multi-adjacent" name="multiAdjacent" style="margin-right: 5px;">
                Multiple Adjacent Targets (-4CS, single roll affects all)
              </label>
              <div id="multi-adjacent-note" style="font-size: 0.8em; color: #666; margin-left: 20px; display: none;">
                Valid for: Blunt, Escaping, Energy, Force attacks only
              </div>
            </div>
            <div style="margin-bottom: 5px;">
              <label>
                <input type="checkbox" id="multi-attacks" name="multiAttacks" style="margin-right: 5px;">
                Multiple Attacks (requires Fighting FEAT)
              </label>
              <div id="multi-attacks-options" style="margin-left: 20px; display: none;">
                <label style="display: block; margin: 3px 0;">
                  <input type="radio" name="attackCount" value="2" checked style="margin-right: 5px;">
                  2 Attacks (Remarkable FEAT, -1CS each)
                </label>
                <label style="display: block; margin: 3px 0;">
                  <input type="radio" name="attackCount" value="3" style="margin-right: 5px;">
                  3 Attacks (Amazing FEAT, -1CS each)
                </label>
              </div>
              <div id="multi-attacks-note" style="font-size: 0.8em; color: #666; margin-left: 20px; display: none;">
                Valid for: Slugfest and Shooting attacks only
				</div>
            </div>
          </div>
          
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Karma Points:</label>
            <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
          </div>
          <div>
            <label>
              <input type="checkbox" id="skip-dice" name="skipDice"> 
              Skip dice animation
            </label>
          <div style="margin-top: 10px;">
          <label>
            <input type="checkbox" id="save-settings" name="saveSettings" checked> 
            Remember these settings for future rolls
          </label>
        </div>
      </div>
    `;

      return new Dialog({
        title: `Equipment Roll: ${equipment.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const actionName = html.find('[name="action"]').val();
              const shift = parseInt(html.find('[name="shift"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const skipDice = html.find('[name="skipDice"]').is(':checked');
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');
              
              // Get multiple target/attack options
              const multiAdjacent = html.find('[name="multiAdjacent"]').is(':checked');
              const multiAttacks = html.find('[name="multiAttacks"]').is(':checked');
              const attackCount = parseInt(html.find('[name="attackCount"]:checked').val()) || 2;

              console.log("=== EQUIPMENT DIALOG DEBUG ===");
              console.log("Current weapon ammo type:", currentAmmoType); // Use the determined ammo type
              console.log("multiAdjacent:", multiAdjacent);
              console.log("multiAttacks:", multiAttacks);
              console.log("attackCount:", attackCount);
              console.log("Selected targets:", Array.from(game.user.targets).map(t => t.name));
              console.log("All form values:", {
                actionName, shift, karma, skipDice, saveSettings
              });
              console.log("===================");

              // Extract action code from action type
              const actionCodeMatch = actionName.match(/\(([^)]+)\)/);
              const actionCode = actionCodeMatch ? actionCodeMatch[1] : actionName.split(' ')[0].substring(0, 2).toUpperCase();
              
              // VALIDATE MULTIPLE ADJACENT TARGETS
              if (multiAdjacent) {
                // Check if action type is valid
                if (!isValidMultiTargetAttack(actionCode)) {
                  ui.notifications.warn(`${actionName} cannot be used for multiple adjacent targets!`);
                  return;
                }
                
                const targetTokens = Array.from(game.user.targets);
                if (targetTokens.length < 2) {
                  ui.notifications.warn("Multiple adjacent targets requires at least 2 targets selected!");
                  return;
                }
                
                const attackerToken = canvas.tokens.controlled[0];
                if (!attackerToken) {
                  ui.notifications.warn("No attacker token selected!");
                  return;
                }
                
                const validation = validateAdjacentTargets(attackerToken, targetTokens);
                if (!validation.valid) {
                  ui.notifications.warn(`Some targets are not adjacent: ${validation.invalidTargets.map(t => t.name).join(', ')}`);
                  return;
                }
              }

              // VALIDATE MULTIPLE ATTACKS
              if (multiAttacks) {
                // Check if action type is valid
                if (!isValidMultipleAttack(actionCode)) {
                  ui.notifications.warn(`${actionName} cannot be used for multiple attacks!`);
                  return;
                }
                
                // Need at least one target
                if (game.user.targets.size === 0) {
                  ui.notifications.warn("Select at least one target for multiple attacks!");
                  return;
                }
              }

              // Mutual exclusion check
              if (multiAdjacent && multiAttacks) {
                ui.notifications.warn("Cannot use both multiple adjacent targets and multiple attacks at the same time!");
                return;
              }

              // Save settings if requested
              if (saveSettings) {
                await equipment.setFlag("msh-faserip", "lastActionType", actionName);
                await equipment.setFlag("msh-faserip", "lastColumnShift", shift);
                await equipment.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              }

              // Handle multiple attacks first (requires Fighting FEAT)
              if (multiAttacks) {
                return await processMultipleAttackSequence(actor, equipment, {
                  actionType: actionName,
                  columnShift: shift,
                  karma: karma,
                  skipDice: skipDice,
                  attackCount: attackCount,
                  ammoType: currentAmmoType
                });
              }

              // Call this method again but with the gathered options
              return FaseripRolls.rollEquipment(actor, equipment, {
                useDirectRoll: true,
                actionType: actionName,
                columnShift: shift,
                karma: karma,
                skipDice: skipDice,
                ammoType: currentAmmoType,
                multiAdjacent: multiAdjacent,
                multiAttacks: multiAttacks,
                attackCount: attackCount
              });
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll",
        render: (html) => {
          // Get references to the multiple target elements
          const actionSelect = html.find('#action');
          const multiAdjacentCheckbox = html.find('#multi-adjacent');
          const multiAttacksCheckbox = html.find('#multi-attacks');
          const multiAttacksOptions = html.find('#multi-attacks-options');

          // Function to update option availability based on action type
          function updateMultiOptions() {
            const selectedAction = actionSelect.val();
            
            // Extract action code from the selected action
            const actionCodeMatch = selectedAction.match(/\(([^)]+)\)/);
            const actionCode = actionCodeMatch ? actionCodeMatch[1] : selectedAction.split(' ')[0].substring(0, 2).toUpperCase();
            
            console.log("🎨 updateMultiOptions called with action:", selectedAction, "code:", actionCode);
            
            // Check if action is valid for multiple adjacent targets
            const validMultiTarget = isValidMultiTargetAttack(actionCode);
            const validMultiAttack = isValidMultipleAttack(actionCode);
            
            console.log("🎨 validMultiTarget:", validMultiTarget);
            console.log("🎨 validMultiAttack:", validMultiAttack);
            
            multiAdjacentCheckbox.prop('disabled', !validMultiTarget);
            if (!validMultiTarget) {
              multiAdjacentCheckbox.prop('checked', false);
            }
            
            multiAttacksCheckbox.prop('disabled', !validMultiAttack);
            if (!validMultiAttack) {
              multiAttacksCheckbox.prop('checked', false);
              multiAttacksOptions.hide();
            }
          }

          // Mutual exclusion: if one is checked, disable the other
          multiAdjacentCheckbox.on('change', function() {
            console.log("🎨 multiAdjacent checkbox changed:", this.checked);
            if (this.checked) {
              multiAttacksCheckbox.prop('disabled', true).prop('checked', false);
              multiAttacksOptions.hide();
            } else {
              const selectedAction = actionSelect.val();
              const actionCodeMatch = selectedAction.match(/\(([^)]+)\)/);
              const actionCode = actionCodeMatch ? actionCodeMatch[1] : selectedAction.split(' ')[0].substring(0, 2).toUpperCase();
              const validMultiAttack = isValidMultipleAttack(actionCode);
              multiAttacksCheckbox.prop('disabled', !validMultiAttack);
            }
          });

          multiAttacksCheckbox.on('change', function() {
            console.log("🎨 multiAttacks checkbox changed:", this.checked);
            if (this.checked) {
              multiAdjacentCheckbox.prop('disabled', true).prop('checked', false);
              multiAttacksOptions.show();
            } else {
              multiAttacksOptions.hide();
              const selectedAction = actionSelect.val();
              const actionCodeMatch = selectedAction.match(/\(([^)]+)\)/);
              const actionCode = actionCodeMatch ? actionCodeMatch[1] : selectedAction.split(' ')[0].substring(0, 2).toUpperCase();
              const validMultiTarget = isValidMultiTargetAttack(actionCode);
              multiAdjacentCheckbox.prop('disabled', !validMultiTarget);
            }
          });

          // Update options when action type changes
          actionSelect.on('change', updateMultiOptions);
          
          // Initial update
          updateMultiOptions();
        }
      }).render(true);
    }
    else if (category === "power-item") {
      // For power items, roll using the power mechanism
      const powerRank = equipment.system.powerRank || "Typical";
      const powerType = equipment.system.powerType || "";

      // Use the power roll function
      return game.msh.rollPower(actor, {
        name: equipment.name,
        type: "power",
        system: {
          rank: powerRank,
          value: FaseripRolls._getRankValue(powerRank),
          type: powerType,
          range: equipment.system.powerRange || ""
        },
        getFlag: (key) => item.getFlag("msh-faserip", key) // Pass through getFlag
      });
    }
    else {
      // For other equipment types, show info message
      ui.notifications.info(`${actor.name} uses ${equipment.name} (${equipment.system.materialStrength || "Typical"})`);

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
        <div class="faserip-equipment-use">
          <h3>${actor.name} uses ${equipment.name}</h3>
          <div class="equipment-info">
            <div><strong>Type:</strong> ${category}</div>
            <div><strong>Material:</strong> ${equipment.system.materialStrength || "Typical"}</div>
            ${equipment.system.description ? `<div class="description">${equipment.system.description}</div>` : ''}
          </div>
        </div>
        <style>
          .faserip-equipment-use {
            font-family: Arial, sans-serif;
            background: #f9f8f4;
            border: 1px solid #ccc;
            border-radius: 3px;
            padding: 8px;
          }
          .faserip-equipment-use h3 {
            margin: 0 0 8px 0;
            border-bottom: 1px solid #ccc;
            padding-bottom: 4px;
            font-size: 1.1em;
          }
          .equipment-info {
            margin-bottom: 8px;
            font-size: 0.95em;
          }
          .equipment-info div {
            margin-bottom: 3px;
          }
          .description {
            margin-top: 6px;
            font-style: italic;
            border-top: 1px dotted #ccc;
            padding-top: 6px;
          }
        </style>
      `
      });

      return true;
    }
  }

  // Helper method to convert rank names to values
  static _getRankValue(rankName) {
    const rankValues = {
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
      "Unearthly": 100
    };

    return rankValues[rankName] || 6; // Default to Typical if not found
  }

    // FIXES FOR rolls.js - Remove the problematic code at the end

// 1. REMOVE this entire section from the end of the file (around line 2038+):

/*
  static async _updateCurrentKarma(actor) {
    // Recalculate current karma based on history
    const totalEarned = actor.system.karma.lifetime || 0;
    let totalSpent = 0;
    
    if (actor.system.karma.history && Array.isArray(actor.system.karma.history)) {
      actor.system.karma.history.forEach(event => {
        if (event.amount < 0) {
          totalSpent += Math.abs(event.amount);
        }
      });
    }
    
    const advancementFund = actor.system.karma.advancement || 0;
    const karmaPool = actor.system.karma.pool || 0;
    
    const currentKarma = Math.max(0, totalEarned - totalSpent - advancementFund - karmaPool);
    
    // Update current karma value so players see immediate change
    await actor.update({ "system.attributes.karma.value": currentKarma });
  }

  // Then call this after updating karma history in each function:
  if (karmaUsed > 0) {
    const history = foundry.utils.deepClone(actor.system.karma?.history || []);
    const newEvent = {
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -karmaUsed,
      type: "Die Roll",
      description: `Spent on ${sourceName}`
    };
    history.push(newEvent);

    await actor.update({ "system.karma.history": history });
    await FaseripRolls._updateCurrentKarma(actor); // Add this line
  }
  // additional class methods
*/

// 2. REPLACE the end of the FaseripRolls class with this:

  // Helper method to convert rank names to values
  static _getRankValue(rankName) {
    const rankValues = {
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
      "Unearthly": 100
    };

    return rankValues[rankName] || 6; // Default to Typical if not found
  }

  // Helper method to update current karma value immediately after spending
  static async _updateCurrentKarma(actor) {
    // Recalculate current karma based on history
    const totalEarned = actor.system.karma.lifetime || 0;
    let totalSpent = 0;
    
    if (actor.system.karma.history && Array.isArray(actor.system.karma.history)) {
      actor.system.karma.history.forEach(event => {
        if (event.amount < 0) {
          totalSpent += Math.abs(event.amount);
        }
      });
    }
    
    const advancementFund = actor.system.karma.advancement || 0;
    const karmaPool = actor.system.karma.pool || 0;
    
    const currentKarma = Math.max(0, totalEarned - totalSpent - advancementFund - karmaPool);
    
    // Update current karma value so players see immediate change
    await actor.update({ "system.attributes.karma.value": currentKarma });
  }
}


/**
 * Roll a Fighting FEAT for multiple attacks
 * @param {Actor} actor - The actor making the FEAT
 * @param {String} intensity - The required intensity ("Remarkable" or "Amazing")
 * @returns {Object} - {success: boolean, result: string, roll: Roll}
 */
/* async function rollFightingFeat(actor, intensity) {
  const fightingRank = actor.system.abilities.fighting.rank;
  const fightingValue = actor.system.abilities.fighting.value;
  
  // Create the roll
  const roll = new Roll("1d100");
  await roll.evaluate();
  
  const resultColor = game.msh.rollUniversalTable(fightingRank, roll.total);
  
  // Determine success based on intensity requirement
  let success = false;
  switch (intensity) {
    case "Remarkable":
      success = ["green", "yellow", "red"].includes(resultColor.toLowerCase());
      break;
    case "Amazing":
      success = ["yellow", "red"].includes(resultColor.toLowerCase());
      break;
  }
  
  const resultText = `Fighting FEAT vs ${intensity}: ${roll.total} on ${fightingRank} = ${resultColor.toUpperCase()} - ${success ? "SUCCESS" : "FAILURE"}`;
  
  // Create chat message for the FEAT
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
          <strong>${actor.name} - Multiple Attack FEAT</strong>
        </div>
        <div style="padding: 5px 10px; font-size: 0.9em;">
          <div>Required Intensity: ${intensity}</div>
          <div>Fighting Rank: ${fightingRank} (${fightingValue})</div>
          <div>Roll: ${roll.total}</div>
        </div>
        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
          background-color: ${success ? '#4CAF50' : '#F44336'}; color: white;">
          ${success ? "SUCCESS" : "FAILURE"} (${resultColor.toUpperCase()})
        </div>
      </div>
    `
  });
  
  return { success, result: resultText, roll };
} */

function measureTokenRangeInAreas(actor, target) {
  let distance = 0;
  let sourceToken = null;
  let targetToken = null;

  if (canvas.tokens.controlled.length > 0) {
    sourceToken = canvas.tokens.controlled[0];
  } else if (actor instanceof Actor && typeof actor.getActiveTokens === 'function') {
    sourceToken = actor.getActiveTokens()[0];
  }

  if (game.user.targets.size > 0) {
    targetToken = Array.from(game.user.targets)[0];
  }

  if (sourceToken && targetToken) {
    const grid = canvas.grid;
    const sourcePoint = sourceToken.center;
    const targetPoint = targetToken.center;
    const pathResult = grid.measurePath([sourcePoint, targetPoint]);
    const rawDistance = pathResult.distance;
    const rawUnits = (grid.units || "").toLowerCase().trim();

    // Normalize known abbreviations to canonical forms
    const unitMap = {
      "feet": "feet", "foot": "feet", "ft": "feet",
      "yards": "yards", "yard": "yards", "yd": "yards",
      "meters": "meters", "meter": "meters", "m": "meters",
      "area": "areas", "areas": "areas"
    };

    const normalized = unitMap[rawUnits] || "areas";

    switch (normalized) {
      case "yards":   distance = rawDistance / 44; break;
      case "feet":    distance = rawDistance / 132; break;
      case "meters":  distance = rawDistance / 40.23; break;
      case "areas":   distance = rawDistance; break;
      default:        distance = rawDistance; // fallback
    }

    console.log(`Measured distance: ${rawDistance} ${rawUnits} => ${distance.toFixed(2)} areas`);
  } else {
    console.warn("Unable to determine both source and target tokens. Returning 0.");
  }

  return distance;
}

// Add this function for power range calculation
function calculatePowerRangeInfo(actor, power, target) {
  if (!target) {
    return { penalty: 0, info: "", outOfRange: false, distance: 0, maxRange: 0 };
  }

  const distance = measureTokenRangeInAreas(actor, target);
  const powerRank = power.system.rank || "Typical";
  const basePowerRange = POWER_RANGE_VALUES[powerRank] || 0;

  let penalty = 0;
  let info = "";
  const outOfRange = false; // Powers don’t have an absolute max range

  if (distance > basePowerRange) {
    penalty = distance - basePowerRange;
    info = `<div style="color: #ff6600;"><strong>Range:</strong> ${distance.toFixed(1)} areas (Base: ${basePowerRange} areas). Penalty: -${penalty.toFixed(1)}CS</div>`;
  } else if (distance > 0) {
    info = `<div><strong>Range:</strong> ${distance.toFixed(1)} areas (within base range of ${basePowerRange} areas). No penalty.</div>`;
  } else {
    info = `<div><strong>Range:</strong> Adjacent (no penalty).</div>`;
  }

  return { penalty, info, outOfRange, distance, maxRange: basePowerRange };
}

// Add this new function after the existing helper functions
function calculateRangeInfo(actor, equipment, target) {
  if (!target || equipment.system.category !== "weapon") {
    return { penalty: 0, info: "", outOfRange: false, distance: 0, maxRange: 0 };
  }

  const distance = measureTokenRangeInAreas(actor, target);
  const weaponRange = equipment.system.range || getDefaultWeaponRange(equipment);

  let penalty = 0;
  let info = "";
  let outOfRange = false;

  if (distance > weaponRange) {
    outOfRange = true;
    info = `<div style="color: #cc0000;"><strong>OUT OF RANGE:</strong> ${distance.toFixed(1)} areas exceeds maximum ${weaponRange} areas</div>`;
  } else if (distance > 0) {
    penalty = Math.floor(distance);
    info = penalty > 0
      ? `<div><strong>Range:</strong> ${distance.toFixed(1)} areas (-${penalty}CS penalty)</div>`
      : `<div><strong>Range:</strong> ${distance.toFixed(1)} areas (no penalty - within 1 area)</div>`;
  } else {
    info = `<div><strong>Range:</strong> Adjacent (no penalty)</div>`;
  }

  return { penalty, info, outOfRange, distance, maxRange: weaponRange };
}

function getDefaultWeaponRange(equipment) {
  // Default ranges based on weapon type
  const weaponType = equipment.system.weaponType?.toLowerCase() || "";
  const name = equipment.name.toLowerCase();
  
  if (name.includes("rifle")) return 15;
  if (name.includes("pistol") || name.includes("handgun")) return 5;
  if (name.includes("shotgun")) return 3;
  if (name.includes("bow")) return 8;
  if (name.includes("crossbow")) return 10;
  if (weaponType === "melee") return 1; // Melee weapons can reach 1 area (adjacent)
  if (weaponType === "thrown") {
    // Use thrower's strength for range
    const strength = equipment.parent?.system?.abilities?.strength?.rank || "Typical";
    const strengthRanges = {
      "Feeble": 1, "Poor": 1, "Typical": 1, "Good": 2, "Excellent": 3,
      "Remarkable": 4, "Incredible": 5, "Amazing": 6, "Monstrous": 7, "Unearthly": 8
    };
    return strengthRanges[strength] || 1;
  }
  
  return 5; // Default range
}

function highlightResultCell(rankName, rollValue) {
  console.log("Highlighting:", rankName, rollValue);

  const dialog = document.querySelector(".app.dialog");
  if (!dialog) {
    console.warn("No dialog found");
    return;
  }

  const rankIndex = getRankIndex(rankName);
  const rollLabel = getRollLabelFromValue(rollValue);
  console.log("Looking for:", rollLabel, "Rank Index:", rankIndex);

  const selector = `.universal-rank-table tr[data-roll-label="${rollLabel}"] td:nth-child(${rankIndex + 2})`;
  const cell = dialog.querySelector(selector);

  if (cell) {
    console.log("Cell found:", cell);
    cell.classList.add("highlight-cell");
    setTimeout(() => cell.classList.remove("highlight-cell"), 15000);  // 15 seconds
  } else {
    console.warn("Cell not found for:", selector);
  }
}


function getRankIndex(rankName) {
  const ranks = [
    "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent", "Remarkable", "Incredible",
    "Amazing", "Monstrous", "Unearthly", "Shift X", "Shift Y", "Shift Z",
    "Class 1000", "Class 3000", "Class 5000", "Beyond"
  ];
  return ranks.indexOf(rankName);
}

function getRollLabelFromValue(value) {
  if (value === 1) return "01";
  if (value <= 3) return "02–03";
  if (value <= 6) return "04–06";
  if (value <= 10) return "07–10";
  if (value <= 15) return "11–15";
  if (value <= 20) return "16–20";
  if (value <= 25) return "21–25";
  if (value <= 30) return "26–30";
  if (value <= 35) return "31–35";
  if (value <= 40) return "36–40";
  if (value <= 45) return "41–45";
  if (value <= 50) return "46–50";
  if (value <= 55) return "51–55";
  if (value <= 60) return "56–60";
  if (value <= 65) return "61–65";
  if (value <= 70) return "66–70";
  if (value <= 75) return "71–75";
  if (value <= 80) return "76–80";
  if (value <= 85) return "81–85";
  if (value <= 90) return "86–90";
  if (value <= 94) return "91–94";
  if (value <= 97) return "95–97";
  if (value <= 99) return "98–99";
  return "100";
}


const resultRows = [
  {
    result: "white",
    cells: [
      { value: "Miss", span: 5 }, { value: "Miss", span: 2 }, { value: "Miss", span: 1 },
      { value: "Miss", span: 1 }, { value: "Miss", span: 1 }, { value: "None", span: 1 },
      { value: "Autohit", span: 1 }, { value: "-6 CS", span: 1 }, { value: "Autohit", span: 1 },
      { value: "Miss", span: 1 }, { value: "1–10", span: 1 }, { value: "Gr. Slam", span: 1 },
      { value: "En. Loss", span: 1 }
    ]
  },
  {
    result: "green",
    cells: [
      { value: "Hit", span: 5 }, { value: "Hit", span: 2 }, { value: "Hit", span: 1 },
      { value: "Hit", span: 1 }, { value: "Hit", span: 1 }, { value: "-2 CS", span: 1 },
      { value: "Evasion", span: 1 }, { value: "+4 CS", span: 1 }, { value: "Catch", span: 1 },
      { value: "1", span: 1 }, { value: "1 area", span: 1 }, { value: "E/S", span: 1 }
    ]
  },
  {
    result: "yellow",
    cells: [
      { value: "Slam", span: 1 }, { value: "Stun", span: 1 }, { value: "Bullseye", span: 1 },
      { value: "Stun", span: 1 }, { value: "Bullseye", span: 1 }, { value: "Bullseye", span: 1 },
      { value: "Partial", span: 1 }, { value: "Grab", span: 1 }, { value: "Escape", span: 1 },
      { value: "Slam", span: 1 }, { value: "-4 CS", span: 1 }, { value: "+1 CS", span: 1 },
      { value: "+2 CS", span: 1 }, { value: "Catch", span: 1 }, { value: "Damage", span: 1 },
      { value: "Stagger", span: 1 }, { value: "No", span: 1 }
    ]
  },
  {
    result: "red",
    cells: [
      { value: "Stun", span: 1 }, { value: "Kill", span: 1 }, { value: "Kill", span: 1 },
      { value: "Kill", span: 1 }, { value: "Stun", span: 1 }, { value: "Kill", span: 1 },
      { value: "Hold", span: 1 }, { value: "Break", span: 1 }, { value: "Reverse", span: 1 },
      { value: "Stun", span: 1 }, { value: "-6 CS", span: 1 }, { value: "+2 CS", span: 1 },
      { value: "+1 CS", span: 1 }, { value: "No", span: 1 }, { value: "No", span: 1 },
      { value: "No", span: 1 }
    ]
  }
];

// ============================================
// EXPORTED FUNCTIONS (OUTSIDE THE CLASS)
// ============================================
// universal table roll referenced via game.msh.openUniversalTableDialog
export async function openUniversalTableDialog(actor) {
  const actionTypes = [
    { labelTop: "Blunt", labelMid: "Attack", code: "BA", ability: "Fighting", white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
    { labelTop: "Edged", labelMid: "Attack", code: "EA", ability: "Fighting", white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
    { labelTop: "Shooting", labelMid: "Attack", code: "Sh", ability: "Agility", white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
    { labelTop: "Throwing", labelMid: "Edged", code: "TE", ability: "Agility", white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
    { labelTop: "Throwing", labelMid: "Blunt", code: "TB", ability: "Agility", white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" },
    { labelTop: "Energy", labelMid: "Attack", code: "En", ability: "Agility", white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
    { labelTop: "Force", labelMid: "Attack", code: "Fo", ability: "Agility", white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
    { labelTop: "Grappling", labelMid: "Attack", code: "Gp", ability: "Strength", white: "Miss", green: "Hit", yellow: "Partial", red: "Hold" },
    { labelTop: "Grabbing", labelMid: "Attack", code: "Gb", ability: "Strength", white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
    { labelTop: "Escaping", labelMid: "Hold", code: "Es", ability: "Strength", white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
    { labelTop: "Charging", labelMid: "Attack", code: "Ch", ability: "Endurance", white: "None", green: "Slam", yellow: "Slam", red: "Stun" },
    { labelTop: "Dodging", labelMid: "Defense", code: "Do", ability: "Agility", white: "Autohit", green: "-2 CS", yellow: "-4 CS", red: "-6 CS" },
    { labelTop: "Evading", labelMid: "Defense", code: "Ev", ability: "Fighting", white: "Autohit", green: "Evasion", yellow: "+1 CS", red: "+2 CS" },
    { labelTop: "Blocking", labelMid: "Defense", code: "Bl", ability: "Strength", white: "Autohit", green: "+4 CS", yellow: "+2 CS", red: "+1 CS" },
    { labelTop: "Catching", labelMid: "Objects", code: "Ca", ability: "Agility", white: "Auto-hit", green: "Miss", yellow: "Damage", red: "Catch" },
    { labelTop: "Stun", labelMid: "Check", code: "St", ability: "Endurance", white: "1–10", green: "1", yellow: "Damage", red: "No" },
    { labelTop: "Slam", labelMid: "Check", code: "Sl", ability: "Endurance", white: "Gr. Slam", green: "1 area", yellow: "Stagger", red: "No" },
    { labelTop: "Kill", labelMid: "Check", code: "Ki", ability: "Endurance", white: "End. Loss", green: "E/S", yellow: "No", red: "No" }
  ];

  const actorItems = actor.items.contents;
  const powers = game.msh.getActorPowers(actor);

  const talents = actorItems.filter(i => i.type === "talent");
  const equipment = actorItems.filter(i => i.type === "equipment");

  const savedAction = actor.getFlag("msh-faserip", "universalRollAction") || "";
  const savedSource = actor.getFlag("msh-faserip", "universalRollSource") || "";
  const savedCS = actor.getFlag("msh-faserip", "universalRollCS") || 0;
  const savedKarma = actor.getFlag("msh-faserip", "universalRollKarma") || 0;

  const dialogContent = `
    <form>
      <div class="form-group">
        <label>Action Type</label>
        <select name="action">
          ${actionTypes.map(type => `
            <option value="${type.code}" ${type.code === savedAction ? "selected" : ""}>
              ${type.labelTop} ${type.labelMid} (${type.code})
            </option>`).join('')}
        </select>

      </div>
      <div class="form-group">
        <label>Source</label>
        <select name="source">
          <option value="">(Select Power, Talent, or Equipment)</option>
          <optgroup label="Powers">
            ${powers.map(p => `<option value="power:${p.id}" ${`power:${p.id}` === savedSource ? "selected" : ""}>${p.name} (${p.system?.rank || 'Typical'})</option>`).join('')}
          </optgroup>
          <optgroup label="Talents">
            ${talents.map(t => `<option value="talent:${t.id}" ${`talent:${t.id}` === savedSource ? "selected" : ""}>${t.name}</option>`).join('')}
          </optgroup>
          <optgroup label="Equipment">
            ${equipment.map(e => `<option value="equipment:${e.id}" ${`equipment:${e.id}` === savedSource ? "selected" : ""}>${e.name}</option>`).join('')}
          </optgroup>
        </select>
      </div>
      <div class="form-group">
        <label>Generic Column Shift Modifier</label>
        <input type="number" name="cs" value="${savedCS}">
      </div>
      <div class="form-group">
        <label>Karma to Spend</label>
        <input type="number" name="karma" value="${savedKarma}">
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" name="save" checked />
          Remember these settings
        </label>
      </div>
    </form>
  `;

  const html = await renderTemplate("systems/msh-faserip/templates/universal-table.html", {
    actionTypes,
    rankRows  // ✅ now this works
  });

  const dlg = new Dialog({
    title: "Universal Table",
    content: html,
    buttons: {}, // 👈 no close button; rely on top-right X
    render: html => {
      const app = html.closest(".app.dialog");
      if (app.length) {
        app.css({
          width: "1100px",
          resize: "both",
          overflow: "auto"
        });

        // Center it horizontally
        const left = Math.max((window.innerWidth - 1100) / 2, 50);
        app[0].style.left = `${left}px`;
      }
    }
  });
  dlg.render(true);

  Hooks.once("renderDialog", (_app, html) => {

    html.find("#toggleRankTable").on("click", () => {
      html.find("#rankTableContainer").toggle();
    });

    // Font size slider logic
    html.find("#fontSizeSlider").on("input", (event) => {
      const size = event.target.value + "px";
      html.find(".stack").css("font-size", size);
    });

    // Drag and click logic for action buttons
    // Updated event listener setup - only target the parent .action-button elements
    html.find(".action-button").each((_, el) => {
      el.addEventListener("dragstart", async ev => {
        const action = ev.currentTarget.dataset.action;
        if (!action) {
          ev.preventDefault();
          ui.notifications.warn("No action code found on element.");
          return;
        }
        
        const actor = game.user.character || canvas.tokens.controlled[0]?.actor;
        if (!actor) {
          ev.preventDefault();
          ui.notifications.warn("Select a token or assign a character first.");
          return;
        }

        console.log("🎯 Creating macro for action:", action);

        // Copy EXACTLY what the click handler does - don't open a new dialog
        const command = `// Universal Action Macro - same pattern as power macros
        const actor = game.user.character || canvas.tokens.controlled[0]?.actor || game.actors.get("${actor.id}");
        if (!actor) {
          return ui.notifications.warn("Select a token or assign a character first.");
        }

        // Get saved settings for this action (same as clicking the button)
        const savedCS = actor.getFlag("msh-faserip", "cs_${action}") || 0;
        const savedKarma = actor.getFlag("msh-faserip", "karma_${action}") || 0;

        // Generate multiple target options (same function used by clicking)
        function generateMultiTargetOptionsHTML(actionCode) {
          const targetCount = game.user.targets.size;
          const validMultiTarget = ["BA", "Es", "En", "Fo"].includes(actionCode);
          const validMultiAttack = ["BA", "EA", "Sh"].includes(actionCode);
          
          if (!validMultiTarget && !validMultiAttack) {
            return "";
          }
          
          let html = \`
            <div style="margin-bottom: 10px; padding: 8px; background: #e8f4f8; border: 1px solid #b8d4da; border-radius: 3px;">
              <div style="font-weight: bold; margin-bottom: 5px; color: #2c5aa0;">Multiple Target Options:</div>
          \`;
          
          if (validMultiTarget) {
            html += \`
              <div style="margin-bottom: 5px;">
                <label>
                  <input type="checkbox" id="multi-adjacent" name="multiAdjacent" style="margin-right: 5px;">
                  Multiple Adjacent Targets (-4CS, single roll affects all)
                </label>
                <div style="font-size: 0.8em; color: #666; margin-left: 20px;">
                  Targets selected: \${targetCount} | All must be adjacent to attacker
                </div>
              </div>
            \`;
          }
          
          if (validMultiAttack) {
            html += \`
              <div style="margin-bottom: 5px;">
                <label>
                  <input type="checkbox" id="multi-attacks" name="multiAttacks" style="margin-right: 5px;">
                  Multiple Attacks (requires Fighting FEAT)
                </label>
                <div id="multi-attacks-options" style="margin-left: 20px; display: none;">
                  <label style="display: block; margin: 3px 0;">
                    <input type="radio" name="attackCount" value="2" checked style="margin-right: 5px;">
                    2 Attacks (Remarkable FEAT, -1CS each)
                  </label>
                  <label style="display: block; margin: 3px 0;">
                    <input type="radio" name="attackCount" value="3" style="margin-right: 5px;">
                    3 Attacks (Amazing FEAT, -1CS each)
                  </label>
                </div>
              </div>
            \`;
          }
          
          html += \`</div>\`;
          return html;
        }

        const multiTargetOptionsHTML = generateMultiTargetOptionsHTML("${action}");

        // Create the dialog (EXACTLY what clicking the button does)
        new Dialog({
          title: \`Roll: ${action}\`,
          content: \`
          <form>
            <div class="form-group">
              <label>Column Shift</label>
              <input type="number" name="cs" value="\${savedCS}" />
            </div>
            <div class="form-group">
              <label>Karma</label>
              <input type="number" name="karma" value="\${savedKarma}" />
            </div>
            <div class="form-group">
              <label>Damage Value</label>
              <input type="number" name="damageValue" value="" placeholder="Enter weapon/power damage" />
              <div style="font-size: 0.8em; color: #666;">Leave blank to use ability value</div>
            </div>
            <div class="form-group">
              <label>Weapon/Power Used</label>
              <input type="text" name="weaponName" value="" placeholder="e.g., Colt .45, Energy Blast, Katana" />
              <div style="font-size: 0.8em; color: #666;">Optional: For chat display purposes</div>
            </div>
            \${multiTargetOptionsHTML}
            <div class="form-group">
              <label><input type="checkbox" name="remember" checked /> Remember these settings</label>
            </div>
          </form>
        \`,
          buttons: {
            roll: {
              label: "Roll",
              callback: async (html) => {
              const cs = parseInt(html.find('[name="cs"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const damageValue = parseInt(html.find('[name="damageValue"]').val()) || null;
              const weaponName = html.find('[name="weaponName"]').val().trim();
              const remember = html.find('[name="remember"]').is(":checked");
              const multiAdjacent = html.find('[name="multiAdjacent"]').is(':checked');
              const multiAttacks = html.find('[name="multiAttacks"]').is(':checked');
              const attackCount = parseInt(html.find('[name="attackCount"]:checked').val()) || 2;

              if (remember) {
                await actor.setFlag("msh-faserip", \`cs_${action}\`, cs);
                await actor.setFlag("msh-faserip", \`karma_${action}\`, karma);
              }

              game.msh.rollUniversalAction("${action}", actor.id, cs, karma, {
                multiAdjacent,
                multiAttacks,
                attackCount,
                customDamage: damageValue,
                weaponName: weaponName
              });
              }
            },
            cancel: { label: "Cancel" }
          },
          default: "roll"
        }).render(true);`;

        let macro = game.macros.find(m => m.name === `FEAT: ${action} (${actor.name})` && m.command === command);
        if (!macro) {
          const iconMap = {
            BA: "blunt", EA: "edged", Sh: "shooting", TE: "thrown", TB: "thrown_blunt",
            En: "energy", Fo: "force", Gp: "grapple", Gb: "grab", Es: "escape",
            Ch: "charge", Ki: "kill", St: "stun", Sl: "slam", Do: "dodge",
            Ev: "evade", Bl: "block", Ca: "catch",
          };

          const iconName = iconMap[action] || "dice-target";
          const img = `systems/msh-faserip/assets/icons/actions/${iconName}.png`;

          macro = await Macro.create({
            name: `FEAT: ${action} (${actor.name})`,
            type: "script",
            command,
            img,
            flags: {"faserip.universalActionMacro": true}
          });
        }

        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "Macro",
          uuid: macro.uuid
        }));
      });

      el.addEventListener("click", ev => {
        // Prevent event bubbling to avoid double-triggers
        ev.stopPropagation();
        
        const action = ev.currentTarget.dataset.action;
        if (!action) {
          console.warn("🔥 No action found on clicked element:", ev.currentTarget);
          return;
        }
        
        console.log("🔥 Action button clicked:", action);
        
        const actor = game.user.character || canvas.tokens.controlled[0]?.actor;
        if (!actor) {
          return ui.notifications.warn("Select a token or assign a character first.");
        }

        console.log("🔥 Actor found:", actor.name);

        const savedCS = actor.getFlag("msh-faserip", `cs_${action}`) || 0;
        const savedKarma = actor.getFlag("msh-faserip", `karma_${action}`) || 0;

        console.log("🔥 About to call generateMultiTargetOptionsHTML...");
        
        // Generate multiple target options based on action type
        const multiTargetOptionsHTML = generateMultiTargetOptionsHTML(action);
        
        console.log("🔥 multiTargetOptionsHTML result:", multiTargetOptionsHTML);

        new Dialog({
          title: `Roll: ${action}`,
          content: `
          <form>
            <div class="form-group">
              <label>Column Shift</label>
              <input type="number" name="cs" value="${savedCS}" />
            </div>
            <div class="form-group">
              <label>Karma</label>
              <input type="number" name="karma" value="${savedKarma}" />
            </div>
            <div class="form-group">
              <label>Damage Value</label>
              <input type="number" name="damageValue" value="" placeholder="Enter weapon/power damage" />
              <div style="font-size: 0.8em; color: #666;">Leave blank to use ability value</div>
            </div>
            <div class="form-group">
              <label>Weapon/Power Used</label>
              <input type="text" name="weaponName" value="" placeholder="e.g., Colt .45, Energy Blast, Katana" />
              <div style="font-size: 0.8em; color: #666;">Optional: For chat display purposes</div>
            </div>
            ${multiTargetOptionsHTML}
            <div class="form-group">
              <label><input type="checkbox" name="remember" checked /> Remember these settings</label>
            </div>
          </form>
        `,
          buttons: {
            roll: {
              label: "Roll",
              callback: async (html) => {
                console.log("🚀 Roll button clicked");
                
                const cs = parseInt(html.find('[name="cs"]').val()) || 0;
                const karma = parseInt(html.find('[name="karma"]').val()) || 0;
                const damageValue = parseInt(html.find('[name="damageValue"]').val()) || null;
                const weaponName = html.find('[name="weaponName"]').val().trim();
                const remember = html.find('[name="remember"]').is(":checked");
                const multiAdjacent = html.find('[name="multiAdjacent"]').is(':checked');
                const multiAttacks = html.find('[name="multiAttacks"]').is(':checked');
                const attackCount = parseInt(html.find('[name="attackCount"]:checked').val()) || 2;

                // Validation for multiple adjacent targets
                if (multiAdjacent) {
                  const targetTokens = Array.from(game.user.targets);
                  if (targetTokens.length < 2) {
                    ui.notifications.warn("Multiple adjacent targets requires at least 2 targets selected!");
                    return;
                  }
                  
                  const attackerToken = canvas.tokens.controlled[0];
                  if (!attackerToken) {
                    ui.notifications.warn("No attacker token selected!");
                    return;
                  }
                  
                  const validation = validateAdjacentTargets(attackerToken, targetTokens);
                  if (!validation.valid) {
                    ui.notifications.warn(`Some targets are not adjacent: ${validation.invalidTargets.map(t => t.name).join(', ')}`);
                    return;
                  }
                }

                if (remember) {
                  await actor.setFlag("msh-faserip", `cs_${action}`, cs);
                  await actor.setFlag("msh-faserip", `karma_${action}`, karma);
                }

                game.msh.rollUniversalAction(action, actor.id, cs, karma, {
                  multiAdjacent,
                  multiAttacks,
                  attackCount,
                  customDamage: damageValue,
                  weaponName: weaponName
                });
              }
            },
            cancel: { label: "Cancel" }
          },
          default: "roll",
          render: (html) => {
            console.log("🎨 Dialog render callback called");
            addMultiTargetEventHandlers(html);
          }
        }).render(true);

        console.log("🔥 Dialog created and rendered");
      });

    });

    /* html.find(".action-toggle").on("change", (event) => {
      const code = event.currentTarget.dataset.code;
      const visible = event.currentTarget.checked;
      html.find(`.column[data-code="${code}"]`).toggle(visible);
    }); */

  });
  // end of openUniversalTableDialog  
}

export async function rollUniversalAction(actionCode, actorId, columnShift = null, karma = null, options = {}) {
  let actor = game.actors.get(actorId) || canvas.tokens.controlled[0]?.actor || game.user.character;
  if (!actor) return ui.notifications.warn("No actor found.");

  // If columnShift or karma are null, show the dialog instead
  if (columnShift === null || karma === null) {
    // ... existing dialog code stays the same ...
    return;
  }

  // code for Catching maneuver
  if (actionCode === "Ca") {
    const targetToken = game.user.targets.first();
    const validation = await validateCatchingAttempt(actor, actionCode, targetToken);
    if (!validation.valid) {
      return; // Stop execution if validation fails
    }
    
    // Apply -3CS penalty if object is directed against the character
    const target = targetToken?.actor;
    const isDirectedAttack = target?.getFlag("msh-faserip", "directedAttack") || false;
    if (isDirectedAttack) {
      totalColumnShift -= 3;
      console.log("Applied -3CS penalty for catching object directed against character");
    }
  }

  // Handle multiple attacks first (before rolling)
  if (options.multiAttacks) {
    console.log(`Starting multiple universal action sequence: ${options.attackCount} attacks with ${actionCode}`);
    
    // First, roll the Fighting FEAT
    const featIntensity = options.attackCount === 2 ? "Remarkable" : "Amazing";
    const fightingRank = actor.system.abilities.fighting.rank;
    const fightingValue = actor.system.abilities.fighting.value;
    
    // Create and evaluate the FEAT roll
    const featRoll = new Roll("1d100");
    await featRoll.evaluate();
    
    const featColor = game.msh.rollUniversalTable(fightingRank, featRoll.total);
    
    // Determine success based on intensity requirement
    let featSuccess = false;
    switch (featIntensity) {
      case "Remarkable":
        featSuccess = ["green", "yellow", "red"].includes(featColor.toLowerCase());
        break;
      case "Amazing":
        featSuccess = ["yellow", "red"].includes(featColor.toLowerCase());
        break;
    }
    
    // Create FEAT result message
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${actor.name} - Multiple Attack FEAT</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Required Intensity: ${featIntensity}</div>
            <div>Fighting Rank: ${fightingRank} (${fightingValue})</div>
            <div>Roll: ${featRoll.total}</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: ${featSuccess ? '#4CAF50' : '#F44336'}; color: white;">
            ${featSuccess ? "SUCCESS" : "FAILURE"} (${featColor.toUpperCase()})
          </div>
        </div>
      `
    });
    
    if (!featSuccess) {
      // Failed FEAT: Single attack at -3CS
      console.log("Fighting FEAT failed - single attack with -3CS penalty");
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div style="background-color: #ffebee; border: 1px solid #f44336; border-radius: 3px; padding: 8px; margin: 5px 0;">
            <div style="color: #d32f2f; font-weight: bold; margin-bottom: 5px;">Multiple Attack Failed</div>
            <div style="font-size: 0.9em;">
              <div>${actor.name} failed the Fighting FEAT for ${options.attackCount} attacks.</div>
              <div>Result: Single attack only, at -3CS penalty.</div>
            </div>
          </div>
        `
      });
      
      // Make single attack with -3CS penalty
      return rollUniversalAction(actionCode, actorId, columnShift - 3, karma, {
        ...options,
        multiAttacks: false,
        attackCount: 1
      });
    }
    
    // Success: Multiple attacks at -1CS each
    console.log(`Fighting FEAT succeeded - proceeding with ${options.attackCount} attacks at -1CS each`);
    
    const results = [];
    
    for (let i = 1; i <= options.attackCount; i++) {
      console.log(`Making attack ${i} of ${options.attackCount}`);
      
      // Each attack gets -1CS penalty
      const attackResult = await rollUniversalAction(actionCode, actorId, columnShift - 1, karma, {
        ...options,
        multiAttacks: false, // Prevent recursion
        attackCount: 1
      });
      
      results.push(attackResult);
      
      // Small delay between attacks for better visual flow
      if (i < options.attackCount) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
    
    // Create summary message
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div style="background-color: #e8f5e8; border: 1px solid #4caf50; border-radius: 3px; padding: 8px; margin: 5px 0;">
          <div style="color: #2e7d32; font-weight: bold; margin-bottom: 5px;">Multiple Attack Sequence Complete</div>
          <div style="font-size: 0.9em;">
            <div>${actor.name} completed ${options.attackCount} attacks with ${actionCode}.</div>
            <div>Each attack was made at -1CS due to multiple attack rules.</div>
          </div>
        </div>
      `
    });
    
    return results;
  }

  const label = `FEAT: ${actionCode}`;
  const abilityKey = ACTION_ABILITY_MAP[actionCode] || "fighting";
  const ability = actor.system.abilities[abilityKey] || { rank: "Typical", value: 6 };

  // Calculate total column shift (including multiple adjacent penalty)
  let totalColumnShift = columnShift;
  
  // Apply -4CS penalty for multiple adjacent targets
  if (options.multiAdjacent) {
    totalColumnShift -= 4;
    console.log("Applied -4CS penalty for multiple adjacent targets");
  }

  // more Catching code
  // Apply -3CS penalty if object is directed against the character (for catching)
  if (actionCode === "Ca") {
    const targetToken = game.user.targets.first();
    const target = targetToken?.actor;
    const isDirectedAttack = target?.getFlag("msh-faserip", "directedAttack") || false;
    if (isDirectedAttack) {
      totalColumnShift -= 3;
      console.log("Applied -3CS penalty for catching object directed against character");
    }
  }

  // Apply column shifts to get effective rank
  let finalRank = ability.rank;
  let finalValue = ability.value;
  
  if (totalColumnShift !== 0) {
    const shiftedResult = applyColumnShiftToRank(ability.rank, ability.value, totalColumnShift);
    finalRank = shiftedResult.rank;
    finalValue = shiftedResult.value;
    console.log(`Applied ${totalColumnShift} column shifts to ${ability.rank}, now ${finalRank}`);
  }

  // Create and evaluate the roll
  const roll = new Roll("1d100");
  await roll.evaluate();

  // Process karma
  let cappedTotal = roll.total;
  let karmaUsed = 0;

  // <-- KARMA PROCESSING SECTION (same as before) -->
  const dailyKarmaEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
  let dailyKarmaUsedAmount = 0;
  let lifetimeKarmaUsedAmount = 0;
  
  if (karma > 0) {
    if (dailyKarmaEnabled && actor.system.karma.dailyKarmaUsed < actor.system.karma.dailyKarmaMax) {
      const dailyKarmaRemaining = actor.system.karma.dailyKarmaMax - actor.system.karma.dailyKarmaUsed;
      const karmaFromDaily = Math.min(karma, dailyKarmaRemaining);
      
      dailyKarmaUsedAmount = karmaFromDaily;
      karmaUsed += karmaFromDaily;

      await runAsGM({
        operation: 'update',
        targetActorUuid: actor.uuid,
        args: [{ "system.karma.dailyKarmaUsed": actor.system.karma.dailyKarmaUsed + dailyKarmaUsedAmount }]
      });

      const remainingKarmaToSpend = karma - karmaFromDaily;
      if (remainingKarmaToSpend > 0) {
        cappedTotal = Math.min(100, roll.total + remainingKarmaToSpend);
        lifetimeKarmaUsedAmount = cappedTotal - roll.total;
        karmaUsed += lifetimeKarmaUsedAmount;
      } else {
        cappedTotal = Math.min(100, roll.total + karmaFromDaily);
      }
    } else {
      cappedTotal = Math.min(100, roll.total + karma);
      lifetimeKarmaUsedAmount = cappedTotal - roll.total;
      karmaUsed = lifetimeKarmaUsedAmount;
    }
  }

  // Update karma history
  const historyUpdates = [];
  if (dailyKarmaUsedAmount > 0) {
    historyUpdates.push({
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -dailyKarmaUsedAmount,
      type: "Daily Roll",
      description: `Spent daily karma on ${actionCode} roll`
    });
  }
  if (lifetimeKarmaUsedAmount > 0) {
    historyUpdates.push({
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -lifetimeKarmaUsedAmount,
      type: "Die Roll",
      description: `Spent lifetime karma on ${actionCode} roll`
    });
  }

  if (historyUpdates.length > 0) {
    const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
    const newHistory = currentHistory.concat(historyUpdates);
    
    await runAsGM({
      operation: 'update',
      targetActorUuid: actor.uuid,
      args: [{ "system.karma.history": newHistory }]
    });

    await FaseripRolls._updateCurrentKarma(actor);
  }

  // NOW determine result color using the FINAL rank and capped total
  let color, resultText;
  try {
    color = game.msh.rollUniversalTable(finalRank, cappedTotal);
    const labelColor = color.toLowerCase();
    resultText = (ACTION_RESULT_LABELS[actionCode] || {})[labelColor] || color.toUpperCase();
    
  } catch (error) {
    console.error("Error in universal table lookup:", error);
    color = "white";
    resultText = "Miss";
  }

  // Light up the rank table cell using the final rank
  if (typeof highlightResultCell === 'function') {
    highlightResultCell(finalRank, cappedTotal);
  }

  const labelColor = color.toLowerCase();

  // Create chat message
  const weaponInfo = options.weaponName ? `<div>Weapon/Power: ${options.weaponName}</div>` : "";
  const damageInfo = options.customDamage ? `<div>Damage: ${options.customDamage}</div>` : "";

  const content = `
  <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
    <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
      <strong>${actor.name} - ${options.weaponName || label}</strong>
    </div>
    <div style="padding: 5px 10px; font-size: 0.9em;">
      <div>Ability: ${abilityKey.charAt(0).toUpperCase() + abilityKey.slice(1)}</div>
      <div>Base Rank: ${ability.rank} (${ability.value})</div>
      ${weaponInfo}
      ${damageInfo}
      ${totalColumnShift !== 0 ? `<div>Column Shift: ${totalColumnShift > 0 ? "+" : ""}${totalColumnShift}</div>` : ""}
      ${totalColumnShift !== 0 ? `<div>Final Rank: ${finalRank} (${finalValue})</div>` : ""}
      <div>Roll: ${roll.total} + Karma: ${karmaUsed} = <strong>${cappedTotal}</strong></div>
    </div>
    <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
      background-color: ${labelColor === 'white' ? '#f8f8f8' :
      labelColor === 'green' ? '#4CAF50' :
        labelColor === 'yellow' ? '#FFC107' : '#F44336'};
      color: ${labelColor === 'white' || labelColor === 'yellow' ? '#333' : 'white'};">
      ${resultText} (${color.toUpperCase()})
    </div>
  </div>
  `;

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${actor.name} uses ${label}`,
    content,
    rollMode: game.settings.get("core", "rollMode")
  });

  // Process targets
  // AUTOMATION: Process effect if targets exist
  if (options.multiAdjacent && game.user.targets.size > 1) {
    // Multiple adjacent targets - process all with same result
    const targets = Array.from(game.user.targets);
    console.log(`🎯 DEBUG: Processing multiple adjacent targets with color: "${color}"`);
    console.log(`🎯 DEBUG: color.toLowerCase(): "${color.toLowerCase()}"`);
    console.log(`🎯 DEBUG: Should skip damage? ${color.toLowerCase() === "white"}`);
    
    for (const targetToken of targets) {
      const target = targetToken.actor;
      if (target) {
        console.log(`🎯 DEBUG: About to call processUniversalActionTarget for ${target.name}`);
        await processUniversalActionTarget(actor, target, actionCode, color, finalValue, options.weaponName || label, options);
      }
    }
  } else {
    // Single target processing
    const target = game.user.targets.first()?.actor;
    console.log(`🎯 DEBUG: Single target processing with color: "${color}"`);
    
    if (actionCode === "Do") {
      // Handle dodging - pre-action defensive stance (no target needed)
      await processDodgeResult(actor, color, finalValue, label);
    } else if (target && actionCode === "Ch") {
      // Prompt for areas moved in this charge
      const areasMovedThrough = await new Promise((resolve) => {
        new Dialog({
          title: "Charge Distance",
          content: `
            <div class="form-group">
              <label>How many areas did ${actor.name} move before impact?</label>
              <input type="number" name="areas" value="1" min="1" max="20" />
              <div style="font-size: 0.8em; color: #666;">1 area = 10 feet. Distance affects damage and CS bonus.</div>
            </div>
          `,
          buttons: {
            ok: {
              label: "Calculate Damage",
              callback: (html) => resolve(parseInt(html.find('[name="areas"]').val()) || 1)
            }
          }
        }).render(true);
      });
      
      await processChargeAttack({
        attacker: actor,
        target: target,
        areasMovedThrough: areasMovedThrough,
        rollResult: color
      });
    } else if (actionCode === "Ca") {
      if (target) {
        await processCatchingResult(actor, target, color, actionCode, finalValue, label);
      } else {
        ui.notifications.info("Catching requires a target to be selected.");
      }
    } else if (target && actionCode === "Ch") {
      // Prompt for areas moved in this charge
      const areasMovedThrough = await new Promise((resolve) => {
        new Dialog({
          title: "Charge Distance",
          content: `
            <div class="form-group">
              <label>How many areas did ${actor.name} move before impact?</label>
              <input type="number" name="areas" value="1" min="1" max="20" />
              <div style="font-size: 0.8em; color: #666;">1 area = 10 feet. Distance affects damage and CS bonus.</div>
            </div>
          `,
          buttons: {
            ok: {
              label: "Calculate Damage",
              callback: (html) => resolve(parseInt(html.find('[name="areas"]').val()) || 1)
            }
          }
        }).render(true);
      });
      
      await processChargeAttack({
        attacker: actor,
        target: target,
        areasMovedThrough: areasMovedThrough,
        rollResult: color
      });
    } else if (target && actionCode !== "Ca" && actionCode !== "Ch" && actionCode !== "Do") {
      await processUniversalActionTarget(actor, target, actionCode, color, finalValue, options.weaponName || label, options);
    } else if (actionCode === "Ch") {
      ui.notifications.info("Charging requires a target to be selected.");
    } else {
      ui.notifications.info("No target selected — result shown, but no damage processed.");
    }
  }
}

// ============================================
// UTILITY FUNCTIONS (OUTSIDE THE CLASS)
// ============================================

/**
 * Process a universal action against a single target
 * @param {Actor} actor - The attacking actor
 * @param {Actor} target - The target actor  
 * @param {String} actionCode - The action code (BA, EA, etc.)
 * @param {String} resultColor - The roll result color
 * @param {Number} baseDamage - The base damage value
 * @param {String} sourceName - The source name for chat
 */
// Around line 3570 in processUniversalActionTarget function
async function processUniversalActionTarget(actor, target, actionCode, resultColor, baseDamage, sourceName, options = {}) {
  console.log(`🎯 DEBUG: processUniversalActionTarget called with resultColor: "${resultColor}"`);
  
  if (resultColor.toLowerCase() === "white") {
    console.log(`🎯 DEBUG: Skipping damage - result was white (miss)`);
    return;
  }

  const damageTypeMap = {
    BA: "Physical-Blunt", EA: "Physical-Edged", Sh: "Physical-Shooting",
    TE: "Physical-Edged", TB: "Physical-Blunt", En: "Energy-Energy",
    Fo: "Force", Gp: "Physical-Grapple", Gb: "Physical-Grab", Ch: "Physical-Charge"
  };

  const damageType = damageTypeMap[actionCode] || "Unknown";
  const canBeStun = ["BA", "EA", "Sh", "En", "Fo", "TE", "TB"].includes(actionCode);
  const canBeSlam = ["BA", "EA", "Ch"].includes(actionCode);
  const canBeKill = ["EA", "Sh", "En", "TE"].includes(actionCode);

  // Use custom damage if provided, otherwise use the calculated damage
  let finalBaseDamage = options.customDamage || baseDamage;

  // FIX: For Blunt Attacks (BA), use Strength for damage, not the rolling ability
  if (actionCode === "BA" && !options.customDamage) {
    finalBaseDamage = actor.system.abilities.strength.value || 0;
    console.log(`🎯 BA DAMAGE FIX: Using Strength ${finalBaseDamage} instead of Fighting ${baseDamage}`);
  }

  console.log(`🎯 DEBUG: Final damage being used: ${finalBaseDamage} ${options.customDamage ? '(custom)' : '(calculated)'}`);

  // Check if this is a wrestling action
  if (["Gp", "Gb", "Es"].includes(actionCode)) {
    try {
      await game.msh.CombatHandler.processWrestlingAction({
        attacker: actor,
        target,
        actionType: actionCode,
        resultColor: resultColor.toLowerCase(),
        sourceName: sourceName
      });
    } catch (error) {
      console.error("Error processing wrestling action:", error);
      ui.notifications.error("Failed to process wrestling action");
    }
  } else {
    // Regular damage processing for non-wrestling actions
    try {
      await game.msh.runAsGM({
        operation: 'applyCombatHandlerDamage',
        attackerUuid: actor.uuid,
        targetActorUuid: target.uuid,
        baseDamage: finalBaseDamage, // Use the corrected damage value
        damageType,
        sourceName: sourceName,
        canBeStun,
        canBeSlam,
        canBeKill,
        originalRollResult: resultColor.toLowerCase()
      });
    } catch (error) {
      console.error("Error processing damage:", error);
      ui.notifications.error("Failed to process damage");
    }
  }
}

/**
 * Process multiple attacks with Fighting FEAT and CS penalties
 * @param {Actor} actor - The attacking actor
 * @param {Object} attackData - The base attack data
 * @param {Number} attackCount - Number of attacks (2 or 3)
 * @param {Object} options - Additional options
 * @returns {Array} - Array of attack results
 */
/**
 * Process multiple attacks with Fighting FEAT and CS penalties
 * @param {Actor} actor - The attacking actor
 * @param {Item} power - The power being used
 * @param {Object} options - Attack options
 * @returns {Array} - Array of attack results
 */
async function processMultipleAttackSequence(actor, power, options) {
  const { attackCount, actionType } = options;
  
  console.log(`Starting multiple attack sequence: ${attackCount} attacks with ${power.name}`);
  
  // First, roll the Fighting FEAT
  const featResult = await game.msh.CombatHandler.rollMultipleAttackFeat(actor, attackCount);
  
  if (featResult.cancelled) {
    ui.notifications.info("Multiple attack cancelled");
    return [];
  }
  
  if (!featResult.success) {
    // Failed FEAT: Single attack at -3CS
    console.log("Fighting FEAT failed - single attack with -3CS penalty");
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div style="background-color: #ffebee; border: 1px solid #f44336; border-radius: 3px; padding: 8px; margin: 5px 0;">
          <div style="color: #d32f2f; font-weight: bold; margin-bottom: 5px;">Multiple Attack Failed</div>
          <div style="font-size: 0.9em;">
            <div>${actor.name} failed the Fighting FEAT for ${attackCount} attacks.</div>
            <div>Result: Single attack only, at -3CS penalty.</div>
          </div>
        </div>
      `
    });
    
    // Apply -3CS penalty and make single attack
    const modifiedOptions = {
      ...options,
      columnShift: options.columnShift - 3,
      multiAttacks: false,
      attackCount: 1
    };
    
    return [await FaseripRolls.rollPower(actor, power, {
      useDirectRoll: true,
      ...modifiedOptions
    })];
  }
  
  // Success: Multiple attacks at -1CS each
  console.log(`Fighting FEAT succeeded - proceeding with ${attackCount} attacks at -1CS each`);
  
  const results = [];
  const targets = Array.from(game.user.targets);
  
  for (let i = 1; i <= attackCount; i++) {
    console.log(`Making attack ${i} of ${attackCount}`);
    
    // Each attack gets -1CS penalty
    const attackOptions = {
      ...options,
      columnShift: options.columnShift - 1,
      multiAttacks: false, // Prevent recursion
      attackCount: 1
    };
    
    const attackResult = await FaseripRolls.rollPower(actor, power, {
      useDirectRoll: true,
      ...attackOptions
    });
    
    results.push(attackResult);
    
    // Small delay between attacks for better visual flow
    if (i < attackCount) {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
  
  // Create summary message
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="background-color: #e8f5e8; border: 1px solid #4caf50; border-radius: 3px; padding: 8px; margin: 5px 0;">
        <div style="color: #2e7d32; font-weight: bold; margin-bottom: 5px;">Multiple Attack Sequence Complete</div>
        <div style="font-size: 0.9em;">
          <div>${actor.name} completed ${attackCount} attacks with ${power.name}.</div>
          <div>Each attack was made at -1CS due to multiple attack rules.</div>
        </div>
      </div>
    `
  });
  
  return results;
}

// NEW FUNCTION FOR TALENTS
async function processMultipleTalentAttackSequence(actor, talent, options) {
  const { attackCount } = options;
  console.log(`Starting multiple talent attack sequence: ${attackCount} attacks with ${talent.name}`);

  const featResult = await CombatHandler.rollMultipleAttackFeat(actor, attackCount);

  if (featResult.cancelled) {
    ui.notifications.info("Multiple attack cancelled");
    return [];
  }

  if (!featResult.success) {
    console.log("Fighting FEAT failed - single talent attack with -3CS penalty");
    const modifiedOptions = { ...options, extraShift: (options.extraShift || 0) - 3, multiAttacks: false, attackCount: 1 };
    return [await FaseripRolls.rollTalent(actor, talent, { useDirectRoll: true, ...modifiedOptions })];
  }

  console.log(`Fighting FEAT succeeded - proceeding with ${attackCount} talent attacks at -1CS each`);
  const results = [];
  for (let i = 1; i <= attackCount; i++) {
    const attackOptions = { ...options, extraShift: (options.extraShift || 0) - 1, multiAttacks: false, attackCount: 1 };
    const attackResult = await FaseripRolls.rollTalent(actor, talent, { useDirectRoll: true, ...attackOptions });
    results.push(attackResult);
    if (i < attackCount) await new Promise(resolve => setTimeout(resolve, 800));
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="background-color: #e8f5e8; border: 1px solid #4caf50; border-radius: 3px; padding: 8px; margin: 5px 0;">
        <div style="color: #2e7d32; font-weight: bold; margin-bottom: 5px;">Multiple Attack Sequence Complete</div>
        <p>${actor.name} completed ${attackCount} attacks with talent: ${talent.name}. Each at -1CS.</p>
      </div>`
  });

  return results;
}

/**
 * Make a single attack with a CS penalty applied
 * @param {Actor} actor - The attacking actor
 * @param {Object} attackData - Attack data
 * @param {Number} csPenalty - Column shift penalty (negative number)
 * @param {Object} options - Additional options
 */
async function makeSingleAttackWithPenalty(actor, attackData, csPenalty, options = {}) {
  // This function will need to be implemented differently for each roll type
  // For now, it's a placeholder that calls the appropriate roll function
  // The actual implementation will depend on whether this is from rollPower, rollTalent, etc.
  
  console.log(`Making single attack with ${csPenalty}CS penalty`);
  
  // This is where we'd call the specific roll function with the penalty applied
  // For now, just return a placeholder result
  return {
    penalty: csPenalty,
    attackData: attackData,
    options: options
  };
}


// 3. The handleCombatEffect function should remain outside the class at the very end:

async function handleCombatEffect({ actor, target, actionType, resultColor, sourceName, baseDamage = 0 }) {
  const damageTypeMap = {
    BA: "Physical-Blunt",
    EA: "Physical-Edged",
    Sh: "Physical-Shooting",
    TE: "Physical-Edged",
    TB: "Physical-Blunt",
    En: "Energy-Energy",
    Fo: "Force",
    Gp: "Physical-Grapple",
    Gb: "Physical-Grab",
    Ch: "Physical-Charge"
    // Extend as needed
  };

  const damageType = damageTypeMap[actionType] || "Unknown";
  const canBeStun = ["BA", "EA", "Sh", "En", "Fo", "TE", "TB"].includes(actionType);
  const canBeSlam = ["BA", "EA", "Ch"].includes(actionType);
  const canBeKill = ["EA", "Sh", "En", "TE"].includes(actionType);

  // Bail if no target
  if (!target) {
    ui.notifications.warn("No target selected for combat effect.");
    return;
  }

  await CombatHandler.processAttack({
    attacker: actor,
    target,
    baseDamage,
    damageType,
    sourceName,
    canBeStun,
    canBeSlam,
    canBeKill,
    originalRollResult: resultColor.toLowerCase()
  });
}

// Catch functions
async function validateCatchingAttempt(actor, actionCode, targetToken) {
  if (actionCode !== "Ca") return { valid: true };
  
  const agility = actor.system.abilities.agility;
  const agilityRank = agility.rank;
  
  // Check if there's a selected target (projectile/falling object)
  if (!targetToken) {
    ui.notifications.info("No target selected - creating temporary falling object for this catch attempt.");
    // Create a temporary "falling object" data structure
    const tempCatchingInfo = await getCatchingInfoDialog();
    return { 
      valid: true, 
      targetType: tempCatchingInfo.objectType,
      catchingInfo: tempCatchingInfo,
      isTemporary: true
    };
  }
  
  const target = targetToken.actor;
  
  // Pop up dialog to determine what's being caught
  const catchingInfo = await new Promise((resolve) => {
    new Dialog({
      title: `Catching Attempt: ${target.name}`,
      content: `
        <form>
          <div class="form-group">
            <label><strong>What is ${actor.name} trying to catch?</strong></label>
            <select name="objectType" id="objectType">
              <option value="falling">Falling Object/Character</option>
              <option value="thrown">Thrown Projectile</option>
              <option value="arrow">Arrow/Large Thin Projectile</option>
              <option value="bullet">Bullet/Small Fast Projectile</option>
            </select>
          </div>
          
          <div class="form-group" id="fallingOptions" style="display: block;">
            <label><strong>How long has the object/character been falling?</strong></label>
            <select name="fallDuration">
              <option value="1">1st Round - 3 floors/round (Typical speed)</option>
              <option value="2">2nd Round - 6 floors/round (Good speed)</option>
              <option value="3">3rd Round - 10 floors/round (Excellent speed)</option>
              <option value="4">4th+ Round - 20 floors/round (Remarkable speed)</option>
            </select>
            <!-- 🔴 ADD THE DAMAGE PREVIEW HERE 🔴 -->
            <div style="font-size: 0.8em; margin-top: 5px; color: #666;">
              <strong>Impact damage if catch fails (assumes Typical person, concrete ground):</strong><br>
              • 1st Round: ~12 damage (6 + 6)<br>
              • 2nd Round: ~18 damage (6 + 12)<br>
              • 3rd Round: ~26 damage (6 + 20)<br>
              • 4th+ Round: ~46 damage (6 + 40) - Usually fatal!
            </div>
            
            <div style="margin-top: 10px;">
              <label><strong>Total fall distance (in floors/stories):</strong></label>
              <input type="number" name="totalFallDistance" value="10" min="1" max="100" style="width: 60px;">
              <div style="font-size: 0.8em; color: #666;">Used for impact damage if catch fails</div>
            </div>
          </div>
          
          <div class="form-group" id="projectileOptions" style="display: none;">
            <label><strong>Projectile Details</strong></label>
            <div style="margin: 5px 0;">
              <label>Damage/Material Strength:</label>
              <input type="number" name="projectileDamage" value="10" min="1" max="100">
            </div>
            <div style="margin: 5px 0;">
              <label>Speed Rank:</label>
              <select name="projectileSpeed">
                <option value="Poor">Poor (2)</option>
                <option value="Typical">Typical (6)</option>
                <option value="Good">Good (10)</option>
                <option value="Excellent">Excellent (20)</option>
                <option value="Remarkable">Remarkable (30)</option>
              </select>
            </div>
          </div>
          
          <div class="form-group">
            <label>
              <input type="checkbox" name="directedAttack" />
              This object/attack is specifically directed at ${actor.name} (-3CS penalty)
            </label>
          </div>
          
          <div class="form-group" id="objectWeight" style="display: block;">
            <label><strong>Object/Character Weight/Mass</strong></label>
            <select name="objectMass">
              <option value="2">Light (Feeble) - Small items, papers</option>
              <option value="6">Normal (Typical) - Books, small tools, normal person</option>
              <option value="10">Heavy (Good) - Large books, weapons, large person</option>
              <option value="20">Very Heavy (Excellent) - Furniture, large objects</option>
              <option value="30">Extremely Heavy (Remarkable) - Boulders, vehicles</option>
              <option value="50">Massive (Amazing) - Cars, small buildings</option>
            </select>
          </div>
        </form>
        
        <script>
          document.getElementById('objectType').addEventListener('change', function() {
            const fallingOptions = document.getElementById('fallingOptions');
            const projectileOptions = document.getElementById('projectileOptions');
            const objectWeight = document.getElementById('objectWeight');
            
            if (this.value === 'falling') {
              fallingOptions.style.display = 'block';
              projectileOptions.style.display = 'none';
              objectWeight.style.display = 'block';
            } else {
              fallingOptions.style.display = 'none';
              projectileOptions.style.display = 'block';
              objectWeight.style.display = 'none';
            }
          });
        </script>
      `,
      buttons: {
        attempt: {
          label: "Attempt Catch",
          callback: (html) => {
            const objectType = html.find('[name="objectType"]').val();
            const fallDuration = parseInt(html.find('[name="fallDuration"]').val()) || 1;
            const totalFallDistance = parseInt(html.find('[name="totalFallDistance"]').val()) || 10;
            const directedAttack = html.find('[name="directedAttack"]').is(':checked');
            const objectMass = parseInt(html.find('[name="objectMass"]').val()) || 6;
            const projectileDamage = parseInt(html.find('[name="projectileDamage"]').val()) || 10;
            const projectileSpeed = html.find('[name="projectileSpeed"]').val() || "Good";
            
            resolve({
              objectType,
              fallDuration,
              totalFallDistance,
              directedAttack,
              objectMass,
              projectileDamage,
              projectileSpeed,
              cancelled: false
            });
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => resolve({ cancelled: true })
        }
      },
      default: "attempt",
      render: (html) => {
        // Initialize the form display
        const objectTypeSelect = html.find('#objectType')[0];
        if (objectTypeSelect) {
          objectTypeSelect.dispatchEvent(new Event('change'));
        }
      }
    }).render(true);
  });
  
  if (catchingInfo.cancelled) {
    return { valid: false };
  }
  
  // Check minimum Agility requirements based on object type
  const rankValues = {
    "Shift-0": 0, "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10,
    "Excellent": 20, "Remarkable": 30, "Incredible": 40, "Amazing": 50,
    "Monstrous": 75, "Unearthly": 100, "Shift X": 150, "Shift Y": 200,
    "Shift Z": 300, "Class 1000": 1000, "Class 3000": 3000, "Class 5000": 5000,
    "Beyond": 10000
  };
  
  const agilityValue = rankValues[agilityRank] || 6;
  let requiredAgility = 0;
  let requiredRank = "";
  
  switch (catchingInfo.objectType) {
    case "bullet":
    case "small_fast":
      requiredAgility = 100;
      requiredRank = "Unearthly";
      break;
    case "arrow":
    case "large_thin":
      requiredAgility = 50;
      requiredRank = "Amazing";
      break;
    case "thrown":
    case "projectile":
      requiredAgility = 30;
      requiredRank = "Remarkable";
      break;
    case "falling":
    case "character":
    case "object":
    default:
      // Any Agility can catch falling objects/characters
      requiredAgility = 0;
      requiredRank = "Any";
      break;
  }
  
  if (agilityValue < requiredAgility) {
    ui.notifications.error(`Catching ${catchingInfo.objectType} requires at least ${requiredRank} Agility. ${actor.name} has ${agilityRank}.`);
    return { valid: false };
  }
  
  // Calculate fall speed and areas moved based on FASERIP rules
  let fallSpeed, fallSpeedRank, areasMovedThrough;
  
  if (catchingInfo.objectType === "falling") {
    // Use official FASERIP falling speeds
    switch (catchingInfo.fallDuration) {
      case 1:
        fallSpeed = 3;
        fallSpeedRank = "Typical";
        areasMovedThrough = 3;
        break;
      case 2:
        fallSpeed = 6;
        fallSpeedRank = "Good";
        areasMovedThrough = 6;
        break;
      case 3:
        fallSpeed = 10;
        fallSpeedRank = "Excellent";
        areasMovedThrough = 10;
        break;
      case 4:
      default:
        fallSpeed = 20;
        fallSpeedRank = "Remarkable";
        areasMovedThrough = 20;
        break;
    }
  }
  
  // Set flags on the target based on the dialog results using GM permissions
  const flagUpdates = {
    "flags.msh-faserip.projectileType": catchingInfo.objectType,
    "flags.msh-faserip.directedAttack": catchingInfo.directedAttack,
    "flags.msh-faserip.objectWeight": catchingInfo.objectMass,
    "flags.msh-faserip.projectileDamage": catchingInfo.projectileDamage,
    "flags.msh-faserip.projectileSpeed": catchingInfo.projectileSpeed
  };

  if (catchingInfo.objectType === "falling") {
    flagUpdates["flags.msh-faserip.fallSpeed"] = fallSpeedRank;
    flagUpdates["flags.msh-faserip.fallDuration"] = catchingInfo.fallDuration;
    flagUpdates["flags.msh-faserip.totalFallDistance"] = catchingInfo.totalFallDistance;
    flagUpdates["flags.msh-faserip.areasMovedThrough"] = areasMovedThrough;
  }

  await runAsGM({
    operation: 'update',
    targetActorUuid: target.uuid,
    args: [flagUpdates]
  });
  
  return { 
    valid: true, 
    targetType: catchingInfo.objectType, 
    requiredRank,
    catchingInfo,
    fallSpeed,
    fallSpeedRank,
    areasMovedThrough
  };
}

// Add this function to process catching results with charge damage integration
async function processCatchingResult(actor, target, color, actionCode, finalValue, label) {
  const targetType = target?.getFlag("msh-faserip", "projectileType") || "falling";
  const isDirectedAttack = target?.getFlag("msh-faserip", "directedAttack") || false;
  
  switch (color.toLowerCase()) {
    // Update the white (Auto-hit) case for falling objects in processCatchingResult:
    case "white": // Auto-hit
      if (targetType === "falling") {
        // Failed catch - falling person hits the catcher AND then hits the ground
        const fallDuration = target?.getFlag("msh-faserip", "fallDuration") || 1;
        const totalFallDistance = target?.getFlag("msh-faserip", "totalFallDistance") || 10;
        const areasMovedThrough = target?.getFlag("msh-faserip", "areasMovedThrough") || 3;
        const objectWeight = target?.getFlag("msh-faserip", "objectWeight") || 6;
        
        // Calculate damage to the catcher (collision)
        const damageResults = calculateChargeDamage({
          attackerEndurance: objectWeight,
          attackerBodyArmor: getBodyArmorValue(target) || 0, // Falling person's armor
          defenderBodyArmor: getBodyArmorValue(actor),
          areasMovedThrough: areasMovedThrough,
          resultColor: "green", // Treat as automatic hit
          isInanimateObject: false,
          objectMaterialStrength: 0
        });
        
        // Calculate damage to falling person when they hit ground after collision
        const fallingPersonEndurance = objectWeight;
        const fallingPersonArmor = getBodyArmorValue(target) || 0;
        const groundImpactDamage = Math.max(fallingPersonEndurance, fallingPersonArmor) + (2 * areasMovedThrough);
        const netGroundDamage = Math.max(0, groundImpactDamage - fallingPersonArmor);
        
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `
            <div style="background-color: #ffebee; border: 1px solid #f44336; border-radius: 3px; padding: 8px; margin: 5px 0;">
              <div style="color: #d32f2f; font-weight: bold;">Catching Failed - Auto-hit!</div>
              <div style="font-size: 0.9em; margin-top: 5px;">
                ${actor.name} failed to catch the falling person and is struck by them!<br>
                <strong>Fall Duration:</strong> Round ${fallDuration} (${areasMovedThrough} floors/round)<br>
                <strong>Total Fall Distance:</strong> ${totalFallDistance} floors<br>
                <strong>Person Weight:</strong> ${objectWeight}<br>
                <strong>Impact Speed:</strong> ${areasMovedThrough} areas/round<br>
                <br>
                <strong>Collision Damage:</strong> ${damageResults.description}<br>
                ${damageResults.damageToDefender > 0 ? 
                  `<span style="color: #cc0000;"><strong>${actor.name} takes ${damageResults.damageToDefender} collision damage!</strong></span>` : 
                  '<span style="color: #28a745;"><strong>${actor.name} takes no collision damage (absorbed by armor)</strong></span>'
                }<br>
                <br>
                <strong>Ground Impact:</strong> Falling person then hits the ground<br>
                <strong>Ground Impact Damage:</strong> ${groundImpactDamage} points (rebounds from concrete)<br>
                ${netGroundDamage > 0 ? 
                  `<span style="color: #cc0000;"><strong>${target.name} takes ${netGroundDamage} falling damage!</strong></span>` : 
                  '<span style="color: #28a745;"><strong>${target.name} takes no falling damage (absorbed by armor)</strong></span>'
                }
              </div>
            </div>
          `
        });
        
        // Apply collision damage to catcher
        if (damageResults.damageToDefender > 0) {
          console.log(`🩸 DEBUG: Applying ${damageResults.damageToDefender} collision damage to ${actor.name}`);
          console.log(`🩸 DEBUG: Current health: ${actor.system.attributes.health.value}`);
          console.log(`🩸 DEBUG: Actor UUID: ${actor.uuid}`);
          console.log(`🩸 DEBUG: Actor type: ${actor.constructor.name}`);
          console.log(`🩸 DEBUG: Is token actor: ${actor.isToken}`);
          
          const newHealth = Math.max(0, actor.system.attributes.health.value - damageResults.damageToDefender);
          console.log(`🩸 DEBUG: New health should be: ${newHealth}`);
          
          // Use the correct actor UUID
          const actorUuid = actor.isToken ? actor.token.uuid : actor.uuid;
          console.log(`🩸 DEBUG: Using UUID: ${actorUuid}`);
          
          await runAsGM({
            operation: 'adjustTargetHealth',
            targetActorUuid: actorUuid,
            newHealth: newHealth
          });
          
          console.log(`🩸 DEBUG: Health update command sent via runAsGM`);
        }
        
      // Apply ground impact damage to falling person
      if (netGroundDamage > 0 && target.system?.attributes?.health) {
        console.log(`🩸 DEBUG: Applying ${netGroundDamage} ground damage to ${target.name}`);
        console.log(`🩸 DEBUG: Current health: ${target.system.attributes.health.value}`);
        console.log(`🩸 DEBUG: Target UUID: ${target.uuid}`);
        console.log(`🩸 DEBUG: Target type: ${target.constructor.name}`);
        console.log(`🩸 DEBUG: Is token actor: ${target.isToken}`);
        
        const newHealth = Math.max(0, target.system.attributes.health.value - netGroundDamage);
        console.log(`🩸 DEBUG: New health should be: ${newHealth}`);
        
        // Use the correct actor UUID - if it's a token actor, use the token's actor
        const actorUuid = target.isToken ? target.token.uuid : target.uuid;
        console.log(`🩸 DEBUG: Using UUID: ${actorUuid}`);
        
        await runAsGM({
          operation: 'adjustTargetHealth',
          targetActorUuid: actorUuid,
          newHealth: newHealth
        });
        
        console.log(`🩸 DEBUG: Health update command sent via runAsGM`);
      }
        
      } else {
        // Existing projectile auto-hit code...
      }
      break;
      
    case "green": // Miss
      if (isDirectedAttack) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `
            <div style="background-color: #fff3e0; border: 1px solid #ff9800; border-radius: 3px; padding: 8px; margin: 5px 0;">
              <div style="color: #f57c00; font-weight: bold;">Catching Missed!</div>
              <div style="font-size: 0.9em; margin-top: 5px;">
                ${actor.name} missed catching the object directed at them.<br>
                The original attack proceeds with +1CS to hit.
              </div>
            </div>
          `
        });
        // TODO: Apply +1CS to original attack roll
      } else if (targetType === "falling") {
        // Failed to catch falling object/person - they hit the ground!
        const fallDuration = target?.getFlag("msh-faserip", "fallDuration") || 1;
        const totalFallDistance = target?.getFlag("msh-faserip", "totalFallDistance") || 10;
        const areasMovedThrough = target?.getFlag("msh-faserip", "areasMovedThrough") || 3;
        const objectWeight = target?.getFlag("msh-faserip", "objectWeight") || 6;
        
        // Calculate rebound damage from hitting concrete (using corrected falling rules)
        const personEndurance = objectWeight;
        const personArmor = getBodyArmorValue(target) || 0;
        const impactDamage = Math.max(personEndurance, personArmor) + (2 * areasMovedThrough);
        const concreteStrength = 30; // Remarkable - concrete pavement
        
        // Since concrete is stronger than most impacts, full rebound damage applies
        const reboundDamage = impactDamage;
        const netDamage = Math.max(0, reboundDamage - personArmor);
        
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `
            <div style="background-color: #fff3e0; border: 1px solid #ff9800; border-radius: 3px; padding: 8px; margin: 5px 0;">
              <div style="color: #f57c00; font-weight: bold;">Catching Missed!</div>
              <div style="font-size: 0.9em; margin-top: 5px;">
                ${actor.name} missed catching the falling person.<br>
                <strong>Fall Duration:</strong> Round ${fallDuration} (${areasMovedThrough} floors/round)<br>
                <strong>Ground Impact:</strong> ${target.name} hits concrete pavement!<br>
                <strong>Ground Material:</strong> Remarkable (concrete/asphalt) - ${concreteStrength} strength<br>
                <strong>Impact Force:</strong> ${impactDamage} points<br>
                <strong>Rebound Damage:</strong> All impact force rebounds to person<br>
                ${netDamage > 0 ? 
                  `<span style="color: #cc0000;"><strong>${target.name} takes ${netDamage} falling damage!</strong></span>` : 
                  '<span style="color: #28a745;"><strong>No damage taken (absorbed by armor)</strong></span>'
                }
              </div>
            </div>
          `
        });
        
        // Apply falling damage to the person who hit the ground
        if (netDamage > 0 && target.system?.attributes?.health) {
          console.log(`🩸 DEBUG: Applying ${netDamage} falling damage to ${target.name}`);
          console.log(`🩸 DEBUG: Current health: ${target.system.attributes.health.value}`);
          console.log(`🩸 DEBUG: Target UUID: ${target.uuid}`);
          
          const newHealth = Math.max(0, target.system.attributes.health.value - netDamage);
          console.log(`🩸 DEBUG: New health should be: ${newHealth}`);
          
          await runAsGM({
            operation: 'adjustTargetHealth',
            targetActorUuid: target.uuid,
            newHealth: newHealth
          });
          
          console.log(`🩸 DEBUG: Health update command sent via runAsGM`);
        }
      } else {
        // Other non-directed projectiles
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `
            <div style="background-color: #fff3e0; border: 1px solid #ff9800; border-radius: 3px; padding: 8px; margin: 5px 0;">
              <div style="color: #f57c00; font-weight: bold;">Catching Missed!</div>
              <div style="font-size: 0.9em; margin-top: 5px;">
                ${actor.name} missed catching the object.
              </div>
            </div>
          `
        });
      }
      break;
      
    case "yellow": // Damage
      // Calculate damage to the caught object/character
      const catchDamage = actor.system.abilities.strength.value || 10;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div style="background-color: #fff8e1; border: 1px solid #ffc107; border-radius: 3px; padding: 8px; margin: 5px 0;">
            <div style="color: #f57c00; font-weight: bold;">Catching Succeeded - With Damage!</div>
            <div style="font-size: 0.9em; margin-top: 5px;">
              ${actor.name} caught the object but may have damaged it!<br>
              <strong>Catch Damage:</strong> ${catchDamage} (based on ${actor.name}'s Strength)<br>
              ${target.type === "character" ? 
                `<span style="color: #cc0000;"><strong>${target.name} takes ${catchDamage} damage from rough catch!</strong></span>` :
                `<strong>Object may be damaged (GM discretion)</strong>`
              }
            </div>
          </div>
        `
      });
      
      // Apply damage if target is a character
      if (target.type === "character" || target.system?.attributes?.health) {
        const targetArmorValue = getBodyArmorValue(target);
        const netDamage = Math.max(0, catchDamage - targetArmorValue);
        
        if (netDamage > 0) {
          await game.msh.runAsGM({
            operation: 'adjustTargetHealth',
              targetActorUuid: target?.actor?.uuid || target.uuid,
            newHealth: Math.max(0, target.system.attributes.health.value - netDamage)
          });
        }
      }
      break;
      
    case "red": // Catch
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div style="background-color: #e8f5e8; border: 1px solid #4caf50; border-radius: 3px; padding: 8px; margin: 5px 0;">
            <div style="color: #2e7d32; font-weight: bold;">Perfect Catch!</div>
            <div style="font-size: 0.9em; margin-top: 5px;">
              ${actor.name} successfully caught the object with no ill effects!
            </div>
          </div>
        `
      });
      break;
  }
}

// Add this function to help GMs set up catching scenarios
// Enhanced setup function for catching scenarios
async function setupCatchingScenario(token) {
  if (!token) {
    ui.notifications.warn("Please select a token representing the object to be caught.");
    return;
  }
  
  new Dialog({
    title: "Setup Catching Scenario",
    content: `
      <form>
        <div class="form-group">
          <label>Object Type</label>
          <select name="projectileType">
            <option value="falling">Falling Object/Character</option>
            <option value="thrown">Thrown Projectile</option>
            <option value="arrow">Arrow/Large Thin Projectile</option>
            <option value="bullet">Bullet/Small Fast Projectile</option>
          </select>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="directedAttack" />
            Directed against character (-3CS penalty)
          </label>
        </div>
        <div class="form-group">
          <label>Fall Speed / Object Speed</label>
          <select name="fallSpeed">
            <option value="Poor">Poor (2)</option>
            <option value="Typical">Typical (6)</option>
            <option value="Good" selected>Good (10)</option>
            <option value="Excellent">Excellent (20)</option>
            <option value="Remarkable">Remarkable (30)</option>
            <option value="Incredible">Incredible (40)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Object Weight/Mass (for falling objects)</label>
          <input type="number" name="objectWeight" value="10" />
        </div>
        <div class="form-group">
          <label>Projectile Damage (for thrown/shot objects)</label>
          <input type="number" name="projectileDamage" value="10" />
        </div>
      </form>
    `,
    buttons: {
      setup: {
        label: "Setup",
        callback: async (html) => {
          const projectileType = html.find('[name="projectileType"]').val();
          const directedAttack = html.find('[name="directedAttack"]').is(':checked');
          const fallSpeed = html.find('[name="fallSpeed"]').val();
          const objectWeight = parseInt(html.find('[name="objectWeight"]').val()) || 10;
          const projectileDamage = parseInt(html.find('[name="projectileDamage"]').val()) || 10;
          
          await token.actor.setFlag("msh-faserip", "projectileType", projectileType);
          await token.actor.setFlag("msh-faserip", "directedAttack", directedAttack);
          await token.actor.setFlag("msh-faserip", "fallSpeed", fallSpeed);
          await token.actor.setFlag("msh-faserip", "objectWeight", objectWeight);
          await token.actor.setFlag("msh-faserip", "projectileDamage", projectileDamage);
          
          ui.notifications.info(`Catching scenario setup complete for ${token.name}`);
        }
      },
      cancel: { label: "Cancel" }
    }
  }).render(true);
}

// Add this to the global scope for easy GM access
window.setupCatchingScenario = setupCatchingScenario;

async function processDodgeResult(actor, color, finalValue, label) {
  // First, ask if this is the pre-action phase
  const isPreActionPhase = await new Promise((resolve) => {
    new Dialog({
      title: "Dodge Timing Validation",
      content: `
        <div style="text-align: center; padding: 15px;">
          <h3>Dodge Declaration</h3>
          <p><strong>${actor.name}</strong> wants to dodge.</p>
          <p style="margin: 10px 0; font-weight: bold; color: #8b0000;">
            Is this the pre-action phase?
          </p>
          <p style="font-size: 0.9em; color: #666;">
            According to FASERIP rules, dodging must be declared "at the start of the turn, 
            as soon as Initiative is determined" - before any other actions are taken.
          </p>
        </div>
      `,
      buttons: {
        yes: {
          icon: '<i class="fas fa-check"></i>',
          label: "Yes - Pre-Action Phase",
          callback: () => resolve(true)
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "No - Actions Already Started",
          callback: () => resolve(false)
        }
      },
      default: "yes"
    }).render(true);
  });

  if (!isPreActionPhase) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div style="background-color: #ffebee; border: 1px solid #f44336; border-radius: 3px; padding: 8px; margin: 5px 0;">
          <div style="color: #d32f2f; font-weight: bold;">Dodge Failed - Wrong Timing!</div>
          <div style="font-size: 0.9em; margin-top: 5px;">
            ${actor.name} cannot dodge now - dodging must be declared at the start of the turn,
            as soon as Initiative is determined, before any other actions are taken.
          </div>
        </div>
      `
    });
    return;
  }

  // Convert result color to CS penalty
  let csPenalty = "";
  let description = "";
  
  switch (color.toLowerCase()) {
    case "white":
      csPenalty = "Auto-hit";
      description = "All attacks automatically hit the dodger this turn.";
      break;
    case "green":
      csPenalty = "-2CS";
      description = "Attackers suffer -2 Column Shift penalty when targeting the dodger.";
      break;
    case "yellow":
      csPenalty = "-4CS";
      description = "Attackers suffer -4 Column Shift penalty when targeting the dodger.";
      break;
    case "red":
      csPenalty = "-6CS";
      description = "Attackers suffer -6 Column Shift penalty when targeting the dodger.";
      break;
  }

  // Create comprehensive dodge status message
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="background-color: #e3f2fd; border: 1px solid #2196f3; border-radius: 3px; margin: 5px 0;">
        <div style="padding: 8px 12px; border-bottom: 1px solid #2196f3; font-size: 1.2em; color: #1976d2; font-weight: bold;">
          🏃 DODGE STANCE ACTIVATED 🏃
        </div>
        <div style="padding: 10px 12px; font-size: 0.95em;">
          <div style="margin-bottom: 8px;"><strong>${actor.name}</strong> enters a defensive dodging stance!</div>
          
          <div style="background: #f5f5f5; padding: 8px; border-radius: 3px; margin: 8px 0;">
            <div style="font-weight: bold; color: #1976d2; margin-bottom: 5px;">🎯 Dodge Result: ${csPenalty}</div>
            <div>${description}</div>
          </div>

          <div style="background: #fff3e0; padding: 8px; border-radius: 3px; border-left: 3px solid #ff9800;">
            <div style="font-weight: bold; color: #f57c00; margin-bottom: 5px;">⚠️ Turn Restrictions (GM Enforced):</div>
            <div>• <strong>Movement:</strong> Only half speed this turn</div>
            <div>• <strong>Actions:</strong> Maximum ONE other action this turn</div>
            <div>• <strong>Charging:</strong> Cannot make charging attacks</div>
            <div>• <strong>Own Attacks:</strong> All attack rolls at -2CS penalty</div>
          </div>

          <div style="background: #e8f5e8; padding: 8px; border-radius: 3px; border-left: 3px solid #4caf50;">
            <div style="font-weight: bold; color: #2e7d32; margin-bottom: 5px;">✅ Dodge Limitations:</div>
            <div>• Only works against attacks the character is aware of</div>
            <div>• No effect against unexpected/blindsiding attacks</div>
            <div>• No effect against slugfest and wrestling attacks</div>
            <div>• Cannot dodge attacks from allies</div>
            <div>• Cannot dodge sniper attacks from unknown locations</div>
          </div>

          <div style="margin-top: 10px; padding: 8px; background: #f9f9f9; border-radius: 3px; font-style: italic; text-align: center;">
            <strong>GM Note:</strong> Apply the ${csPenalty} modifier to all applicable incoming attacks this turn.
            Remember to enforce movement and action restrictions.
          </div>
        </div>
      </div>
    `
  });

  // Optionally set flags on the actor for automated tracking (if desired)
  // This could be used by other systems to automatically apply penalties
  await actor.setFlag("msh-faserip", "dodgeStatus", {
    active: true,
    csPenalty: csPenalty,
    turn: game.combat?.turn || 0,
    round: game.combat?.round || 0
  });

  ui.notifications.info(`${actor.name} is now dodging with ${csPenalty} effect. GM should enforce restrictions.`);
}
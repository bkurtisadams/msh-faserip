// movement-feats.js v1.7.1 - 2025-01-19
// v1.7.1: Fix teleport distance table to use Air speed (areas = max teleport distance)
// v1.7.0: Add Teleport dialog with power rank dropdown, disorientation/passenger/solid object checks
// v1.6.0: Add Swim dialog with Swimming power dropdown, add Lightning Speed dropdown to Run dialog
// v1.5.3: Add hover text (title attributes) to compact dialog elements
// v1.5.2: Fix speed links (use spans not anchors to prevent navigation)
// v1.5.1: Fix karma controls (restore generateKarmaControlsHTML), use text links for speed quick-fill
// v1.5.0: Compact dialog layouts - 4-col stats, 2-col FEATs, inline modifiers/options
// v1.4.0: Add current speed input with Max/Cruising quick-fill buttons for Fly and Run
// v1.3.1: Fix Normal Flight/Run to show cruising speed (not max) in chat card
// v1.3.0: Add Run FEAT dialog (Normal, Speed FEAT, Exhaustion Check)
// v1.2.0: Simplify Leaping - dropdown with Strength default + manual rank selection for Leaping power
// v1.1.0: Leap dialog dropdown shows ALL powers, user selects leaping source
// Movement FEAT dialogs for Leap, Fly, Run, Swim, Teleport
// Extracted from actorSheet.js to reduce file size

import { generateKarmaControlsHTML, showKarmaDecisionDialog, getAvailableKarma } from './modules/dice/dice-roller.js';
import { RANKS_ORDERED as RANKS, RANK_ABBR } from './rules/rules-reference.js';

// Exhaustion-immune ranks
const EXHAUSTION_IMMUNE_RANKS = [
  "Unearthly", "Shift-X", "Shift X", "Shift-Y", "Shift Y", 
  "Shift-Z", "Shift Z", "Class 1000", "Class 3000", "Class 5000"
];

// Rank abbreviations — alias the canonical RANK_ABBR for local usage
const RANK_ABBREV = RANK_ABBR;

function abbrevRank(rank) {
  return RANK_ABBREV[rank] || rank.substring(0, 2);
}

/**
 * Apply column shifts to a rank
 */
function applyColumnShift(rank, shift) {
  if (shift === 0) return rank;
  const index = RANKS.indexOf(rank);
  if (index === -1) return rank;
  const newIndex = Math.min(Math.max(index + shift, 0), RANKS.length - 1);
  return RANKS[newIndex];
}

/**
 * Check if a FEAT result meets the requirement
 */
function checkFeatSuccess(resultColor, requirement) {
  const color = resultColor.toLowerCase();
  switch (requirement) {
    case "Green": return ["green", "yellow", "red"].includes(color);
    case "Yellow": return ["yellow", "red"].includes(color);
    case "Red": return color === "red";
    case "Automatic": return true;
    default: return true;
  }
}

/**
 * Color styling for chat output
 */
const COLOR_STYLES = {
  'white': { bg: '#f8f8f8', text: '#333' },
  'green': { bg: '#4CAF50', text: 'white' },
  'yellow': { bg: '#FFC107', text: '#333' },
  'red': { bg: '#F44336', text: 'white' }
};

/**
 * MovementFeats class - handles all movement-related FEAT dialogs
 */
export class MovementFeats {
  constructor(sheet) {
    this.sheet = sheet;
    this.actor = sheet.actor;
  }

  /**
   * Build dropdown options for leaping rank selection
   * Default is Strength, but user can select any rank for Leaping power
   */
  _buildLeapingRankOptions(selectedValue = 'strength') {
    const strengthAbility = this.actor.system.abilities?.strength;
    const strengthRank = strengthAbility?.rank || "Typical";
    const strengthValue = strengthAbility?.value || 6;
    
    let html = `<option value="strength" ${selectedValue === 'strength' ? 'selected' : ''}>Strength — ${strengthRank} (${strengthValue})</option>`;
    html += `<optgroup label="Leaping Power (select rank)">`;
    
    for (const rank of RANKS) {
      if (rank === "Shift-0" || rank === "Beyond") continue;
      html += `<option value="${rank}" ${selectedValue === rank ? 'selected' : ''}>${rank}</option>`;
    }
    
    html += `</optgroup>`;
    return html;
  }
  
  /**
   * Get rank info from dropdown selection
   */
  _getLeapingInfoFromSelection(selection) {
    if (selection === 'strength') {
      const strengthAbility = this.actor.system.abilities?.strength;
      return {
        id: 'strength',
        name: 'Strength',
        rank: strengthAbility?.rank || "Typical",
        value: strengthAbility?.value || 6
      };
    }
    
    // It's a rank name for Leaping power
    const rankValues = {
      "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10, "Excellent": 20,
      "Remarkable": 30, "Incredible": 40, "Amazing": 50, "Monstrous": 75,
      "Unearthly": 100, "Shift-X": 150, "Shift-Y": 200, "Shift-Z": 500,
      "Class 1000": 1000, "Class 3000": 3000, "Class 5000": 5000
    };
    
    return {
      id: selection,
      name: 'Leaping',
      rank: selection,
      value: rankValues[selection] || 6
    };
  }

  // ============================================================
  // LEAP FEAT
  // ============================================================

  /**
   * Show Leap FEAT dialog
   * Rules:
   * - Half distance: Automatic (no roll)
   * - Full distance: Green Strength/Leaping FEAT
   * - Extended (+1 area): Red Strength/Leaping FEAT
   */
  async showLeapDialog() {
    const FaseripActor = CONFIG.Actor.documentClass;
    
    // Get saved settings
    const savedLeapSource = this.actor.getFlag("msh-faserip", "lastLeapSource") || "strength";
    const savedDirection = this.actor.getFlag("msh-faserip", "lastLeapDirection") || "across";
    const savedDistance = this.actor.getFlag("msh-faserip", "lastLeapDistance") || "full";
    const savedColumnShift = this.actor.getFlag("msh-faserip", "lastLeapColumnShift") || 0;
    const skipDiceRoll = this.actor.getFlag("msh-faserip", "lastLeapSkipDiceRoll") || false;
    
    // Get initial leaping info
    const initialInfo = this._getLeapingInfoFromSelection(savedLeapSource);
    const initialLeapData = FaseripActor.MOVEMENT_DATA.leaping[initialInfo.rank] || 
                            FaseripActor.MOVEMENT_DATA.leaping["Typical"];
    
    // Build distance table function
    const buildDistanceTable = (leapData) => `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85em; margin: 8px 0;">
        <thead>
          <tr style="background: #e0e0e0;">
            <th style="padding: 4px; border: 1px solid #ccc;"></th>
            <th style="padding: 4px; border: 1px solid #ccc; font-weight: bold; color: #333;">Across</th>
            <th style="padding: 4px; border: 1px solid #ccc; font-weight: bold; color: #333;">Up</th>
            <th style="padding: 4px; border: 1px solid #ccc; font-weight: bold; color: #333;">Down</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 4px; border: 1px solid #ccc; font-weight: bold;">Half (Auto)</td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center;">${Math.floor(leapData.acrossFeet / 2)}'</td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center;">${Math.floor(leapData.upFeet / 2)}'</td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center;">${Math.floor(leapData.downFeet / 2)}'</td>
          </tr>
          <tr style="background: #e8f5e9;">
            <td style="padding: 4px; border: 1px solid #ccc; font-weight: bold;">Full (Green)</td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center;">${leapData.acrossFeet}'</td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center;">${leapData.upFeet}' (${leapData.upFloors} flr)</td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center;">${leapData.downFeet}' (${leapData.downFloors} flr)</td>
          </tr>
          <tr style="background: #ffebee;">
            <td style="padding: 4px; border: 1px solid #ccc; font-weight: bold;">Extended (Red)</td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center;">${leapData.acrossFeet * 2}'</td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center;">${leapData.upFeet * 2}' (${(leapData.upFloors * 2).toFixed(1)} flr)</td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center;">${leapData.downFeet * 2}' (${(leapData.downFloors * 2).toFixed(1)} flr)</td>
          </tr>
        </tbody>
      </table>
    `;
    
    const dialogContent = `
      <div style="background: #f5f5f0; padding: 10px; border-radius: 5px;">
        <div style="margin-bottom: 10px;">
          <label style="display: block; font-weight: bold; margin-bottom: 5px;">Leaping Ability:</label>
          <select id="leap-source" name="leapSource" style="width: 100%; padding: 4px;">
            ${this._buildLeapingRankOptions(savedLeapSource)}
          </select>
          <div style="font-size: 0.8em; color: #666; margin-top: 3px;">Select Strength or choose a rank if using Leaping power</div>
        </div>
        
        <div id="leap-distance-table">
          ${buildDistanceTable(initialLeapData)}
        </div>
        
        <div style="margin-bottom: 10px;">
          <label style="display: block; font-weight: bold; margin-bottom: 5px;">Direction:</label>
          <label style="margin-right: 15px;"><input type="radio" name="leapDirection" value="across" ${savedDirection === 'across' ? 'checked' : ''}> Across</label>
          <label style="margin-right: 15px;"><input type="radio" name="leapDirection" value="up" ${savedDirection === 'up' ? 'checked' : ''}> Up</label>
          <label><input type="radio" name="leapDirection" value="down" ${savedDirection === 'down' ? 'checked' : ''}> Down (controlled fall)</label>
        </div>
        
        <div style="margin-bottom: 10px;">
          <label style="display: block; font-weight: bold; margin-bottom: 5px;">Target Distance:</label>
          <label style="display: block; margin: 3px 0;"><input type="radio" name="leapDistance" value="half" ${savedDistance === 'half' ? 'checked' : ''}> Half distance (Automatic - no roll)</label>
          <label style="display: block; margin: 3px 0; color: #2e7d32;"><input type="radio" name="leapDistance" value="full" ${savedDistance === 'full' ? 'checked' : ''}> Full distance (Green FEAT)</label>
          <label style="display: block; margin: 3px 0; color: #c62828;"><input type="radio" name="leapDistance" value="extended" ${savedDistance === 'extended' ? 'checked' : ''}> Extended +1 area (Red FEAT)</label>
        </div>
        
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 100px;">Column Shift:</label>
          <input type="number" id="leap-shift" name="leapShift" value="${savedColumnShift}" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
        </div>
        
        ${generateKarmaControlsHTML(this.actor)}
        
        <div style="margin-bottom: 10px;">
          <label>
            <input type="checkbox" id="leap-save-settings" name="saveSettings" checked> 
            Remember settings
          </label>
        </div>
        <div>
          <label>
            <input type="checkbox" id="leap-skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
            Skip dice animation
          </label>
        </div>
      </div>
    `;
    
    // Store reference for callbacks
    const self = this;
    
    new Dialog({
      title: `Leap FEAT: ${this.actor.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          icon: '<i class="fas fa-fist-raised"></i>',
          label: "Leap!",
          callback: async (html) => {
            const leapSourceValue = html.find('[name="leapSource"]').val();
            const direction = html.find('[name="leapDirection"]:checked').val();
            const distance = html.find('[name="leapDistance"]:checked').val();
            const columnShift = parseInt(html.find('[name="leapShift"]').val()) || 0;
            const spendKarma = html.find('#spend-karma').is(':checked');
            const saveSettings = html.find('[name="saveSettings"]').is(':checked');
            const skipDice = html.find('[name="skipDice"]').is(':checked');
            
            // Get the selected leaping info
            const leapingInfo = self._getLeapingInfoFromSelection(leapSourceValue);
            const leapData = FaseripActor.MOVEMENT_DATA.leaping[leapingInfo.rank] || 
                            FaseripActor.MOVEMENT_DATA.leaping["Typical"];
            
            if (saveSettings) {
              await this.actor.setFlag("msh-faserip", "lastLeapSource", leapSourceValue);
              await this.actor.setFlag("msh-faserip", "lastLeapDirection", direction);
              await this.actor.setFlag("msh-faserip", "lastLeapDistance", distance);
              await this.actor.setFlag("msh-faserip", "lastLeapColumnShift", columnShift);
              await this.actor.setFlag("msh-faserip", "lastLeapSkipDiceRoll", skipDice);
            }
            
            await this._executeLeapFeat(direction, distance, columnShift, spendKarma, skipDice, leapData, leapingInfo);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll",
      render: (html) => {
        // Update distance table when source changes
        html.find('[name="leapSource"]').on('change', function() {
          const selectedValue = $(this).val();
          const selectedInfo = self._getLeapingInfoFromSelection(selectedValue);
          const newLeapData = FaseripActor.MOVEMENT_DATA.leaping[selectedInfo.rank] || 
                              FaseripActor.MOVEMENT_DATA.leaping["Typical"];
          html.find('#leap-distance-table').html(buildDistanceTable(newLeapData));
        });
      }
    }).render(true);
  }
  
  /**
   * Execute a Leap FEAT roll
   */
  async _executeLeapFeat(direction, distance, columnShift, spendKarma, skipDice, leapData, leapingInfo) {
    // Get distance values based on direction
    let distanceFeet, distanceFloors;
    switch (direction) {
      case 'up':
        distanceFeet = leapData.upFeet;
        distanceFloors = leapData.upFloors;
        break;
      case 'down':
        distanceFeet = leapData.downFeet;
        distanceFloors = leapData.downFloors;
        break;
      default:
        distanceFeet = leapData.acrossFeet;
        distanceFloors = null;
    }
    
    // Calculate actual distance
    let multiplier;
    switch (distance) {
      case 'half': multiplier = 0.5; break;
      case 'extended': multiplier = 2; break;
      default: multiplier = 1;
    }
    const actualFeet = Math.floor(distanceFeet * multiplier);
    const actualFloors = distanceFloors ? (distanceFloors * multiplier).toFixed(1) : null;
    
    // Determine FEAT requirement
    let featRequirement, isAutomatic = false;
    switch (distance) {
      case 'half':
        featRequirement = "Automatic";
        isAutomatic = true;
        break;
      case 'extended':
        featRequirement = "Red";
        break;
      default:
        featRequirement = "Green";
    }
    
    // Apply column shifts
    const effectiveRank = applyColumnShift(leapingInfo.rank, columnShift);
    
    // Display text
    const directionDisplay = direction.charAt(0).toUpperCase() + direction.slice(1);
    const distanceDisplay = distance === 'half' ? 'Half' : distance === 'extended' ? 'Extended' : 'Full';
    const floorInfo = actualFloors ? ` (${actualFloors} floors)` : '';
    const sourceLabel = leapingInfo.name; // "Strength" or power name
    const isPower = leapingInfo.id !== 'strength';
    
    // Handle automatic success
    if (isAutomatic) {
      const content = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${this.actor.name} - Leap ${directionDisplay}</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>${sourceLabel}: ${leapingInfo.rank} (${leapingInfo.value})</div>
            <div>Distance: ${distanceDisplay} — ${actualFeet}'${floorInfo}</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: #4CAF50; color: white;">
            AUTOMATIC SUCCESS
          </div>
          <div style="padding: 5px 10px; font-size: 0.85em; color: #666; text-align: center;">
            Half distance requires no roll
          </div>
        </div>
      `;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: content
      });
      return;
    }
    
    // Roll
    const roll = new Roll("1d100");
    await roll.evaluate();
    
    if (!skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${this.actor.name} attempts a ${distanceDisplay.toLowerCase()} leap ${direction}`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }
    
    // Karma handling
    let cappedTotal = roll.total;
    let karmaUsed = 0;
    
    if (spendKarma && getAvailableKarma(this.actor) > 0) {
      const initialColor = game.msh.rollUniversalTable(effectiveRank, roll.total);
      const karmaResult = await showKarmaDecisionDialog(
        this.actor,
        roll.total,
        effectiveRank,
        `Leap ${directionDisplay}`,
        initialColor
      );
      cappedTotal = karmaResult.finalResult;
      karmaUsed = karmaResult.karmaSpent;
    }
    
    const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const featSuccess = checkFeatSuccess(resultColor, featRequirement);
    const colorStyle = COLOR_STYLES[resultColor.toLowerCase()] || COLOR_STYLES.white;
    
    const content = `
      <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
          <strong>${this.actor.name} - Leap ${directionDisplay}</strong>
        </div>
        <div style="padding: 5px 10px; font-size: 0.9em;">
          <div>${sourceLabel}: ${leapingInfo.rank} (${leapingInfo.value})${isPower ? ' <span style="color: #7b1fa2;">(Power)</span>' : ''}</div>
          ${columnShift !== 0 ? `<div>Column Shift: ${columnShift > 0 ? '+' : ''}${columnShift} → ${effectiveRank}</div>` : ''}
          <div>Distance: ${distanceDisplay} — ${actualFeet}'${floorInfo}</div>
          <div>Required: <span style="color: ${featRequirement === 'Red' ? '#c62828' : '#2e7d32'}; font-weight: bold;">${featRequirement}</span></div>
          <div>Roll: ${roll.total}${karmaUsed > 0 ? ` + Karma: ${karmaUsed} = ${cappedTotal}` : ''}</div>
        </div>
        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
          background-color: ${colorStyle.bg}; color: ${colorStyle.text};">
          ${resultColor.toUpperCase()} RESULT
        </div>
        <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${featSuccess ? '#4CAF50' : '#F44336'};">
          ${featSuccess ? `LEAP SUCCEEDED — ${actualFeet}'${floorInfo}` : 'LEAP FAILED'}
        </div>
      </div>
    `;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    });
  }

  // ============================================================
  // FLY FEAT
  // ============================================================

  /**
   * Show Fly FEAT dialog
   */
  async showFlyDialog() {
    const flyAreas = this.actor.system.movement?.fly || 0;
    
    if (flyAreas <= 0) {
      ui.notifications.warn(`${this.actor.name} has no flight capability.`);
      return;
    }
    
    const FaseripActor = CONFIG.Actor.documentClass;
    const agilityAbility = this.actor.system.abilities?.agility;
    const enduranceAbility = this.actor.system.abilities?.endurance;
    const agilityRank = agilityAbility?.rank || "Typical";
    const agilityValue = agilityAbility?.value || 6;
    const enduranceRank = enduranceAbility?.rank || "Typical";
    const enduranceValue = enduranceAbility?.value || 6;
    
    const flightInfo = FaseripActor.getFlightInfo(flyAreas);
    const cruisingInfo = FaseripActor.getCruisingFlight(flyAreas);
    const acceleration = this.actor.suggestedMovement;
    const exhaustionThreshold = this.actor.exhaustionThreshold;
    const isExhaustionImmune = EXHAUSTION_IMMUNE_RANKS.includes(enduranceRank);
    
    // Saved settings
    const savedFeatType = this.actor.getFlag("msh-faserip", "lastFlyFeatType") || "normal";
    const savedColumnShift = this.actor.getFlag("msh-faserip", "lastFlyColumnShift") || 0;
    const savedActionsWhileFlying = this.actor.getFlag("msh-faserip", "lastFlyActionsWhileFlying") || false;
    const savedLowAltitude = this.actor.getFlag("msh-faserip", "lastFlyLowAltitude") || false;
    const skipDiceRoll = this.actor.getFlag("msh-faserip", "lastFlySkipDiceRoll") || false;
    
    const flightStatsHtml = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 8px; font-size: 0.85em;">
        <div style="padding: 6px; background: #e3f2fd; border: 1px solid #90caf9; border-radius: 3px; text-align: center;" title="Maximum flight speed. Flying at max speed requires Exhaustion checks after ${exhaustionThreshold} turns.">
          <div style="font-weight: bold;">${flyAreas}/turn</div>
          <div style="font-size: 0.85em; color: #1565c0;">Max ${flightInfo.mph}mph</div>
        </div>
        <div style="padding: 6px; background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 3px; text-align: center;" title="Cruising speed (2 ranks below max). No Exhaustion checks required at this speed.">
          <div style="font-weight: bold;">${cruisingInfo?.areas || '—'}/turn</div>
          <div style="font-size: 0.85em; color: #2e7d32;">Cruise ${cruisingInfo?.mph || '—'}mph</div>
        </div>
        <div style="padding: 6px; background: #fff3e0; border: 1px solid #ffcc80; border-radius: 3px; text-align: center;" title="Maximum speed when flying at low altitude (under 2 stories) or in enclosed spaces. Exceeding requires Low Altitude FEAT.">
          <div style="font-weight: bold;">${flightInfo.groundAreas}/turn</div>
          <div style="font-size: 0.85em; color: #e65100;">Low Alt max</div>
        </div>
        <div style="padding: 6px; background: #fce4ec; border: 1px solid #f48fb1; border-radius: 3px; text-align: center;" title="Number of turns at max speed before first Exhaustion check. Based on Endurance rank number.">
          <div style="font-weight: bold;">${exhaustionThreshold} turns</div>
          <div style="font-size: 0.85em; color: #c2185b;">Exh. thresh</div>
        </div>
      </div>
    `;
    
    const cruisingAreas = cruisingInfo?.areas || Math.max(1, flyAreas - 2);
    const agiAbbrev = abbrevRank(agilityRank);
    const endAbbrev = abbrevRank(enduranceRank);
    
    const dialogContent = `
      <div style="background: #f5f5f0; padding: 8px; border-radius: 5px; font-size: 0.95em;">
        ${flightStatsHtml}
        
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px; background: #e8eaf6; border: 1px solid #9fa8da; border-radius: 3px; flex-wrap: wrap;">
          <span style="font-weight: bold;" title="Current flight speed in areas per turn">Speed:</span>
          <input type="number" name="flyCurrentSpeed" value="${flyAreas}" min="1" max="${flyAreas + 5}" style="width: 45px;" title="Enter current flight speed">
          <span class="fly-speed-btn" data-speed="${flyAreas}" style="font-size: 0.85em; color: #0066cc; cursor: pointer; text-decoration: underline;" title="Set to maximum speed (${flyAreas} areas/turn)">[Max]</span>
          <span class="fly-speed-btn" data-speed="${cruisingAreas}" style="font-size: 0.85em; color: #0066cc; cursor: pointer; text-decoration: underline;" title="Set to cruising speed (${cruisingAreas} areas/turn) - no exhaustion">[Cruise]</span>
          <span style="margin-left: auto; color: #0d47a1; font-size: 0.9em;" title="Agility: ${agilityRank} (${agilityValue})&#10;Endurance: ${enduranceRank} (${enduranceValue})">Agi: ${agiAbbrev}(${agilityValue}) End: ${endAbbrev}(${enduranceValue})${isExhaustionImmune ? ' ✓Immune' : ''}</span>
        </div>
        
        <div style="margin-bottom: 8px;">
          <div style="font-weight: bold; margin-bottom: 4px;">FEAT Type:</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
            <label style="padding: 3px; background: ${savedFeatType === 'normal' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Normal flight at current speed. No roll required.">
              <input type="radio" name="flyFeatType" value="normal" ${savedFeatType === 'normal' ? 'checked' : ''}> Normal <span style="color: #666;">(no roll)</span>
            </label>
            <label style="padding: 3px; background: ${savedFeatType === 'sharp-turn' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Agility FEAT to turn more than 90°.&#10;Failure: Continue in original direction.">
              <input type="radio" name="flyFeatType" value="sharp-turn" ${savedFeatType === 'sharp-turn' ? 'checked' : ''}> Sharp Turn <span style="color: #666;">(Agi)</span>
            </label>
            <label style="padding: 3px; background: ${savedFeatType === 'landing' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Agility FEAT to land while moving faster than 3 areas/turn.&#10;Failure: Slam result.">
              <input type="radio" name="flyFeatType" value="landing" ${savedFeatType === 'landing' ? 'checked' : ''}> Landing <span style="color: #666;">(Agi)</span>
            </label>
            <label style="padding: 3px; background: ${savedFeatType === 'low-altitude' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Agility FEAT when exceeding ${flightInfo.groundAreas} areas at low altitude or in enclosed spaces.&#10;Failure: Lose control.">
              <input type="radio" name="flyFeatType" value="low-altitude" ${savedFeatType === 'low-altitude' ? 'checked' : ''}> Low Alt <span style="color: #666;">(Agi)</span>
            </label>
            <label style="padding: 3px; background: ${savedFeatType === 'dive-pullout' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Agility FEAT to pull out of a dive.&#10;Failure: Continue diving.">
              <input type="radio" name="flyFeatType" value="dive-pullout" ${savedFeatType === 'dive-pullout' ? 'checked' : ''}> Dive Pullout <span style="color: #666;">(Agi)</span>
            </label>
            <label style="padding: 3px; background: ${savedFeatType === 'exhaustion' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em; ${isExhaustionImmune ? 'opacity: 0.5;' : ''}" title="Endurance FEAT after ${exhaustionThreshold} turns at max speed.&#10;Failure: Must rest 1-10 turns.${isExhaustionImmune ? '&#10;&#10;IMMUNE: Unearthly+ Endurance' : ''}">
              <input type="radio" name="flyFeatType" value="exhaustion" ${savedFeatType === 'exhaustion' ? 'checked' : ''} ${isExhaustionImmune ? 'disabled' : ''}> Exhaustion <span style="color: #666;">(End)</span>
            </label>
          </div>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; padding: 6px; background: #f0f0f0; border-radius: 3px; flex-wrap: wrap; font-size: 0.9em;">
          <label title="Performing actions (attacking, using powers) while flying reduces speed by 50%."><input type="checkbox" name="actionsWhileFlying" ${savedActionsWhileFlying ? 'checked' : ''}> Actions <span style="color: #c62828;">(-50%)</span></label>
          <label title="Flying at low altitude (under 2 stories) or in enclosed spaces. Max ${flightInfo.groundAreas} areas/turn."><input type="checkbox" name="lowAltitude" ${savedLowAltitude ? 'checked' : ''}> Low alt <span style="color: #e65100;">(max ${flightInfo.groundAreas})</span></label>
          <span style="margin-left: auto;" title="Column Shift: Positive shifts right (easier), negative shifts left (harder).">CS: <input type="number" name="flyShift" value="${savedColumnShift}" style="width: 40px;" title="Column Shift (+right, -left)"></span>
        </div>
        
        ${generateKarmaControlsHTML(this.actor)}
        
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.9em;">
          <label title="Save current settings for next time"><input type="checkbox" name="saveSettings" checked> Remember</label>
          <label title="Skip the 3D dice animation"><input type="checkbox" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>
    `;
    
    new Dialog({
      title: `Fly FEAT: ${this.actor.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          icon: '<i class="fas fa-wind"></i>',
          label: "Fly!",
          callback: async (html) => {
            const featType = html.find('[name="flyFeatType"]:checked').val();
            const currentSpeed = parseInt(html.find('[name="flyCurrentSpeed"]').val()) || flyAreas;
            const columnShift = parseInt(html.find('[name="flyShift"]').val()) || 0;
            const spendKarma = html.find('#spend-karma').is(':checked');
            const actionsWhileFlying = html.find('[name="actionsWhileFlying"]').is(':checked');
            const lowAltitude = html.find('[name="lowAltitude"]').is(':checked');
            const saveSettings = html.find('[name="saveSettings"]').is(':checked');
            const skipDice = html.find('[name="skipDice"]').is(':checked');
            
            if (saveSettings) {
              await this.actor.setFlag("msh-faserip", "lastFlyFeatType", featType);
              await this.actor.setFlag("msh-faserip", "lastFlyColumnShift", columnShift);
              await this.actor.setFlag("msh-faserip", "lastFlyActionsWhileFlying", actionsWhileFlying);
              await this.actor.setFlag("msh-faserip", "lastFlyLowAltitude", lowAltitude);
              await this.actor.setFlag("msh-faserip", "lastFlySkipDiceRoll", skipDice);
            }
            
            await this._executeFlyFeat(featType, columnShift, spendKarma, skipDice, actionsWhileFlying, lowAltitude, currentSpeed, flightInfo, cruisingInfo);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll",
      render: (html) => {
        // FEAT type highlight
        html.find('[name="flyFeatType"]').on('change', function() {
          html.find('[name="flyFeatType"]').each(function() {
            $(this).closest('label').css('background', $(this).is(':checked') ? '#e3f2fd' : 'transparent');
          });
        });
        // Speed quick-fill
        html.find('.fly-speed-btn').on('click', function() {
          const speed = $(this).data('speed');
          html.find('[name="flyCurrentSpeed"]').val(speed);
        });
      }
    }).render(true);
  }
  
  /**
   * Execute a Fly FEAT roll
   */
  async _executeFlyFeat(featType, columnShift, spendKarma, skipDice, actionsWhileFlying, lowAltitude, currentSpeed, flightInfo, cruisingInfo) {
    const agilityAbility = this.actor.system.abilities?.agility;
    const enduranceAbility = this.actor.system.abilities?.endurance;
    const agilityRank = agilityAbility?.rank || "Typical";
    const agilityValue = agilityAbility?.value || 6;
    const enduranceRank = enduranceAbility?.rank || "Typical";
    const enduranceValue = enduranceAbility?.value || 6;
    
    const isExhaustionCheck = featType === 'exhaustion';
    const abilityRank = isExhaustionCheck ? enduranceRank : agilityRank;
    const abilityValue = isExhaustionCheck ? enduranceValue : agilityValue;
    const abilityName = isExhaustionCheck ? 'Endurance' : 'Agility';
    
    const featTypeInfo = {
      'normal': { name: 'Normal Flight', failure: null },
      'sharp-turn': { name: 'Sharp Turn (>90°)', failure: 'Continue in original direction' },
      'landing': { name: 'Landing at Speed', failure: 'Slam result' },
      'low-altitude': { name: 'Low Altitude Maneuver', failure: 'Lose control' },
      'dive-pullout': { name: 'Pull Out of Dive', failure: 'Continue diving' },
      'exhaustion': { name: 'Exhaustion Check', failure: 'Must rest 1-10 turns' }
    };
    const featInfo = featTypeInfo[featType] || featTypeInfo['normal'];
    
    const cruisingAreas = cruisingInfo?.areas || Math.max(1, flightInfo.areas - 2);
    const isAtMax = currentSpeed >= flightInfo.areas;
    const isAboveCruising = currentSpeed > cruisingAreas;
    
    // Normal flight - no roll, uses current speed from input
    if (featType === 'normal') {
      let effectiveSpeed = currentSpeed;
      
      if (actionsWhileFlying) {
        effectiveSpeed = Math.ceil(effectiveSpeed / 2);
      }
      if (lowAltitude && effectiveSpeed > flightInfo.groundAreas) {
        effectiveSpeed = Math.min(effectiveSpeed, flightInfo.groundAreas);
      }
      
      // Note about exhaustion if flying above cruising speed
      const exhaustionNote = isAboveCruising 
        ? `<div style="color: #c2185b; font-size: 0.85em;">Above cruising speed — Exhaustion check after ${this.actor.exhaustionThreshold} turns</div>`
        : '';
      
      const content = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${this.actor.name} - Flight</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Speed: ${currentSpeed} areas/turn (${currentSpeed * 15} mph)${isAtMax ? ' <strong style="color: #1565c0;">[MAX]</strong>' : ''}</div>
            <div style="color: #666; font-size: 0.85em;">Cruising: ${cruisingAreas} | Max: ${flightInfo.areas}</div>
            ${exhaustionNote}
            ${actionsWhileFlying ? `<div style="color: #c62828;">Actions while flying: speed halved</div>` : ''}
            ${lowAltitude ? `<div style="color: #e65100;">Low altitude: max ${flightInfo.groundAreas} areas/turn</div>` : ''}
            <div>Effective Speed: <strong>${effectiveSpeed} areas/turn</strong> (${effectiveSpeed * 15} mph)</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: #4CAF50; color: white;">
            FLIGHT OK — NO ROLL NEEDED
          </div>
        </div>
      `;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: content
      });
      return;
    }
    
    // Apply column shifts
    const effectiveRank = applyColumnShift(abilityRank, columnShift);
    
    // Roll
    const roll = new Roll("1d100");
    await roll.evaluate();
    
    if (!skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${this.actor.name} attempts ${featInfo.name}`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }
    
    // Karma
    let cappedTotal = roll.total;
    let karmaUsed = 0;
    
    if (spendKarma && getAvailableKarma(this.actor) > 0) {
      const initialColor = game.msh.rollUniversalTable(effectiveRank, roll.total);
      const karmaResult = await showKarmaDecisionDialog(
        this.actor,
        roll.total,
        effectiveRank,
        featInfo.name,
        initialColor
      );
      cappedTotal = karmaResult.finalResult;
      karmaUsed = karmaResult.karmaSpent;
    }
    
    const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const featSuccess = ['green', 'yellow', 'red'].includes(resultColor.toLowerCase());
    const colorStyle = COLOR_STYLES[resultColor.toLowerCase()] || COLOR_STYLES.white;
    
    let modifierNotes = [];
    if (actionsWhileFlying) modifierNotes.push('Actions while flying (-50% speed)');
    if (lowAltitude) modifierNotes.push(`Low altitude (max ${flightInfo.groundAreas} areas)`);
    
    const content = `
      <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
          <strong>${this.actor.name} - ${featInfo.name}</strong>
        </div>
        <div style="padding: 5px 10px; font-size: 0.9em;">
          <div>${abilityName}: ${abilityRank} (${abilityValue})</div>
          ${columnShift !== 0 ? `<div>Column Shift: ${columnShift > 0 ? '+' : ''}${columnShift} → ${effectiveRank}</div>` : ''}
          ${modifierNotes.length > 0 ? `<div style="color: #666; font-size: 0.85em;">${modifierNotes.join(' • ')}</div>` : ''}
          <div>Roll: ${roll.total}${karmaUsed > 0 ? ` + Karma: ${karmaUsed} = ${cappedTotal}` : ''}</div>
        </div>
        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
          background-color: ${colorStyle.bg}; color: ${colorStyle.text};">
          ${resultColor.toUpperCase()} RESULT
        </div>
        <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${featSuccess ? '#4CAF50' : '#F44336'};">
          ${featSuccess ? 'SUCCESS' : `FAILED — ${featInfo.failure}`}
        </div>
        ${!featSuccess && featType === 'landing' ? `
          <div style="padding: 5px 10px; font-size: 0.9em; text-align: center; background: #ffebee; border-top: 1px solid #ffcdd2;">
            <strong>SLAM!</strong> Roll Endurance FEAT to determine Slam distance.
          </div>
        ` : ''}
      </div>
    `;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    });
  }

  // ============================================================
  // RUN FEAT
  // ============================================================

  /**
   * Build Lightning Speed power rank dropdown options
   */
  _buildLightningSpeedRankOptions(selectedValue) {
    const enduranceAbility = this.actor.system.abilities?.endurance;
    const enduranceRank = enduranceAbility?.rank || "Typical";
    const baseRunAreas = this.actor.suggestedMovement;
    
    // Default option: Normal Running (Endurance-based)
    let html = `<option value="endurance" ${selectedValue === 'endurance' ? 'selected' : ''}>Normal Running — ${baseRunAreas} areas (End: ${enduranceRank})</option>`;
    
    // Optgroup for Lightning Speed Power ranks
    html += `<optgroup label="Lightning Speed (select rank)">`;
    
    const ranks = [
      "Feeble", "Poor", "Typical", "Good", "Excellent", "Remarkable", 
      "Incredible", "Amazing", "Monstrous", "Unearthly", 
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000"
    ];
    
    const FaseripActor = CONFIG.Actor.documentClass;
    for (const rank of ranks) {
      const speedData = FaseripActor.MOVEMENT_DATA.landSpeed[rank];
      if (speedData) {
        const isSelected = selectedValue === rank;
        html += `<option value="${rank}" ${isSelected ? 'selected' : ''}>${rank} — ${speedData.areas} areas (${speedData.mph} mph)</option>`;
      }
    }
    
    html += `</optgroup>`;
    return html;
  }
  
  /**
   * Get run info from dropdown selection
   */
  _getRunInfoFromSelection(selection) {
    if (selection === 'endurance') {
      const enduranceAbility = this.actor.system.abilities?.endurance;
      const baseRunAreas = this.actor.suggestedMovement;
      return {
        id: 'endurance',
        name: 'Normal Running',
        rank: enduranceAbility?.rank || "Typical",
        areas: baseRunAreas,
        mph: baseRunAreas * 15,
        isLightningSpeed: false
      };
    }
    
    // It's a rank name for Lightning Speed power
    const FaseripActor = CONFIG.Actor.documentClass;
    const speedData = FaseripActor.MOVEMENT_DATA.landSpeed[selection];
    
    return {
      id: selection,
      name: 'Lightning Speed',
      rank: selection,
      areas: speedData?.areas || 3,
      mph: speedData?.mph || 45,
      isLightningSpeed: true
    };
  }

  /**
   * Show Run FEAT dialog
   * Rules:
   * - Normal: No roll, uses Endurance-based speed
   * - Lightning Speed: Power rank-based speed (vehicle movement)
   * - Speed FEAT: Yellow Strength FEAT for +1 area beyond max
   * - Exhaustion: Endurance FEAT after rank# turns at max speed
   */
  async showRunDialog() {
    const FaseripActor = CONFIG.Actor.documentClass;
    const enduranceAbility = this.actor.system.abilities?.endurance;
    const strengthAbility = this.actor.system.abilities?.strength;
    const enduranceRank = enduranceAbility?.rank || "Typical";
    const enduranceValue = enduranceAbility?.value || 6;
    const strengthRank = strengthAbility?.rank || "Typical";
    const strengthValue = strengthAbility?.value || 6;
    
    // Get saved settings
    const savedRunSource = this.actor.getFlag("msh-faserip", "lastRunSource") || "endurance";
    const savedFeatType = this.actor.getFlag("msh-faserip", "lastRunFeatType") || "normal";
    const savedColumnShift = this.actor.getFlag("msh-faserip", "lastRunColumnShift") || 0;
    const savedActionsWhileRunning = this.actor.getFlag("msh-faserip", "lastRunActionsWhileRunning") || false;
    const savedTurning = this.actor.getFlag("msh-faserip", "lastRunTurning") || false;
    const skipDiceRoll = this.actor.getFlag("msh-faserip", "lastRunSkipDiceRoll") || false;
    
    // Get initial run info
    const initialInfo = this._getRunInfoFromSelection(savedRunSource);
    const runAreas = initialInfo.areas;
    const runMph = initialInfo.mph;
    
    // Get cruising speed (2 ranks lower, no exhaustion)
    const cruisingInfo = FaseripActor.getCruisingLand(runAreas);
    const exhaustionThreshold = this.actor.exhaustionThreshold;
    
    // Check for exhaustion immunity (Unearthly+ Endurance)
    const isExhaustionImmune = EXHAUSTION_IMMUNE_RANKS.includes(enduranceRank);
    
    const cruisingAreas = cruisingInfo?.areas || Math.max(1, runAreas - 2);
    const cruisingMph = cruisingInfo?.mph || (cruisingAreas * 15);
    const endAbbrev = abbrevRank(enduranceRank);
    const strAbbrev = abbrevRank(strengthRank);
    const self = this;
    
    // Build compact speed stats display
    const speedStatsHtml = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 8px; font-size: 0.85em;">
        <div id="run-max-speed" style="padding: 6px; background: #e3f2fd; border: 1px solid #90caf9; border-radius: 3px; text-align: center;" title="Maximum running speed. At max speed, Exhaustion checks required after ${exhaustionThreshold} turns.">
          <div style="font-weight: bold;">${runAreas}/turn</div>
          <div style="font-size: 0.85em; color: #1565c0;">Max ${runMph}mph</div>
        </div>
        <div id="run-cruise-speed" style="padding: 6px; background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 3px; text-align: center;" title="Cruising speed (2 ranks below max). No Exhaustion checks required at this speed.">
          <div style="font-weight: bold;">${cruisingAreas}/turn</div>
          <div style="font-size: 0.85em; color: #2e7d32;">Cruise ${cruisingMph}mph</div>
        </div>
        <div style="padding: 6px; background: #fff3e0; border: 1px solid #ffcc80; border-radius: 3px; text-align: center;" title="Speed FEAT: Yellow Strength FEAT to move +1 area beyond max speed for one turn.">
          <div style="font-weight: bold;">+1/turn</div>
          <div style="font-size: 0.85em; color: #e65100;">Yellow Str</div>
        </div>
        <div style="padding: 6px; background: #fce4ec; border: 1px solid #f48fb1; border-radius: 3px; text-align: center;" title="Number of turns at max speed before first Exhaustion check. Based on Endurance rank number.">
          <div style="font-weight: bold;">${exhaustionThreshold} turns</div>
          <div style="font-size: 0.85em; color: #c2185b;">Exh. thresh</div>
        </div>
      </div>
    `;
    
    const dialogContent = `
      <div style="background: #f5f5f0; padding: 8px; border-radius: 5px; font-size: 0.95em;">
        ${speedStatsHtml}
        
        <div style="margin-bottom: 8px;">
          <label style="font-weight: bold;" title="Select normal running (Endurance-based) or Lightning Speed power rank">Running Source:</label>
          <select name="runSource" style="width: 100%; margin-top: 4px;">
            ${this._buildLightningSpeedRankOptions(savedRunSource)}
          </select>
        </div>
        
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px; background: #e8eaf6; border: 1px solid #9fa8da; border-radius: 3px; flex-wrap: wrap;">
          <span style="font-weight: bold;" title="Current running speed in areas per turn">Speed:</span>
          <input type="number" name="runCurrentSpeed" value="${runAreas}" min="1" max="${runAreas + 5}" style="width: 45px;" title="Enter current running speed">
          <span class="run-speed-btn" data-speed="${runAreas}" style="font-size: 0.85em; color: #0066cc; cursor: pointer; text-decoration: underline;" title="Set to maximum speed">[Max]</span>
          <span class="run-speed-btn" data-speed="${cruisingAreas}" style="font-size: 0.85em; color: #0066cc; cursor: pointer; text-decoration: underline;" title="Set to cruising speed - no exhaustion">[Cruise]</span>
          <span style="margin-left: auto; color: #0d47a1; font-size: 0.9em;" title="Endurance: ${enduranceRank} (${enduranceValue})&#10;Strength: ${strengthRank} (${strengthValue})">End: ${endAbbrev}(${enduranceValue}) Str: ${strAbbrev}(${strengthValue})${isExhaustionImmune ? ' ✓Immune' : ''}</span>
        </div>
        
        <div style="margin-bottom: 8px;">
          <div style="font-weight: bold; margin-bottom: 4px;">FEAT Type:</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
            <label style="padding: 3px; background: ${savedFeatType === 'normal' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Normal movement at current speed. No roll required.">
              <input type="radio" name="runFeatType" value="normal" ${savedFeatType === 'normal' ? 'checked' : ''}> Normal <span style="color: #666;">(no roll)</span>
            </label>
            <label style="padding: 3px; background: ${savedFeatType === 'speed' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Yellow Strength FEAT to move +1 area beyond max speed.&#10;Failure: No bonus speed.">
              <input type="radio" name="runFeatType" value="speed" ${savedFeatType === 'speed' ? 'checked' : ''}> Speed +1 <span style="color: #666;">(Yel Str)</span>
            </label>
            <label style="padding: 3px; background: ${savedFeatType === 'exhaustion' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em; ${isExhaustionImmune ? 'opacity: 0.5;' : ''}" title="Green Endurance FEAT after ${exhaustionThreshold} turns at max speed.&#10;Failure: Must rest 1-10 turns.${isExhaustionImmune ? '&#10;&#10;IMMUNE: Unearthly+ Endurance' : ''}">
              <input type="radio" name="runFeatType" value="exhaustion" ${savedFeatType === 'exhaustion' ? 'checked' : ''} ${isExhaustionImmune ? 'disabled' : ''}> Exhaustion <span style="color: #666;">(Grn End)</span>
            </label>
          </div>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; padding: 6px; background: #f0f0f0; border-radius: 3px; flex-wrap: wrap; font-size: 0.9em;">
          <label title="Performing actions (attacking, using powers) while running reduces speed by 50%."><input type="checkbox" name="actionsWhileRunning" ${savedActionsWhileRunning ? 'checked' : ''}> Actions <span style="color: #c62828;">(-50%)</span></label>
          <label id="run-turning-label" title="Turning more than 90° while running reduces speed by 50%.${initialInfo.isLightningSpeed ? '&#10;&#10;Lightning Speed: Can turn at max speed without penalty!' : ''}"><input type="checkbox" name="turning" ${savedTurning ? 'checked' : ''} ${initialInfo.isLightningSpeed ? 'disabled' : ''}> Turn &gt;90° <span style="color: #c62828;">(-50%)</span>${initialInfo.isLightningSpeed ? ' <span style="color: #2e7d32;">(LS: free)</span>' : ''}</label>
          <span style="margin-left: auto;" title="Column Shift: Positive shifts right (easier), negative shifts left (harder).">CS: <input type="number" name="runShift" value="${savedColumnShift}" style="width: 40px;" title="Column Shift (+right, -left)"></span>
        </div>
        
        ${generateKarmaControlsHTML(this.actor)}
        
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.9em;">
          <label title="Save current settings for next time"><input type="checkbox" name="saveSettings" checked> Remember</label>
          <label title="Skip the 3D dice animation"><input type="checkbox" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>
    `;
    
    new Dialog({
      title: `Run FEAT: ${this.actor.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          icon: '<i class="fas fa-running"></i>',
          label: "Run!",
          callback: async (html) => {
            const runSourceValue = html.find('[name="runSource"]').val();
            const featType = html.find('[name="runFeatType"]:checked').val();
            const currentSpeed = parseInt(html.find('[name="runCurrentSpeed"]').val()) || runAreas;
            const columnShift = parseInt(html.find('[name="runShift"]').val()) || 0;
            const spendKarma = html.find('#spend-karma').is(':checked');
            const actionsWhileRunning = html.find('[name="actionsWhileRunning"]').is(':checked');
            const turning = html.find('[name="turning"]').is(':checked');
            const saveSettings = html.find('[name="saveSettings"]').is(':checked');
            const skipDice = html.find('[name="skipDice"]').is(':checked');
            
            // Get run info from selection
            const runInfo = self._getRunInfoFromSelection(runSourceValue);
            const newCruising = Math.max(1, runInfo.areas - 2);
            
            if (saveSettings) {
              await this.actor.setFlag("msh-faserip", "lastRunSource", runSourceValue);
              await this.actor.setFlag("msh-faserip", "lastRunFeatType", featType);
              await this.actor.setFlag("msh-faserip", "lastRunColumnShift", columnShift);
              await this.actor.setFlag("msh-faserip", "lastRunActionsWhileRunning", actionsWhileRunning);
              await this.actor.setFlag("msh-faserip", "lastRunTurning", turning);
              await this.actor.setFlag("msh-faserip", "lastRunSkipDiceRoll", skipDice);
            }
            
            // Lightning Speed: turning penalty doesn't apply
            const effectiveTurning = runInfo.isLightningSpeed ? false : turning;
            
            await this._executeRunFeat(featType, columnShift, spendKarma, skipDice, actionsWhileRunning, effectiveTurning, currentSpeed, runInfo, newCruising, exhaustionThreshold);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll",
      render: (html) => {
        const FaseripActor = CONFIG.Actor.documentClass;
        
        // FEAT type highlight
        html.find('[name="runFeatType"]').on('change', function() {
          html.find('[name="runFeatType"]').each(function() {
            $(this).closest('label').css('background', $(this).is(':checked') ? '#e3f2fd' : 'transparent');
          });
        });
        
        // Speed quick-fill
        html.find('.run-speed-btn').on('click', function() {
          const speed = $(this).data('speed');
          html.find('[name="runCurrentSpeed"]').val(speed);
        });
        
        // Update speeds when source changes
        html.find('[name="runSource"]').on('change', function() {
          const selectedValue = $(this).val();
          const runInfo = self._getRunInfoFromSelection(selectedValue);
          const newCruising = Math.max(1, runInfo.areas - 2);
          
          // Update stats display
          html.find('#run-max-speed').html(`
            <div style="font-weight: bold;">${runInfo.areas}/turn</div>
            <div style="font-size: 0.85em; color: #1565c0;">Max ${runInfo.mph}mph</div>
          `);
          html.find('#run-cruise-speed').html(`
            <div style="font-weight: bold;">${newCruising}/turn</div>
            <div style="font-size: 0.85em; color: #2e7d32;">Cruise ${newCruising * 15}mph</div>
          `);
          
          // Update speed input and buttons
          html.find('[name="runCurrentSpeed"]').val(runInfo.areas);
          html.find('.run-speed-btn').eq(0).data('speed', runInfo.areas);
          html.find('.run-speed-btn').eq(1).data('speed', newCruising);
          
          // Lightning Speed: disable turning penalty
          const turningCheckbox = html.find('[name="turning"]');
          const turningLabel = html.find('#run-turning-label');
          if (runInfo.isLightningSpeed) {
            turningCheckbox.prop('disabled', true).prop('checked', false);
            turningLabel.html(`<input type="checkbox" name="turning" disabled> Turn >90° <span style="color: #c62828;">(-50%)</span> <span style="color: #2e7d32;">(LS: free)</span>`);
          } else {
            turningCheckbox.prop('disabled', false);
            turningLabel.html(`<input type="checkbox" name="turning"> Turn >90° <span style="color: #c62828;">(-50%)</span>`);
          }
        });
      }
    }).render(true);
  }
  
  /**
   * Execute a Run FEAT roll
   */
  async _executeRunFeat(featType, columnShift, spendKarma, skipDice, actionsWhileRunning, turning, currentSpeed, runInfo, cruisingAreas, exhaustionThreshold) {
    const enduranceAbility = this.actor.system.abilities?.endurance;
    const strengthAbility = this.actor.system.abilities?.strength;
    const enduranceRank = enduranceAbility?.rank || "Typical";
    const enduranceValue = enduranceAbility?.value || 6;
    const strengthRank = strengthAbility?.rank || "Typical";
    const strengthValue = strengthAbility?.value || 6;
    
    const maxSpeed = runInfo.areas;
    const sourceNote = runInfo.isLightningSpeed 
      ? `Lightning Speed (${runInfo.rank})` 
      : 'Normal Running';
    
    // Determine which ability to use
    const isSpeedFeat = featType === 'speed';
    const isExhaustionCheck = featType === 'exhaustion';
    const abilityRank = isSpeedFeat ? strengthRank : enduranceRank;
    const abilityValue = isSpeedFeat ? strengthValue : enduranceValue;
    const abilityName = isSpeedFeat ? 'Strength' : 'Endurance';
    
    // FEAT type info
    const featTypeInfo = {
      'normal': { name: 'Normal Movement', failure: null },
      'speed': { name: 'Speed FEAT', failure: 'No bonus speed', requirement: 'Yellow' },
      'exhaustion': { name: 'Exhaustion Check', failure: 'Must rest 1-10 turns', requirement: 'Green' }
    };
    const featInfo = featTypeInfo[featType] || featTypeInfo['normal'];
    
    const isAtMax = currentSpeed >= maxSpeed;
    const isAboveCruising = currentSpeed > cruisingAreas;
    
    // Handle normal movement (no roll) - uses current speed from input
    if (featType === 'normal') {
      let effectiveSpeed = currentSpeed;
      
      if (actionsWhileRunning) {
        effectiveSpeed = Math.ceil(effectiveSpeed / 2);
      }
      if (turning) {
        effectiveSpeed = Math.ceil(effectiveSpeed / 2);
      }
      
      // Note about exhaustion if running above cruising speed
      const exhaustionNote = isAboveCruising 
        ? `<div style="color: #c2185b; font-size: 0.85em;">Above cruising speed — Exhaustion check after ${exhaustionThreshold} turns</div>`
        : '';
      
      const content = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${this.actor.name} - Running</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>${sourceNote}</div>
            <div>Speed: ${currentSpeed} areas/turn (${currentSpeed * 15} mph)${isAtMax ? ' <strong style="color: #1565c0;">[MAX]</strong>' : ''}</div>
            <div style="color: #666; font-size: 0.85em;">Cruising: ${cruisingAreas} | Max: ${maxSpeed}</div>
            ${exhaustionNote}
            ${actionsWhileRunning ? `<div style="color: #c62828;">Actions while moving: speed halved</div>` : ''}
            ${turning ? `<div style="color: #c62828;">Turning >90°: speed halved</div>` : ''}
            ${runInfo.isLightningSpeed && !turning ? `<div style="color: #2e7d32;">Lightning Speed: No turning penalty</div>` : ''}
            <div>Effective Speed: <strong>${effectiveSpeed} areas/turn</strong> (${effectiveSpeed * 15} mph)</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: #4CAF50; color: white;">
            MOVEMENT OK — NO ROLL NEEDED
          </div>
        </div>
      `;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: content
      });
      return;
    }
    
    // For Speed FEAT and Exhaustion, calculate effective speed with modifiers from current speed
    let effectiveSpeed = currentSpeed;
    let speedNotes = [];
    
    if (actionsWhileRunning) {
      effectiveSpeed = Math.ceil(effectiveSpeed / 2);
      speedNotes.push('Actions: -50%');
    }
    if (turning) {
      effectiveSpeed = Math.ceil(effectiveSpeed / 2);
      speedNotes.push('Turning >90°: -50%');
    }
    
    // Apply column shifts
    const effectiveRank = applyColumnShift(abilityRank, columnShift);
    
    // Roll
    const roll = new Roll("1d100");
    await roll.evaluate();
    
    if (!skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${this.actor.name} attempts ${featInfo.name}`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }
    
    // Karma
    let cappedTotal = roll.total;
    let karmaUsed = 0;
    
    if (spendKarma && getAvailableKarma(this.actor) > 0) {
      const initialColor = game.msh.rollUniversalTable(effectiveRank, roll.total);
      const karmaResult = await showKarmaDecisionDialog(
        this.actor,
        roll.total,
        effectiveRank,
        featInfo.name,
        initialColor
      );
      cappedTotal = karmaResult.finalResult;
      karmaUsed = karmaResult.karmaSpent;
    }
    
    const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    
    // Check success based on FEAT type
    let featSuccess;
    if (isSpeedFeat) {
      // Speed FEAT requires Yellow
      featSuccess = ['yellow', 'red'].includes(resultColor.toLowerCase());
    } else {
      // Exhaustion requires Green
      featSuccess = ['green', 'yellow', 'red'].includes(resultColor.toLowerCase());
    }
    
    const colorStyle = COLOR_STYLES[resultColor.toLowerCase()] || COLOR_STYLES.white;
    
    // Build modifier notes
    let modifierNotes = [];
    if (actionsWhileRunning) modifierNotes.push('Actions while moving (-50%)');
    if (turning) modifierNotes.push('Turning >90° (-50%)');
    
    // Success/failure text
    let resultText;
    if (isSpeedFeat) {
      resultText = featSuccess 
        ? `SUCCESS — Speed +1 area (${effectiveSpeed + 1} areas total)`
        : `FAILED — No bonus speed (${effectiveSpeed} areas)`;
    } else {
      resultText = featSuccess 
        ? 'SUCCESS — No exhaustion'
        : `FAILED — ${featInfo.failure}`;
    }
    
    const content = `
      <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
          <strong>${this.actor.name} - ${featInfo.name}</strong>
        </div>
        <div style="padding: 5px 10px; font-size: 0.9em;">
          <div>${sourceNote}</div>
          <div>${abilityName}: ${abilityRank} (${abilityValue})</div>
          ${columnShift !== 0 ? `<div>Column Shift: ${columnShift > 0 ? '+' : ''}${columnShift} → ${effectiveRank}</div>` : ''}
          ${modifierNotes.length > 0 ? `<div style="color: #666; font-size: 0.85em;">${modifierNotes.join(' • ')}</div>` : ''}
          <div>Required: <span style="color: ${isSpeedFeat ? '#f57f17' : '#2e7d32'}; font-weight: bold;">${featInfo.requirement}</span></div>
          <div>Roll: ${roll.total}${karmaUsed > 0 ? ` + Karma: ${karmaUsed} = ${cappedTotal}` : ''}</div>
        </div>
        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
          background-color: ${colorStyle.bg}; color: ${colorStyle.text};">
          ${resultColor.toUpperCase()} RESULT
        </div>
        <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${featSuccess ? '#4CAF50' : '#F44336'};">
          ${resultText}
        </div>
      </div>
    `;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    });
  }

  // ============================================================
  // SWIM FEAT
  // ============================================================

  /**
   * Build Swimming power rank dropdown options
   */
  _buildSwimmingRankOptions(selectedValue) {
    const enduranceAbility = this.actor.system.abilities?.endurance;
    const enduranceRank = enduranceAbility?.rank || "Typical";
    
    // Default option: Normal Swimming (1 area/turn)
    let html = `<option value="normal" ${selectedValue === 'normal' ? 'selected' : ''}>Normal Swimming — 1 area/turn</option>`;
    
    // Optgroup for Swimming Power ranks
    html += `<optgroup label="Swimming Power (select rank)">`;
    
    const ranks = [
      "Feeble", "Poor", "Typical", "Good", "Excellent", "Remarkable", 
      "Incredible", "Amazing", "Monstrous", "Unearthly", 
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000"
    ];
    
    const FaseripActor = CONFIG.Actor.documentClass;
    for (const rank of ranks) {
      const speedData = FaseripActor.MOVEMENT_DATA.landSpeed[rank];
      if (speedData) {
        const isSelected = selectedValue === rank;
        html += `<option value="${rank}" ${isSelected ? 'selected' : ''}>${rank} — ${speedData.areas} areas (${speedData.mph} mph)</option>`;
      }
    }
    
    html += `</optgroup>`;
    return html;
  }
  
  /**
   * Get swimming info from dropdown selection
   */
  _getSwimmingInfoFromSelection(selection) {
    if (selection === 'normal') {
      return {
        id: 'normal',
        name: 'Normal Swimming',
        rank: null,
        areas: 1,
        mph: 15
      };
    }
    
    // It's a rank name for Swimming power
    const FaseripActor = CONFIG.Actor.documentClass;
    const speedData = FaseripActor.MOVEMENT_DATA.landSpeed[selection];
    
    return {
      id: selection,
      name: 'Swimming',
      rank: selection,
      areas: speedData?.areas || 1,
      mph: speedData?.mph || 15
    };
  }

  /**
   * Show Swim FEAT dialog
   * Rules:
   * - Normal swimming: 1 area/turn, limited by Endurance
   * - Swimming Power: Vehicle-like speed based on power rank
   * - Drowning: Endurance FEAT when out of breath
   */
  async showSwimDialog() {
    const FaseripActor = CONFIG.Actor.documentClass;
    const enduranceAbility = this.actor.system.abilities?.endurance;
    const enduranceRank = enduranceAbility?.rank || "Typical";
    const enduranceValue = enduranceAbility?.value || 6;
    
    // Get saved settings
    const savedSwimSource = this.actor.getFlag("msh-faserip", "lastSwimSource") || "normal";
    const savedFeatType = this.actor.getFlag("msh-faserip", "lastSwimFeatType") || "normal";
    const savedColumnShift = this.actor.getFlag("msh-faserip", "lastSwimColumnShift") || 0;
    const savedActionsWhileSwimming = this.actor.getFlag("msh-faserip", "lastSwimActionsWhileSwimming") || false;
    const savedUnderwater = this.actor.getFlag("msh-faserip", "lastSwimUnderwater") || false;
    const skipDiceRoll = this.actor.getFlag("msh-faserip", "lastSwimSkipDiceRoll") || false;
    
    // Get initial swimming info
    const initialInfo = this._getSwimmingInfoFromSelection(savedSwimSource);
    const swimAreas = initialInfo.areas;
    const swimMph = initialInfo.mph;
    const isSwimmingPower = initialInfo.id !== 'normal';
    
    // Exhaustion threshold and immunity
    const exhaustionThreshold = this.actor.exhaustionThreshold;
    const breathHoldTurns = enduranceValue; // Can hold breath for Endurance rank# turns
    const isExhaustionImmune = EXHAUSTION_IMMUNE_RANKS.includes(enduranceRank);
    
    // Cruising speed (if Swimming power)
    const cruisingAreas = isSwimmingPower ? Math.max(1, swimAreas - 2) : 1;
    const cruisingMph = cruisingAreas * 15;
    
    const endAbbrev = abbrevRank(enduranceRank);
    const self = this;
    
    // Build speed stats display
    const speedStatsHtml = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 8px; font-size: 0.85em;">
        <div id="swim-max-speed" style="padding: 6px; background: #e3f2fd; border: 1px solid #90caf9; border-radius: 3px; text-align: center;" title="Maximum swimming speed. At max speed, Exhaustion checks required after ${exhaustionThreshold} turns.">
          <div style="font-weight: bold;">${swimAreas}/turn</div>
          <div style="font-size: 0.85em; color: #1565c0;">Max ${swimMph}mph</div>
        </div>
        <div id="swim-cruise-speed" style="padding: 6px; background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 3px; text-align: center;" title="Cruising speed (2 ranks below max). No Exhaustion checks required.">
          <div style="font-weight: bold;">${cruisingAreas}/turn</div>
          <div style="font-size: 0.85em; color: #2e7d32;">Cruise ${cruisingMph}mph</div>
        </div>
        <div style="padding: 6px; background: #fff3e0; border: 1px solid #ffcc80; border-radius: 3px; text-align: center;" title="Number of turns you can hold your breath underwater. Based on Endurance rank number.">
          <div style="font-weight: bold;">${breathHoldTurns} turns</div>
          <div style="font-size: 0.85em; color: #e65100;">Breath hold</div>
        </div>
        <div style="padding: 6px; background: #fce4ec; border: 1px solid #f48fb1; border-radius: 3px; text-align: center;" title="Number of turns at max speed before first Exhaustion check. Based on Endurance rank number.">
          <div style="font-weight: bold;">${exhaustionThreshold} turns</div>
          <div style="font-size: 0.85em; color: #c2185b;">Exh. thresh</div>
        </div>
      </div>
    `;
    
    const dialogContent = `
      <div style="background: #f5f5f0; padding: 8px; border-radius: 5px; font-size: 0.95em;">
        ${speedStatsHtml}
        
        <div style="margin-bottom: 8px;">
          <label style="font-weight: bold;" title="Select normal swimming or Swimming power rank">Swimming Source:</label>
          <select name="swimSource" style="width: 100%; margin-top: 4px;">
            ${this._buildSwimmingRankOptions(savedSwimSource)}
          </select>
        </div>
        
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px; background: #e8eaf6; border: 1px solid #9fa8da; border-radius: 3px; flex-wrap: wrap;">
          <span style="font-weight: bold;" title="Current swimming speed in areas per turn">Speed:</span>
          <input type="number" name="swimCurrentSpeed" value="${swimAreas}" min="1" max="${swimAreas + 5}" style="width: 45px;" title="Enter current swimming speed">
          <span class="swim-speed-btn" data-speed="${swimAreas}" style="font-size: 0.85em; color: #0066cc; cursor: pointer; text-decoration: underline;" title="Set to maximum speed">[Max]</span>
          <span class="swim-speed-btn" data-speed="${cruisingAreas}" style="font-size: 0.85em; color: #0066cc; cursor: pointer; text-decoration: underline;" title="Set to cruising speed - no exhaustion">[Cruise]</span>
          <span style="margin-left: auto; color: #0d47a1; font-size: 0.9em;" title="Endurance: ${enduranceRank} (${enduranceValue})">End: ${endAbbrev}(${enduranceValue})${isExhaustionImmune ? ' ✓Immune' : ''}</span>
        </div>
        
        <div style="margin-bottom: 8px;">
          <div style="font-weight: bold; margin-bottom: 4px;">FEAT Type:</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
            <label style="padding: 3px; background: ${savedFeatType === 'normal' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Normal swimming at current speed. No roll required.">
              <input type="radio" name="swimFeatType" value="normal" ${savedFeatType === 'normal' ? 'checked' : ''}> Normal <span style="color: #666;">(no roll)</span>
            </label>
            <label style="padding: 3px; background: ${savedFeatType === 'exhaustion' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em; ${isExhaustionImmune ? 'opacity: 0.5;' : ''}" title="Green Endurance FEAT after ${exhaustionThreshold} turns at max speed.&#10;Failure: Must rest 1-10 turns.${isExhaustionImmune ? '&#10;&#10;IMMUNE: Unearthly+ Endurance' : ''}">
              <input type="radio" name="swimFeatType" value="exhaustion" ${savedFeatType === 'exhaustion' ? 'checked' : ''} ${isExhaustionImmune ? 'disabled' : ''}> Exhaustion <span style="color: #666;">(Grn End)</span>
            </label>
            <label style="padding: 3px; background: ${savedFeatType === 'drowning' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Endurance FEAT when out of breath (after ${breathHoldTurns} turns underwater).&#10;White: Drowning (lose 1 End rank/turn).&#10;Green+: Survive, check again next turn.">
              <input type="radio" name="swimFeatType" value="drowning" ${savedFeatType === 'drowning' ? 'checked' : ''}> Drowning <span style="color: #666;">(End FEAT)</span>
            </label>
          </div>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; padding: 6px; background: #f0f0f0; border-radius: 3px; flex-wrap: wrap; font-size: 0.9em;">
          <label title="Performing actions (attacking, using powers) while swimming reduces speed by 50%."><input type="checkbox" name="actionsWhileSwimming" ${savedActionsWhileSwimming ? 'checked' : ''}> Actions <span style="color: #c62828;">(-50%)</span></label>
          <label title="Swimming underwater. Requires breath holding. Reduced visibility."><input type="checkbox" name="underwater" ${savedUnderwater ? 'checked' : ''}> Underwater</label>
          <span style="margin-left: auto;" title="Column Shift: Positive shifts right (easier), negative shifts left (harder).">CS: <input type="number" name="swimShift" value="${savedColumnShift}" style="width: 40px;" title="Column Shift (+right, -left)"></span>
        </div>
        
        ${generateKarmaControlsHTML(this.actor)}
        
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.9em;">
          <label title="Save current settings for next time"><input type="checkbox" name="saveSettings" checked> Remember</label>
          <label title="Skip the 3D dice animation"><input type="checkbox" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>
    `;
    
    new Dialog({
      title: `Swim FEAT: ${this.actor.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          icon: '<i class="fas fa-swimmer"></i>',
          label: "Swim!",
          callback: async (html) => {
            const swimSourceValue = html.find('[name="swimSource"]').val();
            const featType = html.find('[name="swimFeatType"]:checked').val();
            const currentSpeed = parseInt(html.find('[name="swimCurrentSpeed"]').val()) || 1;
            const columnShift = parseInt(html.find('[name="swimShift"]').val()) || 0;
            const spendKarma = html.find('#spend-karma').is(':checked');
            const actionsWhileSwimming = html.find('[name="actionsWhileSwimming"]').is(':checked');
            const underwater = html.find('[name="underwater"]').is(':checked');
            const saveSettings = html.find('[name="saveSettings"]').is(':checked');
            const skipDice = html.find('[name="skipDice"]').is(':checked');
            
            // Get swimming info from selection
            const swimInfo = self._getSwimmingInfoFromSelection(swimSourceValue);
            
            if (saveSettings) {
              await this.actor.setFlag("msh-faserip", "lastSwimSource", swimSourceValue);
              await this.actor.setFlag("msh-faserip", "lastSwimFeatType", featType);
              await this.actor.setFlag("msh-faserip", "lastSwimColumnShift", columnShift);
              await this.actor.setFlag("msh-faserip", "lastSwimActionsWhileSwimming", actionsWhileSwimming);
              await this.actor.setFlag("msh-faserip", "lastSwimUnderwater", underwater);
              await this.actor.setFlag("msh-faserip", "lastSwimSkipDiceRoll", skipDice);
            }
            
            await this._executeSwimFeat(featType, columnShift, spendKarma, skipDice, actionsWhileSwimming, underwater, currentSpeed, swimInfo, breathHoldTurns, exhaustionThreshold);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll",
      render: (html) => {
        const FaseripActor = CONFIG.Actor.documentClass;
        
        // FEAT type highlight
        html.find('[name="swimFeatType"]').on('change', function() {
          html.find('[name="swimFeatType"]').each(function() {
            $(this).closest('label').css('background', $(this).is(':checked') ? '#e3f2fd' : 'transparent');
          });
        });
        
        // Speed quick-fill
        html.find('.swim-speed-btn').on('click', function() {
          const speed = $(this).data('speed');
          html.find('[name="swimCurrentSpeed"]').val(speed);
        });
        
        // Update speeds when source changes
        html.find('[name="swimSource"]').on('change', function() {
          const selectedValue = $(this).val();
          const swimInfo = self._getSwimmingInfoFromSelection(selectedValue);
          const newCruising = swimInfo.id === 'normal' ? 1 : Math.max(1, swimInfo.areas - 2);
          
          // Update stats display
          html.find('#swim-max-speed').html(`
            <div style="font-weight: bold;">${swimInfo.areas}/turn</div>
            <div style="font-size: 0.85em; color: #1565c0;">Max ${swimInfo.mph}mph</div>
          `);
          html.find('#swim-cruise-speed').html(`
            <div style="font-weight: bold;">${newCruising}/turn</div>
            <div style="font-size: 0.85em; color: #2e7d32;">Cruise ${newCruising * 15}mph</div>
          `);
          
          // Update speed input and buttons
          html.find('[name="swimCurrentSpeed"]').val(swimInfo.areas);
          html.find('.swim-speed-btn').eq(0).data('speed', swimInfo.areas);
          html.find('.swim-speed-btn').eq(1).data('speed', newCruising);
        });
      }
    }).render(true);
  }
  
  /**
   * Execute a Swim FEAT roll
   */
  async _executeSwimFeat(featType, columnShift, spendKarma, skipDice, actionsWhileSwimming, underwater, currentSpeed, swimInfo, breathHoldTurns, exhaustionThreshold) {
    const enduranceAbility = this.actor.system.abilities?.endurance;
    const enduranceRank = enduranceAbility?.rank || "Typical";
    const enduranceValue = enduranceAbility?.value || 6;
    
    const cruisingAreas = swimInfo.id === 'normal' ? 1 : Math.max(1, swimInfo.areas - 2);
    const isAboveCruising = currentSpeed > cruisingAreas;
    
    // FEAT type info
    const featTypeInfo = {
      'normal': { name: 'Normal Swimming', failure: null },
      'exhaustion': { name: 'Exhaustion Check', failure: 'Must rest 1-10 turns', requirement: 'Green' },
      'drowning': { name: 'Drowning Check', failure: 'Drowning! Lose 1 Endurance rank/turn', requirement: 'Green' }
    };
    const featInfo = featTypeInfo[featType] || featTypeInfo['normal'];
    
    // Handle normal swimming (no roll)
    if (featType === 'normal') {
      let effectiveSpeed = currentSpeed;
      
      if (actionsWhileSwimming) {
        effectiveSpeed = Math.ceil(effectiveSpeed / 2);
      }
      
      // Note about exhaustion if swimming above cruising speed
      const exhaustionNote = isAboveCruising 
        ? `<div style="color: #c2185b; font-size: 0.85em;">Above cruising speed — Exhaustion check after ${exhaustionThreshold} turns</div>`
        : '';
      
      const sourceNote = swimInfo.id === 'normal' 
        ? 'Normal Swimming' 
        : `Swimming Power (${swimInfo.rank})`;
      
      const content = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${this.actor.name} - Swimming</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>${sourceNote}</div>
            <div>Speed: ${currentSpeed} areas/turn (${currentSpeed * 15} mph)${currentSpeed >= swimInfo.areas ? ' <strong style="color: #1565c0;">[MAX]</strong>' : ''}</div>
            <div style="color: #666; font-size: 0.85em;">Cruising: ${cruisingAreas} | Max: ${swimInfo.areas}</div>
            ${exhaustionNote}
            ${actionsWhileSwimming ? `<div style="color: #c62828;">Actions while swimming: speed halved</div>` : ''}
            ${underwater ? `<div style="color: #0277bd;">Underwater — can hold breath ${breathHoldTurns} turns</div>` : ''}
            <div>Effective Speed: <strong>${effectiveSpeed} areas/turn</strong> (${effectiveSpeed * 15} mph)</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: #4CAF50; color: white;">
            SWIMMING OK — NO ROLL NEEDED
          </div>
        </div>
      `;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: content
      });
      return;
    }
    
    // Apply column shifts
    const effectiveRank = applyColumnShift(enduranceRank, columnShift);
    
    // Roll
    const roll = new Roll("1d100");
    await roll.evaluate();
    
    if (!skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${this.actor.name} attempts ${featInfo.name}`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }
    
    // Karma
    let cappedTotal = roll.total;
    let karmaUsed = 0;
    
    if (spendKarma && getAvailableKarma(this.actor) > 0) {
      const initialColor = game.msh.rollUniversalTable(effectiveRank, roll.total);
      const karmaResult = await showKarmaDecisionDialog(
        this.actor,
        roll.total,
        effectiveRank,
        featInfo.name,
        initialColor
      );
      cappedTotal = karmaResult.finalResult;
      karmaUsed = karmaResult.karmaSpent;
    }
    
    const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const featSuccess = ['green', 'yellow', 'red'].includes(resultColor.toLowerCase());
    const colorStyle = COLOR_STYLES[resultColor.toLowerCase()] || COLOR_STYLES.white;
    
    // Build modifier notes
    let modifierNotes = [];
    if (actionsWhileSwimming) modifierNotes.push('Actions while swimming (-50%)');
    if (underwater) modifierNotes.push('Underwater');
    
    const sourceNote = swimInfo.id === 'normal' 
      ? 'Normal Swimming' 
      : `Swimming Power (${swimInfo.rank})`;
    
    const content = `
      <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
          <strong>${this.actor.name} - ${featInfo.name}</strong>
        </div>
        <div style="padding: 5px 10px; font-size: 0.9em;">
          <div>${sourceNote}</div>
          <div>Endurance: ${enduranceRank} (${enduranceValue})</div>
          ${columnShift !== 0 ? `<div>Column Shift: ${columnShift > 0 ? '+' : ''}${columnShift} → ${effectiveRank}</div>` : ''}
          ${modifierNotes.length > 0 ? `<div style="color: #666; font-size: 0.85em;">${modifierNotes.join(' • ')}</div>` : ''}
          <div>Required: <span style="color: #2e7d32; font-weight: bold;">${featInfo.requirement}</span></div>
          <div>Roll: ${roll.total}${karmaUsed > 0 ? ` + Karma: ${karmaUsed} = ${cappedTotal}` : ''}</div>
        </div>
        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
          background-color: ${colorStyle.bg}; color: ${colorStyle.text};">
          ${resultColor.toUpperCase()} RESULT
        </div>
        <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${featSuccess ? '#4CAF50' : '#F44336'};">
          ${featSuccess ? 'SUCCESS' : `FAILED — ${featInfo.failure}`}
        </div>
      </div>
    `;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    });
  }

  // ============================================================
  // TELEPORT FEAT
  // ============================================================

  /**
   * Teleport distance by rank - uses AIR speed table (areas = max teleport distance)
   */
  static TELEPORT_DISTANCE = {
    "Feeble": { areas: 2, mph: 30, desc: "2 areas" },
    "Poor": { areas: 4, mph: 60, desc: "4 areas" },
    "Typical": { areas: 6, mph: 90, desc: "6 areas" },
    "Good": { areas: 8, mph: 120, desc: "8 areas" },
    "Excellent": { areas: 10, mph: 150, desc: "10 areas" },
    "Remarkable": { areas: 15, mph: 225, desc: "15 areas" },
    "Incredible": { areas: 20, mph: 300, desc: "20 areas" },
    "Amazing": { areas: 25, mph: 375, desc: "25 areas" },
    "Monstrous": { areas: 30, mph: 450, desc: "30 areas" },
    "Unearthly": { areas: 40, mph: 600, desc: "40 areas" },
    "Shift-X": { areas: 50, mph: 750, desc: "50 areas" },
    "Shift-Y": { areas: 100, mph: 1500, desc: "100 areas" },
    "Shift-Z": { areas: 200, mph: 3750, desc: "200 areas" },
    "Class 1000": { areas: 0, mph: 0, desc: "Interplanetary" },
    "Class 3000": { areas: 0, mph: 0, desc: "Near-Light" },
    "Class 5000": { areas: 0, mph: 0, desc: "Teleportation (anywhere)" }
  };

  /**
   * Build Teleport power rank dropdown options
   */
  _buildTeleportRankOptions(selectedValue) {
    let html = '';
    
    const ranks = [
      "Feeble", "Poor", "Typical", "Good", "Excellent", "Remarkable", 
      "Incredible", "Amazing", "Monstrous", "Unearthly", 
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000"
    ];
    
    for (const rank of ranks) {
      const distData = MovementFeats.TELEPORT_DISTANCE[rank];
      if (distData) {
        const isSelected = selectedValue === rank;
        html += `<option value="${rank}" ${isSelected ? 'selected' : ''}>${rank} — ${distData.desc}</option>`;
      }
    }
    
    return html;
  }
  
  /**
   * Get teleport info from rank selection
   */
  _getTeleportInfoFromSelection(selection) {
    const distData = MovementFeats.TELEPORT_DISTANCE[selection] || MovementFeats.TELEPORT_DISTANCE["Typical"];
    const rankValues = {
      "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10, "Excellent": 20,
      "Remarkable": 30, "Incredible": 40, "Amazing": 50, "Monstrous": 75,
      "Unearthly": 100, "Shift-X": 150, "Shift-Y": 200, "Shift-Z": 500,
      "Class 1000": 1000, "Class 3000": 3000, "Class 5000": 5000
    };
    
    return {
      rank: selection,
      value: rankValues[selection] || 6,
      ...distData
    };
  }

  /**
   * Show Teleport FEAT dialog
   * Rules:
   * - Normal Teleport: Power FEAT, failure = disoriented 1 round
   * - Passenger: Green Endurance FEAT or disoriented 1-10 rounds
   * - Unwilling Target: Yellow Endurance FEAT or disoriented 1-10 rounds
   * - Into Solid: Endurance FEAT, fail = 2x material damage
   */
  async showTeleportDialog() {
    const enduranceAbility = this.actor.system.abilities?.endurance;
    const enduranceRank = enduranceAbility?.rank || "Typical";
    const enduranceValue = enduranceAbility?.value || 6;
    
    // Get saved settings
    const savedTeleportRank = this.actor.getFlag("msh-faserip", "lastTeleportRank") || "Typical";
    const savedFeatType = this.actor.getFlag("msh-faserip", "lastTeleportFeatType") || "normal";
    const savedColumnShift = this.actor.getFlag("msh-faserip", "lastTeleportColumnShift") || 0;
    const savedCarryingPassengers = this.actor.getFlag("msh-faserip", "lastTeleportCarryingPassengers") || false;
    const savedBlindTeleport = this.actor.getFlag("msh-faserip", "lastTeleportBlindTeleport") || false;
    const skipDiceRoll = this.actor.getFlag("msh-faserip", "lastTeleportSkipDiceRoll") || false;
    
    // Get initial teleport info
    const initialInfo = this._getTeleportInfoFromSelection(savedTeleportRank);
    const teleportAbbrev = abbrevRank(savedTeleportRank);
    const endAbbrev = abbrevRank(enduranceRank);
    const self = this;
    
    // Build stats display
    const statsHtml = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-bottom: 8px; font-size: 0.85em;">
        <div id="teleport-range" style="padding: 6px; background: #e3f2fd; border: 1px solid #90caf9; border-radius: 3px; text-align: center;" title="Maximum teleport distance based on power rank.">
          <div style="font-weight: bold;">${initialInfo.desc}</div>
          <div style="font-size: 0.85em; color: #1565c0;">Range</div>
        </div>
        <div style="padding: 6px; background: #fff3e0; border: 1px solid #ffcc80; border-radius: 3px; text-align: center;" title="Failure on normal teleport = disoriented for 1 round (no action next round).">
          <div style="font-weight: bold;">1 round</div>
          <div style="font-size: 0.85em; color: #e65100;">Disorient (fail)</div>
        </div>
        <div style="padding: 6px; background: #fce4ec; border: 1px solid #f48fb1; border-radius: 3px; text-align: center;" title="Passengers/targets who fail Endurance FEAT are disoriented 1-10 rounds.">
          <div style="font-weight: bold;">1-10 rounds</div>
          <div style="font-size: 0.85em; color: #c2185b;">Passenger disorient</div>
        </div>
      </div>
    `;
    
    const dialogContent = `
      <div style="background: #f5f5f0; padding: 8px; border-radius: 5px; font-size: 0.95em;">
        ${statsHtml}
        
        <div style="margin-bottom: 8px;">
          <label style="font-weight: bold;" title="Select your Teleportation power rank">Teleport Power Rank:</label>
          <select name="teleportRank" style="width: 100%; margin-top: 4px;">
            ${this._buildTeleportRankOptions(savedTeleportRank)}
          </select>
        </div>
        
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px; background: #e8eaf6; border: 1px solid #9fa8da; border-radius: 3px; flex-wrap: wrap;">
          <span id="teleport-power-display" style="color: #0d47a1; font-size: 0.9em;" title="Teleport: ${savedTeleportRank} (${initialInfo.value})&#10;Endurance: ${enduranceRank} (${enduranceValue})">Power: ${teleportAbbrev}(${initialInfo.value}) End: ${endAbbrev}(${enduranceValue})</span>
        </div>
        
        <div style="margin-bottom: 8px;">
          <div style="font-weight: bold; margin-bottom: 4px;">FEAT Type:</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
            <label style="padding: 3px; background: ${savedFeatType === 'normal' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Power rank FEAT to teleport.&#10;Failure: Arrive but disoriented (no action next round).">
              <input type="radio" name="teleportFeatType" value="normal" ${savedFeatType === 'normal' ? 'checked' : ''}> Normal <span style="color: #666;">(Power)</span>
            </label>
            <label style="padding: 3px; background: ${savedFeatType === 'passenger' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Green Endurance FEAT for willing passengers.&#10;Failure: Disoriented 1-10 rounds.">
              <input type="radio" name="teleportFeatType" value="passenger" ${savedFeatType === 'passenger' ? 'checked' : ''}> Passenger <span style="color: #666;">(Grn End)</span>
            </label>
            <label style="padding: 3px; background: ${savedFeatType === 'unwilling' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Yellow Endurance FEAT for unwilling targets teleported from area.&#10;Failure: Disoriented 1-10 rounds.">
              <input type="radio" name="teleportFeatType" value="unwilling" ${savedFeatType === 'unwilling' ? 'checked' : ''}> Unwilling <span style="color: #666;">(Yel End)</span>
            </label>
            <label style="padding: 3px; background: ${savedFeatType === 'solid' ? '#e3f2fd' : 'transparent'}; border-radius: 2px; font-size: 0.9em;" title="Endurance FEAT when teleporting into solid object.&#10;Failure: 2x material strength damage.&#10;Success: Random 'port, unconscious 1-10 rounds.">
              <input type="radio" name="teleportFeatType" value="solid" ${savedFeatType === 'solid' ? 'checked' : ''}> Into Solid <span style="color: #666;">(End)</span>
            </label>
          </div>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; padding: 6px; background: #f0f0f0; border-radius: 3px; flex-wrap: wrap; font-size: 0.9em;">
          <label title="Carrying passengers within Strength limits."><input type="checkbox" name="carryingPassengers" ${savedCarryingPassengers ? 'checked' : ''}> Carrying passengers</label>
          <label title="Teleporting to unseen/unfamiliar location. GM may apply column shift penalty."><input type="checkbox" name="blindTeleport" ${savedBlindTeleport ? 'checked' : ''}> Blind 'port</label>
          <span style="margin-left: auto;" title="Column Shift: Positive shifts right (easier), negative shifts left (harder).">CS: <input type="number" name="teleportShift" value="${savedColumnShift}" style="width: 40px;" title="Column Shift (+right, -left)"></span>
        </div>
        
        ${generateKarmaControlsHTML(this.actor)}
        
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.9em;">
          <label title="Save current settings for next time"><input type="checkbox" name="saveSettings" checked> Remember</label>
          <label title="Skip the 3D dice animation"><input type="checkbox" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>
    `;
    
    new Dialog({
      title: `Teleport FEAT: ${this.actor.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          icon: '<i class="fas fa-bolt"></i>',
          label: "Teleport!",
          callback: async (html) => {
            const teleportRankValue = html.find('[name="teleportRank"]').val();
            const featType = html.find('[name="teleportFeatType"]:checked').val();
            const columnShift = parseInt(html.find('[name="teleportShift"]').val()) || 0;
            const spendKarma = html.find('#spend-karma').is(':checked');
            const carryingPassengers = html.find('[name="carryingPassengers"]').is(':checked');
            const blindTeleport = html.find('[name="blindTeleport"]').is(':checked');
            const saveSettings = html.find('[name="saveSettings"]').is(':checked');
            const skipDice = html.find('[name="skipDice"]').is(':checked');
            
            // Get teleport info from selection
            const teleportInfo = self._getTeleportInfoFromSelection(teleportRankValue);
            
            if (saveSettings) {
              await this.actor.setFlag("msh-faserip", "lastTeleportRank", teleportRankValue);
              await this.actor.setFlag("msh-faserip", "lastTeleportFeatType", featType);
              await this.actor.setFlag("msh-faserip", "lastTeleportColumnShift", columnShift);
              await this.actor.setFlag("msh-faserip", "lastTeleportCarryingPassengers", carryingPassengers);
              await this.actor.setFlag("msh-faserip", "lastTeleportBlindTeleport", blindTeleport);
              await this.actor.setFlag("msh-faserip", "lastTeleportSkipDiceRoll", skipDice);
            }
            
            await this._executeTeleportFeat(featType, columnShift, spendKarma, skipDice, carryingPassengers, blindTeleport, teleportInfo);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll",
      render: (html) => {
        // FEAT type highlight
        html.find('[name="teleportFeatType"]').on('change', function() {
          html.find('[name="teleportFeatType"]').each(function() {
            $(this).closest('label').css('background', $(this).is(':checked') ? '#e3f2fd' : 'transparent');
          });
        });
        
        // Update display when rank changes
        html.find('[name="teleportRank"]').on('change', function() {
          const selectedValue = $(this).val();
          const teleportInfo = self._getTeleportInfoFromSelection(selectedValue);
          const teleportAbbrev = abbrevRank(selectedValue);
          
          // Update range display
          html.find('#teleport-range').html(`
            <div style="font-weight: bold;">${teleportInfo.desc}</div>
            <div style="font-size: 0.85em; color: #1565c0;">Range</div>
          `);
          
          // Update power display
          html.find('#teleport-power-display').html(`Power: ${teleportAbbrev}(${teleportInfo.value}) End: ${endAbbrev}(${enduranceValue})`);
        });
      }
    }).render(true);
  }
  
  /**
   * Execute a Teleport FEAT roll
   */
  async _executeTeleportFeat(featType, columnShift, spendKarma, skipDice, carryingPassengers, blindTeleport, teleportInfo) {
    const enduranceAbility = this.actor.system.abilities?.endurance;
    const enduranceRank = enduranceAbility?.rank || "Typical";
    const enduranceValue = enduranceAbility?.value || 6;
    
    // Determine which ability/rank to use based on FEAT type
    const isNormalTeleport = featType === 'normal';
    const isPassenger = featType === 'passenger';
    const isUnwilling = featType === 'unwilling';
    const isIntoSolid = featType === 'solid';
    
    // Normal teleport uses power rank, others use Endurance
    const abilityRank = isNormalTeleport ? teleportInfo.rank : enduranceRank;
    const abilityValue = isNormalTeleport ? teleportInfo.value : enduranceValue;
    const abilityName = isNormalTeleport ? 'Teleport' : 'Endurance';
    
    // FEAT type info
    const featTypeInfo = {
      'normal': { 
        name: 'Teleport', 
        failure: 'Disoriented — no action next round', 
        requirement: 'Green',
        successNote: 'Teleport successful!'
      },
      'passenger': { 
        name: 'Passenger Endurance', 
        failure: 'Disoriented 1-10 rounds', 
        requirement: 'Green',
        successNote: 'Passenger unaffected'
      },
      'unwilling': { 
        name: 'Unwilling Target', 
        failure: 'Disoriented 1-10 rounds', 
        requirement: 'Yellow',
        successNote: 'Target resists disorientation'
      },
      'solid': { 
        name: 'Teleport into Solid', 
        failure: 'Takes 2× material strength damage!', 
        requirement: 'Green',
        successNote: 'Random teleport — unconscious 1-10 rounds'
      }
    };
    const featInfo = featTypeInfo[featType] || featTypeInfo['normal'];
    
    // Apply column shifts
    const effectiveRank = applyColumnShift(abilityRank, columnShift);
    
    // Roll
    const roll = new Roll("1d100");
    await roll.evaluate();
    
    if (!skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${this.actor.name} attempts ${featInfo.name}`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }
    
    // Karma
    let cappedTotal = roll.total;
    let karmaUsed = 0;
    
    if (spendKarma && getAvailableKarma(this.actor) > 0) {
      const initialColor = game.msh.rollUniversalTable(effectiveRank, roll.total);
      const karmaResult = await showKarmaDecisionDialog(
        this.actor,
        roll.total,
        effectiveRank,
        featInfo.name,
        initialColor
      );
      cappedTotal = karmaResult.finalResult;
      karmaUsed = karmaResult.karmaSpent;
    }
    
    const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    
    // Check success based on FEAT type
    let featSuccess;
    if (isUnwilling) {
      // Unwilling requires Yellow
      featSuccess = ['yellow', 'red'].includes(resultColor.toLowerCase());
    } else {
      // Normal, Passenger, Into Solid require Green
      featSuccess = ['green', 'yellow', 'red'].includes(resultColor.toLowerCase());
    }
    
    const colorStyle = COLOR_STYLES[resultColor.toLowerCase()] || COLOR_STYLES.white;
    
    // Build modifier notes
    let modifierNotes = [];
    if (carryingPassengers) modifierNotes.push('Carrying passengers');
    if (blindTeleport) modifierNotes.push('Blind teleport');
    
    // For into solid, success is still bad (random port + unconscious)
    const resultText = featSuccess 
      ? featInfo.successNote
      : `FAILED — ${featInfo.failure}`;
    
    // Special: roll disorientation duration for failures that cause it
    let disorientRoll = '';
    if (!featSuccess && (isPassenger || isUnwilling)) {
      const disorientDuration = Math.floor(Math.random() * 10) + 1;
      disorientRoll = ` (${disorientDuration} rounds)`;
    }
    if (featSuccess && isIntoSolid) {
      const unconsciousDuration = Math.floor(Math.random() * 10) + 1;
      disorientRoll = ` (${unconsciousDuration} rounds unconscious)`;
    }
    
    const content = `
      <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
          <strong>${this.actor.name} - ${featInfo.name}</strong>
        </div>
        <div style="padding: 5px 10px; font-size: 0.9em;">
          <div>Teleport Power: ${teleportInfo.rank} (${teleportInfo.value}) — Range: ${teleportInfo.desc}</div>
          <div>${abilityName}: ${abilityRank} (${abilityValue})</div>
          ${columnShift !== 0 ? `<div>Column Shift: ${columnShift > 0 ? '+' : ''}${columnShift} → ${effectiveRank}</div>` : ''}
          ${modifierNotes.length > 0 ? `<div style="color: #666; font-size: 0.85em;">${modifierNotes.join(' • ')}</div>` : ''}
          <div>Required: <span style="color: ${isUnwilling ? '#f57f17' : '#2e7d32'}; font-weight: bold;">${featInfo.requirement}</span></div>
          <div>Roll: ${roll.total}${karmaUsed > 0 ? ` + Karma: ${karmaUsed} = ${cappedTotal}` : ''}</div>
        </div>
        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
          background-color: ${colorStyle.bg}; color: ${colorStyle.text};">
          ${resultColor.toUpperCase()} RESULT
        </div>
        <div style="padding: 5px 10px; font-size: 1.1em; text-align: center; font-weight: bold; color: ${featSuccess && !isIntoSolid ? '#4CAF50' : '#F44336'};">
          ${resultText}${disorientRoll}
        </div>
      </div>
    `;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    });
  }
}

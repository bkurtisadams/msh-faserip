// movement-feats.js v1.2.0 - 2025-01-19
// v1.2.0: Simplify Leaping - dropdown with Strength default + manual rank selection for Leaping power
// v1.1.0: Leap dialog dropdown shows ALL powers, user selects leaping source
// Movement FEAT dialogs for Leap, Fly, Run, Swim, Teleport
// Extracted from actorSheet.js to reduce file size

import { generateKarmaControlsHTML, showKarmaDecisionDialog, getAvailableKarma } from './modules/dice/dice-roller.js';

// Rank list for column shifts
const RANKS = [
  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
];

// Exhaustion-immune ranks
const EXHAUSTION_IMMUNE_RANKS = [
  "Unearthly", "Shift-X", "Shift X", "Shift-Y", "Shift Y", 
  "Shift-Z", "Shift Z", "Class 1000", "Class 3000", "Class 5000"
];

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
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
        <div style="padding: 8px; background: #e3f2fd; border: 1px solid #90caf9; border-radius: 3px;">
          <div style="font-size: 0.8em; color: #1565c0;">Max Speed</div>
          <div style="font-weight: bold;">${flyAreas} areas/turn</div>
          <div style="font-size: 0.85em;">${flightInfo.mph} mph (${flightInfo.rank})</div>
        </div>
        <div style="padding: 8px; background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 3px;">
          <div style="font-size: 0.8em; color: #2e7d32;">Cruising (no exhaustion)</div>
          <div style="font-weight: bold;">${cruisingInfo?.areas || '—'} areas/turn</div>
          <div style="font-size: 0.85em;">${cruisingInfo?.mph || '—'} mph</div>
        </div>
        <div style="padding: 8px; background: #fff3e0; border: 1px solid #ffcc80; border-radius: 3px;">
          <div style="font-size: 0.8em; color: #e65100;">Low Altitude Max</div>
          <div style="font-weight: bold;">${flightInfo.groundAreas} areas/turn</div>
          <div style="font-size: 0.85em;">Enclosed/&lt;2 stories</div>
        </div>
        <div style="padding: 8px; background: #fce4ec; border: 1px solid #f48fb1; border-radius: 3px;">
          <div style="font-size: 0.8em; color: #c2185b;">Acceleration</div>
          <div style="font-weight: bold;">${acceleration} areas/turn²</div>
          <div style="font-size: 0.85em;">From Endurance</div>
        </div>
      </div>
    `;
    
    const dialogContent = `
      <div style="background: #f5f5f0; padding: 10px; border-radius: 5px;">
        ${flightStatsHtml}
        
        <div style="margin-bottom: 10px; padding: 8px; background: #fff; border: 1px solid #ccc; border-radius: 3px;">
          <div><strong style="color: #0d47a1;">Agility:</strong> ${agilityRank} (${agilityValue})</div>
          <div><strong style="color: #0d47a1;">Endurance:</strong> ${enduranceRank} (${enduranceValue})${isExhaustionImmune ? ' <span style="color: #2e7d32;">(Exhaustion Immune)</span>' : ''}</div>
        </div>
        
        <div style="margin-bottom: 10px;">
          <label style="display: block; font-weight: bold; margin-bottom: 5px;">FEAT Type:</label>
          <label style="display: block; margin: 4px 0; padding: 4px; background: ${savedFeatType === 'normal' ? '#e3f2fd' : 'transparent'}; border-radius: 3px;">
            <input type="radio" name="flyFeatType" value="normal" ${savedFeatType === 'normal' ? 'checked' : ''}> 
            <strong>Normal Flight</strong> <span style="color: #666; font-size: 0.9em;">(no roll needed)</span>
          </label>
          <label style="display: block; margin: 4px 0; padding: 4px; background: ${savedFeatType === 'sharp-turn' ? '#e3f2fd' : 'transparent'}; border-radius: 3px;">
            <input type="radio" name="flyFeatType" value="sharp-turn" ${savedFeatType === 'sharp-turn' ? 'checked' : ''}> 
            <strong>Sharp Turn &gt;90°</strong> <span style="color: #666; font-size: 0.9em;">(Agility FEAT — fail: continue original direction)</span>
          </label>
          <label style="display: block; margin: 4px 0; padding: 4px; background: ${savedFeatType === 'landing' ? '#e3f2fd' : 'transparent'}; border-radius: 3px;">
            <input type="radio" name="flyFeatType" value="landing" ${savedFeatType === 'landing' ? 'checked' : ''}> 
            <strong>Landing at Speed</strong> <span style="color: #666; font-size: 0.9em;">(Agility FEAT if &gt;3 areas — fail: Slam)</span>
          </label>
          <label style="display: block; margin: 4px 0; padding: 4px; background: ${savedFeatType === 'low-altitude' ? '#e3f2fd' : 'transparent'}; border-radius: 3px;">
            <input type="radio" name="flyFeatType" value="low-altitude" ${savedFeatType === 'low-altitude' ? 'checked' : ''}> 
            <strong>Low Altitude Maneuver</strong> <span style="color: #666; font-size: 0.9em;">(Agility FEAT when exceeding ${flightInfo.groundAreas} areas)</span>
          </label>
          <label style="display: block; margin: 4px 0; padding: 4px; background: ${savedFeatType === 'dive-pullout' ? '#e3f2fd' : 'transparent'}; border-radius: 3px;">
            <input type="radio" name="flyFeatType" value="dive-pullout" ${savedFeatType === 'dive-pullout' ? 'checked' : ''}> 
            <strong>Pull Out of Dive</strong> <span style="color: #666; font-size: 0.9em;">(Agility FEAT)</span>
          </label>
          <label style="display: block; margin: 4px 0; padding: 4px; background: ${savedFeatType === 'exhaustion' ? '#e3f2fd' : 'transparent'}; border-radius: 3px; ${isExhaustionImmune ? 'opacity: 0.5;' : ''}">
            <input type="radio" name="flyFeatType" value="exhaustion" ${savedFeatType === 'exhaustion' ? 'checked' : ''} ${isExhaustionImmune ? 'disabled' : ''}> 
            <strong>Exhaustion Check</strong> <span style="color: #666; font-size: 0.9em;">(Endurance FEAT after ${exhaustionThreshold} turns at max)</span>
          </label>
        </div>
        
        <div style="margin-bottom: 10px; padding: 8px; background: #f0f0f0; border-radius: 3px;">
          <div style="font-weight: bold; margin-bottom: 5px;">Modifiers:</div>
          <label style="display: block; margin: 3px 0;">
            <input type="checkbox" name="actionsWhileFlying" ${savedActionsWhileFlying ? 'checked' : ''}> 
            Actions while flying <span style="color: #c62828;">(-50% speed)</span>
          </label>
          <label style="display: block; margin: 3px 0;">
            <input type="checkbox" name="lowAltitude" ${savedLowAltitude ? 'checked' : ''}> 
            Low altitude / enclosed space <span style="color: #e65100;">(max ${flightInfo.groundAreas} areas)</span>
          </label>
        </div>
        
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 100px;">Column Shift:</label>
          <input type="number" id="fly-shift" name="flyShift" value="${savedColumnShift}" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
        </div>
        
        ${generateKarmaControlsHTML(this.actor)}
        
        <div style="margin-bottom: 10px;">
          <label>
            <input type="checkbox" id="fly-save-settings" name="saveSettings" checked> 
            Remember settings
          </label>
        </div>
        <div>
          <label>
            <input type="checkbox" id="fly-skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
            Skip dice animation
          </label>
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
            
            await this._executeFlyFeat(featType, columnShift, spendKarma, skipDice, actionsWhileFlying, lowAltitude, flightInfo, cruisingInfo);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll",
      render: (html) => {
        html.find('[name="flyFeatType"]').on('change', function() {
          html.find('[name="flyFeatType"]').each(function() {
            $(this).closest('label').css('background', $(this).is(':checked') ? '#e3f2fd' : 'transparent');
          });
        });
      }
    }).render(true);
  }
  
  /**
   * Execute a Fly FEAT roll
   */
  async _executeFlyFeat(featType, columnShift, spendKarma, skipDice, actionsWhileFlying, lowAltitude, flightInfo, cruisingInfo) {
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
    
    // Normal flight - no roll
    if (featType === 'normal') {
      let effectiveSpeed = flightInfo.areas;
      
      if (actionsWhileFlying) {
        effectiveSpeed = Math.ceil(effectiveSpeed / 2);
      }
      if (lowAltitude && effectiveSpeed > flightInfo.groundAreas) {
        effectiveSpeed = Math.min(effectiveSpeed, flightInfo.groundAreas);
      }
      
      const content = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${this.actor.name} - Flight</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Max Speed: ${flightInfo.areas} areas/turn (${flightInfo.mph} mph)</div>
            ${actionsWhileFlying ? `<div style="color: #c62828;">Actions while flying: speed halved</div>` : ''}
            ${lowAltitude ? `<div style="color: #e65100;">Low altitude: max ${flightInfo.groundAreas} areas/turn</div>` : ''}
            <div>Effective Speed: <strong>${effectiveSpeed} areas/turn</strong></div>
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
  // FUTURE: RUN, SWIM, TELEPORT
  // ============================================================
  
  // async showRunDialog() { }
  // async showSwimDialog() { }
  // async showTeleportDialog() { }
}

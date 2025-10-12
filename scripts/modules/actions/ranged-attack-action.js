// scripts/modules/actions/ranged-attack-action.js
import { AttackAction } from "./attack-action.js";
import { RANKS, getAbilityInfo } from "./action-utils.js";

export class RangedAttackAction extends AttackAction {
  constructor(args) {
    super(args);
    this.rangeInAreas = 0;
    this.throughObstacle = false;
  }

  /**
   * Calculate range modifier based on distance traveled
   * Powers: -1CS per area beyond power rank range
   * Weapons: -1CS per area traveled
   * Thrown: range limit based on Strength rank
   */
  _calculateRangeModifier(rangeInAreas, weaponMaxRange = null, powerRank = null, strengthRank = null) {
    let modifier = 0;
    let note = "";

    if (powerRank) {
      // Powers: NO penalty within optimal range, then -1CS per area beyond
      const powerRange = this._getPowerRangeInAreas(powerRank);
      if (rangeInAreas > powerRange) {
        modifier = -(rangeInAreas - powerRange);
        note = `Power range: ${powerRange} areas. Beyond range: ${modifier}CS`;
      } else {
        note = `Within power range (${powerRange} areas) - no penalty`;
      }
    } else if (strengthRank) {
      // Thrown items: -1CS per area beyond the FIRST (not per area traveled)
      const throwRange = this._getThrowingRangeInAreas(strengthRank);
      if (rangeInAreas > throwRange) {
        note = `Beyond max throwing range (${throwRange} areas) - cannot hit`;
        modifier = -999; // Indicates impossible shot
      } else {
        modifier = -(rangeInAreas - 1); // -1CS per area beyond the first
        note = rangeInAreas === 1 
          ? `At 1 area: no range penalty`
          : `Throwing ${rangeInAreas} areas: ${modifier}CS (${rangeInAreas - 1} areas beyond first)`;
      }
    } else if (weaponMaxRange !== null) {
      // Weapons (shooting): -1CS per area beyond the FIRST (not per area traveled)
      if (rangeInAreas > weaponMaxRange) {
        note = `Beyond max weapon range (${weaponMaxRange} areas) - cannot hit`;
        modifier = -999;
      } else {
        modifier = -(rangeInAreas - 1); // -1CS per area beyond the first
        note = rangeInAreas === 1
          ? `At 1 area: no range penalty`
          : `Range ${rangeInAreas} areas: ${modifier}CS (${rangeInAreas - 1} areas beyond first)`;
      }
    }

    return { modifier, note };
  }

  /**
   * Power rank to range in areas (simplified - adjust based on actual Power FEATs table)
   */
  _getPowerRangeInAreas(rank) {
    const rangeTable = {
      "Shift-0": 0,        // Touch only
      "Feeble": 0,         // Touch only
      "Poor": 1,           // 1 area
      "Typical": 2,        // 2 areas
      "Good": 4,           // 4 areas
      "Excellent": 6,      // 6 areas
      "Remarkable": 8,     // 8 areas
      "Incredible": 10,    // 10 areas
      "Amazing": 20,       // 20 areas
      "Monstrous": 40,     // 40 areas
      "Unearthly": 60,     // 60 areas
      "Shift-X": 80,       // 80 areas
      "Shift-Y": 160,      // 160 areas
      "Shift-Z": 400,      // 400 areas
      "Class 1000": 999,   // 100 miles (simplified)
      "Class 3000": 9999,  // 10,000 miles (simplified)
      "Class 5000": 99999, // 1,000,000 miles (simplified)
      "Beyond": 999999     // Unlimited (effectively no range limit)
    };
    return rangeTable[rank] || 1;
  }

  /**
   * Strength rank to throwing range in areas
   */
  _getThrowingRangeInAreas(rank) {
    const throwRangeTable = {
      "Shift-0": 0, "Feeble": 1, "Poor": 1, "Typical": 1, "Good": 2,
      "Excellent": 3, "Remarkable": 4, "Incredible": 5, "Amazing": 6,
      "Monstrous": 7, "Unearthly": 8, "Shift-X": 10, "Shift-Y": 15,
      "Shift-Z": 20, "Class 1000": 999, "Class 3000": 999, "Class 5000": 999
    };
    return throwRangeTable[rank] || 1;
  }

    /**
   * Build moving target modifier input
   */
  _buildMovingTargetInput() {
    return `
      <div style="margin-bottom:6px;">
        <label style="display:inline-block;width:160px;">Target movement:</label>
        <select name="targetMovement" style="width:180px;">
          <option value="0">Stationary (0 CS)</option>
          <option value="-1">Moving ≤5 areas (-1 CS)</option>
          <option value="-2">Moving ≤10 areas (-2 CS)</option>
          <option value="-4">Moving >10 areas (-4 CS)</option>
          <option value="0-charging">Charging at you (0 CS)</option>
        </select>
      </div>
    `;
  }

  /**
   * Build common dialog elements for ranged attacks
   */
  _buildRangeInputs({ defaultRange = 1, showObstacle = true, weaponMaxRange = null, powerRank = null, strengthRank = null }) {
    return `
      <div style="margin:10px 0;padding:8px;border:1px solid #ddd;background:#fafafa;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:6px;">Range & Modifiers</div>
        
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:160px;">Distance (areas):</label>
          <input type="number" name="range" value="${defaultRange}" min="0" style="width:80px;">
          ${weaponMaxRange ? `<span style="margin-left:6px;font-size:0.85em;color:#666;">Max: ${weaponMaxRange} areas</span>` : ''}
          ${strengthRank ? `<span style="margin-left:6px;font-size:0.85em;color:#666;">Max: ${this._getThrowingRangeInAreas(strengthRank)} areas</span>` : ''}
          ${powerRank ? `<span style="margin-left:6px;font-size:0.85em;color:#666;">Optimal: ${this._getPowerRangeInAreas(powerRank)} areas</span>` : ''}
        </div>
        
        ${this._buildMovingTargetInput()}
        
        ${showObstacle ? `
          <div style="margin-bottom:6px;">
            <label style="display:inline-block;width:160px;">Through obstacle:</label>
            <input type="checkbox" name="throughObstacle">
            <span style="margin-left:6px;font-size:0.85em;color:#666;">-2CS (window, curtain, etc.)</span>
          </div>
        ` : ''}
        
        <div id="range-preview" style="margin-top:6px;padding:4px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;font-size:0.85em;">
          <strong>Total Modifiers:</strong> <span id="range-mod-text">Calculating...</span>
        </div>
      </div>
    `;
  }

  /**
   * Setup range preview update handler
   */
  _setupRangePreview(html, { weaponMaxRange = null, powerRank = null, strengthRank = null }) {
    const updatePreview = () => {
      const range = Number(html.find('[name="range"]').val() || 1);
      const targetMovement = html.find('[name="targetMovement"]').val() || "0";
      const throughObstacle = html.find('[name="throughObstacle"]').is(':checked');
      
      // Calculate range modifier
      const { modifier: rangeModifier, note: rangeNote } = 
        this._calculateRangeModifier(range, weaponMaxRange, powerRank, strengthRank);
      
      // Parse movement modifier (handle "0-charging" special case)
      const movementModifier = targetMovement === "0-charging" ? 0 : Number(targetMovement);
      const movementNote = targetMovement === "0-charging" ? "charging at you" 
        : movementModifier === 0 ? "stationary"
        : `moving (${movementModifier}CS)`;
      
      // Obstacle modifier
      const obstacleModifier = throughObstacle ? -2 : 0;
      
      // Total
      const totalModifier = rangeModifier + movementModifier + obstacleModifier;
      
      const $preview = html.find('#range-mod-text');
      if (rangeModifier === -999) {
        $preview.html(`<span style="color:#d32f2f;">IMPOSSIBLE - ${rangeNote}</span>`);
      } else {
        const parts = [];
        if (rangeModifier !== 0) parts.push(`Range: ${rangeModifier}CS`);
        if (movementModifier !== 0 || targetMovement === "0-charging") parts.push(`Target: ${movementNote}`);
        if (obstacleModifier !== 0) parts.push(`Obstacle: ${obstacleModifier}CS`);
        
        const summary = parts.length > 0 ? ` (${parts.join(", ")})` : "";
        $preview.html(`<strong>${totalModifier} CS</strong>${summary}`);
      }
    };

    html.find('[name="range"]').on('input', updatePreview);
    html.find('[name="targetMovement"]').on('change', updatePreview);
    html.find('[name="throughObstacle"]').on('change', updatePreview);
    updatePreview(); // Initial update
  }

  /**
   * Apply range and obstacle modifiers to base column shift
   */
  _applyRangeModifiers(baseShift, rangeInAreas, throughObstacle, weaponMaxRange = null, powerRank = null, strengthRank = null) {
    const { modifier: rangeModifier } = this._calculateRangeModifier(rangeInAreas, weaponMaxRange, powerRank, strengthRank);
    
    if (rangeModifier === -999) {
      return { totalShift: -999, impossible: true, rangeModifier: 0, obstacleModifier: 0 };
    }

    const obstacleModifier = throughObstacle ? -2 : 0;
    const totalShift = baseShift + rangeModifier + obstacleModifier;

    return { 
      totalShift, 
      impossible: false, 
      rangeModifier, 
      obstacleModifier 
    };
  }
}
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
      // Powers use rank-based range (see Power FEATs table)
      const powerRange = this._getPowerRangeInAreas(powerRank);
      if (rangeInAreas > powerRange) {
        modifier = -(rangeInAreas - powerRange);
        note = `Power range: ${powerRange} areas. Beyond range: ${modifier}CS`;
      } else {
        note = `Within power range (${powerRange} areas)`;
      }
    } else if (strengthRank) {
      // Thrown items use Strength-based range
      const throwRange = this._getThrowingRangeInAreas(strengthRank);
      if (rangeInAreas > throwRange) {
        note = `Beyond max throwing range (${throwRange} areas) - cannot hit`;
        modifier = -999; // Indicates impossible shot
      } else {
        modifier = -rangeInAreas; // -1CS per area
        note = `Throwing ${rangeInAreas} area${rangeInAreas > 1 ? 's' : ''}: ${modifier}CS`;
      }
    } else if (weaponMaxRange !== null) {
      // Weapons: -1CS per area traveled
      if (rangeInAreas > weaponMaxRange) {
        note = `Beyond max weapon range (${weaponMaxRange} areas) - cannot hit`;
        modifier = -999;
      } else {
        modifier = -rangeInAreas;
        note = `Range ${rangeInAreas} area${rangeInAreas > 1 ? 's' : ''}: ${modifier}CS`;
      }
    }

    return { modifier, note };
  }

  /**
   * Power rank to range in areas (simplified - adjust based on actual Power FEATs table)
   */
  _getPowerRangeInAreas(rank) {
    const rangeTable = {
      "Shift-0": 0, "Feeble": 1, "Poor": 1, "Typical": 2, "Good": 3,
      "Excellent": 4, "Remarkable": 5, "Incredible": 6, "Amazing": 7,
      "Monstrous": 8, "Unearthly": 10, "Shift-X": 15, "Shift-Y": 20,
      "Shift-Z": 30, "Class 1000": 999, "Class 3000": 999, "Class 5000": 999
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
        
        ${showObstacle ? `
          <div style="margin-bottom:6px;">
            <label style="display:inline-block;width:160px;">Through obstacle:</label>
            <input type="checkbox" name="throughObstacle">
            <span style="margin-left:6px;font-size:0.85em;color:#666;">-2CS (window, curtain, etc.)</span>
          </div>
        ` : ''}
        
        <div id="range-preview" style="margin-top:6px;padding:4px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;font-size:0.85em;">
          <strong>Range Modifier:</strong> <span id="range-mod-text">0 CS (at range 1)</span>
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
      const { modifier, note } = this._calculateRangeModifier(range, weaponMaxRange, powerRank, strengthRank);
      
      const $preview = html.find('#range-mod-text');
      if (modifier === -999) {
        $preview.html(`<span style="color:#d32f2f;">IMPOSSIBLE - ${note}</span>`);
      } else if (modifier < 0) {
        $preview.html(`${modifier} CS — ${note}`);
      } else {
        $preview.text(`0 CS — ${note}`);
      }
    };

    html.find('[name="range"]').on('input', updatePreview);
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
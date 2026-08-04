// ranged-attack-action.js v1.3.0 - 2026-03-15
// v1.3.0: Fix range penalty off-by-one: -1CS per area beyond first (not per area traveled)
//         Affects both weapon shooting and thrown items
// v1.2.0: Thrown weapons -1CS per area traveled (same as weapons RAW); Strength rank sets max range only
//         Thrown items have max range only, no per-area penalty within range
import { AttackAction } from "./attack-action.js";
import { RANKS, getAbilityInfo } from "./action-utils.js";

export class RangedAttackAction extends AttackAction {
  constructor(args) {
    super(args);
    this.rangeInAreas = 0;
    this.throughObstacle = false;
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
    }
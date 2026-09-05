// ranged-attack-action.js v2.0.0 - 2026-09-05
// v2.0.0: Range tables and penalties from the faserip-rules range kernel
//         (faserip-range.js v0.1.0). Power Rank Range Table and Strength
//         throwing range are kernel data; weaponRangePenalty,
//         thrownRangePenalty and powerRangePenalty carry the RULED 2026-09-05
//         penalties (-1CS per area to the target, own area 0, for weapons and
//         thrown items; -1CS per area beyond a power's range). LOS ranges are
//         Infinity; rangeLabel renders them as "LOS". Helpers live in the pure
//         range-helpers.js and are re-exported here; the instance methods
//         remain as thin wrappers for existing callers.
// v1.3.0: Fix range penalty off-by-one: -1CS per area beyond first (not per area traveled)
//         Affects both weapon shooting and thrown items
// v1.2.0: Thrown weapons -1CS per area traveled (same as weapons RAW); Strength rank sets max range only
//         Thrown items have max range only, no per-area penalty within range
import { AttackAction } from "./attack-action.js";
import {
  powerRangeInAreas, throwingRangeInAreas, rangeLabel,
  weaponRangePenalty, thrownRangePenalty, powerRangePenalty,
} from "./range-helpers.js";

export { powerRangeInAreas, throwingRangeInAreas, rangeLabel, weaponRangePenalty, thrownRangePenalty, powerRangePenalty };

export class RangedAttackAction extends AttackAction {
  constructor(args) {
    super(args);
    this.rangeInAreas = 0;
    this.throughObstacle = false;
  }

  _getPowerRangeInAreas(rank) { return powerRangeInAreas(rank); }
  _getThrowingRangeInAreas(rank) { return throwingRangeInAreas(rank); }
  _rangeLabel(areas) { return rangeLabel(areas); }
  _weaponRangePenalty(distance, maxRange) { return weaponRangePenalty(distance, maxRange); }
  _thrownRangePenalty(distance, strengthRank) { return thrownRangePenalty(distance, strengthRank); }
  _powerRangePenalty(powerRank, distance) { return powerRangePenalty(powerRank, distance); }
}

'use strict';

/**
 * Barrel exports for the dice subsystem (Phase 2 split of rolls.js).
 * This exposes both namespaced modules and all of their named exports.
 *
 * Usage examples:
 *   import { DiceRoller, UniversalTable, ColumnShifts } from "../dice/index.js";
 *   import { rollD100, lookupUT, applyCS } from "../dice/index.js";
 */

import * as DiceRoller     from "./dice-roller.js";
import * as UniversalTable from "./universal-table.js";
import * as ColorResults   from "./color-results.js";
import * as ColumnShifts   from "./column-shifts.js";

// Re-export everything for direct named imports (e.g., rollD100, lookupUT, applyCS, etc.)
export * from "./dice-roller.js";
export * from "./universal-table.js";
export * from "./color-results.js";
export * from "./column-shifts.js";

// Also provide stable namespaced bundles for convenience/intellisense.
export { DiceRoller, UniversalTable, ColorResults, ColumnShifts };

// Default export bundles the four namespaces.
const DICE_API = Object.freeze({
  DiceRoller,
  UniversalTable,
  ColorResults,
  ColumnShifts
});

export default DICE_API;

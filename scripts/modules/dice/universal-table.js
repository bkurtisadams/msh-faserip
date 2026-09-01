// File: scripts/modules/dice/universal-table.js v2.0.0 - 2026-08-31
// v2.0.0: Rewritten as a shim over @graycloak/faserip-rules (scripts/lib/faserip-rules,
//         certified against the Advanced Set with 169 kernel tests + errata ledger).
//         All table data and resolution now derive from kernel exports; this file
//         keeps the existing public API and display shapes.
//         Behavior fixes vs v1.3.0 (all certified against the published chart /
//         GM rulings): Poor bands yellow 86->81, red 100->98; Remarkable yellow
//         66->71; Shift Y yellow 41->36, red 81->76; Ca column Miss/Catch/Catch/No
//         -> Autohit/Miss/Damage/Catch; St yellow Damage->No; Ch white None->Miss;
//         Do white Autohit->None; TB yellow Hit->Bullseye (RULED 2026-08-31).
//         POWER_RANGE_VALUES retained verbatim (range table not yet kernelized).

import {
  RANKS as KERNEL_RANKS, UNIVERSAL_TABLE, colorForRoll,
} from '../../lib/faserip-rules/faserip-kernel.js';
import {
  EFFECT_COLUMNS, STUN_TABLE, SLAM_TABLE, KILL_TABLE,
} from '../../lib/faserip-rules/faserip-effects.js';
import {
  kernelKeyFor, foundryNameFor, labelForToken,
} from '../../kernel/adapter.js';

const COLUMN_ORDER = ['BA','EA','Sh','TE','TB','En','Fo','Gp','Gb','Es','Ch','Do','Ev','Bl','Ca'];
const SUB_COLUMNS = [
  { code: 'St', label: 'Stun?', table: STUN_TABLE },
  { code: 'Sl', label: 'Slam?', table: SLAM_TABLE },
  { code: 'Ki', label: 'Kill?', table: KILL_TABLE },
];
const EXTENDED_KEYS = KERNEL_RANKS.map(r => r.key);

// Rank names array for lookups (Feeble .. Class 5000, dash-style shifts)
export const RANKS = EXTENDED_KEYS
  .filter(k => !['SH0', 'BEYOND'].includes(k))
  .map(k => foundryNameFor(k, 'dash'));

// Extended rank names including Shift-0 and Beyond (space-style shifts)
export const RANKS_EXTENDED = EXTENDED_KEYS.map(k => foundryNameFor(k, 'space'));

// Action types with codes and labels
export const actionTypes = [
  ...COLUMN_ORDER.map(code => ({
    code,
    label: code === 'Sh' ? 'Shooting Attacks' : EFFECT_COLUMNS[code].name,
  })),
  ...SUB_COLUMNS.map(({ code, label }) => ({ code, label })),
];

// Maps action codes to the ability they use
export const ACTION_ABILITY_MAP = Object.fromEntries([
  ...COLUMN_ORDER.map(code => [code, EFFECT_COLUMNS[code].ability]),
  ...SUB_COLUMNS.map(({ code }) => [code, 'endurance']),
]);

// Maps action codes and colors to result labels
export const ACTION_RESULT_LABELS = Object.fromEntries([
  ...COLUMN_ORDER.map(code => [code, Object.fromEntries(
    Object.entries(EFFECT_COLUMNS[code].results).map(([c, t]) => [c, labelForToken(t)])
  )]),
  ...SUB_COLUMNS.map(({ code, table }) => [code, Object.fromEntries(
    Object.entries(table).map(([c, t]) => [c, labelForToken(t)])
  )]),
]);

// The Universal Table - maps roll bands to colors for each rank
// (generated from the certified kernel bands; columns in RANKS_EXTENDED order)
const BAND_ROWS = [
  [1, '01'], [2, '02\u201303'], [4, '04\u201306'], [7, '07\u201310'], [11, '11\u201315'],
  [16, '16\u201320'], [21, '21\u201325'], [26, '26\u201330'], [31, '31\u201335'],
  [36, '36\u201340'], [41, '41\u201345'], [46, '46\u201350'], [51, '51\u201355'],
  [56, '56\u201360'], [61, '61\u201365'], [66, '66\u201370'], [71, '71\u201375'],
  [76, '76\u201380'], [81, '81\u201385'], [86, '86\u201390'], [91, '91\u201394'],
  [95, '95\u201397'], [98, '98\u201399'], [100, '100'],
];

export const rankRows = BAND_ROWS.map(([lo, label]) => ({
  label,
  colors: EXTENDED_KEYS.map(k => colorForRoll(k, lo)),
}));

// Power Rank Range Table - maps ranks to range in areas
// (retained verbatim from v1.3.0; range table is not yet in the kernel)
export const POWER_RANGE_VALUES = {
  "Shift-0": 0, "Feeble": 0, "Poor": 1, "Typical": 2, "Good": 4,
  "Excellent": 6, "Remarkable": 8, "Incredible": 10, "Amazing": 20,
  "Monstrous": 40, "Unearthly": 60, "Shift-X": 80, "Shift-Y": 160,
  "Shift-Z": 400,
  "Class 1000": 176000,
  "Class 3000": 17600000,
  "Class 5000": 1760000000,
  "Beyond": Infinity
};

// Result rows for UI display (generated; consecutive identical labels merged)
function buildResultRow(color) {
  const labels = [...COLUMN_ORDER, ...SUB_COLUMNS.map(s => s.code)]
    .map(code => ACTION_RESULT_LABELS[code][color]);
  const cells = [];
  for (const value of labels) {
    const last = cells[cells.length - 1];
    if (last && last.value === value) last.span += 1;
    else cells.push({ value, span: 1 });
  }
  return { result: color, cells };
}

export const resultRows = ['white', 'green', 'yellow', 'red'].map(buildResultRow);

// === Compatibility exports for column-shifts.js ===
export const RANKS_ORDERED = EXTENDED_KEYS
  .filter(k => !['CL1000', 'CL3000', 'CL5000', 'BEYOND'].includes(k))
  .map(k => (k === 'SH0' ? 'Shift-0' : foundryNameFor(k, 'space')));

export function rankIndexOf(rankName) {
  const key = kernelKeyFor(rankName);
  if (!key) return 0;
  const name = key === 'SH0' ? 'Shift-0' : foundryNameFor(key, 'space');
  const idx = RANKS_ORDERED.indexOf(name);
  return idx >= 0 ? idx : 0;
}

export function rankNameAt(index) {
  const i = Math.max(0, Math.min(RANKS_ORDERED.length - 1, index | 0));
  return RANKS_ORDERED[i];
}

/**
 * Roll on the Universal Table to determine color result
 * @param {String} rank - The rank name (e.g. "Excellent", "Shift X")
 * @param {Number} roll - The d100 roll result (1-100)
 * @returns {String} - The color result ("white", "green", "yellow", or "red")
 */
export function rollUniversalTable(rank, roll) {
  const key = kernelKeyFor(rank);
  if (!key || !UNIVERSAL_TABLE[key]) {
    console.warn(`[FASERIP WARN] Rank ${rank} not found in universal table`);
    if (typeof ui !== 'undefined') ui.notifications?.error(`Rank ${rank} not found.`);
    return 'white';
  }
  return colorForRoll(key, roll);
}

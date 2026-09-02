// faserip-rules kernel v0.2.1
// Ruling document: MSH Advanced Set, Players Book (PDF v1.1).
// Pure rules engine. No Foundry, no DOM, no dice — callers supply rolls.

export const KERNEL_VERSION = '0.2.1';

export const COLORS = ['white', 'green', 'yellow', 'red'];

// Certified against Players Book ch.1 rank table.
// min/max = rank range, standard = Standard Rank Number (pregenerated),
// initial = Initial Rank Number (generated characters, Fe-Mn only).
// NOTE: source PDF text reads Monstrous range as "63-67" (OCR error);
// 63-87 restored from context (Unearthly begins at 88). Flagged in ERRATA.
export const RANKS = [
  { key: 'SH0', name: 'Shift 0',    min: 0,    max: 0,        standard: 0,    initial: null },
  { key: 'FE',  name: 'Feeble',     min: 1,    max: 2,        standard: 2,    initial: 1 },
  { key: 'PR',  name: 'Poor',       min: 3,    max: 4,        standard: 4,    initial: 3 },
  { key: 'TY',  name: 'Typical',    min: 5,    max: 7,        standard: 6,    initial: 5 },
  { key: 'GD',  name: 'Good',       min: 8,    max: 15,       standard: 10,   initial: 8 },
  { key: 'EX',  name: 'Excellent',  min: 16,   max: 25,       standard: 20,   initial: 16 },
  { key: 'RM',  name: 'Remarkable', min: 26,   max: 35,       standard: 30,   initial: 26 },
  { key: 'IN',  name: 'Incredible', min: 36,   max: 45,       standard: 40,   initial: 36 },
  { key: 'AM',  name: 'Amazing',    min: 46,   max: 62,       standard: 50,   initial: 46 },
  { key: 'MN',  name: 'Monstrous',  min: 63,   max: 87,       standard: 75,   initial: 63 },
  { key: 'UN',  name: 'Unearthly',  min: 88,   max: 125,      standard: 100,  initial: null },
  { key: 'SHX', name: 'Shift X',    min: 126,  max: 175,      standard: 150,  initial: null },
  { key: 'SHY', name: 'Shift Y',    min: 176,  max: 350,      standard: 200,  initial: null },
  { key: 'SHZ', name: 'Shift Z',    min: 351,  max: 999,      standard: 500,  initial: null },
  { key: 'CL1000', name: 'Class 1000', min: 1000, max: 2999,  standard: 1000, initial: null },
  { key: 'CL3000', name: 'Class 3000', min: 3000, max: 4999,  standard: 3000, initial: null },
  { key: 'CL5000', name: 'Class 5000', min: 5000, max: Infinity, standard: 5000, initial: null },
  { key: 'BEYOND', name: 'Beyond',  min: Infinity, max: Infinity, standard: Infinity, initial: null },
];

const RANK_INDEX = new Map(RANKS.map((r, i) => [r.key, i]));

// Shifting ceiling/floor: "No FEAT may be shifted to the left below Shift 0
// or to the right above Shift Z. Anything in the Class 1000+ columns may not
// be shifted." (Players Book, Shifting the Rank)
export const MAX_SHIFTABLE = 'SHZ';
export const MIN_SHIFTABLE = 'SH0';

// ============================================================
// UNIVERSAL TABLE COLOR BANDS — CERTIFIED 2026-08-31
// Certified against the Advanced Set Universal Table image (GM-supplied).
// Shift 0 - Shift Z verified cell-by-cell; Class 1000/3000/5000/Beyond
// read from zoomed table crop. Cross-check: Players Book karma example —
// Typical, red FEAT, roll 68 + 30 karma = 98 succeeds. redStart(TY)=98. ✓
// Format: first roll (d100, 1-100) that produces each color.
// white is everything below greenStart.
// ============================================================
export const UNIVERSAL_TABLE = {
  SH0:    { greenStart: 66, yellowStart: 95, redStart: 100 },
  FE:     { greenStart: 61, yellowStart: 91, redStart: 100 },
  PR:     { greenStart: 56, yellowStart: 81, redStart: 98 },
  TY:     { greenStart: 51, yellowStart: 81, redStart: 98 },
  GD:     { greenStart: 46, yellowStart: 76, redStart: 98 },
  EX:     { greenStart: 41, yellowStart: 71, redStart: 95 },
  RM:     { greenStart: 36, yellowStart: 71, redStart: 95 },
  IN:     { greenStart: 31, yellowStart: 61, redStart: 91 },
  AM:     { greenStart: 26, yellowStart: 56, redStart: 91 },
  MN:     { greenStart: 21, yellowStart: 51, redStart: 86 },
  UN:     { greenStart: 16, yellowStart: 46, redStart: 86 },
  SHX:    { greenStart: 11, yellowStart: 41, redStart: 81 },
  SHY:    { greenStart: 7,  yellowStart: 36, redStart: 76 },
  SHZ:    { greenStart: 4,  yellowStart: 36, redStart: 76 },
  CL1000: { greenStart: 2,  yellowStart: 36, redStart: 76 },
  CL3000: { greenStart: 2,  yellowStart: 31, redStart: 71 },
  CL5000: { greenStart: 2,  yellowStart: 26, redStart: 66 },
  BEYOND: { greenStart: 2,  yellowStart: 21, redStart: 61 },
};
export const UNIVERSAL_TABLE_CERTIFIED = true;

export function rankByKey(key) {
  const i = RANK_INDEX.get(key);
  if (i === undefined) throw new Error(`Unknown rank key: ${key}`);
  return RANKS[i];
}

export function rankForNumber(n) {
  if (n === Infinity) return rankByKey('BEYOND');
  for (const r of RANKS) {
    if (n >= r.min && n <= r.max) return r;
  }
  throw new Error(`No rank for number: ${n}`);
}

export function rankDistance(fromKey, toKey) {
  return RANK_INDEX.get(toKey) - RANK_INDEX.get(fromKey);
}

export function shiftRank(key, cs) {
  const i = RANK_INDEX.get(key);
  if (i === undefined) throw new Error(`Unknown rank key: ${key}`);
  if (cs === 0) return rankByKey(key);
  const maxI = RANK_INDEX.get(MAX_SHIFTABLE);
  if (i > maxI) throw new Error(`Rank ${key} may not be shifted (Class 1000+)`);
  const shifted = Math.min(Math.max(i + cs, RANK_INDEX.get(MIN_SHIFTABLE)), maxI);
  return RANKS[shifted];
}

// Intensity logic (Players Book, Making FEATs / Lifting Things):
// intensity > ability by 1 rank -> red; equal -> yellow; below -> green;
// 3+ ranks below -> automatic (Judge may still call for a roll);
// 2+ ranks above -> impossible (optional rule; always applies to Resources).
// NOTE: general rule says "more than three ranks lower" is automatic; the
// lifting example treats exactly-3-below as effortless. Kernel follows the
// worked example (>=3). Flagged in ERRATA for GM ruling.
export function requiredColor(abilityKey, intensityKey) {
  const d = rankDistance(intensityKey, abilityKey);
  if (d >= 3) return 'automatic';
  if (d >= 1) return 'green';
  if (d === 0) return 'yellow';
  if (d === -1) return 'red';
  return 'impossible';
}

export function colorForRoll(rankKey, roll) {
  const band = UNIVERSAL_TABLE[rankKey];
  if (!band) throw new Error(`No Universal Table column for rank: ${rankKey}`);
  if (roll >= band.redStart) return 'red';
  if (roll >= band.yellowStart) return 'yellow';
  if (roll >= band.greenStart) return 'green';
  return 'white';
}

export function colorAtLeast(color, needed) {
  return COLORS.indexOf(color) >= COLORS.indexOf(needed);
}

// Karma on rolls (Players Book, Spending Karma): declared before the roll,
// minimum spend 10, added directly to the d100 result. Kernel clamps the
// modified roll to 100. Declaration economics (the mandatory 10 even on a
// natural success/failure) are the caller's concern.
// Karma may never modify Resource FEATs, Popularity FEATs, or rolls from
// Blindside/unexpected attacks — callers enforce via karmaAllowed:false.

export function resolveFeat(opts) {
  const {
    rank,               // rank key, e.g. 'RM'
    rankNumber,         // alternative to rank
    shifts = [],        // [{ cs: +1|-2|..., reason: 'point blank' }]
    intensity = null,   // rank key of Intensity, or null (any color succeeds)
    requiredColorOverride = null, // e.g. force 'yellow' regardless of intensity
    roll,               // raw d100 (1-100)
    karma = 0,
    karmaAllowed = true,
  } = opts;

  const baseRank = rank ? rankByKey(rank) : rankForNumber(rankNumber);
  const totalCS = shifts.reduce((s, x) => s + x.cs, 0);
  const effRank = shiftRank(baseRank.key, totalCS);

  let needed = requiredColorOverride;
  if (!needed) needed = intensity ? requiredColor(effRank.key, intensity) : 'green';

  const breakdown = {
    baseRank: baseRank.key,
    shifts: shifts.map(s => ({ cs: s.cs, reason: s.reason ?? '' })),
    totalCS,
    effectiveRank: effRank.key,
    needed,
  };

  if (needed === 'impossible') {
    return { ...breakdown, color: null, success: false, impossible: true, automatic: false };
  }
  if (needed === 'automatic') {
    return { ...breakdown, color: null, success: true, impossible: false, automatic: true };
  }

  const spent = karmaAllowed ? karma : 0;
  const modifiedRoll = Math.min(roll + spent, 100);
  const color = colorForRoll(effRank.key, modifiedRoll);
  const success = colorAtLeast(color, needed);

  return {
    ...breakdown,
    roll,
    karmaSpent: spent,
    modifiedRoll,
    color,
    success,
    impossible: false,
    automatic: false,
  };
}

// Combined actions (Players Book, Combined and Multiple FEATs): helper within
// one rank of the higher grants +1CS to the higher's FEAT.
export function combinedActionShift(higherKey, lowerKey) {
  const d = rankDistance(lowerKey, higherKey);
  return d <= 1 && d >= 0 ? 1 : 0;
}

// Multiple non-combat actions in one round: the tougher action's requirement
// escalates both. green -> yellow, yellow -> red, red -> not permitted.
export function escalateForMultipleActions(neededColor) {
  if (neededColor === 'automatic') return 'automatic';
  if (neededColor === 'green') return 'yellow';
  if (neededColor === 'yellow') return 'red';
  return 'impossible';
}

// Source-text issues and GM rulings. Kurt (Graycloak) holds final RAW authority.
export const ERRATA = [
  'RULED 2026-08-31: Cosmic rank ranges — Shift Z 351-999, Class 1000 = 1000-2999, Class 3000 = 3000-4999, Class 5000 = 5000+, Beyond = infinity (imported from msh-faserip rules-reference ruling).',
  'NOTE: AP Shot is RAW (ammunition rules): target Body Armor -2CS for hit and damage, no effect on force fields. Implemented in faserip-ammo.js.',
  'RULED 2026-08-31: Monstrous rank range is 63-87. PDF text "63-67" is an OCR error.',
  'RULED 2026-08-31: Automatic FEAT threshold is exactly three ranks below ability (>=3). Kernel requiredColor implements this.',
  'RULED 2026-09-01: An automatic FEAT succeeds regardless of any die rolled for it (e.g. column shifts declared at roll time lift the rank into the automatic band); resolveFeat does not consult the roll. Impossible likewise fails regardless of the roll.',
  'RULED 2026-08-31: Universal Table color bands certified against table image; Class 1000/3000/5000/Beyond corrected from provisional values.',
  'RULED 2026-08-31: Rank 36 is Incredible. Players Book text (Rm 26-35, In 36-45) is authoritative; the table image printing Rm 26-36 / In 37-45 is wrong.',
  'RULED 2026-08-31: Throwing Blunt yellow result is Bullseye per prose; the table image printing yellow = Hit is wrong.',
  'RULED 2026-08-31: Energy attacks — damage may be reduced but not the effect (Energy Attack section text is authoritative over the Pulling Punches summary); effect reduction only via 50 Karma per color as a Kill-capable column.',
  'NOTE: Blunt Attack effects paragraph duplicates the Stun line ("may in addition Slam"/"may in addition Stun"); table confirms Miss/Hit/Slam/Stun.',
  'RULED 2026-08-31: Commit Other Crimes is -10 Karma as the Summary Listing prints; the twice-the-listed rule does not override it.',
  'NOTE: Conspiracy example totals 185 but prints "55 points each" for three heroes; floor(185/3)=61. Kernel follows the stated split rule (100/3 -> 33 each), treating 55 as a book math error.',
  'NOTE: Karma Summary Listing prints Failing Commitment as -5; prose and the Reed Richards example say failure to show is -10 and leaving early is -5. Karma module encodes both per prose.',
  'RULED 2026-08-31: Teleporting into an object inflicts damage equal to the material strength (1x, Movement chapter text authoritative); the Appendix A power description saying twice is wrong. Body Armor gives no protection.',
  'RULED 2026-08-31: Fall impact resolves entirely as a Charging attack per the Charging rules (rebound mechanism); "damage equivalent to the distance" is descriptive, not an alternate formula.',
  'RULED 2026-08-31: Laser rifles are Energy attacks (Energy column, Body Armor at -20); the weapon table typing them "S" is wrong.',
  'RULED 2026-08-31: Mercy Shot drug applies when the weapon damage would have met or beaten the defenses (borderline-consistent).',
  'OPEN (narrowed): Fall-catch intensity — book text certifies only 20 floors/round = Excellent Intensity (matches no speed column; designer fiat). Movement module interpolates the slower rates one rank per fall round (3=Pr, 6=Ty, 10=Gd, 20=Ex certified), overridable, pending GM blessing of the interpolation.',
  'NOTE: Long Distance table prints Shift Z air as 200 areas but 3750 mph; mph is areas x 15 everywhere else (200 -> 3000). Kernel stores the printed values.',
  'NOTE: Chargen tables restored where the PDF text leaves gaps: Random Ranks column 2 Good "78-95" -> 76-95; Powers/Talents/Contacts counts "21-80"/"61-90" -> 21-60/61-90; Power Categories "08-10"/"18-25" -> 06-10/16-25.',
  'NOTE: Chargen Examples 1 and 3 have their roll/rank/number rows scrambled in the PDF text extraction and do not reconcile with the tables; Example 2 (Lodestone) aligns exactly and anchors column 1 certification.',
  'RULED 2026-08-31: Hi-tech initial Resources are flat Good OR optionally rolled (Typical plus modifier) — never Good plus a roll. Example 3 applying the roll on top of Good is a book error.',
  'NOTE: Osprey modeling example computes Health 42 and Karma 36 from its stats, then recaps "Health = 34, Karma = 29"; the sum formulas are certified by the computation, the recap is treated as a book error.',
];

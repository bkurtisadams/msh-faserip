// faserip-kernel test suite — run: node faserip-kernel.test.js
// [CERT] tests certify behavior against Players Book text.
// [PROV] tests exercise the provisional Universal Table bands.

import {
  RANKS, rankByKey, rankForNumber, shiftRank, rankDistance,
  requiredColor, colorForRoll, resolveFeat,
  combinedActionShift, escalateForMultipleActions,
  UNIVERSAL_TABLE, UNIVERSAL_TABLE_CERTIFIED, KERNEL_VERSION,
} from './faserip-kernel.js';

let pass = 0, fail = 0;
function t(label, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok  ${label}`);
  } catch (e) {
    fail++;
    console.log(`FAIL  ${label}\n      ${e.message}`);
  }
}
function eq(a, b) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`expected ${jb}, got ${ja}`);
}

console.log(`faserip-kernel v${KERNEL_VERSION}  (UNIVERSAL_TABLE_CERTIFIED=${UNIVERSAL_TABLE_CERTIFIED})\n`);

// --- Ranks and rank numbers -------------------------------------------

t('[CERT] Strength 15 is Good ("A character with a Strength of 15 can be said to have Good Strength")', () => {
  eq(rankForNumber(15).key, 'GD');
});

t('[CERT] standard rank numbers: Remarkable 30, Monstrous 75, Unearthly 100', () => {
  eq(rankByKey('RM').standard, 30);
  eq(rankByKey('MN').standard, 75);
  eq(rankByKey('UN').standard, 100);
});

t('[CERT] initial rank numbers: Excellent 16, Amazing 46, Monstrous 63', () => {
  eq(rankByKey('EX').initial, 16);
  eq(rankByKey('AM').initial, 46);
  eq(rankByKey('MN').initial, 63);
});

t('[CERT] Spider-Man Remarkable Fighting: hero standard 30, generated minimum 26', () => {
  eq(rankByKey('RM').standard, 30);
  eq(rankByKey('RM').initial, 26);
});

t('[CERT] Monstrous range restored to 63-87 (OCR errata)', () => {
  eq(rankForNumber(80).key, 'MN');
  eq(rankForNumber(88).key, 'UN');
});

t('[CERT] ruled cosmic ranges: SHZ to 999, Cl1000 1000-2999, Cl3000 3000-4999, Cl5000 5000+, Beyond infinity', () => {
  eq(rankForNumber(999).key, 'SHZ');
  eq(rankForNumber(1000).key, 'CL1000');
  eq(rankForNumber(2999).key, 'CL1000');
  eq(rankForNumber(3000).key, 'CL3000');
  eq(rankForNumber(4999).key, 'CL3000');
  eq(rankForNumber(5000).key, 'CL5000');
  eq(rankForNumber(750000).key, 'CL5000');
  eq(rankForNumber(Infinity).key, 'BEYOND');
});

// --- Column shifts ----------------------------------------------------

t('[CERT] shifts clamp at Shift 0 and Shift Z', () => {
  eq(shiftRank('FE', -5).key, 'SH0');
  eq(shiftRank('SHY', +5).key, 'SHZ');
});

t('[CERT] Class 1000+ may not be shifted', () => {
  let threw = false;
  try { shiftRank('CL1000', -1); } catch { threw = true; }
  eq(threw, true);
});

t('[CERT] Vision Am(50) helping She-Hulk Mn(75) lift: within one rank, +1CS -> Unearthly', () => {
  eq(combinedActionShift('MN', 'AM'), 1);
  eq(shiftRank('MN', combinedActionShift('MN', 'AM')).key, 'UN');
});

t('[CERT] Sunspot Rm(30) helping She-Hulk Mn(75): too far below, no shift, still Monstrous', () => {
  eq(combinedActionShift('MN', 'RM'), 0);
});

// --- Intensity logic --------------------------------------------------

t('[CERT] intensity vs ability: above=red, equal=yellow, below=green', () => {
  eq(requiredColor('GD', 'EX'), 'red');
  eq(requiredColor('GD', 'GD'), 'yellow');
  eq(requiredColor('GD', 'TY'), 'green');
});

t('[CERT] Spider-Man In(40) Strength lifting: Good wt auto, Ex/Rm green, In yellow, Am red, beyond impossible', () => {
  eq(requiredColor('IN', 'GD'), 'automatic');
  eq(requiredColor('IN', 'EX'), 'green');
  eq(requiredColor('IN', 'RM'), 'green');
  eq(requiredColor('IN', 'IN'), 'yellow');
  eq(requiredColor('IN', 'AM'), 'red');
  eq(requiredColor('IN', 'MN'), 'impossible');
});

t('[CERT] multiple non-combat actions escalate: green->yellow, yellow->red, red->impossible', () => {
  eq(escalateForMultipleActions('green'), 'yellow');
  eq(escalateForMultipleActions('yellow'), 'red');
  eq(escalateForMultipleActions('red'), 'impossible');
});

// --- FEAT resolution with karma --------------------------------------

t('[CERT] karma example: Typical Strength, red FEAT, roll 68 + 30 karma = 98 succeeds', () => {
  const r = resolveFeat({ rank: 'TY', requiredColorOverride: 'red', roll: 68, karma: 30 });
  eq(r.modifiedRoll, 98);
  eq(r.color, 'red');
  eq(r.success, true);
});

t('[CERT] karma example: roll 13 + 30 karma cannot reach red on Typical', () => {
  const r = resolveFeat({ rank: 'TY', requiredColorOverride: 'red', roll: 13, karma: 30 });
  eq(r.success, false);
});

t('[CERT] karmaAllowed:false ignores karma (Resource/Popularity/Blindside)', () => {
  const r = resolveFeat({ rank: 'TY', requiredColorOverride: 'red', roll: 68, karma: 30, karmaAllowed: false });
  eq(r.modifiedRoll, 68);
  eq(r.success, false);
});

t('[CERT] shifts feed effective rank with itemized breakdown', () => {
  const r = resolveFeat({
    rank: 'EX',
    shifts: [{ cs: +1, reason: 'charging 1 area' }, { cs: -2, reason: 'firing through window' }],
    requiredColorOverride: 'green',
    roll: 50,
  });
  eq(r.totalCS, -1);
  eq(r.effectiveRank, 'GD');
  eq(r.shifts.length, 2);
});

t('[CERT] impossible intensity resolves without a roll', () => {
  const r = resolveFeat({ rank: 'GD', intensity: 'IN', roll: 100 });
  eq(r.impossible, true);
  eq(r.success, false);
});

t('[CERT] automatic intensity resolves without a roll', () => {
  const r = resolveFeat({ rank: 'IN', intensity: 'GD', roll: 1 });
  eq(r.automatic, true);
  eq(r.success, true);
});

// --- Universal Table bands (certified against table image 2026-08-31) --

t('[CERT] Typical band boundaries: 50 white, 51 green, 81 yellow, 98 red', () => {
  eq(colorForRoll('TY', 50), 'white');
  eq(colorForRoll('TY', 51), 'green');
  eq(colorForRoll('TY', 81), 'yellow');
  eq(colorForRoll('TY', 98), 'red');
});

t('[CERT] Unearthly band boundaries: 15 white, 16 green, 46 yellow, 86 red', () => {
  eq(colorForRoll('UN', 15), 'white');
  eq(colorForRoll('UN', 16), 'green');
  eq(colorForRoll('UN', 46), 'yellow');
  eq(colorForRoll('UN', 86), 'red');
});

t('[CERT] cosmic columns: 01 always white; yellow starts 36/31/26/21, red starts 76/71/66/61', () => {
  for (const k of ['CL1000', 'CL3000', 'CL5000', 'BEYOND']) eq(colorForRoll(k, 1), 'white');
  eq(colorForRoll('CL1000', 36), 'yellow'); eq(colorForRoll('CL1000', 76), 'red');
  eq(colorForRoll('CL3000', 31), 'yellow'); eq(colorForRoll('CL3000', 71), 'red');
  eq(colorForRoll('CL5000', 26), 'yellow'); eq(colorForRoll('CL5000', 66), 'red');
  eq(colorForRoll('BEYOND', 21), 'yellow'); eq(colorForRoll('BEYOND', 61), 'red');
});

t('[CERT] band monotonicity: green/yellow/red starts never increase as ranks rise (SH0..BEYOND)', () => {
  const keys = ['SH0','FE','PR','TY','GD','EX','RM','IN','AM','MN','UN','SHX','SHY','SHZ','CL1000','CL3000','CL5000','BEYOND'];
  for (let i = 1; i < keys.length; i++) {
    const prev = keys[i - 1], cur = keys[i];
    if (UNIVERSAL_TABLE[cur].greenStart > UNIVERSAL_TABLE[prev].greenStart) throw new Error(`greenStart rises ${prev}->${cur}`);
    if (UNIVERSAL_TABLE[cur].yellowStart > UNIVERSAL_TABLE[prev].yellowStart) throw new Error(`yellowStart rises ${prev}->${cur}`);
    if (UNIVERSAL_TABLE[cur].redStart > UNIVERSAL_TABLE[prev].redStart) throw new Error(`redStart rises ${prev}->${cur}`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// File: scripts/dev/kernel-table-diff.mjs v1.0.0 - 2026-08-31
// Acceptance tool for the slice-1 shim: diffs the v2.0.0 kernel-backed
// universal-table.js against the v1.3.0 data and prints every behavior
// difference. Expected output is EXACTLY the intended fix list — anything
// else is a regression. Run from repo root: node scripts/dev/kernel-table-diff.mjs

import * as NEW from '../modules/dice/universal-table.js';

// v1.3.0 reference data (frozen copy for comparison)
const OLD_LABELS = {
  BA: { white: 'Miss', green: 'Hit', yellow: 'Slam', red: 'Stun' },
  EA: { white: 'Miss', green: 'Hit', yellow: 'Stun', red: 'Kill' },
  Sh: { white: 'Miss', green: 'Hit', yellow: 'Bullseye', red: 'Kill' },
  TE: { white: 'Miss', green: 'Hit', yellow: 'Stun', red: 'Kill' },
  TB: { white: 'Miss', green: 'Hit', yellow: 'Hit', red: 'Stun' },
  En: { white: 'Miss', green: 'Hit', yellow: 'Bullseye', red: 'Kill' },
  Fo: { white: 'Miss', green: 'Hit', yellow: 'Bullseye', red: 'Stun' },
  Gp: { white: 'Miss', green: 'Miss', yellow: 'Partial', red: 'Hold' },
  Gb: { white: 'Miss', green: 'Take', yellow: 'Grab', red: 'Break' },
  Es: { white: 'Miss', green: 'Miss', yellow: 'Escape', red: 'Reverse' },
  Ch: { white: 'None', green: 'Hit', yellow: 'Slam', red: 'Stun' },
  Do: { white: 'Autohit', green: '-2 CS', yellow: '-4 CS', red: '-6 CS' },
  Ev: { white: 'Autohit', green: 'Evasion', yellow: '+1 CS', red: '+2 CS' },
  Bl: { white: '-6 CS', green: '-4 CS', yellow: '-2 CS', red: '+1 CS' },
  Ca: { white: 'Miss', green: 'Catch', yellow: 'Catch', red: 'No' },
  St: { white: '1\u201310', green: '1', yellow: 'Damage', red: 'No' },
  Sl: { white: 'Gr. Slam', green: '1 area', yellow: 'Stagger', red: 'No' },
  Ki: { white: 'End. Loss', green: 'E/S', yellow: 'No', red: 'No' },
};

// v1.3.0 rollUniversalTable thresholds: [lastWhite, lastGreen, lastYellow]
const OLD_THRESHOLDS = {
  'Shift-0': [65, 94, 99], 'Feeble': [60, 90, 99], 'Poor': [55, 85, 99],
  'Typical': [50, 80, 97], 'Good': [45, 75, 97], 'Excellent': [40, 70, 94],
  'Remarkable': [35, 65, 94], 'Incredible': [30, 60, 90], 'Amazing': [25, 55, 90],
  'Monstrous': [20, 50, 85], 'Unearthly': [15, 45, 85], 'Shift X': [10, 40, 80],
  'Shift Y': [6, 40, 80], 'Shift Z': [3, 35, 75], 'Class 1000': [1, 35, 75],
  'Class 3000': [1, 30, 70], 'Class 5000': [1, 25, 65], 'Beyond': [1, 20, 60],
};
function oldColor(rank, roll) {
  const [w, g, y] = OLD_THRESHOLDS[rank];
  if (roll <= w) return 'white';
  if (roll <= g) return 'green';
  if (roll <= y) return 'yellow';
  return 'red';
}

let diffs = 0;
console.log('=== Result label differences (old -> new) ===');
for (const code of Object.keys(OLD_LABELS)) {
  for (const color of ['white', 'green', 'yellow', 'red']) {
    const o = OLD_LABELS[code][color];
    const n = NEW.ACTION_RESULT_LABELS[code][color];
    if (o !== n) { console.log(`  ${code}.${color}: "${o}" -> "${n}"`); diffs++; }
  }
}

console.log('\n=== Band differences (rank: rolls whose color changed) ===');
for (const rank of Object.keys(OLD_THRESHOLDS)) {
  const changed = [];
  for (let roll = 1; roll <= 100; roll++) {
    const o = oldColor(rank, roll);
    const n = NEW.rollUniversalTable(rank, roll);
    if (o !== n) changed.push(`${roll}:${o}->${n}`);
  }
  if (changed.length) {
    const first = changed[0], last = changed[changed.length - 1];
    console.log(`  ${rank}: ${changed.length} rolls differ (${first} .. ${last})`);
    diffs++;
  }
}

console.log(`\n${diffs} difference groups. Verify each against the v2.0.0 header fix list.`);

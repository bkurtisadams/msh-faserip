// faserip-effects test suite — run: node faserip-effects.test.js
// [CERT] = certified against the Universal Table image (2026-08-31) and
// Players Book prose.

import {
  EFFECT_COLUMNS, SLAM_TABLE, STUN_TABLE, KILL_TABLE,
  effectForColor, reduceEffectColor, resolveAttack,
  resolveSlam, resolveStun, resolveKill,
  CATCH_MIN_AGILITY, canAttemptCatch, resolveCatch, CATCH_SELF_DIRECTED_SHIFT,
  EFFECTS_VERSION, EFFECTS_CERTIFIED,
} from './faserip-effects.js';

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { fail++; console.log(`FAIL  ${label}\n      ${e.message}`); }
}
function eq(a, b) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`expected ${jb}, got ${ja}`);
}

console.log(`faserip-effects v${EFFECTS_VERSION}  (EFFECTS_CERTIFIED=${EFFECTS_CERTIFIED})\n`);

// --- Attack column result rows (table image, top strip) ----------------

t('[CERT] Blunt Attacks: Miss/Hit/Slam/Stun on Fighting', () => {
  eq(EFFECT_COLUMNS.BA.ability, 'fighting');
  eq(EFFECT_COLUMNS.BA.results, { white: 'miss', green: 'hit', yellow: 'slam', red: 'stun' });
});

t('[CERT] Edged Attacks: Miss/Hit/Stun/Kill on Fighting', () => {
  eq(EFFECT_COLUMNS.EA.results, { white: 'miss', green: 'hit', yellow: 'stun', red: 'kill' });
});

t('[CERT] Shooting: Miss/Hit/Bullseye/Kill on Agility', () => {
  eq(EFFECT_COLUMNS.Sh.ability, 'agility');
  eq(EFFECT_COLUMNS.Sh.results, { white: 'miss', green: 'hit', yellow: 'bullseye', red: 'kill' });
});

t('[CERT] Throwing Edged: Miss/Hit/Stun/Kill; Throwing Blunt: Miss/Hit/Bullseye/Stun (RULED: prose over table)', () => {
  eq(EFFECT_COLUMNS.TE.results, { white: 'miss', green: 'hit', yellow: 'stun', red: 'kill' });
  eq(EFFECT_COLUMNS.TB.results, { white: 'miss', green: 'hit', yellow: 'bullseye', red: 'stun' });
});

t('[CERT] Energy: Miss/Hit/Bullseye/Kill; Force: Miss/Hit/Bullseye/Stun', () => {
  eq(EFFECT_COLUMNS.En.results, { white: 'miss', green: 'hit', yellow: 'bullseye', red: 'kill' });
  eq(EFFECT_COLUMNS.Fo.results, { white: 'miss', green: 'hit', yellow: 'bullseye', red: 'stun' });
});

t('[CERT] Grappling: Miss/Miss/Partial/Hold; Grabbing: Miss/Take/Grab/Break; Escaping: Miss/Miss/Escape/Reverse (Strength)', () => {
  eq(EFFECT_COLUMNS.Gp.results, { white: 'miss', green: 'miss', yellow: 'partial', red: 'hold' });
  eq(EFFECT_COLUMNS.Gb.results, { white: 'miss', green: 'take', yellow: 'grab', red: 'break' });
  eq(EFFECT_COLUMNS.Es.results, { white: 'miss', green: 'miss', yellow: 'escape', red: 'reverse' });
  eq(EFFECT_COLUMNS.Gp.ability, 'strength');
});

t('[CERT] Charging: Miss/Hit/Slam/Stun on Endurance', () => {
  eq(EFFECT_COLUMNS.Ch.ability, 'endurance');
  eq(EFFECT_COLUMNS.Ch.results, { white: 'miss', green: 'hit', yellow: 'slam', red: 'stun' });
});

t('[CERT] defensive columns: Dodge None/-2/-4/-6, Evade Autohit/Ev/+1/+2, Block -6/-4/-2/+1, Catch Autohit/Miss/Damage/Catch', () => {
  eq(EFFECT_COLUMNS.Do.results, { white: 'none', green: 'cs-2', yellow: 'cs-4', red: 'cs-6' });
  eq(EFFECT_COLUMNS.Ev.results, { white: 'autohit', green: 'evasion', yellow: 'evasion+1cs', red: 'evasion+2cs' });
  eq(EFFECT_COLUMNS.Bl.results, { white: 'cs-6', green: 'cs-4', yellow: 'cs-2', red: 'cs+1' });
  eq(EFFECT_COLUMNS.Ca.results, { white: 'autohit', green: 'miss', yellow: 'damage', red: 'catch' });
});

// --- Slam/Stun/Kill sub-tables ----------------------------------------

t('[CERT] Slam sub-table: white Grand Slam, green 1 area, yellow Stagger, red No', () => {
  eq(SLAM_TABLE, { white: 'grand-slam', green: '1-area', yellow: 'stagger', red: 'no-slam' });
});

t('[CERT] Stun sub-table: white 1-10 rounds, green 1 round, yellow/red No', () => {
  eq(STUN_TABLE, { white: 'stun-1-10', green: 'stun-1', yellow: 'no-effect', red: 'no-effect' });
});

t('[CERT] Kill sub-table: white Endurance Loss, green E/S, yellow/red No', () => {
  eq(KILL_TABLE, { white: 'endurance-loss', green: 'E/S', yellow: 'no-effect', red: 'no-effect' });
});

t('[CERT] E/S resolves to endurance loss only for Edged slugfest or Shooting', () => {
  // Excellent Endurance, roll 45 -> green -> E/S
  eq(resolveKill({ enduranceRank: 'EX', roll: 45, attackColumn: 'EA' }).result, 'endurance-loss');
  eq(resolveKill({ enduranceRank: 'EX', roll: 45, attackColumn: 'Sh' }).result, 'endurance-loss');
  eq(resolveKill({ enduranceRank: 'EX', roll: 45, attackColumn: 'En' }).result, 'no-effect');
});

t('[CERT] She-Hulk fall example shape: Slam vs Endurance, red result = no slam', () => {
  // Monstrous Endurance, roll 90 -> red on MN (redStart 86)
  eq(resolveSlam({ enduranceRank: 'MN', roll: 90 }).result, 'no-slam');
});

t('[CERT] blindsided target may not add karma to Slam/Stun/Kill rolls', () => {
  const r = resolveStun({ enduranceRank: 'TY', roll: 40, karma: 50, karmaAllowed: false });
  eq(r.modifiedRoll, 40);
  eq(r.result, 'stun-1-10');
});

// --- Pulling punches and karma effect reduction ------------------------

t('[CERT] blunt attacks may reduce effect freely (red Stun -> yellow Slam)', () => {
  const r = reduceEffectColor('BA', 'red', 1);
  eq(r, { color: 'yellow', allowed: true, karmaCost: 0 });
});

t('[CERT] shooting effect reducible only via 50 Karma per color step', () => {
  eq(reduceEffectColor('Sh', 'red', 1).allowed, false);
  eq(reduceEffectColor('Sh', 'red', 1, 50), { color: 'yellow', allowed: true, karmaCost: 50 });
});

t('[CERT] pulling-punch flags: damage-reducible BA/TB/TE/En/Fo/Gp/Ch; effect-reducible BA/TB/Fo/Gp/Ch (En excluded per Energy Attack section; errata note)', () => {
  const dmg = Object.keys(EFFECT_COLUMNS).filter(k => EFFECT_COLUMNS[k].reduceDamage).sort();
  eq(dmg, ['BA', 'Ch', 'En', 'Fo', 'Gp', 'TB', 'TE'].sort());
  const eff = Object.keys(EFFECT_COLUMNS).filter(k => EFFECT_COLUMNS[k].reduceEffect).sort();
  eq(eff, ['BA', 'Ch', 'Fo', 'Gp', 'TB'].sort());
});

// --- Composed attack resolution ----------------------------------------

t('[CERT] resolveAttack composes FEAT + effect (Good Fighting blunt, roll 80 -> yellow -> Slam)', () => {
  const r = resolveAttack({ column: 'BA', rank: 'GD', requiredColorOverride: 'green', roll: 80 });
  eq(r.color, 'yellow');
  eq(r.effect, 'slam');
  eq(r.ability, 'fighting');
});

t('[CERT] resolveAttack carries itemized shifts (point blank +3CS: Typical -> Remarkable)', () => {
  const r = resolveAttack({
    column: 'Sh', rank: 'TY',
    shifts: [{ cs: 3, reason: 'point blank, non-fighting target' }],
    requiredColorOverride: 'green', roll: 70,
  });
  eq(r.effectiveRank, 'RM');
  eq(r.color, 'green');
  eq(r.effect, 'hit');
});

// --- Catching maneuver ---------------------------------------------------

t('[CERT] catch minimums: bullets Unearthly, arrows Amazing, thrown Remarkable, falling anyone', () => {
  eq(canAttemptCatch(88, 'small-fast'), true);
  eq(canAttemptCatch(87, 'small-fast'), false);
  eq(canAttemptCatch(46, 'large-thin'), true);
  eq(canAttemptCatch(45, 'large-thin'), false);
  eq(canAttemptCatch(26, 'thrown'), true);
  eq(canAttemptCatch(25, 'thrown'), false);
  eq(canAttemptCatch(1, 'falling'), true);
});

t('[CERT] under-minimum attempts are refused with the requirement named', () => {
  const r = resolveCatch({ agilityNumber: 30, catchType: 'small-fast', roll: 100 });
  eq(r.allowed, false);
  eq(r.reason, 'requires UN Agility');
});

t('[CERT] objects directed at the catcher take -3CS, itemized in the breakdown', () => {
  const r = resolveCatch({ agilityNumber: 50, catchType: 'thrown', roll: 95, directedAtSelf: true });
  eq(r.totalCS, -3);
  eq(r.effectiveRank, 'EX');
});

t('[CERT] autohit consequences: falling object charges at fall speed; weapons hit with white as green', () => {
  // Amazing(50) Agility, roll 10 -> white -> autohit
  const falling = resolveCatch({ agilityNumber: 50, catchType: 'falling', roll: 10 });
  eq(falling.effect, 'autohit');
  eq(falling.consequence, 'charging-attack-at-fall-speed');
  const thrown = resolveCatch({ agilityNumber: 50, catchType: 'thrown', roll: 10 });
  eq(thrown.consequence, 'auto-hit-white-as-green');
});

t('[CERT] a Miss on a directed attack lets it proceed at +1CS; a red is a clean Catch', () => {
  // Amazing Agility, roll 30 -> green -> miss
  const miss = resolveCatch({ agilityNumber: 50, catchType: 'thrown', roll: 30, directedAtSelf: false });
  eq(miss.effect, 'miss');
  eq(miss.consequence, null);
  const missDirected = resolveCatch({ agilityNumber: 50, catchType: 'falling', roll: 55, directedAtSelf: true });
  // -3CS: AM -> RM; 55 -> green -> miss
  eq(missDirected.effect, 'miss');
  eq(missDirected.consequence, 'attack-proceeds-plus-1cs');
  const clean = resolveCatch({ agilityNumber: 50, catchType: 'falling', roll: 95 });
  eq(clean.effect, 'catch');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

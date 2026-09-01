// faserip-rules movement v0.7.2
// Ground, ranged, vertical, flight, water movement, exhaustion, leaping,
// falling, and teleportation hazards.
// Certified against Players Book ch.2 (Movement) prose, the Long Distance
// Movement and Leaping tables, and the chapter's worked examples.

import { rankForNumber, rankByKey, resolveFeat, RANKS } from './faserip-kernel.js';

export const MOVEMENT_VERSION = '0.7.2';
export const MOVEMENT_CERTIFIED = true;

export const AREA_YARDS = 44;
export const FLOOR_FEET = 15;
export const MPH_PER_AREA = 15;

// --- Endurance-based movement ------------------------------------------

// Feeble: 1 area/turn; Poor-Excellent: 2; Remarkable+: 3. Shift 0: none.
export function enduranceAreasPerRound(enduranceNumber) {
  const r = rankForNumber(enduranceNumber);
  if (r.key === 'SH0') return 0;
  if (r.key === 'FE') return 1;
  if (['PR', 'TY', 'GD', 'EX'].includes(r.key)) return 2;
  return 3;
}

// --- Long Distance Movement table (speed Powers, vehicles) -------------
// areas/round by rank. Air mph is areas x 15 throughout except the printed
// Shift Z air value (see ERRATA NOTE); kernel stores printed values.
export const LONG_DISTANCE = {
  FE:  { land: 1,   landMph: 15,   air: 2,   airMph: 30 },
  PR:  { land: 2,   landMph: 30,   air: 4,   airMph: 60 },
  TY:  { land: 3,   landMph: 45,   air: 6,   airMph: 90 },
  GD:  { land: 4,   landMph: 60,   air: 8,   airMph: 120 },
  EX:  { land: 5,   landMph: 75,   air: 10,  airMph: 150 },
  RM:  { land: 6,   landMph: 90,   air: 15,  airMph: 225 },
  IN:  { land: 7,   landMph: 105,  air: 20,  airMph: 300 },
  AM:  { land: 8,   landMph: 120,  air: 25,  airMph: 375 },
  MN:  { land: 9,   landMph: 135,  air: 30,  airMph: 450 },
  UN:  { land: 10,  landMph: 150,  air: 40,  airMph: 600 },
  SHX: { land: 12,  landMph: 180,  air: 50,  airMph: 750 },
  SHY: { land: 14,  landMph: 210,  air: 100, airMph: 1500 },
  SHZ: { land: 16,  landMph: 240,  air: 200, airMph: 3750 },
  CL1000: { land: 32,  landMph: 480,  air: 'interplanetary' },
  CL3000: { land: 50,  landMph: 750,  air: 'near-light' },
  CL5000: { land: 100, landMph: 1500, air: 'teleportation' },
};

// Smallest rank whose column speed covers the given areas/round.
export function speedRankFor(areasPerRound, column = 'land') {
  for (const r of RANKS) {
    const row = LONG_DISTANCE[r.key];
    if (!row) continue;
    const v = row[column];
    if (typeof v === 'number' && v >= areasPerRound) return r.key;
  }
  return null;
}

// --- Ranged movement ----------------------------------------------------

// Leg distances round up to the half-area; a closed-but-unlocked doorway
// (or window) costs an extra half area.
export const DOORWAY_COST = 0.5;

export function rangedLegCost(distanceAreas, { doorways = 0 } = {}) {
  return Math.ceil(distanceAreas * 2) / 2 + doorways * DOORWAY_COST;
}

// Areas lost breaking through an obstruction mid-move: up to Poor 1,
// up to Excellent 2, up to Incredible 3, stronger stops the character.
export function breakthroughAreaLoss(materialRank) {
  const d = (key) => RANKS.findIndex(r => r.key === key);
  const m = d(materialRank);
  if (m < 0) throw new Error(`Unknown material rank: ${materialRank}`);
  if (m <= d('PR')) return 1;
  if (m <= d('EX')) return 2;
  if (m <= d('IN')) return 3;
  return 'stop';
}

// Turns over 90 degrees halve ground speed; performing other actions
// while moving halves movement (charging excepted).
export const HALF_SPEED = { turnOver90: true, otherActions: true };

// --- Vertical movement --------------------------------------------------

export const CLIMB_FLOORS_PER_ROUND = 1;
export const ELEVATOR_FLOORS_PER_ROUND = { old: 5, normal: 10, fast: 20 };

// Falling: 3 floors the first round, 6 the second, 10 the third,
// 20 every round after.
export function fallSpeedAtRound(round) {
  return round >= 4 ? 20 : [3, 6, 10][round - 1];
}

export function fallFloorsAfter(rounds) {
  let total = 0;
  for (let r = 1; r <= rounds; r++) total += fallSpeedAtRound(r);
  return total;
}

// Round in which a fall of the given height lands; impact speed is the
// fall rate of that round (10 stories -> round 3 at speed 10; She-Hulk's
// 33 floors -> round 4, ramming at 20).
export function fallLandingRound(totalFloors) {
  let r = 1;
  while (fallFloorsAfter(r) < totalFloors) r++;
  return r;
}

// Parachutes: one round to deploy, slow the fall to 3 floors/round, hold
// two normal people (overloading negates), Feeble material — a shredded
// chute is useless. Ordinary chutes drift with the wind; gliding chutes
// exist (treat as Gliding).
export const PARACHUTE = { deployRounds: 1, floorsPerRound: 3, capacityPeople: 2, materialRank: 'FE' };

// Catching a lightpost/flagpole while falling: Agility FEAT of intensity
// equal to the fall speed. The book anchors one value — 20 floors/round is
// an Excellent Intensity FEAT [CERT]; the slower rates are interpolated at
// one rank per round of falling (see ERRATA).
export const FALL_CATCH_INTENSITY = { 3: 'PR', 6: 'TY', 10: 'GD', 20: 'EX' };

export function fallCatchIntensityRank(floorsPerRound, overrides = null) {
  const table = overrides ?? FALL_CATCH_INTENSITY;
  const rank = table[floorsPerRound];
  if (!rank) throw new Error(`No fall-catch intensity for ${floorsPerRound} floors/round`);
  return rank;
}

export function resolveFallCatch({ agilityNumber, floorsPerRound, roll, karma = 0, karmaAllowed = true, intensityOverrides = null }) {
  const intensity = fallCatchIntensityRank(floorsPerRound, intensityOverrides);
  return {
    intensity,
    ...resolveFeat({ rankNumber: agilityNumber, intensity, roll, karma, karmaAllowed }),
  };
}

// --- Flight -------------------------------------------------------------

// Acceleration: first round up to the Endurance-limited increment
// (1/2/3 areas), rising by that increment each round to maximum (Storm:
// Amazing Endurance, Incredible 20 speed -> 3,6,9,12,15,18,20).
export function flightAccelerationSchedule({ maxSpeed, enduranceNumber }) {
  const inc = enduranceAreasPerRound(enduranceNumber);
  if (inc === 0) return [];
  const out = [];
  for (let s = inc; s < maxSpeed; s += inc) out.push(s);
  out.push(maxSpeed);
  return out;
}

// Deceleration: may halve current speed each round, fractions up (15 -> 8).
export function decelerate(currentSpeed) {
  return Math.ceil(currentSpeed / 2);
}

// Landing at more than 3 areas/round requires an Agility FEAT (fail: Slam).
export const LANDING_FEAT_ABOVE = 3;

// Diving: +1 area of speed per 3 floors dropped (Angel diving 6 -> +2);
// bonus areas spent continuing the dive compound (9 diving -> 13 total).
export function diveBonus(floorsDropped) {
  return Math.floor(floorsDropped / 3);
}

export function diveTotal(initialDiveAreas, { continueDiving = false } = {}) {
  let total = initialDiveAreas;
  let gain = diveBonus(initialDiveAreas);
  while (gain > 0) {
    total += gain;
    if (!continueDiving) break;
    gain = diveBonus(gain);
  }
  return total;
}

// Low altitude (under 2 stories or close quarters): maximum safe speed is
// the ground speed for the Power rank (Storm In -> 7); up to full air
// speed possible but every action needs an Agility FEAT.
export function lowAltitudeMax(powerRankKey) {
  const row = LONG_DISTANCE[powerRankKey];
  if (!row || typeof row.land !== 'number') throw new Error(`No ground speed for rank: ${powerRankKey}`);
  return row.land;
}

// Gliding: drop 1 floor per round, move stated areas (Typical 6 if unstated).
export const GLIDE = { sinkFloorsPerRound: 1, defaultAreasPerRound: 6 };

// --- Water --------------------------------------------------------------

// Unpowered swimming: 1 area/round maximum. Power-rank swimming uses the
// water column, 9 areas (Monstrous) maximum.
export const SWIM_MAX_UNPOWERED = 1;
export const SWIM_MAX_POWERED = 9;

// Breath: Endurance rank number in rounds; then green, yellow, and red
// Endurance FEATs on successive rounds before drowning begins.
export function breathHoldRounds(enduranceNumber) {
  return enduranceNumber;
}

export function drowningFeatColor(roundsPastHold) {
  if (roundsPastHold <= 0) return null;
  if (roundsPastHold === 1) return 'green';
  if (roundsPastHold === 2) return 'yellow';
  return 'red';
}

// --- Exhaustion (the long-distance runner) ------------------------------

// Moving flat out: after rank-number turns, green FEAT or rest 1-10; after
// 2x, yellow or rest 2-20; after 3x, red or rest 3-30; after 4x, automatic
// rest 3-30. Two ranks slower: one check per hour at most. Exempt: vehicle
// riders, device-fliers, robots, Unearthly+ Endurance.
export function exhaustionCheck(turnsMoved, enduranceNumber) {
  const n = enduranceNumber;
  if (turnsMoved >= 4 * n) return { check: 'rest', restDice: '3-30' };
  if (turnsMoved >= 3 * n) return { check: 'red', restDice: '3-30' };
  if (turnsMoved >= 2 * n) return { check: 'yellow', restDice: '2-20' };
  if (turnsMoved >= n) return { check: 'green', restDice: '1-10' };
  return { check: null, restDice: null };
}

export function exhaustionExempt({ enduranceNumber = 0, vehicle = false, deviceFlight = false, robot = false } = {}) {
  return vehicle || deviceFlight || robot || rankForNumber(enduranceNumber).min >= rankByKey('UN').min;
}

// Speed FEAT: +1 area (15 mph) on a yellow Strength FEAT; green gains
// nothing; white trips (treat as a Slam result continuing forward).
export const SPEED_FEAT = { needed: 'yellow', bonusAreas: 1, whiteResult: 'trip-slam' };

// --- Leaping (Strength-keyed; Leaping Power uses its rank instead) ------
// Feet: up / across / down. Half the listed distance is automatic, the
// listed distance a green Strength FEAT, one additional area a red FEAT.
// Down is a controlled, damage-free fall landing on the feet.
export const LEAP_TABLE = {
  FE:  { up: 2,    across: 2,    down: 3 },
  PR:  { up: 4,    across: 4,    down: 8 },
  TY:  { up: 6,    across: 6,    down: 9 },
  GD:  { up: 10,   across: 10,   down: 15 },
  EX:  { up: 20,   across: 20,   down: 30 },
  RM:  { up: 30,   across: 30,   down: 45 },
  IN:  { up: 40,   across: 40,   down: 60 },
  AM:  { up: 50,   across: 50,   down: 75 },
  MN:  { up: 75,   across: 75,   down: 105 },
  UN:  { up: 100,  across: 100,  down: 150 },
  SHX: { up: 150,  across: 150,  down: 225 },
  SHY: { up: 200,  across: 200,  down: 300 },
  SHZ: { up: 500,  across: 500,  down: 750 },
  CL1000: { up: 1000, across: 1000, down: 1500 },
  CL3000: { up: 3000, across: 3000, down: 4500 },
  CL5000: { up: 5000, across: 5000, down: 7500 },
};

// --- Teleportation hazards ----------------------------------------------

// Teleporting into an object: damage equal to the object's material
// strength, Body Armor no protection (RULED 2026-08-31: Movement chapter
// authoritative over the Appendix A power description's "twice").
// Endurance FEAT: success = bounce clear, unconscious 1-10; failure =
// unconsciousness and Endurance loss toward death at Shift 0.
export function teleportIntoObjectDamage(materialStandardNumber, { multiplier = 1 } = {}) {
  return materialStandardNumber * multiplier;
}

// Unpracticed passengers: red Endurance FEAT or unconscious 1-10 rounds;
// yellow the second trip, green the third and after.
export function teleportPassengerFeatColor(priorTrips) {
  if (priorTrips <= 0) return 'red';
  if (priorTrips === 1) return 'yellow';
  return 'green';
}

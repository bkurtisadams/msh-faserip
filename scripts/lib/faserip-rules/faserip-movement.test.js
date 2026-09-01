// faserip-movement test suite — run: node faserip-movement.test.js
// [CERT] tests certify against Players Book ch.2 movement prose, tables,
// and worked examples.

import {
  AREA_YARDS, FLOOR_FEET, MPH_PER_AREA,
  enduranceAreasPerRound, LONG_DISTANCE, speedRankFor,
  rangedLegCost, breakthroughAreaLoss,
  fallSpeedAtRound, fallFloorsAfter, fallLandingRound, PARACHUTE,
  fallCatchIntensityRank, resolveFallCatch,
  flightAccelerationSchedule, decelerate, LANDING_FEAT_ABOVE,
  diveBonus, diveTotal, lowAltitudeMax, GLIDE,
  SWIM_MAX_UNPOWERED, SWIM_MAX_POWERED, breathHoldRounds, drowningFeatColor,
  exhaustionCheck, exhaustionExempt, SPEED_FEAT,
  LEAP_TABLE, teleportIntoObjectDamage, teleportPassengerFeatColor,
  ELEVATOR_FLOORS_PER_ROUND, CLIMB_FLOORS_PER_ROUND,
  MOVEMENT_VERSION, MOVEMENT_CERTIFIED,
} from './faserip-movement.js';

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { fail++; console.log(`FAIL  ${label}\n      ${e.message}`); }
}
function eq(a, b) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`expected ${jb}, got ${ja}`);
}

console.log(`faserip-movement v${MOVEMENT_VERSION}  (MOVEMENT_CERTIFIED=${MOVEMENT_CERTIFIED})\n`);

// --- Ground movement ----------------------------------------------------

t('[CERT] scale constants: area 44 yards, floor 15 feet, 15 mph per area', () => {
  eq(AREA_YARDS, 44); eq(FLOOR_FEET, 15); eq(MPH_PER_AREA, 15);
});

t('[CERT] Endurance movement: Feeble 1, Poor-Excellent 2, Remarkable+ 3 areas', () => {
  eq(enduranceAreasPerRound(2), 1);
  eq(enduranceAreasPerRound(5), 2);
  eq(enduranceAreasPerRound(25), 2);
  eq(enduranceAreasPerRound(26), 3);
  eq(enduranceAreasPerRound(100), 3);
});

t('[CERT] Captain America runs long distances at 45 mph (3 areas from Remarkable Endurance)', () => {
  eq(enduranceAreasPerRound(30) * MPH_PER_AREA, 45);
});

t('[CERT] Long Distance table spot checks: Rm land 6/90, In air 20/300, SHY air 100/1500', () => {
  eq(LONG_DISTANCE.RM.land, 6); eq(LONG_DISTANCE.RM.landMph, 90);
  eq(LONG_DISTANCE.IN.air, 20); eq(LONG_DISTANCE.IN.airMph, 300);
  eq(LONG_DISTANCE.SHY.air, 100); eq(LONG_DISTANCE.SHY.airMph, 1500);
});

t('[CERT] cosmic land speeds: CL1000 32, CL3000 50, CL5000 100; air becomes special', () => {
  eq(LONG_DISTANCE.CL1000.land, 32);
  eq(LONG_DISTANCE.CL5000.landMph, 1500);
  eq(LONG_DISTANCE.CL1000.air, 'interplanetary');
});

t('[CERT] reverse lookup: 7 areas land -> Incredible; 20 areas air -> Incredible', () => {
  eq(speedRankFor(7, 'land'), 'IN');
  eq(speedRankFor(20, 'air'), 'IN');
});

// --- Ranged movement ----------------------------------------------------

t('[CERT] leg costs round up to the half-area; a doorway adds a half (1.5-area leg + door = 2)', () => {
  eq(rangedLegCost(1.2), 1.5);
  eq(rangedLegCost(1.5, { doorways: 1 }), 2);
});

t('[CERT] breakthrough losses: Poor 1, Excellent 2, Incredible 3, stronger stops', () => {
  eq(breakthroughAreaLoss('PR'), 1);
  eq(breakthroughAreaLoss('EX'), 2);
  eq(breakthroughAreaLoss('IN'), 3);
  eq(breakthroughAreaLoss('AM'), 'stop');
});

// --- Vertical and falling ----------------------------------------------

t('[CERT] falling rates: 3, 6, 10, then 20 per round', () => {
  eq([1, 2, 3, 4, 5].map(fallSpeedAtRound), [3, 6, 10, 20, 20]);
});

t('[CERT] She-Hulk from the 33rd story: 3 rounds fall 19 floors, lands in the 4th at speed 20', () => {
  eq(fallFloorsAfter(3), 19);
  eq(fallSpeedAtRound(4), 20);
});

t('[CERT] landing rounds: 10 stories lands round 3 at speed 10; 33 floors lands round 4 at speed 20', () => {
  eq(fallLandingRound(10), 3);
  eq(fallSpeedAtRound(fallLandingRound(10)), 10);
  eq(fallLandingRound(33), 4);
  eq(fallSpeedAtRound(fallLandingRound(33)), 20);
});

t('[CERT] parachute: 1 round deploy, 3 floors/round, two people, Feeble material; elevators 5/10/20; climbing 1 floor', () => {
  eq(PARACHUTE, { deployRounds: 1, floorsPerRound: 3, capacityPeople: 2, materialRank: 'FE' });
  eq(ELEVATOR_FLOORS_PER_ROUND, { old: 5, normal: 10, fast: 20 });
  eq(CLIMB_FLOORS_PER_ROUND, 1);
});

t('[CERT] fall-catch anchor: 20 floors/round is an Excellent Intensity FEAT', () => {
  eq(fallCatchIntensityRank(20), 'EX');
});

t('[INTERP] slower fall rates one rank per round: 3 Pr, 6 Ty, 10 Gd (overridable)', () => {
  eq(fallCatchIntensityRank(3), 'PR');
  eq(fallCatchIntensityRank(6), 'TY');
  eq(fallCatchIntensityRank(10), 'GD');
  eq(fallCatchIntensityRank(10, { 10: 'RM' }), 'RM');
});

t('[CERT] resolveFallCatch: Good Agility at terminal velocity needs red; Excellent needs yellow', () => {
  const gd = resolveFallCatch({ agilityNumber: 10, floorsPerRound: 20, roll: 98 });
  eq(gd.needed, 'red');
  eq(gd.success, true);
  const ex = resolveFallCatch({ agilityNumber: 20, floorsPerRound: 20, roll: 75 });
  eq(ex.needed, 'yellow');
  eq(ex.success, true);
});

// --- Flight -------------------------------------------------------------

t('[CERT] Storm example: Amazing Endurance, Incredible(20) speed -> 3,6,9,12,15,18,20', () => {
  eq(flightAccelerationSchedule({ maxSpeed: 20, enduranceNumber: 50 }), [3, 6, 9, 12, 15, 18, 20]);
});

t('[CERT] deceleration halves speed rounding up (15 -> 8); landing FEAT above 3 areas', () => {
  eq(decelerate(15), 8);
  eq(LANDING_FEAT_ABOVE, 3);
});

t('[CERT] Angel dive example: 6 areas of dive -> +2; 9 diving with bonuses continued -> 13 total', () => {
  eq(diveBonus(6), 2);
  eq(diveTotal(6), 8);
  eq(diveTotal(9, { continueDiving: true }), 13);
});

t('[CERT] Storm low-altitude cap: Incredible flight limited to 7 areas near the ground', () => {
  eq(lowAltitudeMax('IN'), 7);
});

t('[CERT] gliding: sink 1 floor/round, Typical 6 areas when unstated', () => {
  eq(GLIDE, { sinkFloorsPerRound: 1, defaultAreasPerRound: 6 });
});

// --- Water and breath ---------------------------------------------------

t('[CERT] swimming: 1 area unpowered, powered capped at 9 (Monstrous water)', () => {
  eq(SWIM_MAX_UNPOWERED, 1);
  eq(SWIM_MAX_POWERED, 9);
});

t('[CERT] breath: Endurance rank number of rounds, then green/yellow/red FEATs', () => {
  eq(breathHoldRounds(20), 20);
  eq(drowningFeatColor(0), null);
  eq(drowningFeatColor(1), 'green');
  eq(drowningFeatColor(2), 'yellow');
  eq(drowningFeatColor(3), 'red');
  eq(drowningFeatColor(7), 'red');
});

// --- Exhaustion ---------------------------------------------------------

t('[CERT] Captain America: Remarkable(30) Endurance checks at 30/60/90 turns, rest at 120', () => {
  eq(exhaustionCheck(29, 30).check, null);
  eq(exhaustionCheck(30, 30).check, 'green');
  eq(exhaustionCheck(60, 30), { check: 'yellow', restDice: '2-20' });
  eq(exhaustionCheck(90, 30), { check: 'red', restDice: '3-30' });
  eq(exhaustionCheck(120, 30), { check: 'rest', restDice: '3-30' });
});

t('[CERT] exemptions: vehicles, device flight, robots, Unearthly+ Endurance', () => {
  eq(exhaustionExempt({ vehicle: true }), true);
  eq(exhaustionExempt({ robot: true }), true);
  eq(exhaustionExempt({ enduranceNumber: 100 }), true);
  eq(exhaustionExempt({ enduranceNumber: 75 }), false);
});

t('[CERT] Speed FEAT: yellow Strength for +1 area, white trips into a Slam', () => {
  eq(SPEED_FEAT, { needed: 'yellow', bonusAreas: 1, whiteResult: 'trip-slam' });
});

// --- Leaping -------------------------------------------------------------

t('[CERT] leap table spot checks: Ex 20/20/30, Gd down 15 (one floor), Mn down 105', () => {
  eq(LEAP_TABLE.EX, { up: 20, across: 20, down: 30 });
  eq(LEAP_TABLE.GD.down, 15);
  eq(LEAP_TABLE.MN.down, 105);
});

// --- Teleportation -------------------------------------------------------

t('[CERT] teleport into a wall: material strength (RULED 1x), Body Armor no protection, multiplier overridable', () => {
  eq(teleportIntoObjectDamage(20), 20);
  eq(teleportIntoObjectDamage(20, { multiplier: 2 }), 40);
});

t('[CERT] carried passengers: red first trip, yellow second, green third and after', () => {
  eq(teleportPassengerFeatColor(0), 'red');
  eq(teleportPassengerFeatColor(1), 'yellow');
  eq(teleportPassengerFeatColor(2), 'green');
  eq(teleportPassengerFeatColor(9), 'green');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

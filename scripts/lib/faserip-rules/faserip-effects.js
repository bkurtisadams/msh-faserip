// faserip-rules effects v0.7.1
// v0.7.1: RULED 2026-09-02 — Force effect may not be reduced (Fo.reduceEffect
//         false); reverses the 2026-08-31 pullEffect ruling.
// Battle Effects Table + Slam/Stun/Kill sub-tables.
// Certified against the Advanced Set Universal Table image (GM-supplied,
// 2026-08-31) and Players Book combat prose.

import { resolveFeat, colorForRoll, rankForNumber, rankDistance } from './faserip-kernel.js';

export const EFFECTS_VERSION = '0.7.1';
export const EFFECTS_CERTIFIED = true;

// results: color -> outcome token.
// ability: which FASERIP ability the column resolves on.
// reduceDamage / reduceEffect: "Pulling Punches" (Players Book, Tactics).
// killCapable: red-Kill columns; effect reducible only by spending 50 Karma
// immediately after the roll (Players Book, Modifying Results in Combat).
export const EFFECT_COLUMNS = {
  BA: { name: 'Blunt Attacks',   ability: 'fighting',
        results: { white: 'miss', green: 'hit', yellow: 'slam', red: 'stun' },
        reduceDamage: true,  reduceEffect: true,  killCapable: false },
  EA: { name: 'Edged Attacks',   ability: 'fighting',
        results: { white: 'miss', green: 'hit', yellow: 'stun', red: 'kill' },
        reduceDamage: false, reduceEffect: false, killCapable: true },
  Sh: { name: 'Shooting',        ability: 'agility',
        results: { white: 'miss', green: 'hit', yellow: 'bullseye', red: 'kill' },
        reduceDamage: false, reduceEffect: false, killCapable: true },
  TE: { name: 'Throwing Edged',  ability: 'agility',
        results: { white: 'miss', green: 'hit', yellow: 'stun', red: 'kill' },
        reduceDamage: true,  reduceEffect: false, killCapable: true },
  TB: { name: 'Throwing Blunt',  ability: 'agility',
        // RULED 2026-08-31: yellow = Bullseye per prose; table image is wrong.
        results: { white: 'miss', green: 'hit', yellow: 'bullseye', red: 'stun' },
        reduceDamage: true,  reduceEffect: true,  killCapable: false },
  En: { name: 'Energy',          ability: 'agility',
        results: { white: 'miss', green: 'hit', yellow: 'bullseye', red: 'kill' },
        reduceDamage: true,  reduceEffect: false, killCapable: true },
  Fo: { name: 'Force',           ability: 'agility',
        results: { white: 'miss', green: 'hit', yellow: 'bullseye', red: 'stun' },
        // RULED 2026-09-02: Force Attack section — damage reducible, effect not.
        reduceDamage: true,  reduceEffect: false, killCapable: false },
  Gp: { name: 'Grappling',       ability: 'strength',
        results: { white: 'miss', green: 'miss', yellow: 'partial', red: 'hold' },
        reduceDamage: true,  reduceEffect: true,  killCapable: false },
  Gb: { name: 'Grabbing',        ability: 'strength',
        results: { white: 'miss', green: 'take', yellow: 'grab', red: 'break' },
        reduceDamage: false, reduceEffect: false, killCapable: false },
  Es: { name: 'Escaping',        ability: 'strength',
        results: { white: 'miss', green: 'miss', yellow: 'escape', red: 'reverse' },
        reduceDamage: false, reduceEffect: false, killCapable: false },
  Ch: { name: 'Charging',        ability: 'endurance',
        results: { white: 'miss', green: 'hit', yellow: 'slam', red: 'stun' },
        reduceDamage: true,  reduceEffect: true,  killCapable: false },
  Do: { name: 'Dodging',         ability: 'agility',
        results: { white: 'none', green: 'cs-2', yellow: 'cs-4', red: 'cs-6' },
        reduceDamage: false, reduceEffect: false, killCapable: false },
  Ev: { name: 'Evading',         ability: 'fighting',
        results: { white: 'autohit', green: 'evasion', yellow: 'evasion+1cs', red: 'evasion+2cs' },
        reduceDamage: false, reduceEffect: false, killCapable: false },
  Bl: { name: 'Blocking',        ability: 'strength',
        results: { white: 'cs-6', green: 'cs-4', yellow: 'cs-2', red: 'cs+1' },
        reduceDamage: false, reduceEffect: false, killCapable: false },
  Ca: { name: 'Catching',        ability: 'agility',
        results: { white: 'autohit', green: 'miss', yellow: 'damage', red: 'catch' },
        reduceDamage: false, reduceEffect: false, killCapable: false },
};

// Sub-tables: keyed by the TARGET's Endurance FEAT color.
// Worse roll = worse outcome for the target.
export const SLAM_TABLE = {
  white: 'grand-slam', green: '1-area', yellow: 'stagger', red: 'no-slam',
};
export const STUN_TABLE = {
  white: 'stun-1-10', green: 'stun-1', yellow: 'no-effect', red: 'no-effect',
};
export const KILL_TABLE = {
  white: 'endurance-loss', green: 'E/S', yellow: 'no-effect', red: 'no-effect',
};

// E/S: endurance loss only for Edged-slugfest or Shooting attacks
// (Players Book, Effects Results: Slam, Stun, and Kill).
const ES_ATTACK_COLUMNS = new Set(['EA', 'Sh']);

export function effectForColor(columnKey, color) {
  const col = EFFECT_COLUMNS[columnKey];
  if (!col) throw new Error(`Unknown effect column: ${columnKey}`);
  return col.results[color];
}

// Pulling punches: reduce a rolled effect one or more colors toward green.
// Legal for reduceEffect columns; kill-capable columns require 50 Karma per
// color step (caller supplies karmaPaid; kernel validates, does not bank).
export function reduceEffectColor(columnKey, rolledColor, steps, karmaPaid = 0) {
  const col = EFFECT_COLUMNS[columnKey];
  if (!col) throw new Error(`Unknown effect column: ${columnKey}`);
  const order = ['green', 'yellow', 'red'];
  const i = order.indexOf(rolledColor);
  if (i < 0 || steps < 1) return { color: rolledColor, allowed: true, karmaCost: 0 };
  const target = order[Math.max(i - steps, 0)];
  if (col.reduceEffect) return { color: target, allowed: true, karmaCost: 0 };
  if (col.killCapable) {
    const cost = steps * 50;
    if (karmaPaid >= cost) return { color: target, allowed: true, karmaCost: cost };
    return { color: rolledColor, allowed: false, karmaCost: cost };
  }
  return { color: rolledColor, allowed: false, karmaCost: 0 };
}

export function resolveAttack(opts) {
  const { column, ...featOpts } = opts;
  const col = EFFECT_COLUMNS[column];
  if (!col) throw new Error(`Unknown effect column: ${column}`);
  const feat = resolveFeat(featOpts);
  const effect = feat.color ? effectForColor(column, feat.color) : null;
  return { ...feat, column, columnName: col.name, ability: col.ability, effect };
}

// Target rolls Endurance on the Universal Table; result read from sub-table.
// Precondition (caller enforces): the attack inflicted at least 1 point of
// damage past Body Armor/force field, or exactly balanced it (borderline
// rule: exact balance still allows Slam/Stun/Kill).
export function resolveSlam({ enduranceRank, roll, karma = 0, karmaAllowed = true }) {
  const modified = Math.min(roll + (karmaAllowed ? karma : 0), 100);
  const color = colorForRoll(enduranceRank, modified);
  return { color, modifiedRoll: modified, result: SLAM_TABLE[color] };
}

export function resolveStun({ enduranceRank, roll, karma = 0, karmaAllowed = true }) {
  const modified = Math.min(roll + (karmaAllowed ? karma : 0), 100);
  const color = colorForRoll(enduranceRank, modified);
  return { color, modifiedRoll: modified, result: STUN_TABLE[color] };
}

export function resolveKill({ enduranceRank, roll, attackColumn = null, karma = 0, karmaAllowed = true }) {
  const modified = Math.min(roll + (karmaAllowed ? karma : 0), 100);
  const color = colorForRoll(enduranceRank, modified);
  let result = KILL_TABLE[color];
  if (result === 'E/S') {
    result = attackColumn && ES_ATTACK_COLUMNS.has(attackColumn)
      ? 'endurance-loss'
      : 'no-effect';
  }
  return { color, modifiedRoll: modified, result };
}

// --- Catching maneuver (Players Book, Defensive Actions) ----------------

// One item per attempt; -3CS when the object is directed against the
// catcher specifically. Minimum Agility by projectile type; anyone may try
// to catch a falling character or object.
export const CATCH_SELF_DIRECTED_SHIFT = -3;

export const CATCH_MIN_AGILITY = {
  'small-fast': 'UN',   // bullets
  'large-thin': 'AM',   // arrows
  'thrown': 'RM',       // other thrown projectiles
  'falling': null,      // any Agility
};

export function canAttemptCatch(agilityNumber, catchType) {
  if (!(catchType in CATCH_MIN_AGILITY)) throw new Error(`Unknown catch type: ${catchType}`);
  const min = CATCH_MIN_AGILITY[catchType];
  if (min === null) return true;
  return rankDistance(min, rankForNumber(agilityNumber).key) >= 0;
}

// Consequences: Autohit on a falling object is a charging attack against
// the catcher at the speed of the fall; Autohit on a shooting/thrown
// weapon hits automatically (a white to-hit is treated as green); a Miss
// on an attack directed at the catcher lets it proceed at +1CS to hit.
export function resolveCatch({ agilityNumber, catchType, roll, karma = 0, karmaAllowed = true, directedAtSelf = false, shifts = [] }) {
  if (!canAttemptCatch(agilityNumber, catchType)) {
    return { allowed: false, catchType, reason: `requires ${CATCH_MIN_AGILITY[catchType]} Agility` };
  }
  const allShifts = directedAtSelf
    ? [...shifts, { cs: CATCH_SELF_DIRECTED_SHIFT, reason: 'object directed at catcher' }]
    : shifts;
  const feat = resolveAttack({
    column: 'Ca', rankNumber: agilityNumber, shifts: allShifts,
    requiredColorOverride: 'red', roll, karma, karmaAllowed,
  });
  let consequence = null;
  if (feat.effect === 'autohit') {
    consequence = catchType === 'falling' ? 'charging-attack-at-fall-speed' : 'auto-hit-white-as-green';
  } else if (feat.effect === 'miss' && directedAtSelf) {
    consequence = 'attack-proceeds-plus-1cs';
  }
  return { allowed: true, catchType, ...feat, consequence };
}

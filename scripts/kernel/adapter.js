// File: scripts/kernel/adapter.js v1.0.0 - 2026-08-31
// Bridge between Foundry rank/label conventions and @graycloak/faserip-rules.
// All Foundry rank-string variants normalize here and nowhere else.

import { rankByKey, rankForNumber, RANKS as KERNEL_RANKS } from '../lib/faserip-rules/faserip-kernel.js';

const NAME_TO_KEY = new Map();
function reg(key, ...names) {
  for (const n of names) NAME_TO_KEY.set(n.toLowerCase(), key);
}
reg('SH0', 'Shift-0', 'Shift 0', 'shift0', 's0', 'sh0');
reg('FE', 'Feeble', 'fe');
reg('PR', 'Poor', 'pr');
reg('TY', 'Typical', 'ty');
reg('GD', 'Good', 'gd');
reg('EX', 'Excellent', 'ex');
reg('RM', 'Remarkable', 'rm');
reg('IN', 'Incredible', 'in');
reg('AM', 'Amazing', 'am');
reg('MN', 'Monstrous', 'mn');
reg('UN', 'Unearthly', 'un');
reg('SHX', 'Shift X', 'Shift-X', 'shiftx', 'sx', 'shx');
reg('SHY', 'Shift Y', 'Shift-Y', 'shifty', 'sy', 'shy');
reg('SHZ', 'Shift Z', 'Shift-Z', 'shiftz', 'sz', 'shz');
reg('CL1000', 'Class 1000', 'Class1000', '1000', 'cl1000');
reg('CL3000', 'Class 3000', 'Class3000', '3000', 'cl3000');
reg('CL5000', 'Class 5000', 'Class5000', '5000', 'cl5000');
reg('BEYOND', 'Beyond', 'b');

export function kernelKeyFor(name) {
  if (name == null) return null;
  const s = String(name).trim().replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  return NAME_TO_KEY.get(s) ?? NAME_TO_KEY.get(s.replace(/\s/g, '-')) ?? null;
}

export function kernelRankFor(name) {
  const key = kernelKeyFor(name);
  return key ? rankByKey(key) : null;
}

// style 'dash' -> "Shift-X"; style 'space' -> "Shift X". Non-shift names identical.
export function foundryNameFor(key, style = 'space') {
  const r = rankByKey(key);
  if (key === 'SH0') return 'Shift-0';
  if (['SHX', 'SHY', 'SHZ'].includes(key) && style === 'dash') return r.name.replace(' ', '-');
  return r.name;
}

export function foundryRankForNumber(n, style = 'space') {
  return foundryNameFor(rankForNumber(n).key, style);
}

// Result-token -> display label (attack/defense columns).
export const RESULT_TOKEN_LABELS = {
  miss: 'Miss', hit: 'Hit', slam: 'Slam', stun: 'Stun', kill: 'Kill',
  bullseye: 'Bullseye', partial: 'Partial', hold: 'Hold', take: 'Take',
  grab: 'Grab', break: 'Break', escape: 'Escape', reverse: 'Reverse',
  none: 'None', autohit: 'Autohit', evasion: 'Evasion',
  'evasion+1cs': '+1 CS', 'evasion+2cs': '+2 CS',
  'cs-2': '-2 CS', 'cs-4': '-4 CS', 'cs-6': '-6 CS', 'cs+1': '+1 CS',
  catch: 'Catch', damage: 'Damage',
};

// Sub-table token -> display label (St / Sl / Ki columns).
export const SUB_TABLE_LABELS = {
  'stun-1-10': '1\u201310', 'stun-1': '1',
  'grand-slam': 'Gr. Slam', '1-area': '1 area', stagger: 'Stagger', 'no-slam': 'No',
  'endurance-loss': 'End. Loss', 'E/S': 'E/S', 'no-effect': 'No',
};

export function labelForToken(token) {
  return RESULT_TOKEN_LABELS[token] ?? SUB_TABLE_LABELS[token] ?? token;
}

export { KERNEL_RANKS };

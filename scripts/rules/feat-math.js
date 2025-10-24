export const RANK_ORDER = [
  "Shift0", "Feeble", "Poor", "Typical", "Good", "Excellent",
  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
  "ShiftX", "ShiftY", "ShiftZ", "Class1000", "Class3000", "Class5000"
];

export function rankIndex(rankName) {
  // Handle variants: "Shift0"/"Shift-0"/"Shift 0"
  const normalized = String(rankName).replace(/[-\s]/g, '').toLowerCase();
  const i = RANK_ORDER.findIndex(r => 
    r.replace(/[-\s]/g, '').toLowerCase() === normalized
  );
  return i >= 0 ? i : 0;
}

export function isAutoFeat(abilityRank, intensityRank) {
  const diff = rankIndex(abilityRank) - rankIndex(intensityRank);
  return diff >= 3;  // Clarified rule: 3 or more ranks
}

export function isImpossibleByDefault(abilityRank, intensityRank) {
  const diff = rankIndex(intensityRank) - rankIndex(abilityRank);
  return diff >= 2;  // Intensity 2+ ranks above ability
}

export function requiredColor(abilityRank, intensityRank) {
  const diff = rankIndex(abilityRank) - rankIndex(intensityRank);
  if (diff > 0) return 'green';
  if (diff === 0) return 'yellow';
  return 'red';
}
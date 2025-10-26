// scripts/modules/dice/color-results.js
// Purpose: Normalize color outcomes and expose lightweight helpers.
// Notes:
// - Action handlers decide whether a candidate effect actually applies.
// - Damage CS bumps follow your mechanics cheat (Yellow +1CS, Red +2CS). Adjust per house rules if needed.

/* ===== Types =====
Color = "white" | "green" | "yellow" | "red"
ActionCode examples (from your map): "BA","EA","Sh","TE","TB","En","Fo","Gp","Gb","Es","Ch","Do","Ev","Bl","Ca"
*/

export const COLORS = ["white", "green", "yellow", "red"];

/** Normalizes any truthy value (numbers/strings) to a lowercased color token. */
export function normalizeColor(colorLike) {
  if (typeof colorLike === "number") {
    // 0..3 index mapping if callers pass a numeric slot
    return COLORS[Math.max(0, Math.min(3, colorLike | 0))];
  }
  const c = String(colorLike ?? "").trim().toLowerCase();
  if (COLORS.includes(c)) return c;
  // permissive aliases
  if (c.startsWith("w")) return "white";
  if (c.startsWith("g")) return "green";
  if (c.startsWith("y")) return "yellow";
  if (c.startsWith("r")) return "red";
  return "white";
}

/** Returns damage column-shift bonus for the color. White=0, Green=0, Yellow=+1, Red=+2. */
export function colorToDamageShift(color) {
  const c = normalizeColor(color);
  if (c === "yellow") return +1;
  if (c === "red") return +2;
  return 0; // white/green
}

/**
 * Returns candidate effect flags for a given action code and color.
 * These flags indicate *eligibility*; action handlers still gate by “must inflict some damage” and target saves.
 */
export function colorToEffectCandidates(color, actionCode) {
  const c = normalizeColor(color);

  // Which action families can ever produce which effects (Advanced Set summaries)
  // Slam: Blunt & Charging. Stun: Slugfest/Throwing/Force/Charging. Kill: Edged, Shooting, Throwing Edged.
  // (Handlers will still check their own per-color semantics and prerequisites.)
  // Sources: Advanced Set summaries extracted in your docs. :contentReference[oaicite:6]{index=6} :contentReference[oaicite:7]{index=7}
  const EFFECT_CAPS = {
    BA: { slam: true,  stun: true,  kill: false }, // Blunt Attack
    Ch: { slam: true,  stun: true,  kill: false }, // Charging
    EA: { slam: false, stun: false, kill: true  }, // Edged
    Sh: { slam: false, stun: false, kill: true  }, // Shooting
    TE: { slam: false, stun: false, kill: true  }, // Throwing Edged
    TB: { slam: false, stun: true,  kill: false }, // Throwing Blunt
    En: { slam: false, stun: true,  kill: false }, // Energy (varies by power; treat as Force-like default)
    Fo: { slam: false, stun: true,  kill: false }, // Force
    // Grapple/Grab/Escape/Defenses default to no S/S/K candidates here; their handlers own side-effects.
  };

  const caps = EFFECT_CAPS[actionCode] ?? { slam: false, stun: false, kill: false };

  // Color gating: White never, Green baseline hit, Yellow often “better” (may trigger), Red strongest.
  // We return booleans that *may* be true if the action family supports it; handlers do exact rules.
  const canTrigger = (eff) => {
    if (!caps[eff]) return false;
    if (c === "yellow" || c === "red") return true; // typical trigger colors across families
    // Some tables allow Green-based Slam/Stun with follow-up saves; keep conservative here.
    return false;
  };

  return {
    slamCandidate: canTrigger("slam"),
    stunCandidate: canTrigger("stun"),
    killCandidate: canTrigger("kill"),
  };
}

/** Convenience: single object for chat cards & downstream logic. */
export function buildColorOutcome(color, actionCode) {
  const normalized = normalizeColor(color);
  const damageShiftCS = colorToDamageShift(normalized);
  const { slamCandidate, stunCandidate, killCandidate } = colorToEffectCandidates(normalized, actionCode);
  return { color: normalized, damageShiftCS, slamCandidate, stunCandidate, killCandidate };
}

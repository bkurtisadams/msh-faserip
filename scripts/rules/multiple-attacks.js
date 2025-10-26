// scripts/rules/multiple-attacks.js
import { rollWithKarmaAndHistory } from "../modules/actions/action-utils.js";
import { rollUniversalTable } from "../universalTable.js";
import { debugLog } from "../modules/actions/action-utils.js";

// Anchor: local helper replaces classic rollPower calls
async function rollSingleAttackRefactor({ actor, power, options = {} }) {
  // Rank selection policy:
  // - Prefer explicit override from options (rankOverride or rank)
  // - Then the power's own rank if present
  // - Fallback to "Good" to avoid hard crashes (caller should pass rank in practice)
  const rankUsed =
    options.rankOverride ??
    options.rank ??
    power?.system?.rank?.label ??
    power?.system?.rank ??
    "Good";

  // Column shift: prefer explicit option; otherwise 0
  const csApplied = Number(options.columnShift ?? options.cs ?? 0);

  // Do a karma-aware roll; caller typically provides useDirectRoll and other flags in options
  const r = await rollWithKarmaAndHistory(actor, { useDirectRoll: true, ...options });

  // Map result to UT color
  const color = rollUniversalTable(rankUsed, r.total, csApplied);

  debugLog("multiple-attacks → single roll", {
    actor: actor?.name,
    power: power?.name,
    rankUsed,
    csApplied,
    total: r.total,
    color
  });

  // Normalize the shape: return what your callers expect from the legacy path,
  // minimally including total/color and the inputs used to derive them.
  return {
    total: r.total,
    color,
    rankUsed,
    csApplied,
    roll: r,
    context: {
      multiAttacks: !!options.multiAttacks,
      attackCount: Number(options.attackCount ?? 1),
      attackIndex: Number(options.attackIndex ?? 1)
    }
  };
}


/**
 * Processes a sequence of multiple attacks after a Fighting FEAT check.
 * Handles both Slugfest (Blunt/Edged) and Shooting attacks.
 * 
 * Rules:
 * - 2-3 attacks require Remarkable intensity
 * - 4+ attacks require Amazing intensity
 * - Failed FEAT: 1 attack at -3CS
 * - Successful FEAT: N attacks at -1CS each
 * 
 * @param {Actor} actor - The attacking actor
 * @param {Item} power - The power/weapon being used
 * @param {Object} options - Attack options (actionType, columnShift, damageCS, etc.)
 * @returns {Promise<Array>} Array of attack results
 */
export async function processMultipleAttackSequence(actor, power, options) {
  const { actionType } = options;
  let attackCount = Math.max(1, Number(options.attackCount ?? 1));
  if (attackCount > 3) attackCount = 3; // cap (adjust if you allow more)

  // Only Slugfest (Blunt/Edged) and Shooting qualify per rules
  const at = String(actionType || "").toLowerCase();
  const isSlugfest = at.includes("blunt") || at.includes("edged") || at.includes("(ba)") || at.includes("(ea)");
  const isShooting = at.includes("shoot") || at.includes("(sh)");
  if (!isSlugfest && !isShooting && attackCount > 1) {
    ui.notifications.warn("Multiple attacks apply only to Slugfest and Shooting. Performing a single attack.");
      return [await rollSingleAttackRefactor({ actor, power, options: { ...options, multiAttacks: false, attackCount: 1 } })];

  }

  // If only one attack, just roll normally
  if (attackCount === 1) {
      return [await rollSingleAttackRefactor({ actor, power, options: { ...options, multiAttacks: false, attackCount: 1 } })];

  }

  // ===== CAPTURE TARGETS BEFORE FEAT ROLL =====
  const selectedTargets = Array.from(game.user.targets);
  if (selectedTargets.length === 0) {
    ui.notifications.warn("No targets selected for multiple attacks.");
    return [];
  }
  
  // Build target array: use selected targets, repeat first target if needed
  const targets = [];
  for (let i = 0; i < attackCount; i++) {
    targets.push(selectedTargets[i] || selectedTargets[0]);
  }
  
  // Notify if using same target multiple times
  if (selectedTargets.length < attackCount) {
    ui.notifications.info(`${attackCount} attacks planned but only ${selectedTargets.length} target(s) selected. Remaining attacks will target ${selectedTargets[0].name}.`);
  }

  // ===== Rank + effective Fighting helpers =====
  const RANKS = [
    "Feeble","Poor","Typical","Good","Excellent","Remarkable",
    "Incredible","Amazing","Monstrous","Unearthly","Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000"
  ];
  const rIdx = (n) => {
    const i = RANKS.findIndex(r => r.toLowerCase() === String(n).toLowerCase());
    return i >= 0 ? i : 0;
  };

  // Resolve the true actor (Actor or Token)
  const actorDoc = actor?.actor ?? actor;

  // Base Fighting from actor
  const baseFightingName = (a) =>
    a?.system?.abilities?.fighting?.rank ??
    a?.system?.fighting?.rank ??
    "Feeble";

  // If the *power being used* is Ultimate Skill (Martial Arts) and this is Slugfest,
  // use the power's rank for the FEAT (fallback to base if missing).
  const usingUltimateSkill = /ultimate\s*skill/i.test(power?.name || "");

  let attackerFight = baseFightingName(actorDoc);
  if (usingUltimateSkill && isSlugfest) {
    // Prefer the power's configured rank if present
    attackerFight = power?.system?.rank ?? attackerFight;
  }

  // Intensity required by the rule
  const intensityForAttacks = (n) => (n >= 3 ? "Amazing" : "Remarkable");

  // Color needed vs intensity delta (standard Intensity FEAT logic)
  const neededColorForDelta = (delta) => {
    if (delta >= 3) return "auto";
    if (delta >= 0) return "green";
    if (delta === -1) return "yellow";
    return "red";
  };
  const colorOK = (rolled, needed) => {
    const order = { white:0, green:1, yellow:2, red:3, auto:4 };
    return (order[String(rolled).toLowerCase()] ?? 0) >= (order[needed] ?? 0);
  };

  // Determine attacker Fighting vs required intensity
  const attackerIdx   = rIdx(attackerFight);
  const intensityName = intensityForAttacks(attackCount);
  const intensityIdx  = rIdx(intensityName);
  const delta         = attackerIdx - intensityIdx;
  const neededColor   = neededColorForDelta(delta);

  console.log(`Starting multiple attack sequence: ${attackCount} attacks with ${power?.name ?? "Power"}`);
  console.log(`Multi-attack FEAT: attacker Fighting ${attackerFight} (idx ${attackerIdx}) vs ${intensityName} (idx ${intensityIdx}) → delta ${delta} → need ${neededColor.toUpperCase()}`);
  console.log(`Targets: ${targets.map(t => t.name).join(", ")}`);

  let featColor = "white";
  let featSucceeded = false;

  if (neededColor === "auto") {
    // 3+ ranks higher → automatic success, no roll
    featColor = "auto";
    featSucceeded = true;
    console.log("Multiple attack FEAT auto-succeeds (3+ ranks above intensity).");
  } else {
    // Roll your existing Fighting FEAT function; treat color result against neededColor
    const featResult = await game.msh.CombatHandler.rollMultipleAttackFeat(actorDoc, attackCount, { 
        intensity: intensityName,
        effectiveFightingRank: attackerFight,
        effectiveFightingValue: CONFIG.FASERIP?.rankValues?.[attackerFight] || 0
    });

    if (featResult?.cancelled) {
      ui.notifications.info("Multiple attack cancelled");
      return [];
    }
    featColor = String(featResult?.resultColor ?? "white").toLowerCase();
    featSucceeded = colorOK(featColor, neededColor);
  }

  if (!featSucceeded) {
    // Failure → one attack at −3CS against first target
    console.log("Multiple attack FEAT failed — performing a single attack at −3CS.");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div style="background:#ffebee;border:1px solid #f44336;border-radius:3px;padding:8px;margin:5px 0;">
          <div style="color:#d32f2f;font-weight:bold;margin-bottom:5px;">Multiple Attack Failed</div>
          <div style="font-size:.9em;">
            <div>${actor.name} attempted ${attackCount} attacks (Intensity: ${intensityName}).</div>
            <div>Result: Single attack only, at −3CS against ${targets[0].name}.</div>
          </div>
        </div>`
    });

    const modifiedOptions = {
      ...options,
      columnShift: (options.columnShift ?? 0) - 3,
      multiAttacks: false,
      attackCount: 1
    };
    return [await rollSingleAttackRefactor({ actor, power, options: { ...modifiedOptions, useDirectRoll: true } })];
  }

  // Success → perform N attacks at −1CS each against selected targets
  debugLog(`Multiple attack FEAT ${String(featColor).toUpperCase()} — proceeding with ${attackCount} attacks at −1CS each.`);
  const results = [];

  for (let i = 1; i <= attackCount; i++) {
    const currentTarget = targets[i - 1];
    debugLog("Multiple attack executing", { i, attackCount, target: currentTarget?.name });

    // Temporarily clear and set single target for this attack
    game.user.targets.forEach(t => t.setTarget(false, { user: game.user, releaseOthers: false }));
    currentTarget?.setTarget?.(true, { user: game.user, releaseOthers: true });

    const attackOptions = {
      ...options,
      columnShift: (options.columnShift ?? 0) - 1,
      multiAttacks: false, // prevent recursion
      attackCount: 1,
      attackIndex: i
    };

    const attackResult = await rollSingleAttackRefactor({
      actor,
      power,
      options: { ...attackOptions, useDirectRoll: true }
    });

    results.push(attackResult);

    if (i < attackCount) await new Promise(r => setTimeout(r, 800));
  }


  // Restore original target selection
  game.user.targets.forEach(t => t.setTarget(false, { user: game.user, releaseOthers: false }));
  selectedTargets.forEach(t => t.setTarget(true, { user: game.user, releaseOthers: false }));

  // Build target list for chat message
  const uniqueTargets = [...new Set(targets.map(t => t.name))];
  const targetList = uniqueTargets.join(", ");

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="background:#e8f5e8;border:1px solid #4caf50;border-radius:3px;padding:8px;margin:5px 0;">
        <div style="color:#2e7d32;font-weight:bold;margin-bottom:5px;">Multiple Attack Sequence Complete</div>
        <div style="font-size:.9em;">
          <div>${actor.name} completed ${attackCount} attacks with ${power?.name ?? "Power"}.</div>
          <div>Targets: ${targetList}</div>
          <div>Each attack suffered −1CS.</div>
        </div>
      </div>`
  });

  return results;
}

/**
 * Validates if an action type can be used for multiple attacks
 */
export function isValidMultipleAttack(actionCode) {
  const at = String(actionCode || "").toLowerCase();
  return at.includes("blunt") || at.includes("edged") || 
         at.includes("(ba)") || at.includes("(ea)") || 
         at.includes("shoot") || at.includes("(sh)");
}
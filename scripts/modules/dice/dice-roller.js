// File: systems/msh-faserip/scripts/modules/dice/dice-roller.js
// Two-phase karma system per FASERIP rules:
// Phase 1: Declare intent to spend karma BEFORE rolling
// Phase 2: After seeing roll, decide amount (minimum 10 or all remaining)
// 2026-08-02: promptKarmaDeclaration() — Phase 1 as a standalone two-button
// prompt for reactive/defensive FEATs (intensity resists) that are rolled by
// the pipeline rather than from a roll dialog. Gate on ownership at call site.
// 2026-08-02 (3): localDeclareTimeoutMs option — high-frequency callers
// (Slam/Stun/Kill checks) countdown the LOCAL GM/owner prompt too, so
// full-auto NPC saves auto-decline instead of parking on a dialog.
// 2026-08-02 (2): resolveResistFeat() router — routes the whole resist
// sequence (declare with 10s countdown → roll → Phase-2 amount → deduct) to
// an active owning player's client via socketlib executeAsUser; falls back to
// a local sequence for the GM/owner, or a plain roll. Handler registered in
// gm-utils registerSocket.

import { runAsGM } from '../../gm-utils.js';

// Inline debug helper to avoid import issues
function debugLog(...args) {
  try {
    if (game.settings.get("msh-faserip", "debugMode")) {
      console.log("FASERIP DEBUG |", ...args);
    }
  } catch (_) {}
}

/**
 * Phase-1 declaration prompt for a reactive FEAT (e.g. resisting a stun
 * weapon's Intensity). RAW: karma must be declared before the die is rolled,
 * with a minimum commitment (10, or all remaining if less) that is spent even
 * if the raw roll would have sufficed. Returns true if karma was declared.
 * Callers should skip this entirely for automatic/impossible FEATs (no roll)
 * and when the target has no karma.
 * timeoutMs > 0 shows a countdown and auto-declines (closes → false) when it
 * expires — used when the prompt is routed to the owning player's client.
 */
export async function promptKarmaDeclaration(actor, { sourceName = "FEAT", rank = "", intensityRank = "", requirement = "", timeoutMs = 0 } = {}) {
  const available = getAvailableKarma(actor);
  if (available <= 0) return false;
  const minKarma = getMinimumKarmaCommitment(actor);
  const { showFaseripButtonDialog } = await import("../actions/dialog-shim.js");
  const needLine = requirement
    ? `<div style="margin-bottom:6px;">Need <b>${String(requirement).toUpperCase()}</b> \u2014 ${rank}${intensityRank ? ` vs ${intensityRank} Intensity` : ""}</div>`
    : "";
  const countdownLine = timeoutMs > 0
    ? `<div style="margin-top:6px;text-align:center;font-size:.9em;color:#c62828;">Auto-declines in <b><span class="karma-countdown">${Math.ceil(timeoutMs / 1000)}</span></b>s</div>`
    : "";
  let timer = null;
  let tick = null;
  const result = await showFaseripButtonDialog({
    title: `Karma \u2014 ${actor.name}: ${sourceName}`,
    content: `<div style="min-width:340px;padding:4px 2px;">
      ${needLine}
      <div style="padding:6px 8px;background:#fff3e0;border-left:4px solid #ff9800;font-size:.9em;">
        Declare Karma <b>before</b> the roll. Minimum commitment <b>${minKarma}</b> is spent
        even if the raw roll succeeds. Available: <b>${available}</b>.
      </div>
      ${countdownLine}
    </div>`,
    buttons: {
      declare: { label: `Declare Karma (min ${minKarma})`, icon: "fas fa-star", callback: () => true },
      roll:    { label: "Roll Without Karma", icon: "fas fa-dice", callback: () => false }
    },
    default: "roll",
    render: ($html, dialog) => {
      if (timeoutMs > 0) {
        let remaining = Math.ceil(timeoutMs / 1000);
        tick = setInterval(() => {
          remaining -= 1;
          $html.find(".karma-countdown").text(Math.max(0, remaining));
        }, 1000);
        timer = setTimeout(() => { try { dialog.close(); } catch (_) {} }, timeoutMs);
      }
    },
    close: () => {
      if (timer) clearTimeout(timer);
      if (tick) clearInterval(tick);
    }
  });
  return result === true;
}

/**
 * Full resist-FEAT sequence on THIS client: Phase-1 declaration (optional
 * countdown) → d100 via rollD100AndApplyKarma (Phase-2 amount dialog +
 * deduction when declared). Returns plain serializable numbers so the socket
 * handler can relay it. skipPrompt rolls straight with no karma.
 */
export async function resolveResistFeatSequence(actor, {
  sourceName = "FEAT", rank = "Typical", intensityRank = "", requirement = "",
  declareTimeoutMs = 0, skipPrompt = false
} = {}) {
  let declared = false;
  if (!skipPrompt && getAvailableKarma(actor) > 0) {
    declared = await promptKarmaDeclaration(actor, {
      sourceName, rank, intensityRank, requirement, timeoutMs: declareTimeoutMs
    });
  }
  const { roll, cappedTotal, karmaUsed } = await rollD100AndApplyKarma(actor, {
    spendKarma: declared,
    rank,
    sourceName,
    skipDiceDisplay: true
  });
  return { rollTotal: roll.total, cappedTotal, karmaUsed, declared };
}

/**
 * Router for a defender's resist FEAT. Preference order:
 *   1. An active non-GM owner of the target (other than the executing user)
 *      → route the whole sequence to their client via socketlib
 *      executeAsUser, with the declaration countdown running there. Guarded
 *      by a local timeout (declare window + 120s for the Phase-2 amount
 *      dialog); on guard expiry or socket error, fall back to a plain local
 *      roll with no karma.
 *   2. Executing user is GM or owns the target → local sequence (no
 *      countdown; the deciding human is the one looking at the dialog).
 *   3. Otherwise → plain roll, no karma prompt.
 */
export async function resolveResistFeat(targetActor, opts = {}) {
  const declareTimeoutMs = opts.declareTimeoutMs ?? 10000;
  // Local (GM/owner) prompts default to untimed — the deciding human is
  // looking at the dialog. High-frequency callers (Slam/Stun/Kill checks in
  // full-auto) pass localDeclareTimeoutMs so NPC saves auto-decline instead
  // of parking combat on an unattended dialog.
  const localDeclareTimeoutMs = opts.localDeclareTimeoutMs ?? 0;
  const hasKarma = getAvailableKarma(targetActor) > 0;

  if (hasKarma) {
    const owner = game.users.find(u =>
      u.active && !u.isGM && u.id !== game.user.id &&
      targetActor.testUserPermission(u, "OWNER")
    );
    if (owner && game.msh?.socket) {
      ui.notifications?.info(`Waiting for ${owner.name}: Karma declaration (${Math.ceil(declareTimeoutMs / 1000)}s)...`);
      const guardMs = declareTimeoutMs + 120000;
      try {
        const remote = await Promise.race([
          game.msh.socket.executeAsUser("resolveResistFeat", owner.id, {
            ...opts, declareTimeoutMs, actorUuid: targetActor.uuid
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("resist-feat-guard-timeout")), guardMs))
        ]);
        if (remote && typeof remote.cappedTotal === "number") return remote;
      } catch (e) {
        console.warn(`[FASERIP] Remote resist FEAT for ${owner.name} failed/timed out — rolling locally without karma:`, e?.message || e);
      }
      // Fall through: plain local roll, no double-prompt.
      return resolveResistFeatSequence(targetActor, { ...opts, skipPrompt: true });
    }
    if (game.user.isGM || targetActor.isOwner) {
      return resolveResistFeatSequence(targetActor, { ...opts, declareTimeoutMs: localDeclareTimeoutMs });
    }
  }
  return resolveResistFeatSequence(targetActor, { ...opts, skipPrompt: true });
}

/**
 * Get available karma for an actor
 */
export function getAvailableKarma(actor) {
  return actor.system.karma?.availableLifetime 
    || actor.system.attributes?.karma?.value 
    || actor.system.karma?.value 
    || 0;
}

/**
 * Get the minimum karma commitment for an actor
 * Rules: minimum 10, or all remaining if < 10
 */
export function getMinimumKarmaCommitment(actor) {
  const availableKarma = getAvailableKarma(actor);
  if (availableKarma <= 0) return 0;
  return Math.min(10, availableKarma);
}

/**
 * Generate HTML for karma declaration checkbox (Phase 1 - before roll)
 * Just a simple checkbox to declare intent - amount chosen AFTER roll
 */
/**
 * Generate the compact Action HUD-style karma row (blue Oswald label +
 * right-aligned avail/min readout). Critical styles inlined so the row
 * renders correctly even in dialogs that don't wrap content in .frp-dlg
 * (e.g. movement-feats, entangling-action). Theme classes preserved so
 * scoped CSS overrides still apply where present.
 *
 * v2.0.0 - 2026-05-06: Replace tan-panel layout with single-row format
 * matching blunt/edged/shooting/etc. attack dialogs. Drops the
 * post-roll-amount warning text.
 */
export function generateKarmaControlsHTML(actor, defaultChecked = false) {
  const availableKarma = getAvailableKarma(actor);
  const minKarma = getMinimumKarmaCommitment(actor);

  if (availableKarma <= 0) {
    return `
      <div class="frp-opt-row inactive" style="display:flex;align-items:center;gap:8px;padding:4px 0;opacity:0.55;">
        <span class="frp-opt-label" style="font-family:'Oswald',sans-serif;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Karma</span>
        <span style="margin-left:auto;font-size:11px;color:#888;font-style:italic;">none available</span>
      </div>
    `;
  }

  return `
    <div class="frp-opt-row" style="display:flex;align-items:center;gap:8px;padding:4px 0;">
      <label style="cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-size:13px;">
        <input type="checkbox" id="spend-karma" name="spendKarma" ${defaultChecked ? 'checked' : ''}>
        <span class="frp-opt-label blue" style="font-family:'Oswald',sans-serif;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#1565c0;">Karma</span>
      </label>
      <span class="frp-karma-pool" style="margin-left:auto;font-size:12px;color:#444;">
        <strong style="font-family:'Oswald',sans-serif;font-size:14px;">${availableKarma}</strong> avail (min ${minKarma})
      </span>
    </div>
  `;
}

/**
 * Setup karma control event handlers (minimal for phase 1)
 */
export function setupKarmaControlHandlers(html) {
  // No complex handlers needed - just a checkbox
}

/**
 * Extract karma declaration from dialog (Phase 1)
 * Only returns whether karma was declared - amount comes in phase 2
 */
export function extractKarmaFromDialog(html) {
  const spendKarma = html.find('#spend-karma').is(':checked');
  return { spendKarma, karmaToSpend: 0 }; // Amount determined in phase 2
}

/**
 * Get CSS color code for a Universal Table result color
 */
function getColorCode(color) {
  const colors = {
    'white': '#666',
    'green': '#2e7d32',
    'yellow': '#f57f17',
    'red': '#c62828'
  };
  return colors[String(color).toLowerCase()] || '#666';
}

/**
 * Get background color for a Universal Table result color
 */
function getColorBg(color) {
  const colors = {
    'white': '#f5f5f5',
    'green': '#e8f5e9',
    'yellow': '#fffde7',
    'red': '#ffebee'
  };
  return colors[String(color).toLowerCase()] || '#f5f5f5';
}

/**
 * Calculate karma needed to reach a specific color on the Universal Table
 */
function calculateKarmaToColor(rollResult, rank, targetColor) {
  const colorHierarchy = { 'white': 0, 'green': 1, 'yellow': 2, 'red': 3 };
  const targetLevel = colorHierarchy[targetColor] || 0;
  
  for (let karma = 1; karma <= 100; karma++) {
    const newResult = rollResult + karma;
    if (newResult > 100) return 999; // Can't exceed 100
    
    const newColor = game.msh.rollUniversalTable(rank, newResult);
    const colorLower = String(newColor || "").toLowerCase();
    const colorLevel = colorHierarchy[colorLower] || 0;
    
    if (colorLevel >= targetLevel) {
      return karma;
    }
  }
  return 999; // Can't achieve
}

/**
 * Show karma decision dialog AFTER rolling (Phase 2)
 * Player sees their roll result and decides how much karma to spend
 * 
 * @param {Actor} actor - The actor spending karma
 * @param {number} rollResult - The d100 roll result
 * @param {string} rank - The rank being rolled against
 * @param {string} sourceName - Description of what the roll is for
 * @param {string} initialColor - The Universal Table color result without karma
 * @returns {Promise<{karmaSpent: number, finalResult: number, finalColor: string}>}
 */
export async function showKarmaDecisionDialog(actor, rollResult, rank, sourceName, initialColor) {
  const availableKarma = getAvailableKarma(actor);
  const minKarma = getMinimumKarmaCommitment(actor);
  const maxUseful = Math.min(availableKarma, 100 - rollResult); // Can't go above 100
  
  // Calculate karma needed to reach each color threshold
  const karmaToGreen = calculateKarmaToColor(rollResult, rank, 'green');
  const karmaToYellow = calculateKarmaToColor(rollResult, rank, 'yellow');
  const karmaToRed = calculateKarmaToColor(rollResult, rank, 'red');
  
  // Build radio button options
  let optionsHtml = '';
  
  // Minimum commitment option (always shown)
  const minResult = Math.min(100, rollResult + minKarma);
  const minColor = game.msh.rollUniversalTable(rank, minResult);
  optionsHtml += `
    <div style="margin: 6px 0; padding: 6px; background: ${getColorBg(minColor)}; border-radius: 3px;">
      <input type="radio" name="karmaChoice" id="karma-min" value="${minKarma}" checked>
      <label for="karma-min">
        <strong>Minimum (${minKarma}):</strong> 
        ${rollResult} + ${minKarma} = ${minResult} → 
        <span style="color: ${getColorCode(minColor)}; font-weight: bold;">${String(minColor).toUpperCase()}</span>
      </label>
    </div>
  `;
  
  // Options to reach specific colors (if achievable and costs more than minimum)
  if (karmaToGreen > minKarma && karmaToGreen <= maxUseful) {
    const result = rollResult + karmaToGreen;
    optionsHtml += `
      <div style="margin: 6px 0; padding: 6px; background: #e8f5e9; border-radius: 3px;">
        <input type="radio" name="karmaChoice" id="karma-green" value="${karmaToGreen}">
        <label for="karma-green">
          <strong>Reach GREEN (${karmaToGreen}):</strong> 
          ${rollResult} + ${karmaToGreen} = ${result} → 
          <span style="color: #2e7d32; font-weight: bold;">GREEN</span>
        </label>
      </div>
    `;
  }
  
  if (karmaToYellow > minKarma && karmaToYellow <= maxUseful && karmaToYellow !== karmaToGreen) {
    const result = rollResult + karmaToYellow;
    optionsHtml += `
      <div style="margin: 6px 0; padding: 6px; background: #fffde7; border-radius: 3px;">
        <input type="radio" name="karmaChoice" id="karma-yellow" value="${karmaToYellow}">
        <label for="karma-yellow">
          <strong>Reach YELLOW (${karmaToYellow}):</strong> 
          ${rollResult} + ${karmaToYellow} = ${result} → 
          <span style="color: #f57f17; font-weight: bold;">YELLOW</span>
        </label>
      </div>
    `;
  }
  
  if (karmaToRed > minKarma && karmaToRed <= maxUseful && karmaToRed !== karmaToYellow) {
    const result = rollResult + karmaToRed;
    optionsHtml += `
      <div style="margin: 6px 0; padding: 6px; background: #ffebee; border-radius: 3px;">
        <input type="radio" name="karmaChoice" id="karma-red" value="${karmaToRed}">
        <label for="karma-red">
          <strong>Reach RED (${karmaToRed}):</strong> 
          ${rollResult} + ${karmaToRed} = ${result} → 
          <span style="color: #c62828; font-weight: bold;">RED</span>
        </label>
      </div>
    `;
  }
  
  // Custom amount option
  optionsHtml += `
    <div style="margin: 10px 0; padding: 8px; border-top: 1px solid #ccc;">
      <input type="radio" name="karmaChoice" id="karma-custom" value="custom">
      <label for="karma-custom"><strong>Custom amount:</strong></label>
      <input type="number" id="karma-custom-amount" min="${minKarma}" max="${maxUseful}" value="${minKarma}" style="width: 60px; margin-left: 8px;" disabled>
      <span style="font-size: 0.85em; color: #666;">(${minKarma} - ${maxUseful})</span>
    </div>
  `;
  
  return new Promise((resolve) => {
    new Dialog({
      title: `Karma Decision: ${sourceName}`,
      content: `
        <div style="background: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px;">
          <div style="padding: 8px 12px; border-bottom: 1px solid #c0c0c0; background: ${getColorBg(initialColor)};">
            <strong>You Rolled: ${rollResult}</strong> → 
            <span style="color: ${getColorCode(initialColor)}; font-weight: bold; font-size: 1.1em;">
              ${String(initialColor).toUpperCase()}
            </span>
            <span style="margin-left: 10px; color: #666;">(vs ${rank})</span>
          </div>
          
          <div style="padding: 12px;">
            <div style="margin-bottom: 12px; padding: 8px; background: #fff3e0; border-left: 4px solid #ff9800; font-size: 0.9em;">
              You declared karma spending. Choose how much to spend.<br>
              <strong>Available:</strong> ${availableKarma} | <strong>Minimum:</strong> ${minKarma}
            </div>
            
            <div class="karma-options">
              ${optionsHtml}
            </div>
          </div>
        </div>
      `,
      buttons: {
        spend: {
          icon: '<i class="fas fa-check"></i>',
          label: "Spend Karma",
          callback: async (html) => {
            let karmaSpent = minKarma;
            const choice = html.find('input[name="karmaChoice"]:checked').val();
            
            if (choice === 'custom') {
              karmaSpent = parseInt(html.find('#karma-custom-amount').val()) || minKarma;
            } else {
              karmaSpent = parseInt(choice) || minKarma;
            }
            
            // Enforce bounds
            karmaSpent = Math.max(minKarma, Math.min(karmaSpent, maxUseful));
            
            const finalResult = Math.min(100, rollResult + karmaSpent);
            const finalColor = game.msh.rollUniversalTable(rank, finalResult);
            
            // Deduct karma
            await deductKarma(actor, karmaSpent, sourceName);
            
            resolve({ karmaSpent, finalResult, finalColor });
          }
        }
      },
      default: "spend",
      render: (html) => {
        // Enable custom input when custom radio selected
        html.find('input[name="karmaChoice"]').on('change', function() {
          const isCustom = html.find('#karma-custom').is(':checked');
          html.find('#karma-custom-amount').prop('disabled', !isCustom);
          if (isCustom) {
            html.find('#karma-custom-amount').focus();
          }
        });
      }
    }).render(true);
  });
}

/**
 * Deduct karma from actor and add history entry
 */
export async function deductKarma(actor, amount, sourceName) {
  if (amount <= 0) return;
  
  debugLog(`Deducting ${amount} karma from ${actor.name} for ${sourceName}`);
  
  const historyEntry = {
    timestamp: new Date().toISOString(),
    realDate: new Date().toLocaleDateString(),
    gameDate: "",
    amount: -amount,
    type: "Die Roll",
    description: `Spent karma on ${sourceName}`
  };
  
  const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
  const newHistory = currentHistory.concat([historyEntry]);

  await runAsGM({
    operation: 'update',
    targetActorUuid: actor.uuid,
    args: [{ "system.karma.history": newHistory }]
  });
}

/**
 * Create a basic d100 roll without karma
 */
export async function rollD100(actor, flavorText = null, showInChat = true) {
  const roll = new Roll("1d100");
  await roll.evaluate();

  if (showInChat) {
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: flavorText || `${actor.name} rolls d100`,
      rollMode: game.settings.get("core", "rollMode")
    });
  }

  return roll;
}

/**
 * LEGACY COMPATIBILITY: Roll d100 and apply karma in one step
 * Used by rolls.js for talent/power/equipment rolls
 * This function supports the two-phase system when rank is provided in options
 * 
 * @param {Actor} actor - The actor making the roll
 * @param {Object} options - Roll configuration
 * @returns {Promise<Object>} - {roll, cappedTotal, karmaUsed}
 */
export async function rollD100AndApplyKarma(actor, options = {}) {
  const {
    spendKarma = false,
    karmaToSpend = 0,
    karma = 0, // Legacy parameter
    sourceName = "Roll",
    rank = null,
    skipDiceDisplay = false,
    flavorText = null
  } = options;

  // Handle legacy karma parameter
  const effectiveKarmaToSpend = karmaToSpend || karma;
  const isSpendingKarma = spendKarma || effectiveKarmaToSpend > 0;

  // Roll the d100
  const roll = new Roll("1d100");
  await roll.evaluate();

  // Display roll if not skipped
  if (!skipDiceDisplay) {
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: flavorText || `${actor.name} rolls d100`,
      rollMode: game.settings.get("core", "rollMode")
    });
  }

  let cappedTotal = roll.total;
  let karmaUsed = 0;

  // If spending karma and we have a rank, use two-phase system
  if (isSpendingKarma && rank) {
    const initialColor = game.msh.rollUniversalTable(rank, roll.total);
    const result = await showKarmaDecisionDialog(actor, roll.total, rank, sourceName, initialColor);
    cappedTotal = result.finalResult;
    karmaUsed = result.karmaSpent;
    // Karma already deducted in showKarmaDecisionDialog
  } 
  // Legacy fallback: direct karma application without dialog
  else if (isSpendingKarma && effectiveKarmaToSpend > 0) {
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    
    // Enforce minimum
    let actualKarma = Math.max(minKarma, effectiveKarmaToSpend);
    actualKarma = Math.min(actualKarma, availableKarma);
    
    cappedTotal = Math.min(100, roll.total + actualKarma);
    karmaUsed = actualKarma;
    
    // Deduct karma
    await deductKarma(actor, karmaUsed, sourceName);
  }

  return { roll, cappedTotal, karmaUsed };
}

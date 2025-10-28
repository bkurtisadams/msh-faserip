import { ACTION_LABELS, ACTION_EFFECTS } from "./action-config.js";
import { applyNullifiedEffect, isAuraMaintained } from "./nullify.js";
import { calculateMitigation } from "../../rules/mitigation.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { resolveCombatMode } from "./action-dispatcher.js";

/** Action capability map — what rules permit by default */
export const ACTION_CAPS = {
  "blunt-attack":   { multi:true,  reduceDamage:true,  lowerEffect:true  },  // Slugfest
  "edged-attack":   { multi:true,  reduceDamage:false, lowerEffect:false },  // Slugfest (cannot pull/lower by default)
  "shooting":       { multi:true,  reduceDamage:false, lowerEffect:false },  // Shooting (trick shots are separate)
  "throwing-blunt": { multi:false, reduceDamage:true,  lowerEffect:false },
  "throwing-edged": { multi:false, reduceDamage:false, lowerEffect:false },
  "energy":         { multi:false, reduceDamage:true,  lowerEffect:true  },
  "force":          { multi:false, reduceDamage:true,  lowerEffect:true  },
  "grappling":      { multi:false, reduceDamage:true,  lowerEffect:true  },
  "grabbing":       { multi:false, reduceDamage:false, lowerEffect:false },   // treated separately from Grappling
  "escaping":       { multi:false, reduceDamage:false, lowerEffect:false },
  "charging":       { multi:false, reduceDamage:false, lowerEffect:true  },
  "dodging":        { multi:false, reduceDamage:false, lowerEffect:false },
  "evading":        { multi:false, reduceDamage:false, lowerEffect:false },
  "blocking":       { multi:false, reduceDamage:false, lowerEffect:false },
  "catching":       { multi:false, reduceDamage:false, lowerEffect:false },
  // effect-only “actions” (usually part of results flow, not standalone actions)
  "stun":           { multi:false, reduceDamage:false, lowerEffect:false },
  "slam":           { multi:false, reduceDamage:false, lowerEffect:false },
  "kill":           { multi:false, reduceDamage:false, lowerEffect:false },
};

/** Get merged capabilities for an action; allows per-item/power overrides */
export function getActionCapabilities(actionType, { actor=null, item=null, power=null } = {}) {
  const base = ACTION_CAPS[actionType] || { multi:false, reduceDamage:false, lowerEffect:false };
  const caps = { ...base };

  // Example extension points:
  // - Power stunt flag to allow multi for specific powers
  if (power?.flags?.msh?.multiAttackStunt === true) caps.multi = true;

  // - Some items might allow pulling or special “up to” wording
  if (item?.flags?.msh?.allowsReduceDamage === true) caps.reduceDamage = true;
  if (item?.flags?.msh?.allowsLowerEffect === true)  caps.lowerEffect  = true;

  return caps;
}

/** Apply capabilities to the current dialog UI (non-destructive: hide/disable only) */
export function applyCapabilitiesToDialog(html, actionType, ctx = {}) {
  const caps = getActionCapabilities(actionType, ctx);
  const $root = $(html);
  const $pull  = $root.find("#msh-section-pull, .msh-pull-section");   // prefer an explicit id/class; fallback ok
  const $multi = $root.find("#msh-section-multi, .msh-multi-section");

  // Pull section sub-controls
  const $pulledDamageRow = $pull.find('[name="pulledDamage"]').closest("div");
  const $resultCapRow    = $pull.find('[name="resultCap"]').closest("div");

  if (!caps.reduceDamage) $pulledDamageRow.hide();
  if (!caps.lowerEffect)  $resultCapRow.hide();
  if (!caps.reduceDamage && !caps.lowerEffect) $pull.hide();

  if (!caps.multi) $multi.hide();

  // For consistency, make sure downstream reads don’t crash if hidden:
  // If a row is hidden and input missing, we default to safe values:
  if (!$pull.length) {
    $root.data("msh-no-pull", true);
  }
  if (!$multi.length) {
    $root.data("msh-no-multi", true);
  }
}

/**
 * Play a visual effect from attacker to target(s) using Sequencer
 * @param {string} effectPath - JB2A file path (e.g., "jb2a.energy_beam.normal.blue.01")
 * @param {Token} sourceToken - Attacking token
 * @param {Token[]} targetTokens - Array of target tokens
 * @param {Object} options - Additional options (color, scale, duration, etc.)
 */
export async function playAttackEffect(effectPath, sourceToken, targetTokens = [], options = {}) {
  // Check if Sequencer is available
  if (!game.modules.get("sequencer")?.active) return;
  
  const targets = targetTokens.length ? targetTokens : Array.from(game.user.targets);
  if (!sourceToken || !targets.length) return;

  try {
    const sequence = new Sequence();
    
    for (const target of targets) {
      sequence.effect()
        .file(effectPath)
        .atLocation(sourceToken)
        .stretchTo(target)
        .duration(options.duration || 1000)
        .scale(options.scale || 1.0)
        .opacity(options.opacity || 1.0)
        .waitUntilFinished(options.wait ? -500 : 0);
    }
    
    await sequence.play();
  } catch (err) {
    console.warn("Sequencer effect failed:", err);
  }
}

/**
 * Play an impact/explosion effect at target location(s)
 */
export async function playImpactEffect(effectPath, targetTokens = [], options = {}) {
  if (!game.modules.get("sequencer")?.active) return;
  
  const targets = targetTokens.length ? targetTokens : Array.from(game.user.targets);
  if (!targets.length) return;

  try {
    const sequence = new Sequence();
    
    for (const target of targets) {
      sequence.effect()
        .file(effectPath)
        .atLocation(target)
        .scale(options.scale || 1.0)
        .opacity(options.opacity || 1.0);
    }
    
    await sequence.play();
  } catch (err) {
    console.warn("Sequencer impact effect failed:", err);
  }
}

/**
 * Get JB2A effect path based on attack type and color
 */
export function getAttackEffectPath(attackType, color = "blue", variant = "01") {
  const effectMap = {
    "energy": `jb2a.energy_beam.normal.${color}.${variant}`,
    "force": `jb2a.impact.010.${color}`,
    "lightning": `jb2a.chain_lightning.primary.${color}.${variant}`,
    "fire": `jb2a.fire_bolt.${color}`,
    "ice": `jb2a.ice_spikes.radial.${variant}`,
    "laser": `jb2a.laser_blast.${color}`,
    "magic": `jb2a.magic_missile.${color}`
  };
  
  return effectMap[attackType] || effectMap["energy"];
}

/**
 * Setup complete mode selector with persistence
 * @param {Actor} actor - The actor to save/load mode from
 * @param {jQuery} $html - The dialog HTML
 * @param {Object} opts - Options object to update
 * @param {string} flagName - Flag name to save mode (e.g., "lastBluntMode")
 * @returns {string} Current mode value
 */
export async function setupModeSelector(actor, $html, opts = {}, flagName = "lastActionMode") {
  // Load saved mode
  const savedMode = (await actor.getFlag("msh-faserip", flagName)) || "semi";
  
  // Initialize opts
  opts.mode = savedMode;
  const derived = (savedMode === "full")
    ? { autoApply: true, showConfirm: false }
    : (savedMode === "semi")
      ? { autoApply: false, showConfirm: true }
      : { autoApply: false, showConfirm: false };
  Object.assign(opts, derived);
  
  // Update visual state to match saved mode
  const $buttons = $html.find(".faserip-mode-row .faserip-mode");
  $buttons.css({"background": "#f7f7f7", "color": "#444", "font-weight": "400", "border-color": "#bbb"});
  const $activeBtn = $buttons.filter(`[data-mode="${savedMode}"]`);
  $activeBtn.css({"background":"#2196F3", "color":"#fff", "font-weight":"600", "border-color":"#1976D2"});
  
  // Attach handlers with auto-save
  attachModeSelectorHandlers($html, opts, async (mode, derived) => {
    await actor.setFlag("msh-faserip", flagName, mode);
    debugLog(`Mode changed to ${mode} and saved to ${flagName}`);
  });
  
  return savedMode;
}


/** Build the Manual / Semi / Full mode selector strip */
export function buildModeSelector({ mode = "semi", disabled = false, disabledReason = "" } = {}) {
  const mk = (val, label) => {
    const active = mode === val;
    const base = "display:inline-block;padding:4px 8px;border:1px solid #bbb;border-radius:4px;margin-left:6px;cursor:pointer;font-size:12px;";
    const on   = `${base}background:#2196F3;color:#fff;font-weight:600;border-color:#1976D2;`;  // Changed to blue
    const off  = `${base}background:#f7f7f7;color:#444;opacity:.9;`;
    const dis  = disabled ? "pointer-events:none;opacity:.5;filter:grayscale(.4);" : "";
    return `<a class="faserip-mode" data-mode="${val}" title="${disabled ? disabledReason : ""}" style="${active ? on : off}${dis}">${label}</a>`;
  };

  return `
    <div class="faserip-mode-row" style="display:flex;align-items:center;justify-content:flex-end;gap:6px;margin:4px 0 6px;">
      <span style="font-size:12px;color:#666;margin-right:6px;">Mode:</span>
      ${mk("manual","Manual")}
      ${mk("semi","Semi")}
      ${mk("full","Full")}
      ${disabled ? `<span style="font-size:11px;color:#a33;margin-left:8px;">${disabledReason}</span>` : ""}
    </div>`;
}

/** Attach click handlers; updates opts.mode and derived flags, calls onChange(mode) */
export function attachModeSelectorHandlers($html, opts = {}, onChange) {
  const $buttons = $html.find(".faserip-mode-row .faserip-mode");
  if (!$buttons.length) return;

  const applyFlags = (modeVal) => {
    const mode = String(modeVal || "semi");
    const derived = (mode === "full")
      ? { autoApply: true, showConfirm: false }
      : (mode === "semi")
        ? { autoApply: false, showConfirm: true }
        : { autoApply: false, showConfirm: false };
    if (opts) {
      opts.mode = mode;
      opts.autoApply = derived.autoApply;
      opts.showConfirm = derived.showConfirm;
    }
    if (typeof onChange === "function") onChange(mode, derived);
  };

  $buttons.on("click", (ev) => {
    const $btn = $(ev.currentTarget);
    const mode = $btn.data("mode");
    $buttons.css({"background": "#f7f7f7", "color": "#444", "font-weight": "400", "border-color": "#bbb"});
    $btn.css({"background":"#2196F3", "color":"#fff", "font-weight":"600", "border-color":"#1976D2"});
    applyFlags(mode);
  });

  // REMOVE THIS LINE - it's causing double initialization:
  // applyFlags(opts?.mode || "semi");
}

export const RANKS = [
  "Shift-0","Feeble","Poor","Typical","Good","Excellent",
  "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
  "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
];

export function debugLog(...args) {
  try {
    if (game.settings.get("msh-faserip", "debugMode")) {
      console.log("FASERIP DEBUG |", ...args);
    }
  } catch (_) {
    // settings may not exist yet during early boot
    console.log("FASERIP DEBUG |", ...args);
  }
}

export function shiftRank(rankName, delta) {
  const i = RANKS.indexOf(rankName);
  if (i < 0) return rankName;
  return RANKS[Math.min(Math.max(i + delta, 0), RANKS.length - 1)];
}

export function labelFor(actionType) { return ACTION_LABELS[actionType] ?? actionType; }
export function effectsFor(actionType) { return ACTION_EFFECTS[actionType] ?? {white:"White",green:"Green",yellow:"Yellow",red:"Red"}; }

export function getAbilityInfo(actor, abilityName) {
  const ability = actor?.system?.abilities?.[abilityName];
  if (!ability) throw new Error(`Ability ${abilityName} not found for ${actor?.name}`);
  return {
    name: abilityName.charAt(0).toUpperCase() + abilityName.slice(1),
    rank: ability.rank,
    value: ability.value
  };
}

export function getStrengthInfo(actor) {
  const s = actor?.system?.abilities?.strength;
  return { rank: s?.rank ?? "Typical", value: s?.value ?? 6 };
}

export function rollD100() {
  return (new Roll("1d100"));
}

export function universalColor(rankName, total) {
  return game.msh.rollUniversalTable(rankName, total); // uses your existing table resolver
}

// Roll + Karma (reuses your daily vs lifetime settings logic pattern)
export async function rollWithKarma(actor, actionLabel, requestedKarma = 0) {
  const roll = await (new Roll("1d100")).evaluate();
  let cappedTotal = roll.total;
  let dailyUsed = 0, lifetimeUsed = 0;

  const k = Math.max(0, Number(requestedKarma||0));
  if (k > 0) {
    const dailyEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
    if (dailyEnabled) {
      const dailyRemaining = actor.system.karma.dailyKarmaMax - (actor.system.karma.dailyKarmaUsed || 0);
      if (dailyRemaining > 0) {
        dailyUsed = Math.min(k, dailyRemaining);
        cappedTotal = Math.min(100, roll.total + dailyUsed);

        await game.msh.runAsGM({
          operation: 'update',
          targetActorUuid: actor.uuid,
          args: [{ "system.karma.dailyKarmaUsed": (actor.system.karma.dailyKarmaUsed || 0) + dailyUsed }]
        });

        const leftover = k - dailyUsed;
        if (leftover > 0) {
          lifetimeUsed = leftover;
          cappedTotal = Math.min(100, cappedTotal + lifetimeUsed);
        }
      } else {
        lifetimeUsed = k;
        cappedTotal = Math.min(100, roll.total + lifetimeUsed);
      }
    } else {
      lifetimeUsed = k;
      cappedTotal = Math.min(100, roll.total + lifetimeUsed);
    }

    // history entries (kept identical to your pattern)
    const history = [];
    if (dailyUsed > 0) history.push({
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -dailyUsed,
      type: "Daily Roll",
      description: `Spent daily karma on ${actionLabel}`
    });
    if (lifetimeUsed > 0) history.push({
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -lifetimeUsed,
      type: "Die Roll",
      description: `Spent lifetime karma on ${actionLabel}`
    });
    if (history.length) {
      const current = foundry.utils.deepClone(actor.system.karma?.history || []);
      const newHistory = current.concat(history);
      await game.msh.runAsGM({
        operation: 'update',
        targetActorUuid: actor.uuid,
        args: [{ "system.karma.history": newHistory }]
      });
    }
  }

  return { roll, cappedTotal, totalKarmaUsed: dailyUsed + lifetimeUsed };
}

// Item filters
export const isBluntCapable = (it) => {
  const s = it.system || {};
  const tagHit = Array.isArray(s.tags) && (s.tags.includes("BA") || s.tags.includes("blunt"));
  return (s.damageType === "BA") || (s.attackType === "blunt") || tagHit;
};

// Roll + Karma (same behavior you had, packaged up)
export async function rollWithKarmaAndHistory(actor, actionLabel, requestedKarma = 0, baseTotal) {
  const roll = baseTotal instanceof Roll ? baseTotal : await (new Roll("1d100")).evaluate();
  const raw = baseTotal instanceof Roll ? baseTotal.total : roll.total;

  let cappedTotal = raw;
  let dailyUsed = 0;
  let lifetimeUsed = 0;

  // NEW: only consider what’s needed to hit 100 (and what was requested)
  const want = Math.max(0, Number(requestedKarma || 0));
  const needTo100 = Math.max(0, 100 - raw);
  const maxSpend = Math.min(want, needTo100);

  if (maxSpend > 0) {
    const dailyEnabled = game.settings.get("msh-faserip", "dailyKarmaEnabled");
    if (dailyEnabled) {
      const dailyRemaining = Math.max(0, (actor.system.karma.dailyKarmaMax || 0) - (actor.system.karma.dailyKarmaUsed || 0));

      // Spend daily first, but no more than needed
      dailyUsed = Math.min(maxSpend, dailyRemaining);
      const stillNeed = maxSpend - dailyUsed;

      // Only if still needed, use lifetime
      lifetimeUsed = Math.max(0, stillNeed);

      // Persist daily usage if any
      if (dailyUsed > 0) {
        await game.msh.runAsGM({
          operation: 'update',
          targetActorUuid: actor.uuid,
          args: [{ "system.karma.dailyKarmaUsed": (actor.system.karma.dailyKarmaUsed || 0) + dailyUsed }]
        });
      }

      cappedTotal = Math.min(100, raw + dailyUsed + lifetimeUsed);
    } else {
      // No daily pool: all from lifetime, still only up to what's needed
      lifetimeUsed = maxSpend;
      cappedTotal = Math.min(100, raw + lifetimeUsed);
    }

    // History (only record what we actually spent)
    const history = [];
    if (dailyUsed > 0) history.push({
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -dailyUsed,
      type: "Daily Roll",
      description: `Spent daily karma on ${actionLabel}`
    });
    if (lifetimeUsed > 0) history.push({
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -lifetimeUsed,
      type: "Die Roll",
      description: `Spent lifetime karma on ${actionLabel}`
    });
    if (history.length) {
      const current = foundry.utils.deepClone(actor.system.karma?.history || []);
      await game.msh.runAsGM({
        operation: 'update',
        targetActorUuid: actor.uuid,
        args: [{ "system.karma.history": current.concat(history) }]
      });
    }
  }

  return { roll, cappedTotal, totalKarmaUsed: dailyUsed + lifetimeUsed };
}


// Build the 4-cell result grid
// Result grid + actions + banner
export function buildResultGrid(actionType, activeColorLower, effects, hoverFn = getResultHoverText) {
  const cell = (active, baseBG, activeBG, baseFG, activeFG, baseBDR, activeBDR, bold) => ({
    bg: active ? activeBG : baseBG,
    fg: active ? activeFG : baseFG,
    bdr: active ? activeBDR : baseBDR,
    b: active ? bold : 'normal'
  });
  const isW = activeColorLower==='white', isG=activeColorLower==='green',
        isY = activeColorLower==='yellow', isR=activeColorLower==='red';
  const whiteCell  = cell(isW, '#f0f0f0','#333',    '#666','#fff','1px solid #ccc','2px solid #000','bold');
  const greenCell  = cell(isG, '#f0f0f0','#4CAF50', '#666','#fff','1px solid #ccc','2px solid #2e7d32','bold');
  const yellowCell = cell(isY, '#f0f0f0','#FFC107', '#666','#333','1px solid #ccc','2px solid #f57c00','bold');
  const redCell    = cell(isR, '#f0f0f0','#F44336', '#666','#fff','1px solid #ccc','2px solid #c62828','bold');
  const ho = (c)=> (hoverFn ? hoverFn(actionType, c) : "");

  return `
  <div style="padding:5px 10px; margin:5px 0; background-color:#fff; border:1px solid #ddd;">
    <div style="font-weight:bold; margin-bottom:5px; color:#333;">Possible Results:</div>
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:3px; font-size:0.85em;">
      <div style="padding:4px;background:${whiteCell.bg};color:${whiteCell.fg};border:${whiteCell.bdr};font-weight:${whiteCell.b};text-align:center;" title="${ho('white')}">White: ${effects.white}</div>
      <div style="padding:4px;background:${greenCell.bg};color:${greenCell.fg};border:${greenCell.bdr};font-weight:${greenCell.b};text-align:center;" title="${ho('green')}">Green: ${effects.green}</div>
      <div style="padding:4px;background:${yellowCell.bg};color:${yellowCell.fg};border:${yellowCell.bdr};font-weight:${yellowCell.b};text-align:center;" title="${ho('yellow')}">Yellow: ${effects.yellow}</div>
      <div style="padding:4px;background:${redCell.bg};color:${redCell.fg};border:${redCell.bdr};font-weight:${redCell.b};text-align:center;" title="${ho('red')}">Red: ${effects.red}</div>
    </div>
  </div>`;
}

// Action buttons box (placeholder chips + optional Breaking FEAT)
export function buildActionsBox({
  showSlam = false,
  showStun = false,
  showKill = false,
  showEscape = false,
  showNullifySave = false,
  nullifyIntensityRank = "",
  pulled = false,
  breakingFeat = null,
  grabbingBreak = null,
  actorUuid,
  damage = 0,
  attackForm = "blunt",
  damageType = "physical-blunt",
  armorPiercing = 0,
  armorPiercingCS = 0,
  apMode = "value",        
  prefillData = null,
  targetUuid = "",
  targetName = "",
  targetStrength = "",
  autoApply = false,  // full auto mode
  bypassArmor = false
}) {

  // Small helper to render a chip
  const chip = (label, title, enabled, dataAttrs = "") => {
    const base = "display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;font-size:13px;line-height:1.2;padding:4px 10px;border:1px solid #bbb;border-radius:4px;text-decoration:none;white-space:nowrap;";
    const style = enabled
      ? `${base}background:#fff;color:#333;cursor:pointer;`
      : `${base}background:#f7f7f7;color:#333;cursor:not-allowed;opacity:.55;filter:grayscale(.3);`;
    const key = label.toLowerCase().replace(/\s+/g, "-");
    return `<a class="faserip-chip" data-action="${key}" ${dataAttrs} ${enabled ? "" : 'aria-disabled="true"'} title="${title}" style="${style}">${label}</a>`;
  };

  const parts = [];

  // Derive the penetrating damage value that the hook expects (dataset.dmg)
  // Prefer prefillData.dmgThrough, fall back to the provided damage param.
  const dmgPen = Number((prefillData && prefillData.dmgThrough) ?? damage ?? 0);

  // Optional JSON prefill for backward compatibility with older handlers
  const prefillJson = prefillData ? JSON.stringify(prefillData) : null;
  const prefillAttr = prefillJson ? `data-prefill='${prefillJson.replace(/'/g, "&apos;")}'` : "";

  // Apply Damage chip (to apply damage to selected/targeted token[s])
  // Skip button in auto mode since damage applies automatically
  if (dmgPen > 0 && !autoApply) {  // check auto mode
    parts.push(
      chip(
        "Apply Damage",
        "Apply damage to targeted or selected token(s)",
        true,
        `data-action="apply-damage"
        data-damage="${dmgPen}"
        data-attacker-uuid="${actorUuid}"
        data-bypass-armor="${bypassArmor}"
        data-damage-type="${damageType || 'physical-blunt'}"
        data-attack-form="${attackForm || 'blunt'}"
        data-armor-piercing="${Number(armorPiercing || 0)}"
        data-armor-piercing-cs="${Number(armorPiercingCS || 0)}"
        data-ap-mode="${apMode}"`
      )
    );
  }

  // Slam chip — only if requested by caller
  if (showSlam) {
    parts.push(
      chip(
        "Resolve Slam",
        "Open Slam dialog using penetrating damage",
        true,
        `data-check="slam" data-attack-form="${attackForm}" data-dmg="${dmgPen}" data-attacker-uuid="${actorUuid}" ${pulled ? 'data-pulled="true"' : ""} ${prefillAttr}`
      )
    );
  }

  // Stun chip
  if (showStun) {
    parts.push(
      chip(
        "Resolve Stun",
        "Open Stun dialog using penetrating damage",
        true,
        `data-check="stun"
        data-attack-form="${attackForm}"
        data-damage-type="${damageType}"
        data-dmg="${dmgPen}"
        data-attacker-uuid="${actorUuid}"
        ${pulled ? 'data-pulled="true"' : ""} ${prefillAttr}`
      )
    );
  }

  // Kill chip
  if (showKill) {
    parts.push(
      chip(
        "Resolve Kill",
        "Open Kill check dialog",
        true,
        `data-check="kill"
        data-attack-form="${attackForm}"
        data-damage-type="${damageType}"
        data-dmg="${dmgPen}"
        data-attacker-uuid="${actorUuid}"
        ${prefillAttr}`
      )
    );
  }

  // Escape chip
  if (showEscape) {
    const targetBits = [
      targetUuid ? `data-defender-uuid="${targetUuid}"` : "",
      targetName ? `data-defender-name="${targetName}"` : "",
      targetStrength ? `data-defender-rank="${targetStrength}"` : ""
    ].join(" ");
    parts.push(
      chip(
        "Attempt Escape",
        "Open Escape check dialog",
        true,
        `data-check="escape" data-attack-form="${attackForm}" data-attacker-uuid="${actorUuid}" ${targetBits} ${prefillAttr}`
      )
    );
  }

  // Optional utility chips
  if (breakingFeat) {
    parts.push(
      chip(
        "Breaking FEAT",
        "Attempt a Breaking FEAT against intensity",
        true,
        `data-action="breaking-feat" ${prefillAttr}`
      )
    );
  }

  if (grabbingBreak) {
    parts.push(
      chip(
        "Break Grab",
        "Attempt to break a grab or hold",
        true,
        `data-action="grab-break" ${prefillAttr}`
      )
    );
  }

    // Nullify: force Endurance save (single target)
  if (showNullifySave) {
    const targetBits = [
      targetUuid ? `data-target-uuid="${targetUuid}"` : "",
      targetName ? `data-target-name="${targetName}"` : ""
    ].join(" ");
    const intensityAttr = nullifyIntensityRank ? `data-intensity-rank="${nullifyIntensityRank}"` : "";
    parts.push(
      chip(
        "Force Nullify Save",
        "Target makes an Endurance FEAT vs power intensity",
        true,
        `data-action="force-save-nullify" data-attacker-uuid="${actorUuid}" ${targetBits} ${intensityAttr}`
      )
    );
  }

  // Render container or nothing
  return parts.length
    ? `<div class="actions-row" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;padding:6px 0 10px;margin:6px 0 2px;">${parts.join("")}</div>`
    : "";
}

export function bannerColors(colorLower) {
  const bg = colorLower==='white' ? '#f8f8f8'
           : colorLower==='green'  ? '#4CAF50'
           : colorLower==='yellow' ? '#FFC107'
           : '#F44336';
  const fg = (colorLower==='white' || colorLower==='yellow') ? '#333' : '#fff';
  return { bg, fg };
}

// Simple banner color/fg
export function resultBannerColors(activeColorLower) {
  const bg = activeColorLower==='white' ? '#f8f8f8'
           : activeColorLower==='green'  ? '#4CAF50'
           : activeColorLower==='yellow' ? '#FFC107'
           : '#F44336';
  const fg = (activeColorLower==='white' || activeColorLower==='yellow') ? '#333' : '#fff';
  return { bg, fg };
}

// Blunt damage (exactly your rule)
export function computeBluntDamage(strRank, strVal, matRank, RANKS_LOCAL=RANKS) {
  const getVal = (r)=> game.msh.getRankValue(r) || 0;
  const sIdx = RANKS_LOCAL.indexOf(strRank);
  const mIdx = RANKS_LOCAL.indexOf(matRank);
  if (sIdx < 0 || mIdx < 0) return { damage: strVal, note: "Using Strength value" };

  if (mIdx > sIdx) {
    const nextIdx = Math.min(sIdx + 1, RANKS_LOCAL.length - 1);
    const nextRank = RANKS_LOCAL[nextIdx];
    const dmg = getVal(nextRank);
    return { damage: dmg, note: `${matRank} weapon > ${strRank} → min of ${nextRank} rank (${dmg})` };
  }
  const dmg = Math.min(getVal(strRank), getVal(matRank));
  return { damage: dmg, note: `Damage = min(STR ${getVal(strRank)}, MAT ${getVal(matRank)})` };
}

// Edged-capable item filter (damageType/attackType tags or "edged"/EA)
export const isEdgedCapable = (it) => {
  const s = it.system || {};
  const tagHit = Array.isArray(s.tags) && (s.tags.includes("EA") || s.tags.includes("edged"));
  return (s.damageType === "EA") || (s.attackType === "edged") || tagHit;
};

// Edged damage: min(STR, MAT) but never less than weapon base damage.
// natural weapon case: pass weaponBase = 0, matRank = selected natural rank.
export function computeEdgedDamage(strRank, strVal, matRank, weaponBase = 0, RANKS_LOCAL = RANKS) {
  const getVal = (r)=> game.msh.getRankValue(r) || 0;
  const sIdx = RANKS_LOCAL.indexOf(strRank);
  const mIdx = RANKS_LOCAL.indexOf(matRank);
  if (sIdx < 0 || mIdx < 0) {
    return { damage: Math.max(strVal, weaponBase), note: weaponBase ? `Using base ${weaponBase}` : "Using Strength value" };
  }
  const strCap = getVal(strRank);
  const matVal = getVal(matRank);
  const calc   = Math.min(strCap, matVal);
  const final  = Math.max(calc, weaponBase);
  return { damage: final, note: `Damage = max(min(STR ${strCap}, MAT ${matVal}), base ${weaponBase || 0})` };
}

export function getUnitsPerArea() {
  const unit = String(canvas?.scene?.grid?.units || "").toLowerCase();

  // If the scene is already in Areas, DO NOT convert; 1 scene unit == 1 Area
  if (unit === "area" || unit === "areas") return 1;

  // Otherwise, allow GM override if set
  const val = game.settings?.get?.("msh-faserip", "unitsPerArea");
  if (Number.isFinite(val) && val > 0) return Number(val);

  // Fallback by common units
  switch (unit) {
    case "ft":
    case "feet":   return 132; // 44 yards
    case "m":
    case "meter":
    case "meters": return 40;  // ~36.6 m
    case "yd":
    case "yard":
    case "yards":  return 44;  // exactly 44 yards
    default:       return 132;
  }
}

/** Measure scene distance between two points in SCENE UNITS (ft/m/areas), V12+ compatible. */
function measureSceneDistance(p0, p1) {
  if (canvas?.grid?.measurePath) {
    const res = canvas.grid.measurePath([p0, p1], { gridSpaces: false });
    if (typeof res === "number") return res;
    if (res && typeof res.distance === "number") return res.distance;
    if (Array.isArray(res) && res[0] && typeof res[0].distance === "number") return res[0].distance;
    return 0;
  }
  if (canvas?.grid?.measureDistance) {
    const n = canvas.grid.measureDistance(p0, p1);
    return typeof n === "number" ? n : 0;
  }
  return 0;
}

export function measureAreasBetweenTokens(src, dst) {
  if (!src || !dst) return 0;
  const dist = measureSceneDistance(src.center, dst.center);
  const unitsPerArea = getUnitsPerArea();
  const areas = unitsPerArea === 1 ? dist : (dist / unitsPerArea);
  // keep minimum 1 only if you want to force ranged min; otherwise allow 0.x
  return Math.max(1, Math.round(areas));
}

/**
 * Auto-fill the [name="range"] input in a Dialog with measured Areas from the actor’s token to the first target.
 * Returns a disposer to unhook listeners when the dialog closes.
 */
export function attachAutoFillRange(html, actor, onAfterFill) {
  const $range = html.find('[name="range"]');
  if (!$range.length) return () => {};

  const fill = () => {
    try {
      const targets = Array.from(game.user?.targets ?? []);
      if (!targets.length) return;
      const dst = targets[0];

      const src = canvas.tokens?.controlled?.[0]
        || canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id);
      if (!src || !dst) return;

      const areas = measureAreasBetweenTokens(src, dst);
      $range.val(String(areas)).trigger("input");
      if (typeof onAfterFill === "function") onAfterFill();
    } catch (e) {
      console.warn("attachAutoFillRange: fill failed", e);
    }
  };

  fill();

  const onTarget = () => fill();
  const onMove   = () => fill();

  Hooks.on("targetToken", onTarget);
  Hooks.on("updateToken", onMove);

  return () => {
    Hooks.off("targetToken", onTarget);
    Hooks.off("updateToken", onMove);
  };
}

export function getResultHoverText(actionType, color) {
  const hoverTexts = {
    'blunt-attack': {
      white: 'Miss - No damage inflicted',
      green: 'Hit - Inflict Strength rank damage',
      yellow: 'Slam - Inflict damage and may Slam opponent',
      red: 'Stun - Inflict damage and may Stun opponent'
    },
    'edged-attack': {
      white: 'Miss - No damage inflicted',
      green: 'Hit - Inflict weapon damage',
      yellow: 'Stun - Inflict damage and may Stun opponent',
      red: 'Kill - Inflict damage and may Kill opponent'
    },
    'shooting': {
      white: 'Miss - No damage, may hit another target',
      green: 'Hit - Inflict weapon damage',
      yellow: 'Bullseye - Hit specific target area',
      red: 'Kill - Inflict damage and may Kill opponent'
    },
    'throwing-edged': {
      white: 'Miss - No damage, may hit another target',
      green: 'Hit - Inflict weapon damage',
      yellow: 'Stun - Inflict damage and may Stun opponent',
      red: 'Kill - Inflict damage and may Kill opponent'
    },
    'throwing-blunt': {
      white: 'Miss - No damage',
      green: 'Hit - Inflict Strength or material damage',
      yellow: 'Hit - Inflict Strength or material damage',
      red: 'Stun - Inflict damage and may Stun opponent'
    },
    'energy': {
      white: 'Miss - No damage inflicted',
      green: 'Hit - Inflict power rank damage',
      yellow: 'Bullseye - Hit specific target area',
      red: 'Kill - Inflict damage and may Kill opponent'
    },
    'force': {
      white: 'Miss - No damage inflicted',
      green: 'Hit - Inflict power rank damage',
      yellow: 'Bullseye - Hit specific target area',
      red: 'Stun - Inflict damage and may Stun opponent'
    },
    'grappling': {
      white: 'Miss - Failed to hold opponent, no other actions',
      green: 'Miss - Failed to hold opponent, no other actions',
      yellow: 'Partial Hold - Grabbed limb, target acts at -2CS',
      red: 'Hold - Target fully restrained, can inflict Strength damage'
    },
    'grabbing': {
      white: 'Miss - Item not taken, may be knocked loose',
      green: 'Take - Gained possession if Strength ≥ target',
      yellow: 'Grab - Gained possession regardless of Strength',
      red: 'Break - Item taken or potentially damaged/activated'
    },
    'escaping': {
      white: 'Miss - Still held, no other actions this turn',
      green: 'Escape - Free of hold, may move half speed',
      yellow: 'Escape - Free of hold, may move half speed',
      red: 'Reverse - Free and may counter-grapple or act at -2CS'
    },
    'charging': {
      white: 'Miss - No damage, continue moving half speed in straight line\nRequirements: Move 1+ areas, +1CS per area (max +3CS)\nAgility FEAT needed to change direction after miss',
      green: 'Hit - Damage = Endurance/Body Armor (higher) + 2pts per area moved\nRequirements: Move 1+ areas, +1CS per area (max +3CS)\nBody Armor may reflect damage to attacker',
      yellow: 'Slam - Damage as Hit result, plus may Slam opponent\nDamage = Endurance/Body Armor (higher) + 2pts per area\nBody Armor may reflect damage to attacker',
      red: 'Stun - Damage as Hit result, plus may Stun opponent\nDamage = Endurance/Body Armor (higher) + 2pts per area\nBody Armor may reflect damage to attacker'
    },
    'dodging': {
      white: 'None - No reduction to incoming attacks. Dodging: -2CS to FEAT rolls, 1/2 move, only 1 other action',
      green: '-2 CS - Reduce attacker CS by 2. Dodging: -2CS to FEAT rolls, 1/2 move, only 1 other action',
      yellow: '-4 CS - Reduce attacker CS by 4. Dodging: -2CS to FEAT rolls, 1/2 move, only 1 other action',
      red: '-6 CS - Reduce attacker CS by 6. Dodging: -2CS to FEAT rolls, 1/2 move, only 1 other action'
    },
    'evading': {
      white: 'Auto-hit - Opponent automatically scores green result',
      green: 'Evasion - Dodge successful, no damage taken',
      yellow: 'Evasion +1CS - Dodge and gain +1CS next attack',
      red: 'Evasion +2CS - Dodge and gain +2CS next attack'
    },
    'blocking': {
      white: '-6 CS - Strength shifted down 6 columns as Body Armor',
      green: '-4 CS - Strength shifted down 4 columns as Body Armor',
      yellow: '-2 CS - Strength shifted down 2 columns as Body Armor',
      red: '+1 CS - Strength shifted up 1 column as Body Armor'
    },
    'catching': {
      white: 'Autohit - Object hits you instead (auto green)',
      green: 'Miss - Failed to catch, attack gets +1CS',
      yellow: 'Damage - Caught but may damage object/person',
      red: 'Catch - Successfully caught with no damage'
    },
    'stun': {
      white: '1-10 rounds - Knocked out for 1-10 rounds',
      green: '1 round - Knocked down, no action next round',
      yellow: 'No effect - Character not stunned',
      red: 'No effect - Character not stunned'
    },
    'slam': {
      white: 'Grand Slam - Knocked away at attacker Strength speed',
      green: '1 area - Knocked back one area',
      yellow: 'Stagger - Knocked back a step, no longer adjacent',
      red: 'No Slam - Not affected by slam'
    },
    'kill': {
      white: 'Endurance Loss - Dying, lose 1 rank/turn',
      green: 'E/S - Endurance Loss only if Edged/Shooting attack',
      yellow: 'No effect - Character survives, takes damage only',
      red: 'No effect - Character survives, takes damage only'
    }
  };
  
  return hoverTexts[actionType]?.[color] || `${color} result for ${actionType}`;
}

/**
 * Get targeting context string for chat cards
 * @param {Actor} actor - The acting character
 * @param {string} actionLabel - The action being performed (e.g., "Blunt Attack")
 * @returns {string} HTML string describing the targeting context
 */
export function getTargetingContext(actor, actionLabel) {
  const targets = Array.from(game.user?.targets ?? []);

  if (targets.length === 0) {
    return `<div style="font-style:italic;color:#666;">Target: <span style="color:#d32f2f;">(no target selected)</span></div>`;
  }

  if (targets.length === 1) {
    const targetName = targets[0]?.name || "Unknown";
    // Single target: no count
    return `<div>Target: <strong>${targetName}</strong></div>`;
  }

  // Multiple targets: show explicit count, e.g., "(3 targets)"
  const targetNames = targets.map(t => t?.name || "Unknown").join(", ");
  return `<div>Targets: <strong>${targetNames}</strong> <span style="color:#666;">(${targets.length} targets)</span></div>`;
}

/**
 * Apply damage to targeted or controlled tokens with Body Armor calculation
 * @param {number} damage - Base damage amount
 * @param {Object} options - Additional options
 *   - attackerUuid: UUID of the attacker (optional)
 *   - damageType: Type of damage for resistance checks (optional)
 *   - showNotification: Whether to show UI notifications (default: true)
 *   - updateButton: Button element to update with "Applied" state (optional)
 * @returns {Array} - Array of results for each target: { target, damageDealt, absorbed, newHealth }
 */
export async function applyDamageToTargets(damage, options = {}) {
  const {
    attackerUuid = null,
    damageType = "Physical-Blunt",
    showNotification = true,
    updateButton = null,
    bypassArmor = false
  } = options;

  // NEW: normalize extra fields (back-compat safe)
  const attackForm    = String(options.attackForm || "blunt").toLowerCase();
  const armorPiercing = Number(options.armorPiercing || 0) || 0;
  const dmgTypeLower  = String(damageType || "physical-blunt").toLowerCase();


  debugLog("applyDamageToTargets called", {
    damage: damage,
    bypassArmor: bypassArmor,
    attackerUuid: attackerUuid
  });

  if (damage <= 0) {
    if (showNotification) ui.notifications.warn("No damage to apply.");
    return [];
  }

  // Check for targeted tokens first, then fall back to controlled tokens (for GM)
  let targets = Array.from(game.user.targets);
    
  if (targets.length === 0) {
    // Allow the roll to happen, but skip damage application
    if (showNotification) {
      ui.notifications.info("No targets selected. Roll made but no damage applied.");
    }
    return []; // Return empty array - damage won't be applied
  }

  console.log(`FASERIP | Using ${targets.length} targeted token(s)`);
  const results = [];

  // Apply damage to each target
  for (const target of targets) {
    const targetActor = target.actor;
    if (!targetActor) {
      console.warn(`FASERIP | Target token has no actor:`, target.name);
      continue;
    }

    // ADD THIS DEBUG LOGGING HERE:
  const isToken = target.document?.documentName === "Token" || target.documentName === "Token";
  const targetTokenData = isToken ? (target.document || target) : null;
  const isUnlinkedToken = isToken && targetTokenData && !targetTokenData.actorLink;
  
  console.log("FASERIP | Apply Damage Debug:", {
    targetName: target.name,
    isToken,
    isUnlinkedToken,
    isGM: game.user.isGM,
    isOwner: targetActor.isOwner,
    updatePath: isUnlinkedToken ? "token.document" : "actor"
  });

    // Get target's Body Armor (check both equipment and powers)
    // Calculate mitigation using centralized logic
    const mitigationResult = calculateMitigation(damage, targetActor, {
      damageType: dmgTypeLower,
      attackForm: attackForm,
      bypassArmor: bypassArmor,
      armorPiercing: armorPiercing,
      armorPiercingCS: options.armorPiercingCS || 0,
      apMode: options.apMode || "value"
    });
    
    const damageAfterArmor = mitigationResult.netDamage;
    const bodyArmorValue = mitigationResult.absorbed;
    
    // Get current health
    const currentHealth = targetActor.system.attributes.health.value;
    const newHealth = Math.max(0, currentHealth - damageAfterArmor);

    // Track result
    const result = {
      // UNDO FIX: Added UUID fields
      actorUuid: targetActor.uuid,
      tokenUuid: target.document?.uuid,
      hpBefore: currentHealth,
      hpAfter: newHealth,
      target: target.name,
      targetActor: targetActor,
      damageDealt: damageAfterArmor,
      absorbed: bodyArmorValue,
      currentHealth: currentHealth,
      newHealth: newHealth
    };

    if (damageAfterArmor > 0) {
      const update = { "system.attributes.health.value": newHealth };

      try {
        if (game.user.isGM || targetActor.isOwner) {
          await targetActor.update(update);
        } else if (game.msh?.runAsGM) {
          await game.msh.runAsGM({
            operation: 'update',
            targetActorUuid: targetActor.uuid,
            args: [update]
          });
        } else {
          if (showNotification) {
            ui.notifications.warn("Couldn't update Health: no GM helper available.");
          }
          result.error = "No GM helper available";
          results.push(result);
          continue;
        }

        // Create feedback message
        if (showNotification) {
          const armorNote = bodyArmorValue > 0 
            ? ` (${damage} damage - ${bodyArmorValue} Body Armor)` 
            : "";
          
          ui.notifications.info(
            `${target.name} took ${damageAfterArmor} damage${armorNote}. Health: ${currentHealth} → ${newHealth}`
          );
        }
        
        result.success = true;

        // Check if just hit 0 health
        // modify the 0-health check:
        if (newHealth === 0 && currentHealth > 0) {
          // Check four-color rule
          const fourColorRule = game.settings.get('msh-faserip', 'fourColorRule');
          
          if (fourColorRule) {
            // In four-color mode, only do death save if this was a Kill result
            const wasKillResult = options.wasKillResult || false;
            
            if (wasKillResult) {
              await postDeathSavePrompt(targetActor);
            } else {
              // Just stunned/unconscious, no death save needed
              ChatMessage.create({
                content: `<div style="background:#e3f2fd;border:1px solid #2196F3;padding:8px;border-radius:3px;">
                  <strong>${targetActor.name}</strong> has been knocked unconscious (0 Health).
                  <div style="font-size:0.9em;color:#666;margin-top:4px;">
                    Four-Color Rule: No death save required (attack was not lethal).
                  </div>
                </div>`
              });
            }
          } else {
            // Standard rules: always death save at 0 health
            await postDeathSavePrompt(targetActor);
          }
        }
      } catch (err) {
        console.error("FASERIP | Failed to apply damage:", err);
        if (showNotification) {
          ui.notifications.error(`Failed to apply damage to ${target.name}`);
        }
        result.error = err.message;
        result.success = false;
      }
    } else {
      // All damage absorbed
      if (showNotification) {
        ui.notifications.info(
          `${target.name}'s Body Armor (${bodyArmorValue}) absorbed all ${damage} damage!`
        );
      }
      result.success = true;
      result.fullyAbsorbed = true;
    }

    results.push(result);
  }

  // Update button if provided
  if (updateButton) {
    updateButton.style.opacity = "0.5";
    updateButton.style.pointerEvents = "none";
    updateButton.textContent = "✓ Damage Applied";
  }

  return results;
}

export async function applyDamageToActorUuid(damage, actorUuid, options = {}) {
  const { showNotification = true, updateButton = null } = options;
  try {
    const resolved = await fromUuid(actorUuid);
    if (!resolved) {
      ui.notifications.warn("Could not find actor for self damage.");
      return { success: false, error: "Actor not found" };
    }

    const actor = resolved.documentName === "Actor"
      ? resolved
      : (resolved.documentName === "Token" ? resolved.actor : null);

    if (!actor) {
      ui.notifications.warn("Could not resolve actor for self damage.");
      return { success: false, error: "Bad UUID" };
    }

    const amt = Math.max(0, Number(damage || 0));
    if (amt === 0) {
      if (showNotification) ui.notifications.warn("No damage to apply.");
      return { success: false, error: "Zero damage" };
    }

    const current = actor.system?.attributes?.health?.value ?? 0;
    const newVal  = Math.max(0, current - amt);

    const update = { "system.attributes.health.value": newVal };

    if (game.user.isGM || actor.isOwner) {
      await actor.update(update);
    } else if (game.msh?.runAsGM) {
      await game.msh.runAsGM({
        operation: "update",
        targetActorUuid: actor.uuid,
        args: [update]
      });
    } else {
      if (showNotification) ui.notifications.warn("No permission to update health.");
      return { success: false, error: "No permission" };
    }

    if (showNotification) {
      ui.notifications.info(`${actor.name} took ${amt} collision damage. Health: ${current} to ${newVal}`);
    }

    if (updateButton) {
      updateButton.style.opacity = "0.5";
      updateButton.style.pointerEvents = "none";
      updateButton.textContent = "Damage Applied";
    }

    return { success: true, actor: actor.name, amount: amt, newHealth: newVal };
  } catch (err) {
    console.error("applyDamageToActorUuid failed:", err);
    if (showNotification) ui.notifications.error("Failed to apply collision damage.");
    return { success: false, error: err?.message || String(err) };
  }
}

// Add to action-utils.js

/**
 * Get Body Armor values for a target actor
 * Supports both new explicit flags and legacy name-matching
 * @param {Actor} targetActor - The actor being hit
 * @param {string} damageType - Type of damage (e.g., "energy-fire", "physical-blunt")
 * @returns {Object} { physical, energy, applicable }
 */
export function getBodyArmorValues(targetActor, damageType = "physical-blunt") {
  const dmgTypeLower = String(damageType || "physical-blunt").toLowerCase();
  
  console.log("FASERIP DEBUG | getBodyArmorValues called:", {
    targetName: targetActor.name,
    damageType: damageType
  });

  let physicalArmor = 0;
  let energyArmor = 0;
  let physicalRank = "";
  let energyRank = "";
  let isForceField = false;

  // Check equipment armor
  const armorItems = targetActor.items.filter(i => 
    i.type === "equipment" && 
    i.system.category === "armor" && 
    i.system.protection
  );
  
  if (armorItems.length > 0) {
    const bestArmor = armorItems.reduce((best, current) => {
      const bestVal = typeof best.system.protection === 'number' 
        ? best.system.protection 
        : (CONFIG.FASERIP?.rankValues?.[best.system.protection] || 0);
      const currVal = typeof current.system.protection === 'number'
        ? current.system.protection
        : (CONFIG.FASERIP?.rankValues?.[current.system.protection] || 0);
      return currVal > bestVal ? current : best;
    });
    
    // Store rank label if available
    if (typeof bestArmor.system.protection === 'string') {
      physicalRank = bestArmor.system.protection;
      energyRank = bestArmor.system.protection;
    }
    
    const armorValue = typeof bestArmor.system.protection === 'number'
      ? bestArmor.system.protection
      : (CONFIG.FASERIP?.rankValues?.[bestArmor.system.protection] || 0);
    
    physicalArmor = armorValue;
    energyArmor = Math.max(0, armorValue - 20);
    
    // Check for force field flag
    isForceField = bestArmor.system.isForceField === true;
  }

  // Check Body Armor powers
  const bodyArmorPowers = targetActor.items.filter(i => {
    if (i.type !== "power") return false;
    if (i.system.isBodyArmor === true) return true;
    
    const name = i.name.toLowerCase();
    return name.includes("body armor") || 
           name.includes("body armour") || 
           i.system.type?.toLowerCase().includes("body armor");
  });

  bodyArmorPowers.forEach(power => {
    const type = power.system.bodyArmorType || "both";
    
    // Check if this power is a force field
    if (power.system.isForceField === true) {
      isForceField = true;
    }
    
    let physVal = power.system.armorPhysical;
    let energyVal = power.system.armorEnergy;
    
    if (physVal === undefined || physVal === 0) {
      physVal = typeof power.system.value === 'number'
        ? power.system.value
        : (CONFIG.FASERIP?.rankValues?.[power.system.rank] || 0);
      
      // Store rank if available
      if (power.system.rank && !physicalRank) {
        physicalRank = power.system.rank;
      }
    }
    
    if (energyVal === undefined || energyVal === 0) {
      energyVal = Math.max(0, physVal - 20);
      
      if (power.system.rank && !energyRank) {
        const rankIdx = RANKS.indexOf(power.system.rank);
        if (rankIdx >= 0) {
          // Energy rank is typically 2 CS lower than physical
          const energyRankIdx = Math.max(0, rankIdx - 2);
          energyRank = RANKS[energyRankIdx];
        }
      }
    }
    
    if (type === "physical" || type === "both") {
      physicalArmor = Math.max(physicalArmor, physVal);
    }
    if (type === "energy" || type === "both") {
      energyArmor = Math.max(energyArmor, energyVal);
    }
  });

  const isEnergy = CONFIG.FASERIP?.isEnergyDamage?.(dmgTypeLower) ?? 
                   (dmgTypeLower && dmgTypeLower.includes("energy"));
  const applicable = isEnergy ? energyArmor : physicalArmor;

  console.log("FASERIP DEBUG | getBodyArmorValues result:", {
    targetName: targetActor.name,
    damageType,
    physicalArmor,
    energyArmor,
    physicalRank,
    energyRank,
    isForceField,
    isEnergy,
    applicable
  });

  // If ranks are missing, reverse-lookup from numeric values
/* if (!physicalRank && physicalArmor > 0) {
  physicalRank = game.msh.getClosestRank(physicalArmor) || "";
}
if (!energyRank && energyArmor > 0) {
  energyRank = game.msh.getClosestRank(energyArmor) || "";
}
 */

return {
  physical: physicalArmor,
  energy: energyArmor,
  physicalRank: physicalRank,
  energyRank: energyRank,
  applicable: applicable,
  isEnergyDamage: isEnergy,
  isForceField: isForceField
};

}

/**
 * Apply damage immediately using the classic mitigation pipeline.
 * Wraps CombatHandler.processAttack so both classic and refactor paths share one soak/HP codepath.
 *
 * @param {Object} opts
 * @param {Actor}  opts.sourceActor
 * @param {TokenDocument[]|Token[]} opts.targets
 * @param {number} opts.baseDamage            Raw damage before soak
 * @param {string} opts.damageType            e.g., "energy-generic", "physical-blunt", etc.
 * @param {string} [opts.sourceLabel]         For chat summaries
 * @param {boolean}[opts.forceKilling=false]  If you need to mark as killing attack
 * @returns {Promise<Array>}                  Per-target summaries: { targetId, name, absorbed, net, hpBefore, hpAfter }
 */
export async function applyDamageNow({
  sourceActor,
  targets = [],
  baseDamage = 0,
  damageType = "physical-blunt",
  sourceLabel = "Attack",
  forceKilling = false,
  wasKillResult = false,      // if the triggering roll was a Kill result
  attackForm = "blunt",
  bypassArmor = false,
  armorPiercing = 0,
  armorPiercingCS = 0,
  apMode = "value",
  showNotification = true
}) {
  try {
    const results = [];
    const dmgTypeLower = String(damageType || "physical-blunt").toLowerCase();
    const apVal = Number(armorPiercing || 0) || 0;
    const apCS  = Number(armorPiercingCS || 0) || 0;

    for (const t of (targets || [])) {
      // Normalize Token/TokenDocument → Actor
      const td = t?.document ? t.document : t;
      const targetActor = td?.actor || t?.actor;
      if (!targetActor) continue;

      // Mitigation (centralized rules)
      const m = calculateMitigation(baseDamage, targetActor, {
        damageType: dmgTypeLower,
        attackForm: String(attackForm || "blunt").toLowerCase(),
        bypassArmor: !!bypassArmor,
        armorPiercing: apVal,
        armorPiercingCS: apCS,
        apMode
      });

      const net      = Math.max(0, m?.netDamage || 0);
      const absorbed = Math.max(0, m?.absorbed   || 0);
      const hpBefore = targetActor.system?.attributes?.health?.value ?? 0;
      const hpAfter  = Math.max(0, hpBefore - net);

      if (net > 0) {
        const update = { "system.attributes.health.value": hpAfter };

        if (game.user.isGM || targetActor.isOwner) {
          await targetActor.update(update);
        } else if (game.msh?.runAsGM) {
          await game.msh.runAsGM({ operation: "update", targetActorUuid: targetActor.uuid, args: [update] });
        } else {
          if (showNotification) ui.notifications.warn("Couldn't update Health: no GM helper available.");
        }

        // 0-Health rule (supports Four-Color toggle)
        if (hpAfter === 0 && hpBefore > 0) {
          const fourColor = game.settings.get("msh-faserip", "fourColorRule");
          const lethal = wasKillResult || forceKilling;
          if (!fourColor || lethal) {
            await postDeathSavePrompt(targetActor);
          } else {
            await ChatMessage.create({
              content: `<div style="background:#e3f2fd;border:1px solid #2196F3;padding:8px;border-radius:3px;">
                <strong>${targetActor.name}</strong> is unconscious (0 Health).
                <div style="font-size:0.9em;color:#666;margin-top:4px;">Four-Color Rule: No death save (non-lethal).</div>
              </div>`
            });
          }
        }

        if (showNotification) {
          const armorNote = absorbed > 0 ? ` (${baseDamage} - ${absorbed} Body Armor)` : "";
          ui.notifications.info(`${targetActor.name} took ${net} damage${armorNote}. Health: ${hpBefore} → ${hpAfter}`);
        }
      } else if (showNotification) {
        ui.notifications.info(`${targetActor.name}'s Body Armor (${absorbed}) absorbed all ${baseDamage} damage.`);
      }

      results.push({
        actorUuid: targetActor?.uuid ?? null,     // works for base actors or token actors
        tokenUuid: targetToken?.document?.uuid ?? targetToken?.uuid ?? null, // if you have token
        name: targetActor?.name ?? "Target",
        hpBefore,
        hpAfter,
        absorbed,
        net
      });
    }

    debugLog("applyDamageNow (refactor path)", { count: results.length, sourceLabel, damageType: dmgTypeLower });
    return results;
  } catch (err) {
    console.error("applyDamageNow error:", err);
    return [];
  }
}


/**
 * Get resistance modifiers for a target actor
 * @param {Actor} targetActor - The actor being hit
 * @param {string} damageType - Type of damage (e.g., "energy-fire", "physical-blunt")
 * @returns {Object} { csBonus, damageReduction, hasImmunity, resistancePowers }
 */
export function getResistanceModifiers(targetActor, damageType = "physical-blunt") {
  const dmgTypeLower = String(damageType || "physical-blunt").toLowerCase();
  // Extract base resistance type (e.g., "fire" from "energy-fire")
  let baseType = dmgTypeLower;  // ✅ Use normalized version
  if (dmgTypeLower?.includes("-")) {  // ✅ Use normalized version
    baseType = dmgTypeLower.split("-")[1];  // ✅ Use normalized version
  }
  
  // Find relevant resistance powers
  const resistances = targetActor.items.filter(i => {
    if (i.type !== "power") return false;
    
    // NEW WAY: Check explicit isResistance flag and match type
    if (i.system.isResistance === true) {
      return i.system.resistanceType === baseType;
    }
    
    // LEGACY FALLBACK: Category-based detection
    const cat = String(i.system.category || "").toLowerCase();
    if (cat === "resistances") {
      const typ = String(i.system.type || "").toLowerCase();
      return typ.includes(baseType);
    }
    
    return false;
  });

  let totalCSBonus = 0;
  let totalDamageReduction = 0;
  let hasImmunity = false;

  resistances.forEach(res => {
    const effect = res.system.resistanceEffect || "columnShift";
    
    if (effect === "immunity") {
      hasImmunity = true;
    } else if (effect === "columnShift") {
      totalCSBonus += res.system.resistanceValue || 2;
    } else if (effect === "damageReduction") {
      totalDamageReduction += res.system.resistanceValue || 0;
    }
  });

  return {
    csBonus: totalCSBonus,
    damageReduction: totalDamageReduction,
    hasImmunity: hasImmunity,
    resistancePowers: resistances,
    damageType: damageType,
    baseType: baseType
  };
}

/**
 * Check if target is immune to damage type based on resistance powers
 * @param {Actor} targetActor - The actor being hit
 * @param {string} damageType - Type of damage
 * @param {number} attackRank - Rank value of the attack
 * @returns {boolean} True if immune
 */
export function checkImmunity(targetActor, damageType, attackRank) {
  const resistance = getResistanceModifiers(targetActor, damageType);
  
  if (!resistance.hasImmunity) return false;
  
  // Check if any immunity power has rank >= attack rank
  for (const resPower of resistance.resistancePowers) {
    if (resPower.system.resistanceEffect === "immunity") {
      const resRank = typeof resPower.system.value === 'number'
        ? resPower.system.value
        : (CONFIG.FASERIP?.rankValues?.[resPower.system.rank] || 0);
      
      if (resRank >= attackRank) {
        return true; // Immune!
      }
    }
  }
  
  return false;
}

/**
 * Apply the Nullified status to a single target via your effects system.
 * Duration: RAW 1–10 rounds unless the attacker is maintaining a Nullify aura.
 */
export async function applyNullifyToTarget(targetActor, attacker, { originUuid = null, rounds = null } = {}) {
  if (!targetActor) return;
  const maintained = isAuraMaintained(attacker);
  await applyNullifiedEffect(targetActor, { maintained, originUuid, rounds });
}


/**
 * Post a chat card prompting for a death save when a character hits 0 Health
 */
export async function postDeathSavePrompt(actor) {
  const content = `
    <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
      <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
        <strong>${actor.name} - Health Collapsed</strong>
      </div>
      
      <div style="padding:5px 10px;font-size:.9em;">
        <div style="color:#c62828;font-weight:bold;">Health: 0</div>
        <div style="margin-top:4px;">Character is unconscious and must roll an Endurance FEAT vs the Kill column to determine if they are dying.</div>
      </div>

      <div style="text-align:center;padding:8px;margin:8px 10px;">
        <a class="faserip-chip" 
           data-action="death-save"
           data-actor-uuid="${actor.uuid}"
           style="display:inline-block;font-size:13px;font-weight:bold;padding:6px 14px;border:1px solid #c62828;border-radius:3px;background:#fff;color:#c62828;text-decoration:none;cursor:pointer;">
          Roll Death Save
        </a>
      </div>
    </div>
  `;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: content
  });
}

// === [PREVIEW CONFIRM HELPERS] =============================================
//
// Centralized helpers for the optional post-roll "Preview → Confirm" gate.
// Used by actions in Semi-Auto / Manual when opts.showConfirm && !opts.autoApply
//
// Usage in an action file (after computing roll/color/damage, before posting):
//   import { shouldConfirm, buildPreviewHtml, confirmPreview } from "./action-utils.js";
//   if (shouldConfirm(this?.opts)) {
//     const html = buildPreviewHtml({ actorName, actionName, rollTotal, resultColor, column, colShift, baseDamage, finalDamage, extras: [...] });
//     const ok = await confirmPreview({ title: "Preview — <Action Name>", contentHtml: html });
//     if (!ok) return;
//   }

export function shouldConfirm(opts) {
  return Boolean(opts && opts.showConfirm === true && opts.autoApply === false);
}

/**
 * Build a compact preview grid.
 * @param {Object} p
 * @param {string} p.actorName
 * @param {string} p.actionName
 * @param {number|string} p.rollTotal
 * @param {string} p.resultColor   // "white"|"green"|"yellow"|"red"
 * @param {string} p.column        // e.g., "Remarkable" (or a number/index string)
 * @param {string} p.colShift      // e.g., "+1 CS", "-2 CS", "0 CS"
 * @param {number|string} p.baseDamage
 * @param {number|string} p.finalDamage
 * @param {Array<{label:string,value:string|number}>} p.extras
 */
export function buildPreviewHtml({
  actorName,
  actionName,
  rollTotal,
  resultColor,
  column,
  colShift,
  baseDamage,
  finalDamage,
  extras = []
} = {}) {
  const rows = [
    { label: "Roll total",   value: rollTotal ?? "—" },
    { label: "Result color", value: (resultColor ?? "—").toString() },
    { label: "Column",       value: column ?? "—" },
    { label: "CS",           value: colShift ?? "—" },
    { label: "Raw damage",   value: baseDamage ?? "—" },
    { label: "After armor",  value: finalDamage ?? "—" },
    ...extras
  ];

  const grid = rows.map(r => `
    <div style="color:#666;">${r.label}</div>
    <div>${r.value}</div>
  `).join("");

  return `
    <div style="font-family:var(--font-primary);line-height:1.3;">
      <div style="font-weight:600;margin-bottom:6px;">${actorName ?? ""} — ${actionName ?? ""}</div>
      <div style="display:grid;grid-template-columns:140px 1fr;gap:6px;">${grid}</div>
      <div style="margin-top:8px;color:#666;font-size:.9em;">Confirm to post the action card.</div>
    </div>
  `;
}

/**
 * Show a standard confirm dialog. Returns true if confirmed.
 * @param {Object} p
 * @param {string} p.title
 * @param {string} p.contentHtml
 * @returns {Promise<boolean>}
 */
export async function confirmPreview({ title = "Preview", contentHtml }) {
  return await Dialog.confirm({
    title,
    content: contentHtml,
    yes: () => true,
    no: () => false,
    defaultYes: true
  });
}

/**
 * Build HTML for the multi-attack section
 * @param {string} actionType - Type of action (e.g., "blunt-attack", "energy", "shooting")
 * @param {number} targetCount - Number of targets selected
 * @param {boolean} multiAttacks - Whether multi-attacks is enabled
 * @param {number} attackCount - Number of attacks (2 or 3)
 * @param {boolean} multiAdjacent - Whether attacking multiple adjacent targets
 * @returns {string} HTML for the multi-attack section
 */
export function buildMultiAttackSection(actionType, targetCount, multiAttacks = false, attackCount = 2, multiAdjacent = false) {
  const canUseAdjacent = ["blunt-attack", "energy", "force"].includes(actionType);
  
  return `
    <div style="margin:6px 0;padding:6px;background:#e8f5e9;border:1px solid #4caf50;border-radius:3px;">
      <div style="font-weight:600;margin-bottom:6px;color:#2e7d32;">Multiple Targets/Attacks</div>
      
      ${canUseAdjacent ? `
        <div style="margin-bottom:6px;">
          <label style="font-size:.9em;">
            <input type="checkbox" name="multiAdjacent" ${multiAdjacent ? 'checked' : ''}>
            Attack all adjacent targets (-4 CS, single roll)
          </label>
          <div style="font-size:.8em;color:#555;font-style:italic;margin-left:20px;">
            One attack roll affects all adjacent enemies
          </div>
        </div>
      ` : ''}
      
      <div style="margin-bottom:4px;${canUseAdjacent ? 'border-top:1px solid #c8e6c9;padding-top:6px;' : ''}">
        <label style="font-size:.9em;">
          <input type="checkbox" name="multiAttacks" ${multiAttacks ? 'checked' : ''}>
          Multiple attacks: 2 or 3 separate attacks (-1 CS each)
        </label>
      </div>
      
      <div id="multi-attack-options" style="display:${multiAttacks ? 'block' : 'none'};margin-left:20px;padding:4px 0;">
      <div style="margin-bottom:4px;">
        <label style="font-size:.9em;display:block;margin-bottom:2px;">Number of Attacks:</label>
        <label style="font-size:.85em;margin-right:12px;">
          <input type="radio" name="attackCount" value="2" ${attackCount === 2 ? 'checked' : ''}>
          2 attacks (Remarkable FEAT)
        </label>
        <label style="font-size:.85em;">
          <input type="radio" name="attackCount" value="3" ${attackCount === 3 ? 'checked' : ''}>
          3 attacks (Amazing FEAT)
        </label>
      </div>
      
      <!-- ADD THIS SECTION -->
      <div style="margin-top:6px;border-top:1px solid #c8e6c9;padding-top:4px;">
        <span class="multi-attack-info-toggle" style="font-size:.8em;color:#2e7d32;cursor:pointer;user-select:none;">
          ℹ️ How are attacks distributed? <span style="font-size:.7em;">(click)</span>
        </span>
        <div class="multi-attack-info" style="display:none;margin-top:4px;padding:6px;background:#f1f8e9;border-radius:3px;font-size:.75em;color:#555;">
          <div style="font-weight:600;margin-bottom:3px;">Attack Distribution:</div>
          <div>• 1 target: All attacks hit that target</div>
          <div>• Multiple targets: Attacks distributed round-robin</div>
          <div style="margin-top:3px;font-style:italic;">
            Examples: 3 attacks/2 targets = 2+1 hits, 3 attacks/3 targets = 1+1+1 hits
          </div>
        </div>
      </div>
      
      <div style="font-size:.8em;color:#555;font-style:italic;margin-top:4px;">
        Requires Fighting FEAT. If failed: 1 attack at -3CS
      </div>
    </div>
  `;
}

/**
 * Setup event handlers for multi-attack checkboxes
 * @param {jQuery} html - The jQuery-wrapped HTML element
 */
export function setupMultiAttackHandlers(html) {
  const $multiAttacks = html.find('[name="multiAttacks"]');
  const $multiAdjacent = html.find('[name="multiAdjacent"]');
  const $multiOptions = html.find('#multi-attack-options');
  
  // Toggle multi-attack options visibility
  if ($multiAttacks.length && $multiOptions.length) {
    $multiAttacks.on('change', function() {
      if ($(this).is(':checked')) {
        $multiOptions.slideDown(200);
        if ($multiAdjacent.length) $multiAdjacent.prop('checked', false);
      } else {
        $multiOptions.slideUp(200);
      }
    });
  }
  
  // Make adjacent mutually exclusive with multi-attacks
  if ($multiAdjacent.length && $multiAttacks.length) {
    $multiAdjacent.on('change', function() {
      if ($(this).is(':checked')) {
        $multiAttacks.prop('checked', false);
        $multiOptions.slideUp(200);
      }
    });
  }
  
  // Toggle info section
  html.find('.multi-attack-info-toggle').on('click', function(e) {
    e.preventDefault();
    html.find('.multi-attack-info').slideToggle(200);
  });
}
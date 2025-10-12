import { ACTION_LABELS, ACTION_EFFECTS } from "./action-config.js";

export const RANKS = [
  "Shift-0","Feeble","Poor","Typical","Good","Excellent",
  "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
  "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
];

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
export function buildResultGrid(actionType, activeColorLower, effects, hoverFn) {
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
// In action-utils.js, update buildActionsBox signature:
export function buildActionsBox({
  showSlam = false,
  showStun = false,
  showKill = false,            // NEW: for edged / kill-capable actions
  pulled = false,
  breakingFeat = null,
  actorUuid,
  damage = 0,
  attackForm = "blunt"         // NEW: "blunt" | "edged" | "shooting" | etc.
}) {
  const chip = (label, title, enabled, dataAttrs = "") => {
    const base = "display:inline-block;font-size:12px;line-height:1.1;padding:2px 6px;border:1px solid #bbb;border-radius:3px;text-decoration:none;white-space:nowrap;";
    const style = enabled
      ? `${base}background:#fff;color:#333;cursor:pointer;`
      : `${base}background:#f7f7f7;color:#333;cursor:not-allowed;opacity:.55;filter:grayscale(.3);`;
    const key = label.toLowerCase().replace(/\s+/g, "-");
    return `<a class="faserip-chip" data-action="${key}" ${dataAttrs} ${enabled ? "" : 'aria-disabled="true"'} title="${title}" style="${style}">${label}</a>`;
  };

  const parts = [
    chip("Apply Damage", "Placeholder: apply damage manually to the target(s).", false)
  ];

  if (showSlam) parts.push(chip(
    "Resolve Slam",
    "Open Slam dialog",
    true,
    `data-check="slam" data-attack-form="${attackForm}" data-dmg="${damage}" data-attacker-uuid="${actorUuid}"`
  ));

  if (showStun) parts.push(chip(
    "Resolve Stun",
    "Open Stun dialog",
    true,
    `data-check="stun" data-attack-form="${attackForm}" data-dmg="${damage}" data-attacker-uuid="${actorUuid}"`
  ));

  if (showKill) parts.push(chip(
    "Resolve Kill",
    "Open Kill dialog",
    true,
    `data-check="kill" data-attack-form="${attackForm}" data-dmg="${damage}" data-attacker-uuid="${actorUuid}"`
  ));

  if (pulled) parts.push(chip(
    "Pull Options",
    "Placeholder: adjust for pulled punch.",
    false
  ));

  if (breakingFeat) {
    parts.push(chip(
      "Breaking FEAT",
      "Roll a Breaking FEAT: compare weapon material vs target armor/material (or wielder STR).",
      true,
      `data-action="breaking-feat" data-weapon-mat="${breakingFeat.weaponMat}" data-actor-uuid="${actorUuid}"`
    ));
  }

  return `
    <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;padding:8px 10px;margin:6px 10px 10px;border:1px solid #c0c0c0;background:#fafafa;border-radius:4px;">
      ${parts.join("\n")}
    </div>
    ${breakingFeat ? `<div style="padding:0 10px 8px;font-size:.8em;color:#666;">Note: If weapon Material &lt; target Armor/Material, a Breaking FEAT may apply.</div>` : "" }
  `;
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


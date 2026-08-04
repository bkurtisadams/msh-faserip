// equipment-action-dialog.js v1.7.1 - 2026-08-02
// v1.7.1: MECHANIC_LABEL gains "Stun" → STUN chip (stun-weapon primary attack
//         buttons rendered with an empty mechanic tag).
// equipment-action-dialog.js v1.7.0 - 2026-06-12
// v1.7.0: Suppress the standalone "Intensity Attack" button when the item has an
//         attack action — the intensity now rides the hit (attack-action
//         _applyIntensityOnHit). Pure intensity items (no attack) still show it.
// equipment-action-dialog.js v1.6.0 - 2026-06-12
// v1.6.0: Refine skip-hub: pass straight to the attack dialog when there is
//         exactly one ROLLABLE action, even alongside Reload (which has its own
//         .reload-weapon button on the row). Removes the double dialog for ammo
//         weapons. Toggle/template still keep the hub; multi-mode weapons too.
// v1.5.1 - 2026-06-11
// v1.5.1: Any weapon-category item now always offers an Attack action. The gate
//         previously required attackType/damageType/weaponType to be set, so a
//         half-configured weapon (all blank) silently offered no attack at all.
//         _resolveAttackType() supplies a fallback (defaults to "shooting").
// v1.5.0: Chain Resistance FEAT after attack-mode damage when the active mode declares a
//         resistRank. After the primary attack ActionDispatcher.roll resolves, dispatch
//         IntensityAction with the same attackMode passed via opts. The intensity dialog
//         is gated by its own "Use" button so the player can cancel if the attack missed.
//         Powers e.g. Air Pistol: Laughing Gas (Incredible vs Psyche), Paralysis Gas
//         (Remarkable vs Endurance), Gravity Enhancer (Excellent vs Strength).
// v1.4.0: Redesign action picker dialog (.frp-dlg structure matching Contact/Talent).
//         Adds: header banner with category chip, compressed stat-chip strip,
//         collapsible description, action buttons grouped by Combat/Powers/State,
//         right-side mechanic tag per button, low-ammo warning on Reload,
//         consolidated device function chip ("FUNCTIONS: N").
// v1.3.0: Skip hub when the item has exactly one rollable action and nothing else
//         (no toggle, reload, or template). Items with multiple rollable actions —
//         or any combination of rollable + state-change actions — still show the hub.
//         Passing the single-action case through directly removes a wasted click for
//         plain weapons (sword → click → attack dialog, no intermediate hub).
// v1.2.0: Attack modes no longer replace the primary attack — they are additional buttons.
//         Previously, a spear with Haft/Thrown modes lost its primary Edged Attack entirely.
//         Primary button now labels by resolved attack type (e.g. "Edged") when modes exist.
// v1.1.0: Route Device custom abilities through ActionDispatcher combat pipeline.
//         Custom abilities with damageType resolve to proper attack actions (BA→blunt, EA→edged, E→energy, etc).
//         Custom abilities without damageType use standalone FEAT roller (teleportation, utility, etc).
//         Add Granted Powers (sys.powers) to action button list.
//         Improve button icons/labels with rank and damage type info.
// v1.0.0: Unified equipment action hub. Inspects item fields and presents contextual action buttons.
//         Replaces fragmented click handlers with a single dialog opened from the equipment roll button.
import { AreaTemplate } from "./area-template.js";
import { getTargetData } from "./action-utils.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";

// ── Display config ──
// Reload button highlights yellow when shotsRemaining/shots ≤ this fraction.
// Empty (0/N) gets stronger red treatment.
const LOW_AMMO_THRESHOLD = 0.25;

// Mechanic-tag label per damageType code (right-side chip on Combat buttons).
const MECHANIC_LABEL = {
  "BA": "BLUNT", "EA": "EDGED", "S": "SHOOTING", "E": "ENERGY", "F": "FORCE",
  "TE": "THROW", "TB": "THROW", "GP": "GRAPPLE", "Gb": "GRAB", "Stun": "STUN"
};

// ── Action grouping ──
// Each action gets a `group`: "combat" | "powers" | "state". Determined at
// push-time. Groups render as headed sections in buildActionButtons.
const GROUP_LABELS = { combat: "Combat", powers: "Powers", state: "State" };
const GROUP_ORDER  = ["combat", "powers", "state"];

// Determine which action buttons to show based on item data
function getAvailableActions(item, actor) {
  const actions = [];
  const sys = item.system || {};
  const cat = (sys.category || "").toLowerCase();
  const hasTransferEffects = item.effects?.some(e => e.transfer);
  const anyEffectActive = item.effects?.some(e => e.transfer && !e.disabled);

  // ── Attack (weapon categories route to ActionDispatcher) ──
  // Primary attack is derived from top-level damageType/attackType/weaponType.
  // Attack modes (below) are ADDITIONAL named alternatives, not replacements.
  const modes = Array.isArray(sys.attackModes) ? sys.attackModes.filter(m => m?.name) : [];
  // Any weapon-category item offers an attack. Previously this required at least
  // one of attackType/damageType/weaponType to be set, so a half-configured
  // weapon (all three blank) silently offered NO attack. _resolveAttackType()
  // supplies a sane fallback (defaults to "shooting") when the fields are empty.
  if (cat === "weapon") {
    const primaryLabel = modes.length ? _primaryAttackLabel(item) : "Attack";
    actions.push({
      id: "attack",
      group: "combat",
      label: primaryLabel,
      icon: "fas fa-crosshairs",
      color: "#c62828"
    });
  }

  // ── Attack Modes (multi-mode weapons) — appended as additional attacks ──
  for (let i = 0; i < modes.length; i++) {
    actions.push({
      id: `attack-mode-${i}`,
      group: "combat",
      label: modes[i].name,
      icon: "fas fa-crosshairs",
      color: "#c62828",
      modeIndex: i
    });
  }

  // ── Grenade ──
  if (cat === "other" && sys.weaponType === "grenade") {
    actions.push({
      id: "grenade",
      group: "combat",
      label: "Throw Grenade",
      icon: "fas fa-bomb",
      color: "#e65100"
    });
  }

  // ── Missile ──
  if (cat === "other" && sys.weaponType === "missile") {
    actions.push({
      id: "missile",
      group: "combat",
      label: "Launch Missile",
      icon: "fas fa-rocket",
      color: "#e65100"
    });
  }

  // ── Toggle On/Off (transfer effects OR items with duration) ──
  const hasDuration = Number(sys.duration) > 0;
  if (hasTransferEffects || hasDuration) {
    const isActive = anyEffectActive;
    actions.push({
      id: "toggle",
      group: "state",
      label: isActive ? "Turn Off" : "Turn On",
      icon: "fas fa-power-off",
      color: isActive ? "#c62828" : "#2e7d32",
      active: isActive
    });
  }

  // ── Intensity Attack (standalone) ──
  // Suppressed when the weapon already offers an attack: in that case the
  // intensity rides the hit (attack-action _applyIntensityOnHit) rather than
  // being a separate FEAT button. Pure intensity items (no attack action —
  // e.g. a gas sprayer) still show the standalone button.
  const _hasAttackAction = actions.some(a => a.id === "attack" || a.id.startsWith("attack-mode"));
  if (sys.intensityRank && !_hasAttackAction) {
    actions.push({
      id: "intensity",
      group: "combat",
      label: "Intensity Attack",
      icon: "fas fa-radiation",
      color: "#e65100"
    });
  }

  // ── Place Template (area effect — only explicit areaRadius, not grenadeRadius) ──
  const areaRadius = Number(sys.areaRadius) || 0;
  if (areaRadius > 0) {
    actions.push({
      id: "template",
      group: "state",
      label: `Place Template (${areaRadius} area${areaRadius > 1 ? "s" : ""})`,
      icon: "fas fa-bullseye",
      color: "#1565c0"
    });
  }

  // ── Stun/Gas (stunIntensity without a regular attack) ──
  if (sys.stunIntensity && !actions.some(a => a.id === "attack" || a.id.startsWith("attack-mode"))) {
    actions.push({
      id: "stun-intensity",
      group: "combat",
      label: `Stun/Gas (${sys.stunIntensity})`,
      icon: "fas fa-cloud",
      color: "#6a1b9a"
    });
  }

  // ── Throw (melee weapons with throwable flag) ──
  if (sys.throwable && cat === "weapon") {
    actions.push({
      id: "throw",
      group: "combat",
      label: "Throw",
      icon: "fas fa-location-arrow",
      color: "#ef6c00"
    });
  }

  // ── Custom Abilities ──
  const customs = Array.isArray(sys.customAbilities) ? sys.customAbilities.filter(a => a?.name) : [];
  for (let i = 0; i < customs.length; i++) {
    const ca = customs[i];
    const isCombat = !!ca.damageType;
    const { icon: caIcon, color: caColor } = _damageTypePresentation(ca.damageType);
    const rankTag = ca.rank ? ` (${ca.rank})` : "";
    actions.push({
      id: `custom-${i}`,
      group: isCombat ? "combat" : "powers",
      label: `${ca.name}${rankTag}`,
      icon: caIcon,
      color: caColor,
      customIndex: i
    });
  }

  // ── Granted Powers ──
  const powers = Array.isArray(sys.powers) ? sys.powers.filter(p => p?.name) : [];
  for (let i = 0; i < powers.length; i++) {
    const pw = powers[i];
    const { icon: pwIcon, color: pwColor } = _damageTypePresentation(pw.damageType);
    const rankTag = pw.rank ? ` (${pw.rank})` : "";
    actions.push({
      id: `power-${i}`,
      group: pw.damageType ? "combat" : "powers",
      label: `${pw.name}${rankTag}`,
      icon: pwIcon,
      color: pwColor,
      powerIndex: i
    });
  }

  // ── Device Functions (new unified system — takes priority over legacy custom/powers) ──
  const devFns = Array.isArray(sys.deviceFunctions) ? sys.deviceFunctions.filter(f => f?.name) : [];
  if (devFns.length > 0) {
    // Remove any legacy custom/power buttons we just added — deviceFunctions replaces them
    for (let i = actions.length - 1; i >= 0; i--) {
      if (actions[i].id.startsWith("custom-") || actions[i].id.startsWith("power-")) {
        actions.splice(i, 1);
      }
    }
    for (let i = 0; i < devFns.length; i++) {
      const fn = devFns[i];
      if (fn.type === "buff" || fn.type === "defense") continue; // Not rollable from action dialog
      const { icon: fnIcon, color: fnColor } = fn.type === "attack"
        ? _damageTypePresentation(fn.damageType)
        : { icon: "fas fa-star", color: "#5d4037" };
      const rankTag = fn.rank ? ` (${fn.rank})` : "";
      actions.push({
        id: `devfn-${i}`,
        group: fn.type === "attack" ? "combat" : "powers",
        label: `${fn.name}${rankTag}`,
        icon: fnIcon,
        color: fnColor,
        devFnIndex: i
      });
    }
  }

  // ── Power Item roll ──
  if (cat === "power-item" && sys.powerRank) {
    actions.push({
      id: "power-item",
      group: "combat",
      label: "Use Power",
      icon: "fas fa-bolt",
      color: "#6a1b9a"
    });
  }

  // ── Reload (weapon with shots) ──
  const shots = Number(sys.shots);
  const remaining = Number(sys.shotsRemaining);
  if (shots > 0 && Number.isFinite(remaining) && remaining < shots) {
    actions.push({
      id: "reload",
      group: "state",
      label: "Reload",
      icon: "fas fa-sync-alt",
      color: "#666"
    });
  }

  return actions;
}

// Build stat summary HTML based on item category
// Stat chip strip — single horizontal row of compact "LABEL value" chips.
// Shots chip color-tints by remaining ratio (full = neutral, partial = amber,
// low/empty = red).
function buildStatSummary(item) {
  const sys = item.system || {};
  const cat = (sys.category || "").toLowerCase();
  const chips = [];

  // chip(label, value, tint?) — tint: undefined | "amber" | "red"
  const chip = (label, value, tint) => {
    if (value === undefined || value === null || value === "" || value === 0 || value === "0") return;
    const valColor = tint === "red" ? "#c62828" : tint === "amber" ? "#f57f17" : "#1a1a1a";
    const valWeight = tint ? "700" : "600";
    chips.push(`<span style="padding:2px 6px;background:#faf8f2;border:1px solid #d8cfb8;border-radius:2px;font-size:11px;white-space:nowrap;"><span style="font-family:'Oswald',sans-serif;color:#6a0000;letter-spacing:0.4px;font-size:10px;margin-right:3px;">${label}</span><strong style="color:${valColor};font-weight:${valWeight};">${value}</strong></span>`);
  };

  if (cat === "weapon" || cat === "other") {
    chip("RNG", sys.range || (sys.grenadeRadius ? `${sys.grenadeRadius}a radius` : ""));
    const dmgVal = sys.damage || sys.grenadeDamage || sys.missileDamage;
    const dmgType = sys.damageType || sys.grenadeDamageType || sys.missileDamageType;
    if (dmgVal) chip("DMG", dmgType ? `${dmgVal} (${dmgType})` : dmgVal);
    chip("RATE", sys.rate);

    const shots = Number(sys.shots);
    const rem = Number(sys.shotsRemaining);
    if (shots > 0) {
      const remDisplay = Number.isFinite(rem) ? rem : shots;
      const ratio = Number.isFinite(rem) ? rem / shots : 1;
      let shotsTint;
      if (remDisplay === 0) shotsTint = "red";
      else if (ratio <= LOW_AMMO_THRESHOLD) shotsTint = "red";
      else if (ratio < 1) shotsTint = "amber";
      chip("SHOTS", `${remDisplay}/${shots}`, shotsTint);
    }
  }

  if (cat === "armor") {
    chip("PROT", sys.protection);
    chip("COV", sys.coverage);
  }

  if (cat === "power-item") {
    chip("RANK", sys.powerRank);
    chip("PTYPE", sys.powerType);
    chip("RNG", sys.powerRange);
  }

  if (cat === "device" || cat === "custom") {
    const dfns = Array.isArray(sys.deviceFunctions) ? sys.deviceFunctions.filter(f => f?.name) : [];
    if (dfns.length > 0) {
      chip("FUNCTIONS", dfns.length);
    } else {
      const cas = Array.isArray(sys.customAbilities) ? sys.customAbilities.filter(a => a?.name) : [];
      const pws = Array.isArray(sys.powers) ? sys.powers.filter(p => p?.name) : [];
      const total = cas.length + pws.length;
      if (total > 0) chip("FUNCTIONS", total);
    }
  }

  // Always show material strength last so it doesn't crowd the primary stats.
  chip("MAT", sys.materialStrength);

  if (sys.intensityRank) chip("INT", sys.intensityRank);
  if (sys.areaRadius) chip("AREA", `${sys.areaRadius}a`);

  const dur = Number(sys.duration);
  if (dur > 0) {
    const unit = sys.durationUnit || "hour";
    chip("DUR", `${dur}${unit.charAt(0)}`);
  }

  if (!chips.length) return "";

  return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">${chips.join("")}</div>`;
}

// Build action button HTML
// Resolve the right-side mechanic tag for an action (e.g. "SHOOTING").
// Returns "" when no mechanic should be shown (state actions, generic powers).
function _resolveMechanicTag(action, item) {
  const sys = item.system || {};
  const id = action.id;

  if (id === "attack") {
    // Primary attack — derive from item's damageType / weaponType.
    const dt = sys.damageType;
    return MECHANIC_LABEL[dt] || "";
  }
  if (id.startsWith("attack-mode-")) {
    const idx = action.modeIndex;
    const mode = sys.attackModes?.[idx];
    return MECHANIC_LABEL[mode?.damageType] || "";
  }
  if (id.startsWith("custom-")) {
    const idx = action.customIndex;
    const ca = sys.customAbilities?.[idx];
    return ca?.damageType ? (MECHANIC_LABEL[ca.damageType] || "") : "POWER";
  }
  if (id.startsWith("power-") && !id.startsWith("power-item")) {
    const idx = action.powerIndex;
    const pw = sys.powers?.[idx];
    return pw?.damageType ? (MECHANIC_LABEL[pw.damageType] || "") : "POWER";
  }
  if (id.startsWith("devfn-")) {
    const idx = action.devFnIndex;
    const fn = sys.deviceFunctions?.[idx];
    if (fn?.type === "attack") return MECHANIC_LABEL[fn.damageType] || "";
    return "POWER";
  }
  if (id === "grenade")        return "THROW";
  if (id === "missile")        return "MISSILE";
  if (id === "throw")          return "THROW";
  if (id === "intensity")      return "INTENSITY";
  if (id === "stun-intensity") return "STUN";
  if (id === "power-item")     return "POWER";
  // State actions (toggle, reload, template) — no mechanic tag.
  return "";
}

// Reload tinting: derived from shotsRemaining/shots ratio. Only the Reload
// button is treated specially; other state actions render plain.
function _reloadTint(item) {
  const sys = item.system || {};
  const shots = Number(sys.shots);
  const rem = Number(sys.shotsRemaining);
  if (!(shots > 0 && Number.isFinite(rem))) return null;
  if (rem === 0) return { bg: "#ffebee", border: "#ef9a9a", color: "#c62828", note: "EMPTY" };
  if (rem / shots <= LOW_AMMO_THRESHOLD) return { bg: "#fff8e1", border: "#ffcc80", color: "#f57f17", note: "LOW AMMO" };
  return null;
}

// Toggle tinting: green when off (action label "Turn On"), red when on.
function _toggleTint(action) {
  if (action.active) return { bg: "#fff5f5", border: "#ef9a9a", color: "#c62828", note: "" };
  return { bg: "#e8f5e9", border: "#a5d6a7", color: "#2e7d32", note: "" };
}

function buildActionButtons(actions, item) {
  if (!actions.length) {
    return `<div style="color:#888;font-style:italic;padding:8px;font-size:12px;">No actions available for this item.</div>`;
  }

  // Bucket by group, preserving insertion order within each.
  const buckets = { combat: [], powers: [], state: [] };
  for (const a of actions) {
    const g = a.group && buckets[a.group] ? a.group : "combat";
    buckets[g].push(a);
  }

  const renderButton = (a) => {
    const dataAttrs = [
      `data-action-id="${a.id}"`,
      a.modeIndex !== undefined ? `data-mode-index="${a.modeIndex}"` : "",
      a.customIndex !== undefined ? `data-custom-index="${a.customIndex}"` : "",
      a.powerIndex !== undefined ? `data-power-index="${a.powerIndex}"` : "",
      a.devFnIndex !== undefined ? `data-devfn-index="${a.devFnIndex}"` : ""
    ].filter(Boolean).join(" ");

    // Per-button styling overrides for state-action highlights
    let btnBg = "#fff", btnBorder = "#c0a070", labelColor = "#1a1a1a";
    let stateNote = "", stateNoteColor = "#777";

    if (a.id === "reload") {
      const tint = _reloadTint(item);
      if (tint) {
        btnBg = tint.bg; btnBorder = tint.border;
        stateNote = `⚠ ${tint.note}`; stateNoteColor = tint.color;
      }
    } else if (a.id === "toggle") {
      const tint = _toggleTint(a);
      btnBg = tint.bg; btnBorder = tint.border; labelColor = tint.color;
    }

    const mechanic = _resolveMechanicTag(a, item);
    const tagHTML = mechanic
      ? `<span style="font-size:10px;color:${stateNote ? stateNoteColor : "#777"};font-family:'Oswald',sans-serif;letter-spacing:0.4px;">${mechanic}</span>`
      : (stateNote
          ? `<span style="font-size:10px;color:${stateNoteColor};font-family:'Oswald',sans-serif;letter-spacing:0.4px;font-weight:700;">${stateNote}</span>`
          : "");

    return `<button type="button" class="equip-action-btn" ${dataAttrs}
      style="display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;margin-bottom:3px;
             border:1px solid ${btnBorder};border-radius:3px;background:${btnBg};cursor:pointer;
             font-family:inherit;font-size:13px;text-align:left;">
      <i class="${a.icon}" style="color:${a.color};width:16px;text-align:center;"></i>
      <span style="flex:1;font-weight:600;color:${labelColor};">${a.label}</span>
      ${tagHTML}
    </button>`;
  };

  const sections = GROUP_ORDER.map(g => {
    const list = buckets[g];
    if (!list.length) return "";
    return `<div style="margin-bottom:6px;">
      <div style="font-family:'Oswald',sans-serif;font-size:10px;color:#6a0000;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:3px;">${GROUP_LABELS[g]}</div>
      ${list.map(renderButton).join("")}
    </div>`;
  }).join("");

  return sections;
}

/**
 * Open the Equipment Action Dialog for an item.
 * Called from the actor sheet equipment-roll click handler.
 */
export async function openEquipmentActionDialog(actor, item) {
  if (!actor || !item) return;

  const actions = getAvailableActions(item, actor);

  // Skip-hub shortcut. Dispatch straight to the attack dialog when the item has
  // exactly one ROLLABLE action, even if state-change actions also exist — as
  // long as those state-change actions are reachable elsewhere. Reload has its
  // own dedicated .reload-weapon button on the equipment row, so an ammo weapon
  // (Attack + Reload) should still go straight to its attack dialog rather than
  // forcing a hub click first. Toggle/template have no such affordance, so their
  // presence keeps the hub. Multi-mode weapons (2+ rollable actions) also keep it.
  const STATE_CHANGE_IDS = new Set(["toggle", "reload", "template"]);
  const HUB_OPTIONAL_STATE_IDS = new Set(["reload"]); // reachable via .reload-weapon
  const rollableActions = actions.filter(a => !STATE_CHANGE_IDS.has(a.id));
  const hubRequiringStateActions = actions.filter(
    a => STATE_CHANGE_IDS.has(a.id) && !HUB_OPTIONAL_STATE_IDS.has(a.id)
  );
  if (rollableActions.length === 1 && hubRequiringStateActions.length === 0) {
    const only = rollableActions[0];
    // Key names below mirror DOMStringMap (data-foo-bar → fooBar), which is what
    // _executeAction reads from btn.dataset on the real hub buttons.
    const dataset = {
      actionId: only.id,
      modeIndex: only.modeIndex !== undefined ? String(only.modeIndex) : undefined,
      customIndex: only.customIndex !== undefined ? String(only.customIndex) : undefined,
      powerIndex: only.powerIndex !== undefined ? String(only.powerIndex) : undefined,
      devfnIndex: only.devFnIndex !== undefined ? String(only.devFnIndex) : undefined
    };
    return _executeAction(only.id, actor, item, dataset);
  }

  const statSummary = buildStatSummary(item);
  const actionButtons = buildActionButtons(actions, item);

  const descText = item.system?.description || "";
  const descHtml = descText
    ? `<details style="margin-bottom:6px;font-size:11px;">
         <summary style="cursor:pointer;color:#555;padding:2px 4px;user-select:none;">Description</summary>
         <div style="padding:4px 8px;background:#f5f3ee;border:1px solid #d8cfb8;border-radius:2px;margin-top:3px;color:#444;font-style:italic;max-height:120px;overflow-y:auto;">${descText}</div>
       </details>`
    : "";

  const categoryLabel = (item.system?.category || "equipment").toUpperCase();

  const content = `
  <div class="frp-dlg" style="font-family:'Barlow Condensed',Arial,sans-serif;">
    <div class="frp-header-v3">
      <span class="h-actor">${actor.name}</span>
      <span class="h-arrow">→</span>
      <span class="h-target">${item.name}</span>
      <span style="margin-left:auto;padding:1px 6px;background:rgba(255,255,255,0.18);border-radius:2px;font-size:10px;letter-spacing:0.4px;text-transform:uppercase;">${categoryLabel}</span>
    </div>

    <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;">
      <img src="${item.img}" alt="" style="width:48px;height:48px;object-fit:cover;border:1px solid #c0a070;border-radius:3px;flex:0 0 48px;background:rgba(0,0,0,0.4);" />
      <div style="flex:1;min-width:0;">
        ${statSummary}
      </div>
    </div>
    ${descHtml}
    ${actionButtons}
  </div>`;

  showFaseripButtonDialog({
    title: "Equipment Action",
    content,
    buttons: {
      close: { label: "Close" }
    },
    default: "close",
    render: (html, dlg) => {
      html.find('.equip-action-btn').on('click', async (ev) => {
        const btn = ev.currentTarget;
        const actionId = btn.dataset.actionId;
        dlg.close();
        await _executeAction(actionId, actor, item, btn.dataset);
      });
    },
    width: 420,
    classes: ["faserip", "equipment-action-dialog"]
  });
}

// Route an action button click to the appropriate handler
async function _executeAction(actionId, actor, item, dataset) {
  const sys = item.system || {};

  switch (actionId) {

    // ── Standard attack (routes to ActionDispatcher) ──
    case "attack": {
      const { ActionDispatcher } = await import("./action-dispatcher.js");
      const actionType = _resolveAttackType(item);
      const abilityName = _resolveAbility(actionType);
      return ActionDispatcher.roll(actionType, {
        actor, abilityName,
        opts: { itemId: item.id, item, sourceItem: item, equipment: item }
      });
    }

    // ── Attack mode ──
    default: {
      if (actionId.startsWith("attack-mode-")) {
        const idx = Number(dataset.modeIndex);
        const modes = Array.isArray(sys.attackModes) ? sys.attackModes : [];
        const mode = modes[idx];
        if (!mode) return;
        const { ActionDispatcher } = await import("./action-dispatcher.js");
        const actionType = mode.actionType || "blunt-attack";
        const abilityName = mode.ability || _resolveAbility(actionType);
        await ActionDispatcher.roll(actionType, {
          actor, abilityName,
          opts: { itemId: item.id, item, sourceItem: item, equipment: item, attackMode: mode }
        });
        if (mode.resistRank) {
          return ActionDispatcher.roll("intensity", {
            actor,
            abilityName: mode.resistAbility || "endurance",
            opts: { itemId: item.id, item, sourceItem: item, equipment: item, attackMode: mode }
          });
        }
        return;
      }

      // ── Custom Ability (combat or utility) ──
      if (actionId.startsWith("custom-")) {
        const idx = Number(dataset.customIndex);
        const customs = Array.isArray(sys.customAbilities) ? sys.customAbilities : [];
        const ca = customs[idx];
        if (!ca) return;

        const actionType = _resolveDamageTypeToAction(ca.damageType);
        if (actionType) {
          // Combat ability — route through ActionDispatcher
          const { ActionDispatcher } = await import("./action-dispatcher.js");
          const abilityName = _resolveAbility(actionType);
          return ActionDispatcher.roll(actionType, {
            actor, abilityName,
            opts: {
              itemId: item.id, item, sourceItem: item, equipment: item,
              deviceAbility: ca
            }
          });
        } else {
          // Non-combat ability (teleportation, utility, etc) — standalone FEAT roll
          const sheet = item.sheet;
          if (sheet?._rollSpecificCustomAbility) {
            return sheet._rollSpecificCustomAbility(item, actor, ca);
          }
        }
      }

      // ── Granted Power (combat or utility) ──
      if (actionId.startsWith("power-")) {
        const idx = Number(dataset.powerIndex);
        const powers = Array.isArray(sys.powers) ? sys.powers : [];
        const pw = powers[idx];
        if (!pw) return;

        const actionType = _resolveDamageTypeToAction(pw.damageType);
        if (actionType) {
          // Combat power — route through ActionDispatcher
          const { ActionDispatcher } = await import("./action-dispatcher.js");
          const abilityName = _resolveAbility(actionType);
          return ActionDispatcher.roll(actionType, {
            actor, abilityName,
            opts: {
              itemId: item.id, item, sourceItem: item, equipment: item,
              deviceAbility: {
                name: pw.name,
                rank: pw.rank,
                damageType: pw.damageType,
                range: "",
                description: ""
              }
            }
          });
        } else {
          // Non-combat granted power — standalone FEAT roll
          const sheet = item.sheet;
          if (sheet?._rollSpecificCustomAbility) {
            return sheet._rollSpecificCustomAbility(item, actor, {
              name: pw.name,
              rank: pw.rank,
              damageType: pw.damageType || "",
              range: "",
              description: `Granted by ${item.name}`
            });
          }
        }
      }

      // ── Device Function (new unified system) ──
      if (actionId.startsWith("devfn-")) {
        const idx = Number(dataset.devfnIndex);
        const devFns = Array.isArray(sys.deviceFunctions) ? sys.deviceFunctions : [];
        const fn = devFns[idx];
        if (!fn) return;

        if (fn.type === "attack") {
          const actionType = _resolveDamageTypeToAction(fn.damageType);
          if (actionType) {
            const { ActionDispatcher } = await import("./action-dispatcher.js");
            const abilityName = _resolveAbility(actionType);
            return ActionDispatcher.roll(actionType, {
              actor, abilityName,
              opts: {
                itemId: item.id, item, sourceItem: item, equipment: item,
                deviceAbility: {
                  name: fn.name,
                  rank: fn.rank,
                  damageType: fn.damageType,
                  range: fn.range || "",
                  description: fn.description || ""
                }
              }
            });
          }
        }
        // Non-combat (power type) — standalone FEAT roll
        const sheet = item.sheet;
        if (sheet?._rollSpecificCustomAbility) {
          return sheet._rollSpecificCustomAbility(item, actor, {
            name: fn.name,
            rank: fn.rank || "Typical",
            damageType: fn.damageType || "",
            range: fn.range || "",
            description: fn.description || ""
          });
        }
      }

      break;
    }

    // ── Grenade ──
    case "grenade": {
      const { ActionDispatcher } = await import("./action-dispatcher.js");
      return ActionDispatcher.roll("grenade", {
        actor, abilityName: "agility",
        opts: { itemId: item.id, item, sourceItem: item, equipment: item }
      });
    }

    // ── Toggle effects on/off ──
    case "toggle": {
      const SCOPE = "msh-faserip";
      let transferEffects = item.effects.filter(e => e.transfer);
      const dur = Number(sys.duration);
      const unit = sys.durationUnit || "hour";

      // If item has duration but no transfer effects, auto-create one on the item
      if (!transferEffects.length && dur > 0) {
        await item.createEmbeddedDocuments("ActiveEffect", [{
          name: `${item.name} (Active)`,
          img: item.img || "icons/svg/aura.svg",
          origin: item.uuid,
          disabled: true,
          transfer: true,
          changes: [],
          flags: {
            [SCOPE]: {
              equipmentToggle: true
            }
          }
        }]);
        // Re-fetch after creation
        transferEffects = item.effects.filter(e => e.transfer);
      }

      if (!transferEffects.length) return;

      const anyActive = transferEffects.some(e => !e.disabled);
      const updates = transferEffects.map(e => ({ _id: e.id, disabled: anyActive }));
      await item.updateEmbeddedDocuments("ActiveEffect", updates);

      // Battery timer: actor-embedded timed AE so CTT can track it and
      // expiry can switch the item back off (see init.js deleteActiveEffect).
      const staleTimers = actor.effects.filter(e =>
        e.flags?.[SCOPE]?.equipmentBatteryTimer && e.flags?.[SCOPE]?.itemUuid === item.uuid);
      if (staleTimers.length) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", staleTimers.map(e => e.id));
      }
      if (!anyActive && dur > 0) {
        const UNIT_SECONDS = { second: 1, turn: 6, minute: 60, hour: 3600, day: 86400, week: 604800 };
        const seconds = dur * (UNIT_SECONDS[unit] ?? 3600);
        const { computeDuration } = await import("../effects/effect-engine.js");
        await actor.createEmbeddedDocuments("ActiveEffect", [{
          name: `${item.name} (Battery)`,
          img: item.img || "icons/svg/aura.svg",
          origin: item.uuid,
          duration: computeDuration({ seconds }),
          flags: {
            [SCOPE]: {
              equipmentBatteryTimer: true,
              itemUuid: item.uuid,
              rechargeLabel: sys.rechargeLabel || "Recharge"
            }
          }
        }]);
      }
      const state = anyActive ? "OFF" : "ON";
      const stateColor = anyActive ? "#c62828" : "#2e7d32";
      let durationLine = "";
      if (!anyActive && dur > 0) {
        const unitLabel = dur === 1 ? unit : unit + "s";
        durationLine = `<div style="font-size:.85em;color:#666;">Duration: ${dur} ${unitLabel}</div>`;
      }
      return ChatMessage.create({
        content: `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;">
          <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;">
            <strong style="color:#8b0000;">EQUIPMENT</strong>
          </div>
          <div style="padding:6px 10px;">
            <div><strong>${actor.name}</strong> turns <strong style="color:${stateColor};">${state}</strong>: <strong>${item.name}</strong></div>
            ${durationLine}
          </div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor })
      });
    }

    // ── Intensity attack ──
    case "intensity": {
      const { ActionDispatcher } = await import("./action-dispatcher.js");
      return ActionDispatcher.roll("intensity", {
        actor, abilityName: "endurance",
        opts: { itemId: item.id, item, sourceItem: item, equipment: item }
      });
    }

    // ── Place Template ──
    case "template": {
      const radius = Number(sys.areaRadius) || Number(sys.grenadeRadius) || 1;
      const template = await AreaTemplate.createAtTarget({
        radiusInAreas: radius,
        label: item.name,
        fillColor: "#ff4400",
        fillAlpha: 0.25
      });
      if (template) {
        await template.target();
        ChatMessage.create({
          content: `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;">
            <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;">
              <strong style="color:#8b0000;">AREA EFFECT</strong>
            </div>
            <div style="padding:6px 10px;">
              <div><strong>${actor.name}</strong> places <strong>${item.name}</strong> template (${radius} area${radius > 1 ? "s" : ""} radius)</div>
            </div>
          </div>`,
          speaker: ChatMessage.getSpeaker({ actor })
        });
      }
      return;
    }

    // ── Stun/Gas intensity (uses stunIntensity field) ──
    case "stun-intensity": {
      // Treat stunIntensity as an intensity rank, route through intensity action
      const origRank = sys.intensityRank;
      const origDesc = sys.intensityDescription;
      // Temporarily set intensity fields from stunIntensity
      await item.update({
        "system.intensityRank": sys.stunIntensity,
        "system.intensityDescription": sys.intensityDescription || `${sys.stunIntensity} Intensity stunning/gas`
      });
      const { ActionDispatcher } = await import("./action-dispatcher.js");
      await ActionDispatcher.roll("intensity", {
        actor, abilityName: "endurance",
        opts: { itemId: item.id, item, sourceItem: item, equipment: item }
      });
      // Restore original values
      await item.update({
        "system.intensityRank": origRank || "",
        "system.intensityDescription": origDesc || ""
      });
      return;
    }

    // ── Throw (throwable melee weapon) ──
    case "throw": {
      const { ActionDispatcher } = await import("./action-dispatcher.js");
      const throwType = (sys.damageType === "EA" || sys.damageType === "TE")
        ? "throwing-edged" : "throwing-blunt";
      return ActionDispatcher.roll(throwType, {
        actor, abilityName: "agility",
        opts: { itemId: item.id, item, sourceItem: item, equipment: item }
      });
    }

    // ── Power Item ──
    case "power-item": {
      const sheet = item.sheet;
      if (sheet?._rollPowerItem) {
        return sheet._rollPowerItem(item, actor);
      }
      return;
    }

    // ── Reload ──
    case "reload": {
      await item.update({ "system.shotsRemaining": sys.shots });
      const rechargeLabel = sys.rechargeLabel || "Reload";
      ChatMessage.create({
        content: `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;">
          <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;">
            <strong style="color:#8b0000;">EQUIPMENT</strong>
          </div>
          <div style="padding:6px 10px;">
            <div><strong>${actor.name}</strong> ${rechargeLabel.toLowerCase()}s <strong>${item.name}</strong></div>
          </div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor })
      });
      return;
    }
  }
}

// Resolve attack type from item fields (same logic as actorSheet.js equipment-roll handler)
// When attack modes are present, the primary attack needs a distinguishing label
// (plain "Attack" alongside named modes like "Haft" / "Thrown" is ambiguous).
function _primaryAttackLabel(item) {
  const sys = item.system || {};
  const actionType = _resolveAttackType(item);
  const map = {
    "blunt-attack": "Blunt",
    "edged-attack": "Edged",
    "shooting": "Shooting",
    "throwing-edged": "Throw (Edged)",
    "throwing-blunt": "Throw (Blunt)",
    "energy": "Energy",
    "force": "Force",
    "grappling": "Grapple",
    "grabbing": "Grab",
    "charging": "Charge"
  };
  return map[actionType] || "Attack";
}

function _resolveAttackType(item) {
  const sys = item.system || {};
  const explicit = sys.attackType;
  if (explicit) return explicit;

  const dt = (sys.damageType || "").toUpperCase();
  const wt = (sys.weaponType || "").toLowerCase();

  if (dt === "E") return "energy";
  if (dt === "F") return "force";
  if (dt === "GP") return "grappling";
  if (dt === "GB") return "grabbing";
  if (dt === "STUN") return "shooting";

  if (wt === "shooting" || wt === "firearm") return "shooting";
  if (wt === "melee") return dt === "EA" ? "edged-attack" : "blunt-attack";
  if (wt === "thrown") return (dt === "TE" || dt === "EA") ? "throwing-edged" : "throwing-blunt";

  if (dt === "S") return "shooting";
  if (dt === "EA") return "edged-attack";
  if (dt === "BA") return "blunt-attack";
  if (dt === "TE") return "throwing-edged";
  if (dt === "TB") return "throwing-blunt";

  return "shooting";
}

function _resolveAbility(actionType) {
  const map = {
    "blunt-attack": "fighting",
    "edged-attack": "fighting",
    "shooting": "agility",
    "throwing-edged": "agility",
    "throwing-blunt": "agility",
    "energy": "agility",
    "force": "agility",
    "grappling": "strength",
    "grabbing": "strength",
    "charging": "endurance",
    "grenade": "agility"
  };
  return map[actionType] || "fighting";
}

// Resolve a custom ability / granted power damageType code to an ActionDispatcher action type.
// Returns null for non-combat types (teleportation, sensory, etc).
function _resolveDamageTypeToAction(dt) {
  if (!dt) return null;
  const map = {
    "BA": "blunt-attack",
    "EA": "edged-attack",
    "S":  "shooting",
    "E":  "energy",
    "F":  "force",
    "TE": "throwing-edged",
    "TB": "throwing-blunt",
    "GP": "grappling",
    "Gb": "grabbing"
  };
  return map[dt.toUpperCase?.()] || map[dt] || null;
}

// Icon and color for a given damage type code (used in action buttons)
function _damageTypePresentation(dt) {
  const map = {
    "BA": { icon: "fas fa-fist-raised",     color: "#c62828" },
    "EA": { icon: "fas fa-cut",             color: "#b71c1c" },
    "S":  { icon: "fas fa-crosshairs",      color: "#d84315" },
    "E":  { icon: "fas fa-bolt",            color: "#f57f17" },
    "F":  { icon: "fas fa-hand-rock",       color: "#1565c0" },
    "TE": { icon: "fas fa-location-arrow",  color: "#b71c1c" },
    "TB": { icon: "fas fa-location-arrow",  color: "#ef6c00" },
    "GP": { icon: "fas fa-hands",           color: "#4e342e" },
    "Gb": { icon: "fas fa-hand-paper",      color: "#4e342e" }
  };
  return map[dt] || { icon: "fas fa-star", color: "#5d4037" };
}
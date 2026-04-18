// equipment-action-dialog.js v1.2.0 - 2026-04-16
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
  if (cat === "weapon" && (sys.attackType || sys.damageType || sys.weaponType)) {
    const primaryLabel = modes.length ? _primaryAttackLabel(item) : "Attack";
    actions.push({
      id: "attack",
      label: primaryLabel,
      icon: "fas fa-crosshairs",
      color: "#c62828"
    });
  }

  // ── Attack Modes (multi-mode weapons) — appended as additional attacks ──
  for (let i = 0; i < modes.length; i++) {
    actions.push({
      id: `attack-mode-${i}`,
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
      label: "Throw Grenade",
      icon: "fas fa-bomb",
      color: "#e65100"
    });
  }

  // ── Missile ──
  if (cat === "other" && sys.weaponType === "missile") {
    actions.push({
      id: "missile",
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
      label: isActive ? "Turn Off" : "Turn On",
      icon: "fas fa-power-off",
      color: isActive ? "#c62828" : "#2e7d32",
      active: isActive
    });
  }

  // ── Intensity Attack ──
  if (sys.intensityRank) {
    actions.push({
      id: "intensity",
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
      label: `Place Template (${areaRadius} area${areaRadius > 1 ? "s" : ""})`,
      icon: "fas fa-bullseye",
      color: "#1565c0"
    });
  }

  // ── Stun/Gas (stunIntensity without a regular attack) ──
  if (sys.stunIntensity && !actions.some(a => a.id === "attack" || a.id.startsWith("attack-mode"))) {
    actions.push({
      id: "stun-intensity",
      label: `Stun/Gas (${sys.stunIntensity})`,
      icon: "fas fa-cloud",
      color: "#6a1b9a"
    });
  }

  // ── Throw (melee weapons with throwable flag) ──
  if (sys.throwable && cat === "weapon") {
    actions.push({
      id: "throw",
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
      label: "Reload",
      icon: "fas fa-sync-alt",
      color: "#666"
    });
  }

  return actions;
}

// Build stat summary HTML based on item category
function buildStatSummary(item) {
  const sys = item.system || {};
  const cat = (sys.category || "").toLowerCase();
  const rows = [];

  const add = (label, value) => {
    if (value !== undefined && value !== null && value !== "" && value !== 0 && value !== "0") {
      rows.push(`<div><span style="color:#666;font-size:.8em;text-transform:uppercase;">${label}</span><br><strong>${value}</strong></div>`);
    }
  };

  add("Material", sys.materialStrength);

  if (cat === "weapon" || cat === "other") {
    add("Damage", sys.damage || sys.grenadeDamage || sys.missileDamage);
    add("Type", sys.damageType || sys.grenadeDamageType || sys.missileDamageType);
    add("Range", sys.range || (sys.grenadeRadius ? `${sys.grenadeRadius} area radius` : ""));
    add("Rate", sys.rate);
    const shots = sys.shots;
    const rem = sys.shotsRemaining;
    if (shots) add("Shots", `${rem ?? shots}/${shots}`);
  }

  if (cat === "armor") {
    add("Protection", sys.protection);
    add("Coverage", sys.coverage);
  }

  if (cat === "power-item") {
    add("Power Rank", sys.powerRank);
    add("Power Type", sys.powerType);
    add("Range", sys.powerRange);
  }

  if (cat === "device" || cat === "custom") {
    const dfns = Array.isArray(sys.deviceFunctions) ? sys.deviceFunctions.filter(f => f?.name) : [];
    if (dfns.length > 0) {
      const attacks = dfns.filter(f => f.type === "attack").length;
      const powers = dfns.filter(f => f.type === "power").length;
      const buffs = dfns.filter(f => f.type === "buff").length;
      const defs = dfns.filter(f => f.type === "defense").length;
      if (attacks) add("Attacks", attacks);
      if (powers) add("Powers", powers);
      if (buffs) add("Buffs", buffs);
      if (defs) add("Defenses", defs);
    } else {
      // Legacy fallback
      const cas = Array.isArray(sys.customAbilities) ? sys.customAbilities.filter(a => a?.name) : [];
      const pws = Array.isArray(sys.powers) ? sys.powers.filter(p => p?.name) : [];
      add("Abilities", cas.length || "");
      add("Powers", pws.length || "");
    }
  }

  if (sys.intensityRank) add("Intensity", sys.intensityRank);
  if (sys.areaRadius) add("Area", `${sys.areaRadius} area${sys.areaRadius > 1 ? "s" : ""} radius`);

  const dur = Number(sys.duration);
  if (dur > 0) {
    const unit = sys.durationUnit || "hour";
    add("Duration", `${dur} ${dur === 1 ? unit : unit + "s"}`);
  }

  if (!rows.length) return "";

  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;margin-bottom:10px;padding:8px;background:#f5f5f0;border:1px solid #ddd;border-radius:3px;">
    ${rows.join("")}
  </div>`;
}

// Build action button HTML
function buildActionButtons(actions) {
  if (!actions.length) return `<div style="color:#888;font-style:italic;padding:8px;">No actions available for this item.</div>`;

  return actions.map(a => {
    return `<button type="button" class="equip-action-btn" data-action-id="${a.id}"
      ${a.modeIndex !== undefined ? `data-mode-index="${a.modeIndex}"` : ""}
      ${a.customIndex !== undefined ? `data-custom-index="${a.customIndex}"` : ""}
      ${a.powerIndex !== undefined ? `data-power-index="${a.powerIndex}"` : ""}
      ${a.devFnIndex !== undefined ? `data-devfn-index="${a.devFnIndex}"` : ""}
      style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;margin-bottom:4px;
             border:1px solid #c0c0c0;border-radius:4px;background:#fff;cursor:pointer;
             font-size:0.95em;text-align:left;">
      <i class="${a.icon}" style="color:${a.color};width:18px;text-align:center;"></i>
      <span style="flex:1;font-weight:600;">${a.label}</span>
    </button>`;
  }).join("");
}

/**
 * Open the Equipment Action Dialog for an item.
 * Called from the actor sheet equipment-roll click handler.
 */
export async function openEquipmentActionDialog(actor, item) {
  if (!actor || !item) return;

  const actions = getAvailableActions(item, actor);
  const statSummary = buildStatSummary(item);
  const actionButtons = buildActionButtons(actions);

  const descText = item.system?.description || "";
  const descHtml = descText
    ? `<div style="font-size:.85em;color:#555;margin-bottom:8px;max-height:60px;overflow-y:auto;">${descText}</div>`
    : "";

  const content = `
    <div style="min-width:320px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <img src="${item.img}" width="40" height="40" style="border:1px solid #ccc;border-radius:3px;"/>
        <div>
          <div style="font-weight:bold;font-size:1.15em;">${item.name}</div>
          <div style="font-size:.8em;color:#888;text-transform:uppercase;">${item.system.category || "equipment"}</div>
        </div>
      </div>
      ${descHtml}
      ${statSummary}
      <div class="equip-action-buttons">
        ${actionButtons}
      </div>
    </div>`;

  const dlg = new Dialog({
    title: item.name,
    content,
    buttons: {
      close: { label: "Close" }
    },
    default: "close",
    render: (html) => {
      html.find('.equip-action-btn').on('click', async (ev) => {
        const btn = ev.currentTarget;
        const actionId = btn.dataset.actionId;
        dlg.close();
        await _executeAction(actionId, actor, item, btn.dataset);
      });
    }
  }, {
    width: 380,
    classes: ["faserip", "equipment-action-dialog"]
  });

  dlg.render(true);
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
        return ActionDispatcher.roll(actionType, {
          actor, abilityName,
          opts: { itemId: item.id, item, sourceItem: item, equipment: item, attackMode: mode }
        });
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
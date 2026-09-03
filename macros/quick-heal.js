// quick-heal.js v2.1.0 - 2026-09-02
// v2.1.0: GM guard. Kept defense effects that were disabled by a force-field
//         breach are re-enabled (checkbox, default on). Rank values via the
//         kernel-backed rules-reference (dynamic import; private rank table
//         kept only as the offline fallback for the macro editor).
// quick-heal.js v2.0.1 - 2026-03-22
// v2.0.1: Remove ES export — use self-executing async function for fetch/eval loader.
//         Works with init.js lazy-load (AsyncFunction) and Foundry macro editor.
// v2.0.0: Dialog with categorized effect checkboxes and persistent per-client prefs.
//         Combat effects (dying/unconscious/stunned/slam/stagger) default ON (delete).
//         Defense, power, and custom effects default OFF (keep). Prefs stored in client setting.
// v1.4.0: Preserve non-standard ability rank values (e.g. Good 15).
// v1.3.0: Fix effects not deleting — pass mshIntentional, restore HP before delete.
// Usage: game.msh.macros.quickHeal()

const SCOPE = "msh-faserip";
const PREFS_KEY = "quickHealPrefs";

const RANK_VALUES = {
  "Sh-0": 0, "Shift-0": 0, "Shift 0": 0, "Sh0": 0,
  "Fe": 2, "Feeble": 2, "Pr": 4, "Poor": 4,
  "Ty": 6, "Typical": 6, "Gd": 10, "Good": 10,
  "Ex": 20, "Excellent": 20, "Rm": 30, "Remarkable": 30,
  "In": 40, "Incredible": 40, "Am": 50, "Amazing": 50,
  "Mn": 75, "Monstrous": 75, "Un": 100, "Unearthly": 100,
  "Sh-X": 150, "Shift-X": 150, "ShX": 150,
  "Sh-Y": 200, "Shift-Y": 200, "ShY": 200,
  "Sh-Z": 500, "Shift-Z": 500, "ShZ": 500,
  "CL1000": 1000, "Class 1000": 1000,
  "CL3000": 3000, "Class 3000": 3000,
  "CL5000": 5000, "Class 5000": 5000
};
const ABBREV_TO_FULL = {
  "Sh-0": "Shift-0", "Sh0": "Shift-0",
  "Fe": "Feeble", "Pr": "Poor", "Ty": "Typical",
  "Gd": "Good", "Ex": "Excellent", "Rm": "Remarkable", "In": "Incredible",
  "Am": "Amazing", "Mn": "Monstrous", "Un": "Unearthly",
  "Sh-X": "Shift-X", "ShX": "Shift-X",
  "Sh-Y": "Shift-Y", "ShY": "Shift-Y",
  "Sh-Z": "Shift-Z", "ShZ": "Shift-Z",
  "CL1000": "Class 1000", "CL3000": "Class 3000", "CL5000": "Class 5000"
};

let _rules = null;
async function loadRules() {
  if (_rules) return _rules;
  try { _rules = await import("/systems/msh-faserip/scripts/rules/rules-reference.js"); }
  catch (e) { console.warn("[FASERIP] Quick Heal: rules-reference unavailable, using local table", e); _rules = {}; }
  return _rules;
}
function getRankValue(r) {
  const v = _rules?.rankValue?.(r);
  if (Number.isFinite(v)) return v;
  return RANK_VALUES[r] || game.msh?.getRankValue?.(r) || CONFIG.FASERIP?.rankValues?.[r] || 0;
}
function normalizeRank(r) {
  if (!r) return null;
  return _rules?.normalizeRank?.(r) || ABBREV_TO_FULL[r] || r;
}
function isCorruptedOriginal(r) {
  if (!r) return true;
  return normalizeRank(r) === "Shift-0" || getRankValue(r) === 0;
}

// ── Effect classification ──

const COMBAT_EFFECT_TYPES = new Set([
  "dying", "stunned", "unconscious", "slammed", "grandSlam",
  "staggered", "prone", "grappled", "held", "escaped", "reversed",
  "entangled", "blinded", "deafened", "paralyzed", "weakened",
  "charging", "evading", "evasionBonus", "blocking"
]);

function classifyEffect(e) {
  const flags = e.flags?.[SCOPE] || {};
  const effectType = flags.effectType || "";
  if (flags.isDying || flags.ongoingId === "dying" || effectType === "dying") return "combat";
  if (flags.isImpairedEndurance) return "combat";
  if (flags.isStunned || flags.status?.isStunned) return "combat";
  if (flags.status?.isUnconscious) return "combat";
  if (flags.status?.isSlammed) return "combat";
  if (flags.fromDeathSave || flags.fromConsciousnessFail) return "combat";
  if (COMBAT_EFFECT_TYPES.has(effectType)) return "combat";
  if (flags.effectCategory === "defense") return "defense";
  if (flags.ongoingId === "regeneration" || flags.ongoingId === "solarRegen" ||
      flags.ongoingId === "absorption" || effectType === "regeneration") return "power";
  if (flags.effectType === "nullified") return "power";
  if (flags.ongoingId) return "power";
  return "other";
}

function categoryLabel(cat) {
  switch (cat) {
    case "combat":  return "Combat Effects";
    case "defense": return "Defense";
    case "power":   return "Power Effects";
    default:        return "Other";
  }
}

function categoryColor(cat) {
  switch (cat) {
    case "combat":  return "#c62828";
    case "defense": return "#1565c0";
    case "power":   return "#6a1b9a";
    default:        return "#555";
  }
}

// ── Persistent prefs ──

function loadPrefs() {
  try {
    const raw = game.settings.get(SCOPE, PREFS_KEY);
    return typeof raw === "object" && raw ? raw : {};
  } catch { return {}; }
}
function savePrefs(prefs) {
  try { game.settings.set(SCOPE, PREFS_KEY, prefs); } catch (e) {
    console.warn("[FASERIP] Quick Heal: Could not save prefs", e);
  }
}

// Default: combat ON, everything else OFF
function defaultChecked(cat, prefs) {
  if (prefs.categories?.[cat] !== undefined) return prefs.categories[cat];
  return cat === "combat";
}

// ── Endurance resolution (unchanged from v1.4.0) ──

function resolveEndurance(actor, token) {
  const isUnlinked = token.document.actorLink === false;
  const baseActor = isUnlinked ? game.actors.get(token.document.actorId) : null;
  const baseEndurance = baseActor?.system.abilities?.endurance;

  const dyingEffect = actor.effects.find(e => e.getFlag(SCOPE, "isDying"));
  const impairedEffect = actor.effects.find(e => e.getFlag(SCOPE, "isImpairedEndurance"));
  const effectOriginal = dyingEffect?.getFlag(SCOPE, "originalEndurance") ||
                        impairedEffect?.getFlag(SCOPE, "originalEndurance");
  const actorFlagOriginal = actor.getFlag(SCOPE, "originalEndurance");
  const initialRankAbbrev = actor.system.abilities?.endurance?.initialRank;
  const initialRankFull = normalizeRank(initialRankAbbrev);
  const hasDyingOrImpaired = !!(dyingEffect || impairedEffect);

  let originalRank = null;
  if (hasDyingOrImpaired && effectOriginal && !isCorruptedOriginal(effectOriginal)) {
    originalRank = effectOriginal;
  } else if (hasDyingOrImpaired && actorFlagOriginal && !isCorruptedOriginal(actorFlagOriginal)) {
    originalRank = actorFlagOriginal;
  } else if (actor.system.abilities?.endurance?.rank && !isCorruptedOriginal(actor.system.abilities.endurance.rank)) {
    originalRank = actor.system.abilities.endurance.rank;
  } else if (isUnlinked && baseEndurance?.rank && !isCorruptedOriginal(baseEndurance.rank)) {
    originalRank = baseEndurance.rank;
  } else if (initialRankFull && !isCorruptedOriginal(initialRankFull)) {
    originalRank = initialRankFull;
  } else {
    originalRank = "Good";
  }

  let originalValue;
  if (!hasDyingOrImpaired) {
    originalValue = Number(actor.system.abilities?.endurance?.value) || getRankValue(originalRank);
  } else if (isUnlinked && baseEndurance?.value && baseEndurance.rank === originalRank) {
    originalValue = Number(baseEndurance.value);
  } else if (actor.system.abilities?.endurance?.initialValue && normalizeRank(initialRankAbbrev) === originalRank) {
    originalValue = Number(actor.system.abilities.endurance.initialValue);
  } else {
    originalValue = getRankValue(originalRank);
  }

  const f = actor.system.abilities?.fighting?.value || 0;
  const a = actor.system.abilities?.agility?.value || 0;
  const s = actor.system.abilities?.strength?.value || 0;
  const restoredHealthMax = f + a + s + originalValue;
  const targetHealthMax = isUnlinked && baseActor
    ? baseActor.system.attributes?.health?.max
    : restoredHealthMax;

  return { originalRank, originalValue, targetHealthMax, isUnlinked, baseActor };
}

// ── Apply heal to one token ──

async function applyHeal(token, effectIdsToDelete, { reenableDefenses = true } = {}) {
  const actor = token.actor;
  if (!actor) return;

  const { originalRank, originalValue, targetHealthMax, isUnlinked } = resolveEndurance(actor, token);

  // Restore HP first (before effect deletion)
  if (isUnlinked) {
    await token.document.update({
      "delta.system.abilities.endurance.rank": originalRank,
      "delta.system.abilities.endurance.value": originalValue,
      "delta.system.attributes.health.value": targetHealthMax,
      "delta.system.attributes.health.max": targetHealthMax,
      "delta.system.details.isDead": false
    });
  } else {
    await actor.update({
      "system.abilities.endurance.rank": originalRank,
      "system.abilities.endurance.value": originalValue,
      "system.attributes.health.value": targetHealthMax,
      "system.details.isDead": false
    });
  }

  // Delete selected effects
  if (effectIdsToDelete.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", effectIdsToDelete, { mshIntentional: true });
  }

  // Re-enable kept defense effects that a force-field breach switched off
  let reenabled = 0;
  if (reenableDefenses) {
    const deleted = new Set(effectIdsToDelete);
    const toEnable = actor.effects
      .filter(e => !deleted.has(e.id) && e.disabled && e.flags?.[SCOPE]?.effectCategory === "defense")
      .map(e => ({ _id: e.id, disabled: false }));
    if (toEnable.length) {
      await actor.updateEmbeddedDocuments("ActiveEffect", toEnable, { mshIntentional: true });
      reenabled = toEnable.length;
    }
  }

  // Clear statuses
  if (isUnlinked) {
    await token.document.update({ "delta.statuses": [] });
  }
  try {
    for (const sid of [...(actor.statuses || [])]) {
      await actor.toggleStatusEffect(sid, { active: false });
    }
  } catch (e) { /* ignore */ }

  // Clear flags
  try { await actor.unsetFlag(SCOPE, "originalEndurance"); } catch {}
  try { await actor.unsetFlag(SCOPE, "wasKnockedOut"); } catch {}
  try { await actor.unsetFlag(SCOPE, "lastDamageWorldTime"); } catch {}
  try { await actor.unsetFlag(SCOPE, "lastDamageTime"); } catch {}

  token.renderFlags.set({ refreshBars: true });
  if (actor.sheet?.rendered) actor.sheet.render(false);

  console.log(`[FASERIP] Quick Heal: ${actor.name} restored`, {
    originalRank, originalValue, targetHealthMax,
    effectsDeleted: effectIdsToDelete.length,
    defensesReenabled: reenabled
  });
}

// ── Build dialog HTML ──

function buildDialogContent(tokens, prefs) {
  const sections = [];

  for (const token of tokens) {
    const actor = token.actor;
    if (!actor) continue;
    const effects = actor.effects.contents;
    if (!effects.length) {
      sections.push(`
        <div style="margin-bottom:12px;">
          <div style="font-weight:bold;font-size:1.05em;margin-bottom:4px;">${actor.name}</div>
          <div style="color:#888;font-size:.85em;padding-left:8px;">No active effects</div>
        </div>`);
      continue;
    }

    // Group by category
    const grouped = { combat: [], defense: [], power: [], other: [] };
    for (const e of effects) {
      const cat = classifyEffect(e);
      grouped[cat].push(e);
    }

    let effectRows = "";
    for (const cat of ["combat", "defense", "power", "other"]) {
      const list = grouped[cat];
      if (!list.length) continue;
      const checked = defaultChecked(cat, prefs);
      const color = categoryColor(cat);
      const label = categoryLabel(cat);

      effectRows += `
        <div style="margin-top:6px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <input type="checkbox" class="qh-cat-toggle" data-actor="${actor.id}" data-cat="${cat}"
              ${checked ? "checked" : ""} style="margin:0;">
            <span style="font-weight:600;font-size:.85em;color:${color};">${label}</span>
          </div>
          <div style="padding-left:20px;">`;

      for (const e of list) {
        const eName = e.name || "Unnamed Effect";
        const dur = e.duration?.label || "";
        effectRows += `
            <div style="display:flex;align-items:center;gap:6px;margin:1px 0;">
              <input type="checkbox" class="qh-effect" data-actor="${actor.id}" data-effect="${e.id}" data-cat="${cat}"
                ${checked ? "checked" : ""} style="margin:0;">
              <span style="font-size:.85em;" title="${eName}${dur ? ' — ' + dur : ''}">${eName}</span>
              ${dur ? `<span style="font-size:.75em;color:#999;">${dur}</span>` : ""}
            </div>`;
      }
      effectRows += `</div></div>`;
    }

    sections.push(`
      <div style="margin-bottom:12px;border:1px solid #ccc;border-radius:4px;padding:8px;background:#faf8f2;">
        <div style="font-weight:bold;font-size:1.05em;margin-bottom:4px;color:#8b0000;">${actor.name}</div>
        <div style="font-size:.8em;color:#666;margin-bottom:6px;">
          HP: ${actor.system.attributes?.health?.value ?? "?"}/${actor.system.attributes?.health?.max ?? "?"}
          | End: ${actor.system.abilities?.endurance?.rank ?? "?"} ${actor.system.abilities?.endurance?.value ?? "?"}
        </div>
        ${effectRows}
      </div>`);
  }

  return `
    <div style="max-height:500px;overflow-y:auto;padding-right:4px;">
      ${sections.join("")}
      <div style="margin-top:8px;padding-top:6px;border-top:1px solid #ddd;">
        <label style="display:flex;align-items:center;gap:6px;font-size:.85em;color:#666;">
          <input type="checkbox" id="qh-reenable-defenses" ${prefs.reenableDefenses === false ? "" : "checked"} style="margin:0;">
          Re-enable kept defenses disabled by a force-field breach
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:.85em;color:#666;">
          <input type="checkbox" id="qh-save-prefs" checked style="margin:0;">
          Remember category defaults
        </label>
      </div>
    </div>`;
}

// ── Main entry point ──
// Works as: game.msh.macros.quickHeal() from hotbar macro
// Works as: fetched + evaluated by init.js lazy loader

async function _quickHealMain() {
  if (!game.user?.isGM) {
    ui.notifications.warn("Quick Heal is GM only.");
    return;
  }
  const tokens = canvas.tokens.controlled;
  if (!tokens.length) {
    ui.notifications.warn("No tokens selected");
    return;
  }
  await loadRules();

  // Register prefs setting if not yet registered
  try {
    game.settings.get(SCOPE, PREFS_KEY);
  } catch {
    game.settings.register(SCOPE, PREFS_KEY, {
      scope: "client", config: false, type: Object, default: {}
    });
  }

  const prefs = loadPrefs();
  const content = buildDialogContent(tokens, prefs);

  return new Promise((resolve) => {
    const dlg = new Dialog({
      title: "Quick Heal",
      content,
      buttons: {
        heal: {
          icon: '<i class="fas fa-heart"></i>',
          label: "Heal & Remove Selected",
          callback: async (html) => {
            // Gather checked effect IDs per actor
            const toDelete = {};
            html.find(".qh-effect:checked").each(function () {
              const actorId = this.dataset.actor;
              const effectId = this.dataset.effect;
              (toDelete[actorId] ??= []).push(effectId);
            });

            const reenableDefenses = !!html.find("#qh-reenable-defenses")[0]?.checked;

            // Save prefs if requested
            if (html.find("#qh-save-prefs")[0]?.checked) {
              const catPrefs = {};
              const seen = new Set();
              html.find(".qh-cat-toggle").each(function () {
                const cat = this.dataset.cat;
                if (!seen.has(cat)) {
                  seen.add(cat);
                  catPrefs[cat] = this.checked;
                }
              });
              savePrefs({ categories: catPrefs, reenableDefenses });
            }

            // Apply heal to each token
            for (const token of tokens) {
              const actor = token.actor;
              if (!actor) continue;
              const ids = toDelete[actor.id] || [];
              await applyHeal(token, ids, { reenableDefenses });
            }

            ChatMessage.create({
              content: `<div style="text-align:center;"><strong>Healed ${tokens.length} character(s) to full health</strong></div>`,
              whisper: [game.user.id]
            });
            ui.notifications.info(`Healed ${tokens.length} token(s)`);
            resolve();
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => resolve()
        }
      },
      default: "heal",
      render: (html) => {
        // Category toggle → check/uncheck all effects in that category for that actor
        html.find(".qh-cat-toggle").on("change", function () {
          const actorId = this.dataset.actor;
          const cat = this.dataset.cat;
          const checked = this.checked;
          html.find(`.qh-effect[data-actor="${actorId}"][data-cat="${cat}"]`).prop("checked", checked);
        });
        // Individual effect unchecked → uncheck category; all checked → check category
        html.find(".qh-effect").on("change", function () {
          const actorId = this.dataset.actor;
          const cat = this.dataset.cat;
          const all = html.find(`.qh-effect[data-actor="${actorId}"][data-cat="${cat}"]`);
          const allChecked = all.toArray().every(cb => cb.checked);
          html.find(`.qh-cat-toggle[data-actor="${actorId}"][data-cat="${cat}"]`).prop("checked", allChecked);
        });
      }
    }, { width: 420 });
    dlg.render(true);
  });
}

// Self-execute when loaded via fetch/eval or Foundry macro editor
_quickHealMain();
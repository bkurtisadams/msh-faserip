// power-sheet-v2-logic.js v1.9.0 - 2026-05-21
// v1.9.0: Slice I — Extra Body Parts structured field. #ps2-add-bodypart /
//         .ps2-remove-bodypart add/remove handlers manage the
//         system.extraBodyParts array ([{type, count, notes}]), mirroring
//         the bonusPowers list pattern. UI block lives in the Attack
//         section body; schema default [] added to template.json.
// v1.8.0: Slice H — Resistance UX rewrite. RESISTANCE_TYPE_DEFAULTS maps
//         resistance type -> { effect, minRank }. resistanceType change
//         handler auto-sets resistanceEffect + resistanceMinRank from the
//         map. resistanceEffect change handler keeps countsAsTwoPowers +
//         resistanceIsInvulnerability in sync with the "invulnerability"
//         option. Only sets values that are currently at defaults;
//         explicit user choices preserved.
// v1.7.1: Run section-visibility computation for read-only (compendium)
//         sheets too. Previously the call from itemSheet._onRender was
//         gated by isEditable, so compendium items leaked every section
//         (data-hidden never got set). Visibility is now read-only-safe;
//         the rest of the listener wiring is gated locally on
//         sheet.isEditable instead.
// v1.7.0: Category-driven section-flag auto-tick + sub-field defaults on
//         category CHANGE only (not on render). CATEGORY_FLAG_AUTO_TICK
//         maps category -> section flags to tick if currently unset.
//         CATEGORY_FIELD_DEFAULTS sets sensible sub-field defaults (e.g.
//         transformation.affects="self" for bodyControl) if currently
//         unset. Explicit user values always win.
// v1.6.0: Damage type auto-tick for ignoresNaturalArmor (touch-rotting) and
//         ignoresArtificialArmor (touch-corrosive). New armor-bypass flag
//         checkboxes in Attack section.
// v1.5.0: Symmetric armorPhysicalCustom pattern — orange-dot badge + reset
//         handler + manual-edit detection, mirroring armorEnergyCustom.
//         Rank change no longer overwrites armorPhysical when custom flag set.
// v1.4.1: Replace local RANK_VALUES with import from rules-reference.js
// v1.4.0: Attack section always visible so any power can opt into combat routing.
// v1.2.0: Collapsible Active Effects, Healing/Absorption toggle, bigger textareas
// v1.1.0: Rank→Value auto-fill, special strength type change handler, field reorder support
// Drop-in: call ps2ActivateListeners(html, itemSheet) from activateListeners

// Rank → value lookup (canonical source: rules-reference.js)
import { RANK_VALUES } from "./rules/rules-reference.js";

const CATEGORY_SECTIONS = {
  resistances:              ["defense"],
  senses:                   ["detection", "abilitySubstitution"],
  movement:                 ["movement"],
  matterControl:            ["control", "attack"],
  energyControl:            ["control", "attack", "defense"],
  bodyControl:              ["transformation", "defense", "abilitySubstitution"],
  distanceAttacks:          ["attack", "save"],
  mentalPowers:             ["mental", "save", "abilitySubstitution"],
  bodyAlterationsOffensive: ["attack", "save"],
  bodyAlterationsDefensive: ["defense", "healing"]
};

// Category -> suggested activationType
// passive = always-on (Body Armor, Resistances, Senses)
// activated = toggled on/off (Flight, Energy Blasts)
const CATEGORY_ACTIVATION_TYPE = {
  resistances:              "passive",
  senses:                   "passive",
  bodyAlterationsDefensive: "passive",
  movement:                 "activated",
  matterControl:            "activated",
  energyControl:            "activated",
  bodyControl:              "activated",
  distanceAttacks:          "activated",
  mentalPowers:             "activated",
  bodyAlterationsOffensive: "activated"
};

// When a category is selected, auto-check these section toggles and sub-toggles
// so the user doesn't have to manually dig through 3 layers of checkboxes.
// Keys = category value, values = { sections: [section-check data-section values],
//                                    subs: [sub-check data-sub values] }
const CATEGORY_AUTO_EXPAND = {
  resistances:              { sections: ["defense"], subs: ["resistance"] },
  bodyAlterationsDefensive: { sections: ["defense"], subs: [] },
  mentalPowers:             { sections: ["save"], subs: [] },
  distanceAttacks:          { sections: ["save"], subs: [] },
  bodyAlterationsOffensive: { sections: ["save"], subs: [] }
};

// Category -> section flags to auto-tick on category CHANGE (not on render).
// Only ticks flags that are currently unset. Explicit user choices always win.
const CATEGORY_FLAG_AUTO_TICK = {
  resistances:              { isDefensePower: true, isResistance: true },
  bodyAlterationsDefensive: { isDefensePower: true },
  distanceAttacks:          { isAttackPower: true },
  bodyAlterationsOffensive: { isAttackPower: true }
};

// Category -> sensible sub-field defaults. Same "unset only" rule.
const CATEGORY_FIELD_DEFAULTS = {
  bodyControl: { "transformation.affects": "self" }
};

// Resistance type -> derived defaults per Players' Book pp. 71.
// Used by the #ps2-resistance-type change handler to seed resistanceEffect
// and resistanceMinRank. Damage-based resistances (fire/cold/electricity/
// radiation/corrosive) reduce damage by rank #; ability-based resistances
// (toxin/disease/emotion/mental/magical) replace the relevant FEAT ability
// and may impose a minimum-rank rule against that ability +1CS.
const RESISTANCE_TYPE_DEFAULTS = {
  fire:        { effect: "damageReduction", minRank: "" },
  cold:        { effect: "damageReduction", minRank: "" },
  electricity: { effect: "damageReduction", minRank: "" },
  radiation:   { effect: "damageReduction", minRank: "" },
  corrosive:   { effect: "damageReduction", minRank: "" },
  toxin:       { effect: "featReplace",     minRank: "endurance+1" },
  disease:     { effect: "featReplace",     minRank: "endurance+1" },
  emotion:     { effect: "featReplace",     minRank: "intuition+1" },
  mental:      { effect: "featReplace",     minRank: "psyche+1" },
  magical:     { effect: "featReplace",     minRank: "" }
};

// Sections always shown regardless of category
const ALWAYS_VISIBLE = ["attack", "limitation", "bonusPowers", "magic"];

// All toggleable section keys
const ALL_SECTIONS = [
  "attack", "defense", "save", "detection",
  "abilitySubstitution", "movement", "control", "mental",
  "transformation", "healing", "magic", "limitation", "bonusPowers"
];

function updateSectionVisibility(html, category) {
  const suggested = CATEGORY_SECTIONS[category] || [];
  for (const key of ALL_SECTIONS) {
    const el = html.find(`.ps2-section[data-section="${key}"]`);
    if (!el.length) continue;
    const isAlways = ALWAYS_VISIBLE.includes(key);
    const isSuggested = suggested.includes(key);
    const toggle = el.find('.ps2-section-check');
    const userEnabled = toggle.length ? toggle.prop('checked') : false;
    const show = isAlways || isSuggested || userEnabled;
    el.attr('data-hidden', show ? 'false' : 'true');
    el.attr('data-suggested', isSuggested ? 'true' : 'false');
  }
  // Auto-expand section bodies and sub-sections for this category
  // We force-show the section body so it's *available* for the category, but
  // do NOT auto-check the underlying toggle — that would flip the persisted
  // system flag (e.g. requiresSave) on every sheet open, overriding the user's
  // explicit choice. The toggle stays as authored; visibility is just the hint.
  const autoExp = CATEGORY_AUTO_EXPAND[category];
  if (autoExp) {
    for (const sectionKey of autoExp.sections) {
      const sectionEl = html.find(`.ps2-section[data-section="${sectionKey}"]`);
      sectionEl.attr("data-hidden", "false");
      sectionEl.attr("data-suggested", "true");
      sectionEl.find('.ps2-section-body').show();
    }
    for (const subKey of autoExp.subs) {
      html.find(`.ps2-sub-body[data-sub="${subKey}"]`).show();
    }
  }
}

export function ps2ActivateListeners(html, sheet) {
  // Visibility computation runs for both editable and read-only sheets so
  // compendium-opened items honor category-driven section gating. Without
  // this, the early-return in itemSheet._onRender for !isEditable would
  // leave every section visible because data-hidden never gets set.
  const category = html.find('#ps2-category').val();
  updateSectionVisibility(html, category);

  // Everything below requires write access (data migrations + event handlers).
  if (!sheet.isEditable) return;

  // One-time migration: infer specialStrengthType from existing fields
  const sys = sheet.item?.system ?? {};
  if (!sys.specialStrengthType) {
    const inferred = sys.clawMaterialStrength ? "claw"
      : sys.telekinesisStrength ? "tk"
      : sys.ensnaringStrength ? "ensnare"
      : "";
    if (inferred) {
      sheet.item.update({ "system.specialStrengthType": inferred }, { render: false });
    }
  }

  // Category change -> re-evaluate visibility, auto-tick section flags,
  // and apply sensible sub-field defaults. Only sets values that are
  // currently unset; explicit user choices always win.
  html.find('#ps2-category').on('change', async ev => {
    const cat = ev.currentTarget.value;
    updateSectionVisibility(html, cat);

    // Auto-suggest activationType (handler at .ps2-activation-type persists + enables AEs)
    const suggested = CATEGORY_ACTIVATION_TYPE[cat];
    if (suggested) {
      const atSelect = html.find('.ps2-activation-type');
      atSelect.val(suggested).trigger('change');
    }

    // Auto-tick section flags + sub-field defaults (only if currently unset)
    const sys = sheet.item.system;
    const updates = {};

    const flagTicks = CATEGORY_FLAG_AUTO_TICK[cat];
    if (flagTicks) {
      for (const [key, val] of Object.entries(flagTicks)) {
        if (!sys[key]) updates[`system.${key}`] = val;
      }
    }

    const fieldDefaults = CATEGORY_FIELD_DEFAULTS[cat];
    if (fieldDefaults) {
      for (const [path, val] of Object.entries(fieldDefaults)) {
        const parts = path.split('.');
        let cur = sys;
        for (const p of parts) {
          cur = cur?.[p];
          if (cur === undefined || cur === null) break;
        }
        if (!cur) updates[`system.${path}`] = val;
      }
    }

    if (Object.keys(updates).length) {
      await sheet.item.update(updates);
    }
  });

  // Activation type change -> if set to passive, force isActive true + enable AEs
  html.find('.ps2-activation-type').on('change', async ev => {
    const val = ev.currentTarget.value;
    if (val === "passive") {
      await sheet.item.update({
        "system.activationType": val,
        "system.isActive": true
      });
      // Enable all transfer AEs for passive powers
      const transferEffects = sheet.item.effects.filter(e => e.transfer);
      if (transferEffects.length) {
        const updates = transferEffects.map(e => ({ _id: e.id, disabled: false }));
        await sheet.item.updateEmbeddedDocuments("ActiveEffect", updates);
      }
    }
  });

  // Section toggle checkboxes -> show/hide body
  html.find('.ps2-section-check').on('change', ev => {
    const cb = ev.currentTarget;
    const section = cb.dataset.section;
    const body = html.find(`.ps2-section[data-section="${section}"] .ps2-section-body`);
    if (cb.checked) {
      body.slideDown(150);
      // If user manually enables a hidden section, make it visible
      html.find(`.ps2-section[data-section="${section}"]`).attr('data-hidden', 'false');
    } else {
      body.slideUp(150);
    }
  });

  // Sub-section toggles (body armor, force field, etc.)
  html.find('.ps2-sub-check').on('change', ev => {
    const cb = ev.currentTarget;
    const sub = cb.dataset.sub;
    const body = html.find(`.ps2-sub-body[data-sub="${sub}"]`);
    cb.checked ? body.slideDown(120) : body.slideUp(120);
  });

  // Damage source -> enable/disable fixed damage field
  html.find('#ps2-dmg-source').on('change', ev => {
    const isFixed = ev.currentTarget.value === 'fixed';
    html.find('input[name="system.damage"]').prop('disabled', !isFixed);
  });

  // Damage type -> auto-tick ignore-armor flags for rotting/corrosive touch
  html.find('#ps2-dmg-type').on('change', async ev => {
    const val = ev.currentTarget.value;
    const updates = { "system.damageType": val };
    if (val === "touch-rotting") {
      updates["system.ignoresNaturalArmor"] = true;
    } else if (val === "touch-corrosive") {
      updates["system.ignoresArtificialArmor"] = true;
    }
    await sheet.item.update(updates);
  });

  // Resistance type -> auto-set effect + minRank from RESISTANCE_TYPE_DEFAULTS.
  // Per Players' Book pp. 71. Damage-based types use damageReduction; ability-
  // based types use featReplace with a minimum-rank rule. Overrides any
  // existing effect/minRank to keep them aligned with the chosen type.
  html.find('#ps2-resistance-type').on('change', async ev => {
    const val = ev.currentTarget.value;
    const updates = { "system.resistanceType": val };
    const defaults = RESISTANCE_TYPE_DEFAULTS[val];
    if (defaults) {
      // Don't override an explicit invulnerability — that's a separate choice
      // from the type's natural effect.
      if (sheet.item.system.resistanceEffect !== "invulnerability") {
        updates["system.resistanceEffect"] = defaults.effect;
      }
      updates["system.resistanceMinRank"] = defaults.minRank;
    }
    await sheet.item.update(updates);
  });

  // Resistance effect -> keep countsAsTwoPowers + isInvulnerability in sync
  // with the "invulnerability" option. Invulnerability costs 2 power slots
  // per rulebook ("The initial choosing of Invulnerability counts as two
  // choices").
  html.find('#ps2-resistance-effect').on('change', async ev => {
    const val = ev.currentTarget.value;
    const updates = { "system.resistanceEffect": val };
    if (val === "invulnerability") {
      updates["system.resistanceIsInvulnerability"] = true;
      if (!sheet.item.system.countsAsTwoPowers) {
        updates["system.countsAsTwoPowers"] = true;
      }
    } else {
      updates["system.resistanceIsInvulnerability"] = false;
      // Don't auto-untick countsAsTwoPowers — user may have set it for
      // another reason (e.g. Time Control also counts as two).
    }
    await sheet.item.update(updates);
  });

  // Rank change -> auto-fill Value from lookup
  html.find('#ps2-rank').on('change', async ev => {
    const rank = ev.currentTarget.value;
    const val = (CONFIG.FASERIP?.rankValues?.[rank] ?? RANK_VALUES[rank]) ?? "";
    html.find('#ps2-value').val(val);
    // Auto-fill armor fields if this is a body armor power
    const updates = { "system.rank": rank, "system.value": Number(val) || 0 };
    if (sheet.item.system.isBodyArmor) {
      const numVal = Number(val) || 0;
      if (!sheet.item.system.armorPhysicalCustom) {
        updates["system.armorPhysical"] = numVal;
      }
      if (!sheet.item.system.armorEnergyCustom) {
        updates["system.armorEnergy"] = Math.max(0, numVal - 20);
      }
    }
    await sheet.item.update(updates);
  });

  // Body Armor: detect manual physical edit -> set custom flag
  html.find('#ps2-armor-phys').on('change', async ev => {
    const newPhys = Number(ev.currentTarget.value) || 0;
    const rankVal = sheet.item.system.value || 0;
    const isCustom = newPhys !== rankVal;
    if (isCustom !== (sheet.item.system.armorPhysicalCustom || false)) {
      await sheet.item.update({ "system.armorPhysicalCustom": isCustom });
    }
  });

  // Body Armor: reset physical to default on badge click
  html.find('[data-action="reset-armor-physical"]').on('click', async ev => {
    ev.preventDefault();
    ev.stopPropagation();
    const rankVal = sheet.item.system.value || 0;
    await sheet.item.update({
      "system.armorPhysical": rankVal,
      "system.armorPhysicalCustom": false
    });
  });

  // Body Armor: detect manual energy edit -> set custom flag
  html.find('#ps2-armor-energy').on('change', async ev => {
    const newEnergy = Number(ev.currentTarget.value) || 0;
    const rankVal = sheet.item.system.value || 0;
    const defaultEnergy = Math.max(0, rankVal - 20);
    const isCustom = newEnergy !== defaultEnergy;
    if (isCustom !== (sheet.item.system.armorEnergyCustom || false)) {
      await sheet.item.update({ "system.armorEnergyCustom": isCustom });
    }
  });

  // Body Armor: reset energy to default on badge click
  html.find('[data-action="reset-armor-energy"]').on('click', async ev => {
    ev.preventDefault();
    ev.stopPropagation();
    const rankVal = sheet.item.system.value || 0;
    await sheet.item.update({
      "system.armorEnergy": Math.max(0, rankVal - 20),
      "system.armorEnergyCustom": false
    });
  });

  // Special strength type change -> re-render to show correct sub-select
  html.find('#ps2-special-str-type').on('change', async ev => {
    await sheet.item.update({ "system.specialStrengthType": ev.currentTarget.value }, { render: false });
    sheet.render(true);
  });

  // Bonus powers: add
  html.find('#ps2-add-bonus').on('click', async () => {
    const item = sheet.item;
    const list = foundry.utils.deepClone(item.system.bonusPowers || []);
    list.push({ name: "", rankMod: "same" });
    await item.update({ "system.bonusPowers": list });
  });

  // Bonus powers: remove
  html.find('.ps2-remove-bonus').on('click', async ev => {
    const idx = Number(ev.currentTarget.dataset.index);
    const item = sheet.item;
    const list = foundry.utils.deepClone(item.system.bonusPowers || []);
    list.splice(idx, 1);
    await item.update({ "system.bonusPowers": list });
  });

  // Extra Body Parts: add
  html.find('#ps2-add-bodypart').on('click', async () => {
    const item = sheet.item;
    const list = foundry.utils.deepClone(item.system.extraBodyParts || []);
    list.push({ type: "", count: 1, notes: "" });
    await item.update({ "system.extraBodyParts": list });
  });

  // Extra Body Parts: remove
  html.find('.ps2-remove-bodypart').on('click', async ev => {
    const idx = Number(ev.currentTarget.dataset.index);
    const item = sheet.item;
    const list = foundry.utils.deepClone(item.system.extraBodyParts || []);
    list.splice(idx, 1);
    await item.update({ "system.extraBodyParts": list });
  });

  // SFX preview (reuse existing pattern)
  html.find('.sfx-preview').on('click', ev => {
    const btn = ev.currentTarget;
    const field = btn.dataset.sfxField;
    const volField = btn.dataset.volumeField;
    const path = html.find(`input[name="${field}"]`).val();
    if (!path) return;
    const vol = (Number(html.find(`input[name="${volField}"]`).val()) || 80) / 100;
    const audio = new Audio(path);
    audio.volume = vol;
    audio.play().catch(() => {});
  });

  // VFX preview — reads form values (so unsaved edits preview correctly)
  html.find('.vfx-preview').on('click', async ev => {
    ev.preventDefault();
    const preset   = html.find('select[name="system.vfx.preset"]').val() || "";
    const color    = html.find('input[name="system.vfx.color"]').val() || "";
    const asset    = html.find('input[name="system.vfx.asset"]').val() || "";
    const impact   = html.find('input[name="system.vfx.impact"]').val() || "";
    const scale    = Number(html.find('input[name="system.vfx.scale"]').val()) || 1;
    const duration = Number(html.find('input[name="system.vfx.duration"]').val()) || 1000;
    if (game.msh?.fx?.preview) {
      await game.msh.fx.preview({ preset, color, asset, impact, scale, duration });
    } else {
      ui.notifications?.warn("FX service unavailable.");
    }
  });

  // File picker buttons — V2 dropped V1's automatic class="file-picker"
  // binding, so sheets have to wire them up themselves.
  // Covers both <button class="file-picker"> rows (SFX hit/miss, VFX
  // asset/impact) and the portrait <img data-edit="img"> in the header.
  const FilePickerImpl = foundry.applications.apps?.FilePicker?.implementation ?? FilePicker;

  html.find('button.file-picker').on('click', ev => {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const target = btn.dataset.target;
    if (!target) return;
    const input = html.find(`input[name="${target}"]`);
    new FilePickerImpl({
      type: btn.dataset.type || "imagevideo",
      current: input.val() || "",
      callback: path => {
        input.val(path).trigger("change");
      }
    }).render(true);
  });

  html.find('img[data-edit]').on('click', ev => {
    ev.preventDefault();
    const img = ev.currentTarget;
    const field = img.dataset.edit;
    if (!field) return;
    new FilePickerImpl({
      type: "image",
      current: img.getAttribute("src") || "",
      callback: path => {
        sheet.item.update({ [field]: path });
      }
    }).render(true);
  });

  // Active Effects: auto-expand if effects exist, collapse if none
  const effectsFieldset = html.find('.ps2-effects-fieldset');
  const effectsBody = html.find('.ps2-effects-body');
  const hasEffects = effectsBody.find('.ps2-effect-row').length > 0;
  if (hasEffects) {
    effectsBody.show();
    effectsFieldset.attr('data-expanded', 'true');
  }
  html.find('.ps2-effects-expand').on('click', ev => {
    ev.preventDefault();
    const expanded = effectsFieldset.attr('data-expanded') === 'true';
    if (expanded) {
      effectsBody.slideUp(150);
      effectsFieldset.attr('data-expanded', 'false');
    } else {
      effectsBody.slideDown(150);
      effectsFieldset.attr('data-expanded', 'true');
    }
  });

  // Persistent textarea heights (localStorage keyed by item ID + field name)
  const itemId = sheet.item?.id ?? 'unknown';
  html.find('.ps2-textarea').each(function () {
    const ta = this;
    const $ta = $(ta);
    const field = $ta.attr('name');
    if (!field) return;
    const key = `ps2-ta-${itemId}-${field}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      ta.style.height = saved + 'px';
      ta.removeAttribute('rows');
    }
    // Save on drag-resize (mouseup after resize changes offsetHeight)
    let lastH = ta.offsetHeight;
    $ta.on('mouseup', () => {
      if (ta.offsetHeight !== lastH) {
        lastH = ta.offsetHeight;
        localStorage.setItem(key, lastH);
      }
    });
  });
}

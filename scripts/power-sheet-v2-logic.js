// power-sheet-v2-logic.js v1.3.0 - 2026-03-12
// v1.3.0: Persistent textarea resize heights (localStorage per item)
// v1.2.0: Collapsible Active Effects, Healing/Absorption toggle, bigger textareas
// v1.1.0: Rank→Value auto-fill, special strength type change handler, field reorder support
// Drop-in: call ps2ActivateListeners(html, itemSheet) from activateListeners

// Rank → value lookup (mirrors CONFIG.FASERIP.rankValues, available before init)
const RANK_VALUES = {
  "Shift-0": 0, "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10,
  "Excellent": 20, "Remarkable": 30, "Incredible": 40, "Amazing": 50,
  "Monstrous": 75, "Unearthly": 100, "Shift-X": 150, "Shift-Y": 200,
  "Shift-Z": 500, "Class 1000": 1000, "Class 3000": 3000, "Class 5000": 5000,
  "Beyond": 9999
};

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

// Sections always shown regardless of category
const ALWAYS_VISIBLE = ["limitation", "bonusPowers", "magic"];

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
  const autoExp = CATEGORY_AUTO_EXPAND[category];
  if (autoExp) {
    for (const sectionKey of autoExp.sections) {
      const sectionEl = html.find(`.ps2-section[data-section="${sectionKey}"]`);
      const toggle = sectionEl.find('.ps2-section-check');
      if (toggle.length && !toggle.prop('checked')) {
        toggle.prop('checked', true).trigger('change');
      }
      // Also force-show the body in case it was hidden by inline style
      sectionEl.find('.ps2-section-body').show();
    }
    for (const subKey of autoExp.subs) {
      const subCheck = html.find(`.ps2-sub-check[data-sub="${subKey}"]`);
      if (subCheck.length && !subCheck.prop('checked')) {
        subCheck.prop('checked', true).trigger('change');
      }
      html.find(`.ps2-sub-body[data-sub="${subKey}"]`).show();
    }
  }
}

export function ps2ActivateListeners(html, sheet) {
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

  const category = html.find('#ps2-category').val();
  updateSectionVisibility(html, category);

  // Category change -> re-evaluate visibility
  html.find('#ps2-category').on('change', ev => {
    updateSectionVisibility(html, ev.currentTarget.value);
    // Auto-suggest activationType if it hasn't been manually set or is still default
    const suggested = CATEGORY_ACTIVATION_TYPE[ev.currentTarget.value];
    if (suggested) {
      const atSelect = html.find('.ps2-activation-type');
      atSelect.val(suggested).trigger('change');
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

  // Rank change -> auto-fill Value from lookup
  html.find('#ps2-rank').on('change', async ev => {
    const rank = ev.currentTarget.value;
    const val = (CONFIG.FASERIP?.rankValues?.[rank] ?? RANK_VALUES[rank]) ?? "";
    html.find('#ps2-value').val(val);
    // Persist both so submitOnChange picks up the pair
    await sheet.item.update({ "system.rank": rank, "system.value": Number(val) || 0 });
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

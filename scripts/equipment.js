// equipment.js v2.0.0 - 2026-04-18
// v2.0.0: Migrate to ApplicationV2 / ItemSheetV2 (v16 prep; v14 backward-compat shims gone in v16)
//         _updateObject → _prepareSubmitData. Manual tab wiring for .sheet-tabs nav.
// v1.5.0: Expanded categories (gear subtypes, device, armor resistances). Computed display flags
//         in getData() — no duplicate form fields. Array reconstruction in _updateObject.
// v1.4.0: Rewrite effects to use standard changes[] — system.* for mechanics, faserip.token.* for visuals
// v1.2.0: Add "other" category (grenade/missile); other-fields show/hide; weaponType sub-section toggle
import { applyDamageToTargets } from "./modules/actions/action-utils.js";
import { debugLog } from "./modules/actions/action-utils.js";
import { rollUniversalTable } from "./modules/dice/universal-table.js";
import { prepareActiveEffectCategories, onManageActiveEffect } from "../helpers/effects.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

// Power Rank Range Table (based on "Faserip Combat 02.txt")
const POWER_RANGE_VALUES = {
  "Shift-0": 0, "Feeble": 0, "Poor": 1, "Typical": 2, "Good": 4,
  "Excellent": 6, "Remarkable": 8, "Incredible": 10, "Amazing": 20,
  "Monstrous": 40, "Unearthly": 60, "Shift X": 80, "Shift Y": 160,
  "Shift Z": 400,
  // Converted miles to areas (1 mile = 1760 yards/areas)
  "Class 1000": 4000,   // 100 miles
  "Class 3000": 400000, // 10,000 miles
  "Class 5000": 40000000, // 1,000,000 miles
  "Beyond": Infinity      // Unlimited
};

export class FaseripEquipmentSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["faserip", "sheet", "item", "equipment"],
    position: { width: 530, height: 680 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    main: { template: "systems/msh-faserip/templates/equipment-sheet.html" }
  };

  /** Use item name alone as window title (drops V2's "TYPES.Item.equipment:" prefix) */
  get title() { return this.item?.name ?? super.title; }

  async _prepareContext(options) {
    // Get base data
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system;

    // Add custom CSS class based on document type
    const classes = ["faserip", "sheet", "item", this.item.type];
    context.cssClass = classes.join(" ");

    // All FASERIP Ranks
    context.ranks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift X", "Shift Y", "Shift Z",
      "Class 1000", "Class 3000", "Class 5000", "Beyond"
    ];

    // All FASERIP Combat Damage Types + custom resistance types
    context.damageTypes = [
      "S",    // Shooting
      "E",    // Energy
      "F",    // Force
      "EA",   // Edged Attack
      "BA",   // Blunt Attack
      "TE",   // Throwing Edged
      "TB",   // Throwing Blunt
      "GP",   // Grappling
      "Gb",   // Grabbing

      // Extended types used for resistances or passive armor
      "sensory",
      "mental",
      "radiation",
      "corrosive",
      "toxin",
      "magic",
      "disease",
      "emotion"
    ];

    // Computed display flags — controls which sections render (no duplicate form fields)
    const cat = this.item.system.category || "gear";
    const gt = this.item.system.gearType || "";
    context.isWeapon = (cat === "weapon");
    context.isOther = (cat === "other");
    context.isArmor = (cat === "armor");
    context.isGear = (cat === "gear");
    context.isDevice = (cat === "device" || cat === "custom");
    context.isPowerItem = (cat === "power-item");
    context.isGearProtective = (cat === "gear" && gt === "protective");
    context.isGearSensory = (cat === "gear" && gt === "sensory");
    context.isGearMovement = (cat === "gear" && gt === "movement");
    context.isGearRestraint = (cat === "gear" && gt === "restraint");
    context.isGearSundry = (cat === "gear" && gt === "sundry");
    // Show protection + resistances for armor OR gear-protective
    context.showProtection = (cat === "armor" || (cat === "gear" && gt === "protective"));
    context.showResistances = (cat === "armor" || (cat === "gear" && gt === "protective"));
    context.showSfx = (cat === "weapon" || cat === "other");

    // Auto-compute protectionValue from rank if value is 0 and rank is set
    if (this.item.system.protection && !this.item.system.protectionValue) {
      const rv = CONFIG.FASERIP?.rankValues?.[this.item.system.protection];
      if (rv !== undefined) context.system.protectionValue = rv;
    }

    // Auto-compute resistance values from rank if not set
    if (Array.isArray(this.item.system.resistances)) {
      context.system.resistances = this.item.system.resistances.map(r => {
        if (r.rank && !r.value) {
          const rv = CONFIG.FASERIP?.rankValues?.[r.rank];
          if (rv !== undefined) return { ...r, value: rv };
        }
        return r;
      });
    }

    // Active Effects on this equipment item
    context.effects = prepareActiveEffectCategories(this.item.effects);

    // ── Device Functions display data ──
    if (context.isDevice) {
      context.deviceFunctionsDisplay = this._buildDeviceFunctionsDisplay();
    }

    return context;
  }

  /** @override */
  /**
   * V2 replacement for V1 _updateObject. Transforms the flat formData into an
   * expanded submit object: maps `_other*` synthetic inputs into real slots
   * when category is "other", and rebuilds indexed arrays that expandObject
   * turns into numeric-keyed objects. V2 then passes this to _processSubmitData
   * which defaults to this.document.update(submitData).
   */
  _prepareSubmitData(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    if (!data.system) data.system = {};
    const category = (data.system.category !== undefined) ? data.system.category : this.item.system.category;

    // other-fields uses _-prefixed names to avoid form collision with weapon-fields.
    if (data.system._otherWeaponType !== undefined) {
      if (category === "other") data.system.weaponType = data.system._otherWeaponType;
    }
    if (data.system._otherShots !== undefined) {
      if (category === "other") {
        const qty = parseInt(data.system._otherShots, 10);
        data.system.shots = isNaN(qty) ? 0 : qty;
        data.system.shotsRemaining = data.system.shots;
      }
    }
    if (data.system._otherLegality !== undefined) {
      if (category === "other") data.system.legality = data.system._otherLegality;
    }
    delete data.system._otherWeaponType;
    delete data.system._otherShots;
    delete data.system._otherLegality;

    // Rebuild arrays — expandObject turns indexed form names into objects with numeric keys
    if (data.system.resistances && !Array.isArray(data.system.resistances)) {
      data.system.resistances = Object.values(data.system.resistances).map(r => ({
        type: r.type || "fireHeat",
        rank: r.rank || "Typical",
        value: parseInt(r.value) || 0,
        customLabel: r.customLabel || ""
      }));
    }
    if (data.system.abilityModifiers && !Array.isArray(data.system.abilityModifiers)) {
      data.system.abilityModifiers = Object.values(data.system.abilityModifiers).map(m => ({
        ability: m.ability || "fighting",
        shiftCS: parseInt(m.shiftCS) || 0
      }));
    }
    if (data.system.attackModes && !Array.isArray(data.system.attackModes)) {
      data.system.attackModes = Object.values(data.system.attackModes).map(m => ({
        name: m.name || "",
        actionType: m.actionType || "blunt-attack",
        damageType: m.damageType || "BA",
        damage: parseInt(m.damage) || 0,
        ability: m.ability || "fighting",
        description: m.description || "",
        allowedVariants: m.allowedVariants || ["standard"],
        sfx: m.sfx || { hit: "", miss: "", critical: "" }
      }));
    }
    if (data.system.customAbilities && !Array.isArray(data.system.customAbilities)) {
      data.system.customAbilities = Object.values(data.system.customAbilities).map(a => ({
        name: a.name || "",
        description: a.description || "",
        rank: a.rank || "Typical",
        damageType: a.damageType || "",
        range: a.range || "",
        isPassiveArmor: a.isPassiveArmor || false,
        armorDamageType: a.armorDamageType || ""
      }));
    }
    if (data.system.powers && !Array.isArray(data.system.powers)) {
      data.system.powers = Object.values(data.system.powers).map(p => ({
        name: p.name || "",
        rank: p.rank || "Typical",
        value: parseInt(p.value) || 0,
        damageType: p.damageType || "",
        isPassiveArmor: p.isPassiveArmor || false,
        grantedByEquipment: p.grantedByEquipment || "true"
      }));
    }
    if (data.system.deviceFunctions && !Array.isArray(data.system.deviceFunctions)) {
      data.system.deviceFunctions = Object.values(data.system.deviceFunctions);
    }

    return data;
  }

  /**
   * Capture scroll position and the currently-focused input's name +
   * caret position right before V2 destroys the DOM for re-render.
   * Restored in _onRender.
   */
  _preRender(context, options) {
    if (super._preRender) super._preRender(context, options);
    if (!this.element) return;
    const scroller = this.element.querySelector(".window-content");
    const active = this.element.contains(document.activeElement) ? document.activeElement : null;
    let focusName = null, selectionStart = null, selectionEnd = null;
    if (active && active.name) {
      focusName = active.name;
      if ("selectionStart" in active) {
        try { selectionStart = active.selectionStart; selectionEnd = active.selectionEnd; }
        catch (_e) { /* type=number on some browsers rejects */ }
      }
    }
    this._scrollSnapshot = {
      scrollTop: scroller?.scrollTop ?? 0,
      focusName,
      selectionStart,
      selectionEnd
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;
    const html = $(this.element);

    // Restore scroll position + focused-element-by-name after re-render. V2's
    // submitOnChange triggers a full render on every field change, which by
    // default loses scroll position and active focus. We snapshot in
    // _preRender (just before the DOM is replaced) and restore here.
    if (this._scrollSnapshot) {
      const snap = this._scrollSnapshot;
      // Restore scroll on the .window-content scroll container
      const scroller = this.element.querySelector(".window-content");
      if (scroller && typeof snap.scrollTop === "number") {
        scroller.scrollTop = snap.scrollTop;
      }
      // Restore focus on the input matching the captured `name` attribute.
      // Caret position restore on text/number inputs; selects just refocus.
      if (snap.focusName) {
        const target = this.element.querySelector(`[name="${CSS.escape(snap.focusName)}"]`);
        if (target) {
          target.focus({ preventScroll: true });
          if (typeof snap.selectionStart === "number" && "setSelectionRange" in target) {
            try { target.setSelectionRange(snap.selectionStart, snap.selectionEnd); } catch (_e) { /* select / type=number rejects */ }
          }
        }
      }
      this._scrollSnapshot = null;
    }

    // One-time migration: backfill vfx defaults for equipment created before
    // the vfx schema was added. Without this, partial form submissions into
    // an undefined parent can fail to merge cleanly.
    const sys = this.item?.system ?? {};
    if (!sys.vfx || typeof sys.vfx !== "object") {
      this.item.update({
        "system.vfx": {
          enabled: true,
          preset: "",
          color: "",
          asset: "",
          impact: "",
          scale: 1,
          duration: 1000
        }
      }, { render: false });
    }

    // Manual tab handling — replaces V1 `tabs: [...]` defaultOptions entry.
    // Template has `data-tab="properties"` / `data-tab="effects"` elements.
    const activateTab = (tabName) => {
      this._activeTab = tabName;
      html.find('.sheet-tabs .item').removeClass('active');
      html.find(`.sheet-tabs .item[data-tab="${tabName}"]`).addClass('active');
      html.find('.sheet-body > .tab[data-group="primary"]').removeClass('active');
      html.find(`.sheet-body > .tab[data-tab="${tabName}"][data-group="primary"]`).addClass('active');
    };
    activateTab(this._activeTab || "properties");
    html.find('.sheet-tabs .item[data-tab]').on('click', ev => {
      ev.preventDefault();
      activateTab(ev.currentTarget.dataset.tab);
    });

    // ── Active Effect controls ──
    html.find('.effect-control').click(ev => {
      onManageActiveEffect(ev, this.item);
    });

    // Collapsible effect sections
    html.find('.effect-header').click((event) => {
      if ($(event.target).closest('.effect-control, .btn-add').length) return;
      const section = event.currentTarget.closest('.effect-section');
      section.classList.toggle('collapsed');
    });

    // ── Effect Preset buttons ──
    html.find('.effect-preset-btn').click(async (ev) => {
      ev.preventDefault();
      const preset = ev.currentTarget.dataset.preset;
      const effectData = this._buildPresetEffect(preset);
      if (effectData) {
        await this.item.createEmbeddedDocuments('ActiveEffect', [effectData]);
      }
    });

    // SFX Preview button handler
    html.find(".sfx-preview").on("click", async (ev) => {
      ev.preventDefault();
      const button = ev.currentTarget;
      const sfxField = button.dataset.sfxField;
      const volumeField = button.dataset.volumeField;
      
      // Get SFX path from the corresponding input field
      const sfxInput = html.find(`input[name="${sfxField}"]`);
      const sfxPath = sfxInput.val();
      
      if (!sfxPath) {
        ui.notifications.warn("No sound file selected");
        return;
      }
      
      // Get volume (default 80 if not set)
      const volumeInput = html.find(`input[name="${volumeField}"]`);
      const volume = (parseInt(volumeInput.val()) || 80) / 100;
      
      // Stop any currently playing preview
      if (this._previewSound) {
        this._previewSound.stop();
        html.find(".sfx-preview").removeClass("playing");
      }
      
      try {
        button.classList.add("playing");
        this._previewSound = await foundry.audio.AudioHelper.play({
          src: sfxPath,
          volume: volume,
          autoplay: true,
          loop: false
        }, false);
        
        // Remove playing class when sound ends
        if (this._previewSound) {
          this._previewSound.addEventListener("end", () => {
            button.classList.remove("playing");
            this._previewSound = null;
          });
          this._previewSound.addEventListener("stop", () => {
            button.classList.remove("playing");
            this._previewSound = null;
          });
        }
      } catch (err) {
        console.error("[FASERIP ERROR] Failed to play SFX preview:", err);
        ui.notifications.error("Failed to play sound: " + err.message);
        button.classList.remove("playing");
      }
    });

    // VFX Preview button handler — reads form values so unsaved edits preview correctly
    html.find(".vfx-preview").on("click", async (ev) => {
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

    html.find(".add-granted-power").on("click", ev => {
      ev.preventDefault();
      const powers = duplicate(this.item.system.powers || []);
      powers.push({
        name: "",
        rank: "Typical",
        value: 6,
        damageType: "",
        isPassiveArmor: false,
        grantedByEquipment: true
      });
      this.item.update({ "system.powers": powers });
    });

    html.find(".remove-granted-power").on("click", ev => {
      ev.preventDefault();
      const index = Number(ev.currentTarget.dataset.index);
      const powers = duplicate(this.item.system.powers || []);
      powers.splice(index, 1);
      this.item.update({ "system.powers": powers });
    });

    // grenade listeners
    html.find('[name="system.grenadeType"]').change(ev => {
      const grenadeType = ev.currentTarget.value;
      let damage = "";
      let damageType = "";
      let intensity = "";

      // Set default values based on grenade type
      switch (grenadeType) {
        case "fragmentation":
          damage = "RM (30)";
          damageType = "EA";
          break;
        case "concussive":
          damage = "40";
          damageType = "BA";
          break;
        case "sonic":
          damage = "20";
          damageType = "E";
          break;
        case "flash":
          damage = "Amazing Intensity";
          damageType = ""; // Flash often has no direct damage type in the universal table context
          intensity = "Amazing";
          break;
        case "tearGas":
          intensity = "Typical";
          break;
        case "knockout":
          intensity = "Excellent";
          break;
        case "smoke":
          intensity = "Excellent";
          break;
        // Add other types as needed
      }

      // Update the fields
      html.find('[name="system.grenadeDamage"]').val(damage);
      html.find('[name="system.grenadeDamageType"]').val(damageType);

      // Update intensity if set (and clear if not applicable)
      html.find('[name="system.grenadeIntensity"]').val(intensity);
    });

    html.find('[name="system.payloadType"]').change(ev => {
      const payloadType = ev.currentTarget.value;
      let damage = "";
      let secondaryDamage = "";
      let damageType = "EA"; // Default for most missiles

      // Set default damage values based on payload type
      switch (payloadType) {
        case "standard":
          damage = "40";
          break;
        case "concentrated":
          damage = "40";
          break;
        case "high-explosive":
          damage = "70";
          secondaryDamage = "20";
          break;
        case "incendiary":
          damage = "40";
          damageType = "E"; // Incendiary deals Energy damage
          break;
        case "gas":
          damage = ""; // Gas payloads deal no direct damage, but apply intensity
          damageType = "";
          html.find('[name="system.missileIntensity"]').val("Typical"); // Assuming Typical intensity for gas payload
          break;
        // Add other types as needed
      }

      // Update the fields
      html.find('[name="system.missileDamage"]').val(damage);
      html.find('[name="system.missileSecondaryDamage"]').val(secondaryDamage);
      html.find('[name="system.missileDamageType"]').val(damageType);
    });

    // Toggle collapsible sections
    html.find('.collapsible').click(ev => {
      const header = ev.currentTarget;
      const section = header.dataset.section;
      const content = header.nextElementSibling;
      const icon = header.querySelector('i');

      // Toggle the content display
      const isOpen = content.style.display !== "none";
      if (!isOpen) {
        content.style.display = "block";
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
        this.item.setFlag("msh-faserip", `section_${section}_open`, true);
      } else {
        content.style.display = "none";
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
        this.item.setFlag("msh-faserip", `section_${section}_open`, false);
      }
    });

    // Initialize section states based on saved flags
    html.find('.collapsible').each((i, el) => {
      const header = el;
      const section = header.dataset.section;
      const content = header.nextElementSibling;
      const icon = header.querySelector('i');

      const isOpen = this.item.getFlag("msh-faserip", `section_${section}_open`);
      if (isOpen) {
        content.style.display = "block";
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
      } else {
        // Ensure closed state is consistent on load if flag is false or not set
        content.style.display = "none";
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
      }
    });



    // Auto-fill rank number when rank dropdown changes
    html.find('.rank-with-value').change(ev => {
      const rank = ev.currentTarget.value;
      const targetName = ev.currentTarget.dataset.valueTarget;
      if (!targetName) return;
      const rv = CONFIG.FASERIP?.rankValues?.[rank];
      if (rv !== undefined) {
        const valueInput = html.find(`[name="${targetName}"]`);
        if (valueInput.length) valueInput.val(rv);
      }
    });

    // Category change — update data and re-render (template uses {{#if}} flags from getData)
    html.find('.equipment-category-select').change(async ev => {
      ev.preventDefault();
      await this.item.update({"system.category": ev.currentTarget.value});
    });

    // Gear sub-type change — update and re-render
    html.find('.gear-type-select').change(async ev => {
      ev.preventDefault();
      await this.item.update({"system.gearType": ev.currentTarget.value});
    });


    // Other weapon type sub-section toggle
    html.find('.other-weapon-type-select').change(ev => {
      const wt = ev.currentTarget.value;
      html.find('.other-grenade-fields, .other-missile-fields').hide();
      if (wt === 'grenade') html.find('.other-grenade-fields').show();
      else if (wt === 'missile') html.find('.other-missile-fields').show();
    });

    // Add resistance
    html.find('.add-resistance').click(async ev => {
      ev.preventDefault();
      const resistances = foundry.utils.duplicate(this.item.system.resistances || []);
      resistances.push({ type: "fireHeat", rank: "Typical", value: 6, customLabel: "" });
      await this.item.update({ "system.resistances": resistances }, {diff: false});
    });

    // Remove resistance
    html.find('.remove-resistance').click(async ev => {
      ev.preventDefault();
      const index = parseInt(ev.currentTarget.dataset.index);
      const resistances = foundry.utils.duplicate(this.item.system.resistances || []);
      if (resistances.length > index) {
        resistances.splice(index, 1);
        await this.item.update({ "system.resistances": resistances }, {diff: false});
      }
    });

    // Add ability modifier (restraint gear)
    html.find('.add-ability-modifier').click(async ev => {
      ev.preventDefault();
      const mods = foundry.utils.duplicate(this.item.system.abilityModifiers || []);
      mods.push({ ability: "fighting", shiftCS: -1 });
      await this.item.update({ "system.abilityModifiers": mods }, {diff: false});
    });

    // Remove ability modifier
    html.find('.remove-ability-modifier').click(async ev => {
      ev.preventDefault();
      const index = parseInt(ev.currentTarget.dataset.index);
      const mods = foundry.utils.duplicate(this.item.system.abilityModifiers || []);
      if (mods.length > index) {
        mods.splice(index, 1);
        await this.item.update({ "system.abilityModifiers": mods }, {diff: false});
      }
    });


    // Add custom ability handler
    html.find('.add-custom-ability').click(async ev => {
      const stunts = this.item.system.customAbilities || [];
      stunts.push({
        name: "New Ability",
        description: "",
        rank: "Typical",
        damageType: "",
        range: "",
        isPassiveArmor: false, // Initialize new armor fields
        armorDamageType: ""
      });
      await this.item.update({ "system.customAbilities": stunts }, {diff: false});
      this.render(true); // Re-render to show the new row immediately
    });

    // Remove custom ability handler
    html.find('.remove-custom-ability').click(async ev => {
      const index = parseInt(ev.currentTarget.dataset.index);

      let abilities = duplicate(this.item.system.customAbilities || []);
      if (!Array.isArray(abilities)) {
        abilities = []; // Ensure it's an array for splice to work
        console.warn("customAbilities was not an array, creating empty array");
      }

      if (abilities.length > index) {
        abilities.splice(index, 1);
        await this.item.update({ "system.customAbilities": abilities }, {diff: false});
        this.render(true); // Re-render to reflect the removal
      } else {
        console.error("Invalid ability index:", index, "length:", abilities.length);
      }
    });

    // --- NEW LISTENER FOR SAVING DROPDOWN DATA IN CUSTOM ABILITIES ---
    // This listener captures changes within the custom abilities list to ensure data is saved
    html.find('.custom-abilities-list').on('change', 'select, input, textarea', async ev => {
        ev.preventDefault(); // Prevent default form behavior if submitOnChange is global

        const newCustomAbilities = [];
        const abilityRows = html.find('.custom-ability'); // Get all custom ability rows in the DOM

        // Iterate through each row and reconstruct the ability object from its form elements
        for (let i = 0; i < abilityRows.length; i++) {
            const abilityRow = abilityRows[i];

            // Access elements by their name attribute within this specific row
            const name = abilityRow.querySelector(`[name="system.customAbilities.${i}.name"]`)?.value || "";
            const description = abilityRow.querySelector(`[name="system.customAbilities.${i}.description"]`)?.value || "";
            const rank = abilityRow.querySelector(`[name="system.customAbilities.${i}.rank"]`)?.value || "Typical";
            const damageType = abilityRow.querySelector(`[name="system.customAbilities.${i}.damageType"]`)?.value || "";
            const range = abilityRow.querySelector(`[name="system.customAbilities.${i}.range"]`)?.value || "";
            const isPassiveArmor = abilityRow.querySelector(`[name="system.customAbilities.${i}.isPassiveArmor"]`)?.checked || false;
            const armorDamageType = abilityRow.querySelector(`[name="system.customAbilities.${i}.armorDamageType"]`)?.value || "";

            newCustomAbilities.push({
                name,
                description,
                rank,
                damageType,
                range,
                isPassiveArmor,
                armorDamageType
            });
        }

        // Update the item's data model with the reconstructed array
        await this.item.update({ "system.customAbilities": newCustomAbilities }, { diff: false });
        // Re-render the sheet to ensure the UI reflects the saved state accurately
        // This is crucial for dropdowns to show their 'selected' state and for conditional displays (like armor type)
        this.render(true);
    });

    // --- NEW LISTENER FOR TOGGLING ARMOR TYPE DISPLAY IN CUSTOM ABILITIES ---
    // This makes the 'Armor Type (Specific)' dropdown appear/disappear based on 'Grants Passive Armor' checkbox
    html.find('.custom-abilities-list').on('change', 'input[name$=".isPassiveArmor"]', async ev => {
        const checkbox = ev.currentTarget;
        const abilityRow = checkbox.closest('.custom-ability');
        const armorTypeSelectGroup = abilityRow.querySelector('.form-group[style*="display: none;"]'); // Target the hidden group

        if (checkbox.checked) {
            if (armorTypeSelectGroup) armorTypeSelectGroup.style.display = "block";
        } else {
            if (armorTypeSelectGroup) armorTypeSelectGroup.style.display = "none";
        }
    });

    // ── Device Functions listeners ──
    html.find('.df-add-btn').click(async ev => {
      ev.preventDefault();
      this._openDeviceFunctionTypeSelector();
    });

    html.find('.df-remove-btn').click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const index = parseInt(ev.currentTarget.dataset.fnIndex);
      const fns = foundry.utils.duplicate(this.item.system.deviceFunctions || []);
      if (index < fns.length) {
        const removed = fns[index];
        // If buff, also remove the managed Active Effect
        if (removed.type === "buff" && removed._effectId) {
          const eff = this.item.effects.get(removed._effectId);
          if (eff) await eff.delete();
        }
        fns.splice(index, 1);
        await this.item.update({ "system.deviceFunctions": fns }, { diff: false });
        this.render(true);
      }
    });

    html.find('.df-edit-btn').click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const index = parseInt(ev.currentTarget.dataset.fnIndex);
      this._openDeviceFunctionEditDialog(index);
    });

    html.find('.df-buff-toggle').on('change', async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const index = parseInt(ev.currentTarget.dataset.fnIndex);
      const fns = foundry.utils.duplicate(this.item.system.deviceFunctions || []);
      if (index >= fns.length) return;
      const fn = fns[index];
      const enabled = ev.currentTarget.checked;
      fn.enabled = enabled;

      // Toggle the managed Active Effect
      if (fn._effectId) {
        const eff = this.item.effects.get(fn._effectId);
        if (eff) await eff.update({ disabled: !enabled });
      }
      await this.item.update({ "system.deviceFunctions": fns }, { diff: false });
    });

    // Attack Modes listeners
    html.find('.add-attack-mode').click(async ev => {
      ev.preventDefault();
      
      let modes = this.item.system.attackModes || [];
      if (!Array.isArray(modes)) {
        modes = Object.values(modes).filter(m => m);
      }
      modes = foundry.utils.duplicate(modes);
      
      modes.push({
        name: "New Mode",
        actionType: "blunt-attack",
        damageType: "BA",
        damage: this.item.system.damage || 10,
        ability: "fighting",
        description: ""
      });
      await this.item.update({ "system.attackModes": modes });
    });

    html.find('.remove-attack-mode').click(async ev => {
      ev.preventDefault();
      const index = parseInt(ev.currentTarget.dataset.index);
      
      // Ensure we're working with an array
      let modes = this.item.system.attackModes || [];
      if (!Array.isArray(modes)) {
        modes = Object.values(modes).filter(m => m); // Convert object to array
      }
      modes = foundry.utils.duplicate(modes);
      
      // Remove the mode at index
      modes.splice(index, 1);
      
      await this.item.update({ "system.attackModes": modes });
      this.render(true);
    });

    // Save attack mode changes on field change (without re-render)
    

    // Roll equipment button
    html.find('.roll-equipment').click(ev => {
      this.rollEquipment();
    });
  }

  // ── Preset effect templates using standard Foundry changes[] ──
  // system.* keys are applied by Foundry's applyActiveEffects automatically.
  // faserip.token.* keys use CUSTOM mode and are handled by our applyActiveEffect hook.
  // v14: AE changes live at system.changes, and change.mode is now change.type.
  // _v14NormalizeAE rewrites the legacy shape on return so preset bodies stay readable.
  _v14NormalizeAE(data) {
    if (!data) return data;
    if (Array.isArray(data.changes)) {
      const changes = data.changes.map(c => ({ ...c, type: c.type ?? c.mode }));
      data.system = Object.assign({}, data.system, { changes });
      delete data.changes;
    }
    return data;
  }

  _buildPresetEffect(preset) {
    const origin = this.item.uuid;
    const base = { origin, disabled: true, transfer: true };

    const raw = (() => { switch (preset) {

      // ── Visual / Token presets ──
      case "light":
        return foundry.utils.mergeObject(base, {
          name: "Light Source",
          img: "icons/svg/light.svg",
          changes: [
            { key: "faserip.token.light.bright", mode: "custom", value: "0.5" },
            { key: "faserip.token.light.dim", mode: "custom", value: "1" },
            { key: "faserip.token.light.color", mode: "custom", value: "#ffdd88" },
            { key: "faserip.token.light.alpha", mode: "custom", value: "0.3" },
            { key: "faserip.token.light.angle", mode: "custom", value: "360" },
            { key: "faserip.token.light.animation.type", mode: "custom", value: "torch" },
            { key: "faserip.token.light.animation.speed", mode: "custom", value: "3" },
            { key: "faserip.token.light.animation.intensity", mode: "custom", value: "3" }
          ]
        });

      case "flashlight":
        return foundry.utils.mergeObject(base, {
          name: "Flashlight Beam",
          img: "icons/svg/light.svg",
          changes: [
            { key: "faserip.token.light.bright", mode: "custom", value: "0.5" },
            { key: "faserip.token.light.dim", mode: "custom", value: "1" },
            { key: "faserip.token.light.color", mode: "custom", value: "#ffffcc" },
            { key: "faserip.token.light.alpha", mode: "custom", value: "0.5" },
            { key: "faserip.token.light.angle", mode: "custom", value: "60" },
            { key: "faserip.token.light.animation.type", mode: "custom", value: "" },
            { key: "faserip.token.light.animation.speed", mode: "custom", value: "0" },
            { key: "faserip.token.light.animation.intensity", mode: "custom", value: "0" }
          ]
        });

      case "darkvision":
        return foundry.utils.mergeObject(base, {
          name: "Darkvision / Infravision",
          img: "icons/svg/eye.svg",
          changes: [
            { key: "faserip.token.sight.range", mode: "custom", value: "120" },
            { key: "faserip.token.sight.visionMode", mode: "custom", value: "darkvision" }
          ]
        });

      case "stealth":
        return foundry.utils.mergeObject(base, {
          name: "Stealth Field",
          img: "icons/svg/invisible.svg",
          changes: [
            { key: "faserip.token.alpha", mode: "custom", value: "0.4" }
          ]
        });

      case "forcefield":
        return foundry.utils.mergeObject(base, {
          name: "Force Field Aura",
          img: "icons/svg/aura.svg",
          changes: [
            { key: "faserip.token.light.bright", mode: "custom", value: "0" },
            { key: "faserip.token.light.dim", mode: "custom", value: "0.15" },
            { key: "faserip.token.light.color", mode: "custom", value: "#4488ff" },
            { key: "faserip.token.light.alpha", mode: "custom", value: "0.15" },
            { key: "faserip.token.light.animation.type", mode: "custom", value: "pulse" },
            { key: "faserip.token.light.animation.speed", mode: "custom", value: "2" },
            { key: "faserip.token.light.animation.intensity", mode: "custom", value: "2" }
          ]
        });

      case "flight":
        return foundry.utils.mergeObject(base, {
          name: "Flight Active",
          img: "icons/svg/wing.svg",
          statuses: ["fly"],
          changes: [
            { key: "faserip.token.light.dim", mode: "custom", value: "0.1" },
            { key: "faserip.token.light.color", mode: "custom", value: "#ff6600" },
            { key: "faserip.token.light.alpha", mode: "custom", value: "0.2" },
            { key: "faserip.token.light.animation.type", mode: "custom", value: "flame" },
            { key: "faserip.token.light.animation.speed", mode: "custom", value: "4" },
            { key: "faserip.token.light.animation.intensity", mode: "custom", value: "3" }
          ]
        });

      // ── Mechanical presets ──
      case "body-armor":
        return foundry.utils.mergeObject(base, {
          name: "Body Armor",
          img: "icons/svg/shield.svg",
          disabled: false,
          changes: [
            { key: "system.combatMods.defenseShift", mode: "add", value: "0" }
          ]
        });

      case "attack-bonus":
        return foundry.utils.mergeObject(base, {
          name: "Attack Bonus",
          img: "icons/svg/sword.svg",
          disabled: false,
          changes: [
            { key: "system.combatMods.attackShift", mode: "add", value: "1" }
          ]
        });

      case "defense-bonus":
        return foundry.utils.mergeObject(base, {
          name: "Defense Bonus",
          img: "icons/svg/shield.svg",
          disabled: false,
          changes: [
            { key: "system.combatMods.defenseShift", mode: "add", value: "1" }
          ]
        });

      case "ability-boost":
        return foundry.utils.mergeObject(base, {
          name: "Ability Boost",
          img: "icons/svg/upgrade.svg",
          disabled: false,
          changes: [
            { key: "system.combatMods.abilityShifts.strength", mode: "add", value: "0" }
          ]
        });

      case "immobilize":
        return foundry.utils.mergeObject(base, {
          name: "Immobilized",
          img: "icons/svg/net.svg",
          changes: [
            { key: "system.combatMods.canMove", mode: "override", value: "false" }
          ]
        });

      default:
        ui.notifications.warn(`Unknown preset: ${preset}`);
        return null;
    } })();
    return this._v14NormalizeAE(raw);
  }

  // Method to handle equipment rolls
  // --- helpers used by equipment rolling ---
  _parseDamage(value) {
    if (typeof value === "number") return value;
    const s = String(value ?? "").trim();
    const m = s.match(/\((\d+)\)/); // e.g., "RM (30)"
    if (m) return Number(m[1]);
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  _normalizeDamageType(t) {
    const map = {
      "S":"physical-shooting",
      "BA":"physical-blunt",
      "EA":"physical-edged",
      "TB":"physical-throwing-blunt",
      "TE":"physical-throwing-edged",
      "E":"energy",
      "F":"force",
      "GP":"grappling",
      "Gb":"grabbing"
    };
    const norm = map[t] || String(t || "").toLowerCase();
    return norm;
  }

async rollEquipment() {
    const item = this.item;
    const actor = item.actor;
    if (!actor) return ui.notifications.error("No actor linked to item!");

    const type = item.system?.type || "";
    const cat = item.system?.category || "";

    // Device category check first — devices may not have system.type set
    if (cat === "device" || cat === "custom" || type === "custom") {
      const dfns = item.system.deviceFunctions || [];
      if (dfns.length > 0) return this._rollDeviceFunction(item, actor);
      return this._rollCustomAbility(item, actor);
    }
    if (type === "weapon" || cat === "weapon") return this._rollWeapon(item, actor);
    if (type === "power" || cat === "power-item") return this._rollPowerItem(item, actor);
    return ui.notifications.warn("This equipment type cannot be rolled!");
  }


  // Roll a weapon attack
  async _rollWeapon(item, actor) {
    // Route to mode picker if defined; otherwise use base
    const hasModes = Array.isArray(item.system?.modes) && item.system.modes.length;
    if (hasModes) return this._selectAndRollWeaponMode(item, actor);
    // Synthesize a base "mode" from item fields
    const baseMode = {
      name: "Standard",
      ability: item.system.ability || "fighting",
      damage: item.system.damage || 0,
      damageType: item.system.damageType || "S",
      rangeRank: item.system.rangeRank || (actor.system?.abilities?.agility?.rank ?? "Typical"),
      heatSeeking: !!item.system?.heatSeeking,
      multiAttacks: Number(item.system?.multiAttacks || 1) || 1
    };
    return this._rollWeaponWithMode(item, actor, baseMode);
  }

  async _selectAndRollWeaponMode(item, actor) {
    const modes = item.system?.modes || [];
    const options = modes.map(m => `<option value="${m.name}">${m.name}</option>`).join("");
    return new Promise((resolve) => {
      new Dialog({
        title: `${item.name}: Select Mode`,
        content: `<div style="margin-top:6px;">
          <label style="display:inline-block;width:120px;">Mode:</label>
          <select name="mode">${options}</select>
        </div>`,
        buttons: {
          roll: {
            label: "Continue",
            callback: html => {
              const sel = html.find('[name="mode"]').val();
              const mode = modes.find(m => m.name === sel) || modes[0];
              resolve(this._rollWeaponWithMode(item, actor, mode));
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll"
      }).render(true);
    });
  }


  async _rollWeaponWithMode(item, actor, mode) {
    const ranks = [
      "Shift-0","Feeble","Poor","Typical","Good","Excellent","Remarkable",
      "Incredible","Amazing","Monstrous","Unearthly","Shift X","Shift Y","Shift Z",
      "Class 1000","Class 3000","Class 5000","Beyond"
    ];

    // Build roll dialog
    const rangeRank = mode.rangeRank || item.system?.rangeRank || actor.system?.abilities?.agility?.rank || "Typical";
    const content = `
      <div style="min-width:420px">
        <div style="margin-bottom:8px;">
          <label style="display:inline-block;width:140px;">Target Distance:</label>
          <input type="number" name="distance" value="1" min="1" style="width:70px;"> areas
        </div>
        <div style="margin-bottom:8px;">
          <label style="display:inline-block;width:140px;">Column Shift:</label>
          <input type="number" name="shift" value="0" style="width:70px;">
          <span style="color:#666;font-size:.9em;">(+ right, − left)</span>
        </div>
        <div style="margin-bottom:8px;">
          <label style="display:inline-block;width:140px;">Karma Points:</label>
          <input type="number" name="karma" value="0" min="0" style="width:70px;">
        </div>
        <div style="margin-top:10px;color:#555;">Range Rank: <b>${rangeRank}</b></div>
      </div>`;

    return new Promise(resolve => {
      new Dialog({
        title: `${item.name} — ${mode.name}`,
        content,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const $ = sel => html.find(sel);
              const distance = Math.max(1, Number($('[name="distance"]').val() || 1));
              const shift    = Number($('[name="shift"]').val() || 0);
              const karma    = Math.max(0, Number($('[name="karma"]').val() || 0));

              // Compute effective rank with range
              const rangeAreas = (globalThis.CONFIG?.FASERIP?.rankValues?.[rangeRank] ?? 0) * 2; // fallback approx
              let rangePenaltyCS = 0;
              if (!mode.heatSeeking) {
                // simple bracket logic: each multiple of rangeAreas beyond first gives -1CS
                if (rangeAreas > 0) {
                  const bracket = Math.ceil(distance / Math.max(1, rangeAreas));
                  rangePenaltyCS = Math.max(0, bracket - 1);
                }
              }

              // Base ability
              const abilityKey = (mode.ability || "fighting").toLowerCase();
              const abilityRank = actor.system?.abilities?.[abilityKey]?.rank || "Typical";
              const abilityIndex = Math.max(0, ranks.indexOf(abilityRank));
              let effectiveIndex = abilityIndex - rangePenaltyCS + shift;
              effectiveIndex = Math.max(0, Math.min(ranks.length - 1, effectiveIndex));
              const effectiveRank = ranks[effectiveIndex];

              // Roll with optional Karma
              const r = await (new Roll("1d100")).evaluate({ async: true });
              let total = r.total;
              let karmaUsed = 0;
              if (karma > 0) {
                const cap = Math.min(100, total + karma);
                karmaUsed = cap - total;
                total = cap;
              }
              if (karmaUsed > 0) {
                const history = foundry.utils.deepClone(actor.system.karma?.history || []);
                history.push({ timestamp: new Date().toISOString(), realDate: new Date().toLocaleDateString(), gameDate: "", amount: -karmaUsed, type: "Die Roll", description: `Spent on ${item.name} - ${mode.name}` });
                await actor.update({ "system.karma.history": history });
              }

              // Determine color & effect
              const color = rollUniversalTable(effectiveRank, Math.min(100, total))?.toLowerCase() || "white";

              // Prepare attack payload
              const target = game.user.targets.first()?.document ?? null;
              const baseDamage = this._parseDamage(mode.damage ?? item.system.damage ?? 0);
              const damageType = this._normalizeDamageType(mode.damageType || item.system.damageType || "S");

              // Derive attackForm from normalized damageType
              const attackForm = damageType.includes("shooting") ? "shooting"
                : damageType.includes("edged")   ? "edged"
                : damageType.includes("energy")  ? "energy"
                : damageType.includes("force")   ? "force"
                : damageType.includes("throwing-edged") ? "throwing-edged"
                : damageType.includes("throwing-blunt") ? "throwing-blunt"
                : "blunt";
              const wasKillResult = (color === "red" && (damageType.includes("edged") || damageType.includes("shooting") || damageType.includes("energy")));
              const targetTokens = target ? [target] : [];

              // Multiple attacks (max 3)
              const attacks = Math.max(1, Math.min(3, Number(mode.multiAttacks || item.system.multiAttacks || 1)));

              for (let i = 1; i <= attacks; i++) {
                await applyDamageToTargets({
                  damage: baseDamage,
                  damageType,
                  attackForm,
                  attackerUuid: actor.uuid,
                  targets: targetTokens,
                  wasKillResult,
                  showNotification: true
                });
              }

              resolve();
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll"
      }).render(true);
    });
  }

  // Roll a power-based item
  async _rollPowerItem(item, actor) {
    // Get item's power information
    const ability = item.system.linkedAbility || "reason";
    const abilityRank = actor.system.abilities[ability].rank || "Typical";
    const powerRank = item.system.powerRank || "Typical";
    const powerType = item.system.powerType || "energy";

    // --- INITIAL DISTANCE AND RANGE INFO FOR DIALOG ---
    let initialDistance = 0;
    const targetToken = game.user.targets.first();
    if (targetToken && canvas.tokens.controlled.length > 0) {
      const controlledToken = canvas.tokens.controlled[0];
      const ray = new Ray(controlledToken.center, targetToken.center);
      initialDistance = Math.round(ray.distance / canvas.scene.grid.size);
    }

    let dialogPowerRangeInfo = "";
    const basePowerRange = POWER_RANGE_VALUES[powerRank] || 0;

    if (initialDistance > basePowerRange) {
      const penalty = initialDistance - basePowerRange;
      dialogPowerRangeInfo = `<div><strong>Range:</strong> ${initialDistance} areas (Base: ${basePowerRange} areas). Penalty: -${penalty}CS.</div>`;
    } else if (initialDistance > 0) {
      dialogPowerRangeInfo = `<div><strong>Range:</strong> ${initialDistance} areas (within base range of ${basePowerRange} areas). No penalty.</div>`;
    } else {
      dialogPowerRangeInfo = `<div><strong>Range:</strong> Adjacent (no penalty).</div>`;
    }
    // --- END INITIAL DISTANCE AND RANGE INFO ---

    // Define action types for this power
    const actionTypes = [];

    // Determine available actions based on power type
    switch (powerType) {
      case "energy":
        actionTypes.push(
          { value: "Energy Attack", label: "Energy Attack" },
          { value: "Energy Manipulation", label: "Energy Manipulation" }
        );
        break;
      case "force":
        actionTypes.push(
          { value: "Force Attack", label: "Force Attack" },
          { value: "Force Field", label: "Force Field" }
        );
        break;
      case "matter":
        actionTypes.push(
          { value: "Matter Manipulation", label: "Matter Manipulation" },
          { value: "Matter Transformation", label: "Matter Transformation" }
        );
        break;
      case "mental":
        actionTypes.push(
          { value: "Mental Attack", label: "Mental Attack" },
          { value: "Mind Control", label: "Mind Control" },
          { value: "Telepathy", label: "Telepathy" }
        );
        break;
      case "travel":
        actionTypes.push(
          { value: "Movement", label: "Movement" },
          { value: "Teleportation", label: "Teleportation" }
        );
        break;
      default:
        actionTypes.push(
          { value: "Power Use", label: "Power Use" },
          { value: "Special Effect", label: "Special Effect" }
        );
    }

    // Build action options HTML
    const actionOptionsHTML = actionTypes.map(action =>
      `<option value="${action.value}">${action.label}</option>`
    ).join('');

    // Create dialog for roll options
    let dialogContent = `
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Action Type:</label>
      <select id="action-type" name="actionType" style="width: 180px;">
        ${actionOptionsHTML}
      </select>
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Power Rank:</label>
      <input type="text" value="${powerRank}" readonly style="width: 180px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Ability:</label>
      <input type="text" value="${ability.charAt(0).toUpperCase() + ability.slice(1)} (${abilityRank})" readonly style="width: 180px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Target Distance:</label> <!-- NEW INPUT -->
      <input type="number" id="distance" name="distance" value="${initialDistance}" min="0" style="width: 50px;"> areas
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Column Shift:</label>
      <input type="number" id="shift" name="shift" value="0" style="width: 50px;">
      <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Karma Points:</label>
      <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
    </div>
    ${dialogPowerRangeInfo} <!-- NEW INFO DISPLAY -->
    `;

    return new Dialog({
      title: `Power Item Roll: ${item.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          label: "Roll",
          callback: async (html) => {
            const actionType = html.find('[name="actionType"]').val();
            const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
            const karma = parseInt(html.find('[name="karma"]').val()) || 0;
            const dialogDistance = parseInt(html.find('[name="distance"]').val()) || 0; // NEW: Get distance from dialog

            // --- RECALCULATE effective column shift with range penalty for the actual roll ---
            let effectivePowerRangePenalty = 0;
            // Recalculate basePowerRange here too to ensure it's fresh if powerRank changed in-between
            const basePowerRange = POWER_RANGE_VALUES[powerRank] || 0; 
            if (dialogDistance > basePowerRange) {
              effectivePowerRangePenalty = dialogDistance - basePowerRange;
            }
            const totalColumnShift = columnShift - effectivePowerRangePenalty;
            // --- END RECALCULATE ---

            // Apply column shifts to get effective rank
            let effectiveRank = powerRank;
            if (totalColumnShift !== 0) { // Use totalColumnShift here
              const ranks = [
                "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
              ];

              const index = ranks.indexOf(powerRank);
              if (index !== -1) {
                const newIndex = Math.min(Math.max(index + totalColumnShift, 0), ranks.length - 1);
                effectiveRank = ranks[newIndex];
              }
            }

            // Roll dice and add karma
            const roll = new Roll("1d100");
            await roll.evaluate();
            let cappedTotal = roll.total;
            let karmaUsed = 0;

            if (karma > 0) {
              cappedTotal = Math.min(100, roll.total + karma);
              karmaUsed = cappedTotal - roll.total;
            }

            if (karmaUsed > 0) {
              const history = foundry.utils.deepClone(actor.system.karma?.history || []);
              const newEvent = {
                timestamp: new Date().toISOString(),
                realDate: new Date().toLocaleDateString(),
                gameDate: "",
                amount: -karmaUsed,
                type: "Die Roll",
                description: `Spent on ${item.name} (Equipment)`
              };
              history.push(newEvent);

              await actor.update({
                "system.karma.history": history
              });
              // Assuming _updateCurrentKarma exists and is called after karma history updates
              if (typeof game.msh?.FaseripRolls?._updateCurrentKarma === 'function') {
                game.msh.FaseripRolls._updateCurrentKarma(actor);
              }
            }

            // Get result color
            const colorResult = game.msh.rollUniversalTable(effectiveRank, cappedTotal);

            // Define results based on action type
            const actionResults = {
              "Energy Attack": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
              "Force Attack": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
              "Mental Attack": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" },
              "Power Use": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" }
            };

            // Get result text based on action type and color
            let resultText = colorResult.toUpperCase();
            if (actionResults[actionType] && actionResults[actionType][colorResult.toLowerCase()]) {
              resultText = actionResults[actionType][colorResult.toLowerCase()];
            } else {
              // Default results if specific action type not defined
              if (colorResult.toLowerCase() === "white") resultText = "Failure";
              else if (colorResult.toLowerCase() === "green") resultText = "Success";
              else if (colorResult.toLowerCase() === "yellow") resultText = "Special Effect";
              else if (colorResult.toLowerCase() === "red") resultText = "Maximum Effect";
            }

            // --- RECALCULATE chatPowerRangeInfo for the chat message ---
            let chatPowerRangeInfo = "";
            if (dialogDistance > basePowerRange) {
              const penalty = dialogDistance - basePowerRange;
              chatPowerRangeInfo = `<div><strong>Range:</strong> ${dialogDistance} areas (Base: ${basePowerRange} areas). Penalty: -${penalty}CS.</div>`;
            } else if (dialogDistance > 0) {
              chatPowerRangeInfo = `<div><strong>Range:</strong> ${dialogDistance} areas (within base range of ${basePowerRange} areas). No penalty.</div>`;
            } else {
              chatPowerRangeInfo = `<div><strong>Range:</strong> Adjacent (no penalty).</div>`;
            }
            // --- END RECALCULATE ---

            // Create chat message
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: actor }),
              roll: roll,
              content: `
                <div class="faserip-power-roll">
                  <h3>${actor.name} uses ${item.name} (${actionType})</h3>
                  <div class="roll-info">
                    <div><strong>Power Rank:</strong> ${powerRank}</div>
                    <div><strong>Column Shift:</strong> ${totalColumnShift !== 0 ?
                      `${totalColumnShift > 0 ? '+' : ''}${totalColumnShift}CS → ${effectiveRank}` :
                      "None"}</div>
                    <div><strong>Roll:</strong> ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>
                    ${chatPowerRangeInfo} <!-- Uses the re-calculated chatPowerRangeInfo -->
                  </div>
                  <div class="result result-${colorResult.toLowerCase()}">
                    ${resultText} (${colorResult.toUpperCase()})
                  </div>
                </div>
                <style>
                  .faserip-power-roll {
                    font-family: Arial, sans-serif;
                    background: #f9f8f4;
                    border: 1px solid #ccc;
                    border-radius: 3px;
                    padding: 8px;
                  }
                  .faserip-power-roll h3 {
                    margin: 0 0 8px 0;
                    border-bottom: 1px solid #ccc;
                    padding-bottom: 4px;
                    font-size: 1.1em;
                  }
                  .roll-info {
                    margin-bottom: 8px;
                    font-size: 0.95em;
                  }
                  .roll-info div {
                    margin-bottom: 3px;
                  }
                  .ability-description {
                    margin: 8px 0;
                    padding: 5px;
                    background: #f0f0f0;
                    border-radius: 3px;
                    font-style: italic;
                  }
                  .result {
                    text-align: center;
                    padding: 6px;
                    border-radius: 3px;
                    font-weight: bold;
                    font-size: 1.1em;
                  }
                  .result-white {
                    background-color: #f0f0f0;
                    color: #333;
                    border: 1px solid #ccc;
                  }
                  .result-green {
                    background-color: #4CAF50;
                    color: white;
                  }
                  .result-yellow {
                    background-color: #FFC107;
                    color: #333;
                  }
                  .result-red {
                    background-color: #F44336;
                    color: white;
                  }
                </style>
              `
            });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }).render(true);
  }

  // ── Device Functions helpers ──

  static DAMAGE_TYPE_LABELS = {
    "S": "Shooting (S)", "E": "Energy (E)", "F": "Force (F)",
    "EA": "Edged (EA)", "BA": "Blunt (BA)",
    "TE": "Thrown Edged (TE)", "TB": "Thrown Blunt (TB)",
    "GP": "Grappling (GP)", "Gb": "Grabbing (Gb)"
  };

  static ATTACK_DAMAGE_TYPES = ["S", "E", "F", "EA", "BA", "TE", "TB"];

  static RANK_ABBR = {
    "Shift-0": "Sh0", "Feeble": "Fe", "Poor": "Pr", "Typical": "Ty",
    "Good": "Gd", "Excellent": "Ex", "Remarkable": "Rm", "Incredible": "In",
    "Amazing": "Am", "Monstrous": "Mn", "Unearthly": "Un",
    "Shift X": "ShX", "Shift Y": "ShY", "Shift Z": "ShZ",
    "Class 1000": "CL1000", "Class 3000": "CL3000", "Class 5000": "CL5000",
    "Beyond": "Beyond"
  };

  static RANKS_ORDERED = [
    "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
    "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
    "Shift X", "Shift Y", "Shift Z",
    "Class 1000", "Class 3000", "Class 5000", "Beyond"
  ];

  static ABILITIES = ["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"];

  static DEFENSE_TYPES = {
    "bodyArmor": "Body Armor",
    "forceField": "Force Field",
    "resistance": "Resistance"
  };

  _buildDeviceFunctionsDisplay() {
    const fns = this.item.system.deviceFunctions || [];
    const rv = CONFIG.FASERIP?.rankValues || {};
    const C = this.constructor;

    return fns.map((fn, i) => {
      const base = {
        ...fn,
        typeLabel: { attack: "Attack", buff: "Passive buff", power: "Power", defense: "Defense" }[fn.type] || fn.type,
        rankAbbr: C.RANK_ABBR[fn.rank] || fn.rank || "",
        rankValue: rv[fn.rank] ?? ""
      };

      if (fn.type === "attack") {
        base.damageTypeLabel = C.DAMAGE_TYPE_LABELS[fn.damageType] || fn.damageType || "—";
        const r = fn.range;
        base.rangeDisplay = (!r || r === "0" || r === "adjacent") ? "Adjacent" : `${r} area${r !== "1" ? "s" : ""}`;
      } else if (fn.type === "buff") {
        const ab = fn.ability || "strength";
        base.abilityLabel = ab.charAt(0).toUpperCase() + ab.slice(1);
        const cs = parseInt(fn.csShift) || 0;
        base.csLabel = `${cs >= 0 ? "+" : ""}${cs} CS`;
        // Compute effective rank from owner actor's base
        const owner = this.item.parent;
        if (owner) {
          const baseRank = owner.system?.abilities?.[ab]?.rank || "Typical";
          base.baseRank = baseRank;
          const idx = C.RANKS_ORDERED.indexOf(baseRank);
          const eff = Math.max(0, Math.min(C.RANKS_ORDERED.length - 1, idx + cs));
          base.effectiveRank = C.RANKS_ORDERED[eff];
        } else {
          base.baseRank = "—";
          base.effectiveRank = "—";
        }
      } else if (fn.type === "defense") {
        base.defenseTypeLabel = C.DEFENSE_TYPES[fn.defenseType] || fn.defenseType || "Body Armor";
      }

      return base;
    });
  }

  _openDeviceFunctionTypeSelector() {
    const html = `
      <div class="df-type-selector">
        <div class="df-type-option" data-type="attack">
          <div class="df-type-option-title">Attack</div>
          <div class="df-type-option-desc">Rollable combat action</div>
        </div>
        <div class="df-type-option" data-type="buff">
          <div class="df-type-option-title">Passive buff</div>
          <div class="df-type-option-desc">Modify an ability while active</div>
        </div>
        <div class="df-type-option" data-type="power">
          <div class="df-type-option-title">Power</div>
          <div class="df-type-option-desc">Granted power (FEAT roll)</div>
        </div>
        <div class="df-type-option" data-type="defense">
          <div class="df-type-option-title">Defense</div>
          <div class="df-type-option-desc">Body armor, force field, resistance</div>
        </div>
      </div>
      <div class="df-type-hint">Select a function type, then configure it.</div>
    `;

    let selectedType = "attack";

    const d = new Dialog({
      title: "Add Device Function",
      content: html,
      buttons: {
        add: {
          label: "Next",
          callback: () => {
            this._addDeviceFunction(selectedType);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "add",
      render: (jq) => {
        const options = jq.find('.df-type-option');
        options.first().addClass('selected');
        options.on('click', function () {
          options.removeClass('selected');
          $(this).addClass('selected');
          selectedType = this.dataset.type;
        });
      }
    }, { width: 380 });
    d.render(true);
  }

  async _addDeviceFunction(type) {
    const defaults = {
      attack:  { type: "attack",  name: "New Attack",  rank: "Typical", damageType: "BA", range: "adjacent", description: "" },
      buff:    { type: "buff",    name: "New Buff",     ability: "strength", csShift: 1, enabled: true, _effectId: null },
      power:   { type: "power",   name: "New Power",    rank: "Typical", description: "" },
      defense: { type: "defense", name: "New Defense",  rank: "Typical", defenseType: "bodyArmor", description: "" }
    };

    const fn = defaults[type] || defaults.attack;
    const fns = foundry.utils.duplicate(this.item.system.deviceFunctions || []);
    fns.push(fn);
    await this.item.update({ "system.deviceFunctions": fns }, { diff: false });
    this.render(true);

    // Open edit dialog for the new function
    this._openDeviceFunctionEditDialog(fns.length - 1);
  }

  _openDeviceFunctionEditDialog(index) {
    const fns = foundry.utils.duplicate(this.item.system.deviceFunctions || []);
    if (index >= fns.length) return;
    const fn = fns[index];
    const C = this.constructor;
    const rv = CONFIG.FASERIP?.rankValues || {};

    let fieldsHtml = "";

    // Name field (all types)
    fieldsHtml += `<div class="form-group"><label>Name</label>
      <input type="text" name="df-name" value="${fn.name || ""}" /></div>`;

    if (fn.type === "attack") {
      // Rank
      const rankOpts = C.RANKS_ORDERED.map(r =>
        `<option value="${r}" ${fn.rank === r ? "selected" : ""}>${r} (${rv[r] ?? ""})</option>`
      ).join("");
      // Damage type
      const dtOpts = C.ATTACK_DAMAGE_TYPES.map(t =>
        `<option value="${t}" ${fn.damageType === t ? "selected" : ""}>${C.DAMAGE_TYPE_LABELS[t]}</option>`
      ).join("");

      fieldsHtml += `<div class="df-edit-row">
        <div class="form-group"><label>Rank</label><select name="df-rank">${rankOpts}</select></div>
        </div>`;
      fieldsHtml += `<div class="df-edit-row">
        <div class="form-group"><label>Damage type</label><select name="df-damageType">${dtOpts}</select></div>
        <div class="form-group narrow"><label>Range (areas)</label>
          <input type="text" name="df-range" value="${fn.range || "adjacent"}" /></div>
        </div>`;
      fieldsHtml += `<div class="form-group"><label>Description (optional)</label>
        <textarea name="df-description">${fn.description || ""}</textarea></div>`;

    } else if (fn.type === "buff") {
      const abOpts = C.ABILITIES.map(a =>
        `<option value="${a}" ${fn.ability === a ? "selected" : ""}>${a.charAt(0).toUpperCase() + a.slice(1)}</option>`
      ).join("");
      fieldsHtml += `<div class="df-edit-row">
        <div class="form-group"><label>Ability</label><select name="df-ability">${abOpts}</select></div>
        <div class="form-group narrow"><label>CS Shift</label>
          <input type="number" name="df-csShift" value="${fn.csShift ?? 1}" /></div>
        </div>`;

    } else if (fn.type === "power") {
      const rankOpts = C.RANKS_ORDERED.map(r =>
        `<option value="${r}" ${fn.rank === r ? "selected" : ""}>${r} (${rv[r] ?? ""})</option>`
      ).join("");
      fieldsHtml += `<div class="form-group"><label>Rank</label><select name="df-rank">${rankOpts}</select></div>`;
      fieldsHtml += `<div class="form-group"><label>Description (optional)</label>
        <textarea name="df-description">${fn.description || ""}</textarea></div>`;

    } else if (fn.type === "defense") {
      const dtOpts = Object.entries(C.DEFENSE_TYPES).map(([k, v]) =>
        `<option value="${k}" ${fn.defenseType === k ? "selected" : ""}>${v}</option>`
      ).join("");
      const rankOpts = C.RANKS_ORDERED.map(r =>
        `<option value="${r}" ${fn.rank === r ? "selected" : ""}>${r} (${rv[r] ?? ""})</option>`
      ).join("");
      fieldsHtml += `<div class="df-edit-row">
        <div class="form-group"><label>Defense type</label><select name="df-defenseType">${dtOpts}</select></div>
        <div class="form-group"><label>Rank</label><select name="df-rank">${rankOpts}</select></div>
        </div>`;
      fieldsHtml += `<div class="form-group"><label>Description (optional)</label>
        <textarea name="df-description">${fn.description || ""}</textarea></div>`;
    }

    const content = `<form class="df-edit-form">${fieldsHtml}</form>`;
    const sheet = this;

    new Dialog({
      title: `Edit: ${fn.name || "Device Function"}`,
      content,
      buttons: {
        save: {
          label: "Save",
          callback: async (jq) => {
            const form = jq.find('.df-edit-form');
            fn.name = form.find('[name="df-name"]').val() || fn.name;

            if (fn.type === "attack") {
              fn.rank = form.find('[name="df-rank"]').val();
              fn.damageType = form.find('[name="df-damageType"]').val();
              fn.range = form.find('[name="df-range"]').val();
              fn.description = form.find('[name="df-description"]').val();
            } else if (fn.type === "buff") {
              fn.ability = form.find('[name="df-ability"]').val();
              fn.csShift = parseInt(form.find('[name="df-csShift"]').val()) || 0;
            } else if (fn.type === "power") {
              fn.rank = form.find('[name="df-rank"]').val();
              fn.description = form.find('[name="df-description"]').val();
            } else if (fn.type === "defense") {
              fn.defenseType = form.find('[name="df-defenseType"]').val();
              fn.rank = form.find('[name="df-rank"]').val();
              fn.description = form.find('[name="df-description"]').val();
            }

            fns[index] = fn;
            await sheet.object.update({ "system.deviceFunctions": fns }, { diff: false });

            // Manage Active Effect for buffs
            if (fn.type === "buff") {
              await sheet._syncBuffEffect(index, fn);
            }

            sheet.render(true);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "save"
    }, { width: 400 }).render(true);
  }

  // Create or update the Active Effect that backs a passive buff function
  async _syncBuffEffect(index, fn) {
    const ability = fn.ability || "strength";
    const cs = parseInt(fn.csShift) || 0;
    const key = `system.combatMods.abilityShifts.${ability}`;

    const effectData = {
      name: `${fn.name || "Buff"} (${this.item.name})`,
      icon: "icons/svg/upgrade.svg",
      origin: this.item.uuid,
      disabled: !fn.enabled,
      changes: [{ key, mode: "add", value: String(cs) }]
    };

    if (fn._effectId) {
      // Update existing effect
      const existing = this.item.effects.get(fn._effectId);
      if (existing) {
        await existing.update(effectData);
        return;
      }
    }

    // Create new effect
    const created = await this.item.createEmbeddedDocuments("ActiveEffect", [effectData]);
    if (created?.length) {
      // Store the effect ID back on the function
      const fns = foundry.utils.duplicate(this.item.system.deviceFunctions || []);
      if (fns[index]) {
        fns[index]._effectId = created[0].id;
        await this.item.update({ "system.deviceFunctions": fns }, { diff: false });
      }
    }
  }

  // Roll a device function (new system)
  async _rollDeviceFunction(item, actor) {
    const fns = item.system.deviceFunctions || [];
    // Filter to rollable types only (not buff, not defense)
    const rollable = fns.map((fn, i) => ({ ...fn, _idx: i }))
      .filter(fn => fn.type === "attack" || fn.type === "power");

    if (rollable.length === 0) {
      return ui.notifications.info("This device has no rollable functions (attacks or powers).");
    }

    const pickAndRoll = (fn) => {
      if (fn.type === "attack") {
        // Route through ActionDispatcher-compatible custom ability roll
        const abilityObj = {
          name: fn.name,
          rank: fn.rank || "Typical",
          damageType: fn.damageType || "",
          range: fn.range || "",
          description: fn.description || ""
        };
        this._rollSpecificCustomAbility(item, actor, abilityObj);
      } else if (fn.type === "power") {
        const abilityObj = {
          name: fn.name,
          rank: fn.rank || "Typical",
          damageType: "",
          range: "",
          description: fn.description || ""
        };
        this._rollSpecificCustomAbility(item, actor, abilityObj);
      }
    };

    if (rollable.length === 1) {
      return pickAndRoll(rollable[0]);
    }

    // Multiple rollable — show picker
    const options = rollable.map(fn => {
      const C = this.constructor;
      const abbr = C.RANK_ABBR[fn.rank] || fn.rank;
      const label = fn.type === "attack"
        ? `${fn.name} — ${C.DAMAGE_TYPE_LABELS[fn.damageType] || fn.damageType} (${abbr})`
        : `${fn.name} (${abbr})`;
      return `<option value="${fn._idx}">${label}</option>`;
    }).join("");

    new Dialog({
      title: `${item.name}: Choose Function`,
      content: `<div style="margin-bottom:10px;">
        <label>Function:</label>
        <select id="df-pick" style="width:100%;">${options}</select>
      </div>`,
      buttons: {
        roll: {
          label: "Roll",
          callback: (html) => {
            const idx = parseInt(html.find('#df-pick').val());
            const fn = fns[idx];
            if (fn) pickAndRoll(fn);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }).render(true);
  }

  // Roll a custom ability (legacy)
  async _rollCustomAbility(item, actor) {
    // If no custom abilities, prompt to create one
    if (!item.system.customAbilities || item.system.customAbilities.length === 0) {
      return ui.notifications.warn("This item has no custom abilities defined. Edit the item to add abilities.");
    }

    // If multiple abilities, let the user choose which one to use
    if (item.system.customAbilities.length > 1) {
      const abilities = item.system.customAbilities;
      let options = "";

      abilities.forEach((ability, index) => {
        options += `<option value="${index}">${ability.name} (${ability.rank})</option>`;
      });

      let choiceDialog = `
      <div style="margin-bottom: 10px;">
        <label>Choose ability to use:</label>
        <select id="ability-choice" style="width: 100%;">
          ${options}
        </select>
      </div>`;

      new Dialog({
        title: "Choose Custom Ability",
        content: choiceDialog,
        buttons: {
          roll: {
            label: "Select",
            callback: (html) => {
              const abilityIndex = parseInt(html.find('#ability-choice').val());
              this._rollSpecificCustomAbility(item, actor, abilities[abilityIndex]);
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll"
      }).render(true);

      return;
    }

    // Otherwise roll the only ability
    this._rollSpecificCustomAbility(item, actor, item.system.customAbilities[0]);
  }

  // Helper method to roll a specific custom ability
  async _rollSpecificCustomAbility(item, actor, ability) {
    // Get ability information
    const abilityRank = ability.rank || "Typical";
    const damageType = ability.damageType || "";

    // Determine action options based on damage type
    let actionTypes = [{ value: "Use Ability", label: "Use Ability" }];

    if (damageType) {
      actionTypes = [{ value: `${damageType} Attack`, label: `${damageType} Attack` }];
    }

    // Build action options HTML
    const actionOptionsHTML = actionTypes.map(action =>
      `<option value="${action.value}">${action.label}</option>`
    ).join('');

    // Create dialog for roll options
    let dialogContent = `
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Ability:</label>
      <input type="text" value="${ability.name}" readonly style="width: 180px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Action Type:</label>
      <select id="action-type" name="actionType" style="width: 180px;">
        ${actionOptionsHTML}
      </select>
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Rank:</label>
      <input type="text" value="${abilityRank}" readonly style="width: 180px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Column Shift:</label>
      <input type="number" id="shift" name="shift" value="0" style="width: 50px;">
      <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: inline-block; width: 120px;">Karma Points:</label>
      <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
    </div>`;

    return new Dialog({
      title: `Custom Ability Roll: ${ability.name}`,
      content: dialogContent,
      buttons: {
        roll: {
          label: "Roll",
          callback: async (html) => {
            const actionType = html.find('[name="actionType"]').val();
            const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
            const karma = parseInt(html.find('[name="karma"]').val()) || 0;

            // Apply column shifts to get effective rank
            let effectiveRank = abilityRank;
            if (columnShift !== 0) {
              const ranks = [
                "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
                "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
              ];

              const index = ranks.indexOf(abilityRank);
              if (index !== -1) {
                const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
                effectiveRank = ranks[newIndex];
              }
            }

            // Roll dice and add karma
            const roll = new Roll("1d100");
            await roll.evaluate();
            let cappedTotal = roll.total;
            let karmaUsed = 0;

            if (karma > 0) {
              cappedTotal = Math.min(100, roll.total + karma);
              karmaUsed = cappedTotal - roll.total;
            }

            if (karmaUsed > 0) {
              const history = foundry.utils.deepClone(actor.system.karma?.history || []);
              const newEvent = {
                timestamp: new Date().toISOString(),
                realDate: new Date().toLocaleDateString(),
                gameDate: "",
                amount: -karmaUsed,
                type: "Die Roll",
                description: `Spent on ${ability.name} (Custom Ability)`
              };
              history.push(newEvent);

              await actor.update({
                "system.karma.history": history
              });
            }

            // Get result color
            const colorResult = game.msh.rollUniversalTable(effectiveRank, cappedTotal);

            // Define results based on action type
            const RESULTS = {
              "S Attack": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
              "E Attack": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
              "F Attack": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
              "EA Attack": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
              "BA Attack": { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
              "Use Ability": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" }
            };

            // Get the result text
            let resultText = colorResult.toUpperCase();
            if (RESULTS[actionType] && RESULTS[actionType][colorResult.toLowerCase()]) {
              resultText = RESULTS[actionType][colorResult.toLowerCase()];
            } else {
              // Generic results
              switch (colorResult.toLowerCase()) {
                case "white": resultText = "Failure"; break;
                case "green": resultText = "Success"; break;
                case "yellow": resultText = "Special Effect"; break;
                case "red": resultText = "Maximum Effect"; break;
              }
            }

            // Description text (if any)
            const descriptionHtml = ability.description ?
              `<div class="ability-description">${ability.description}</div>` : '';

            // Create chat message
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: actor }),
              roll: roll,
              content: `
                <div class="faserip-custom-roll">
                  <h3>${actor.name} uses ${item.name}: ${ability.name}</h3>
                  <div class="roll-info">
                    <div><strong>Rank:</strong> ${abilityRank}</div>
                    <div><strong>Column Shift:</strong> ${columnShift !== 0 ?
                      `${columnShift > 0 ? '+' : ''}${columnShift}CS → ${effectiveRank}` :
                      "None"}</div>

                    <div><strong>Roll:</strong> ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>

                    ${ability.range ? `<div><strong>Range:</strong> ${ability.range}</div>` : ''}
                    ${ability.damageType ? `<div><strong>Damage Type:</strong> ${ability.damageType}</div>` : ''}
                  </div>
                  ${descriptionHtml}
                  <div class="result result-${colorResult.toLowerCase()}">
                    ${resultText} (${colorResult.toUpperCase()})
                  </div>
                </div>
                <style>
                  .faserip-custom-roll {
                    font-family: Arial, sans-serif;
                    background: #f9f8f4;
                    border: 1px solid #ccc;
                    border-radius: 3px;
                    padding: 8px;
                  }
                  .faserip-custom-roll h3 {
                    margin: 0 0 8px 0;
                    border-bottom: 1px solid #ccc;
                    padding-bottom: 4px;
                    font-size: 1.1em;
                  }
                  .roll-info {
                    margin-bottom: 8px;
                    font-size: 0.95em;
                  }
                  .roll-info div {
                    margin-bottom: 3px;
                  }
                  .ability-description {
                    margin: 8px 0;
                    padding: 5px;
                    background: #f0f0f0;
                    border-radius: 3px;
                    font-style: italic;
                  }
                  .result {
                    text-align: center;
                    padding: 6px;
                    border-radius: 3px;
                    font-weight: bold;
                    font-size: 1.1em;
                  }
                  .result-white {
                    background-color: #f0f0f0;
                    color: #333;
                    border: 1px solid #ccc;
                  }
                  .result-green {
                    background-color: #4CAF50;
                    color: white;
                  }
                  .result-yellow {
                    background-color: #FFC107;
                    color: #333;
                  }
                  .result-red {
                    background-color: #F44336;
                    color: white;
                  }
                </style>
              `
            });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }).render(true);
  }
}
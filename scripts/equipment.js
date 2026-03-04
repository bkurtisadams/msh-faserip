// equipment.js v1.4.0 - 2026-03-03
// v1.4.0: Rewrite effects to use standard changes[] — system.* for mechanics, faserip.token.* for visuals
// v1.2.0: Add "other" category (grenade/missile); other-fields show/hide; weaponType sub-section toggle
import { applyDamageToTargets } from "./modules/actions/action-utils.js";
import { debugLog } from "./modules/actions/action-utils.js";
import { rollUniversalTable } from "./modules/dice/universal-table.js";
import { prepareActiveEffectCategories, onManageActiveEffect } from "../helpers/effects.mjs";

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

export class FaseripEquipmentSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "item", "equipment"],
      template: "systems/msh-faserip/templates/equipment-sheet.html",
      width: 530,
      height: 680,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "properties" }]
    });
  }

  getData() {
    // Get base data
    const context = super.getData();
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
      // Note: "Stun" is an *effect* type, not a damage type on the Universal Table column.
          // If you want a "Stun" damage type, you'd need to define how it maps to the table.
          // Current weapon sheet already has stunIntensity for weapons that only stun.
    ];

    // --- END NEW ---

    // Active Effects on this equipment item
    context.effects = prepareActiveEffectCategories(this.item.effects);

    return context;
  }

  /** @override */
  async _updateObject(event, formData) {
    const data = foundry.utils.expandObject(formData);
    if (!data.system) data.system = {};
    // Use the submitted category if present, otherwise fall back to what's saved on the item
    const category = (data.system.category !== undefined) ? data.system.category : this.object.system.category;

    // other-fields uses _-prefixed names to avoid form collision with weapon-fields.
    // Always map them regardless of category — they're only present when other-fields is shown.
    if (data.system._otherWeaponType !== undefined) {
      if (category === "other") data.system.weaponType = data.system._otherWeaponType;
    }
    if (data.system._otherShots !== undefined) {
      if (category === "other") {
        const qty = parseInt(data.system._otherShots, 10);
        data.system.shots = isNaN(qty) ? 0 : qty;
        // Always sync shotsRemaining to shots — GM editing Quantity means restocking to full
        data.system.shotsRemaining = data.system.shots;
      }
    }
    if (data.system._otherLegality !== undefined) {
      if (category === "other") data.system.legality = data.system._otherLegality;
    }
    delete data.system._otherWeaponType;
    delete data.system._otherShots;
    delete data.system._otherLegality;

    return super._updateObject(event, foundry.utils.flattenObject(data));
  }

  activateListeners(html) {
    super.activateListeners(html);

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

    html.find(".add-granted-power").on("click", ev => {
      ev.preventDefault();
      const powers = duplicate(this.object.system.powers || []);
      powers.push({
        name: "",
        rank: "Typical",
        value: 6,
        damageType: "",
        isPassiveArmor: false,
        grantedByEquipment: true
      });
      this.object.update({ "system.powers": powers });
    });

    html.find(".remove-granted-power").on("click", ev => {
      ev.preventDefault();
      const index = Number(ev.currentTarget.dataset.index);
      const powers = duplicate(this.object.system.powers || []);
      powers.splice(index, 1);
      this.object.update({ "system.powers": powers });
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
        this.object.setFlag("msh-faserip", `section_${section}_open`, true);
      } else {
        content.style.display = "none";
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
        this.object.setFlag("msh-faserip", `section_${section}_open`, false);
      }
    });

    // Initialize section states based on saved flags
    html.find('.collapsible').each((i, el) => {
      const header = el;
      const section = header.dataset.section;
      const content = header.nextElementSibling;
      const icon = header.querySelector('i');

      const isOpen = this.object.getFlag("msh-faserip", `section_${section}_open`);
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



    // Show/hide category-specific fields when category changes
    html.find('.equipment-category-select').change(async ev => {
      const category = ev.currentTarget.value;
      
      // Prevent multiple rapid updates
      if (this._categoryUpdateTimeout) {
        clearTimeout(this._categoryUpdateTimeout);
      }
      
      // Show/hide sections immediately without re-rendering
      html.find('.weapon-fields, .armor-fields, .power-item-fields, .custom-fields, .other-fields').hide();
      
      if (category === 'weapon') {
        html.find('.weapon-fields').show();
      } else if (category === 'armor') {
        html.find('.armor-fields').show();
      } else if (category === 'power-item') {
        html.find('.power-item-fields').show();
      } else if (category === 'custom') {
        html.find('.custom-fields').show();
      } else if (category === 'other') {
        html.find('.other-fields').show();
        // Show correct weapon type sub-section
        const wt = this.object.system.weaponType || '';
        html.find('.other-grenade-fields, .other-missile-fields').hide();
        if (wt === 'grenade') html.find('.other-grenade-fields').show();
        else if (wt === 'missile') html.find('.other-missile-fields').show();
      }
      
      // Delay the update to prevent conflicts
      this._categoryUpdateTimeout = setTimeout(() => {
        this.object.update({"system.category": category});
      }, 100);
    });

    // Make sure correct fields are shown on initial load
    const currentCategory = this.object.system.category;
    html.find('.weapon-fields, .armor-fields, .power-item-fields, .custom-fields, .other-fields').hide(); // Hide all initially
    if (currentCategory === 'weapon') {
      html.find('.weapon-fields').show();
    } else if (currentCategory === 'armor') {
      html.find('.armor-fields').show();
    } else if (currentCategory === 'power-item') {
      html.find('.power-item-fields').show();
    } else if (currentCategory === 'custom') {
      html.find('.custom-fields').show();
    } else if (currentCategory === 'other') {
      html.find('.other-fields').show();
      const wt = this.object.system.weaponType || '';
      html.find('.other-grenade-fields, .other-missile-fields').hide();
      if (wt === 'grenade') html.find('.other-grenade-fields').show();
      else if (wt === 'missile') html.find('.other-missile-fields').show();
    }


    // Other weapon type sub-section toggle (grenade vs missile)
    html.find('.other-weapon-type-select').change(ev => {
      const wt = ev.currentTarget.value;
      html.find('.other-grenade-fields, .other-missile-fields').hide();
      if (wt === 'grenade') html.find('.other-grenade-fields').show();
      else if (wt === 'missile') html.find('.other-missile-fields').show();
      // Don't need explicit update — _updateObject handles _otherWeaponType → weaponType mapping
    });


    // Add custom ability handler
    html.find('.add-custom-ability').click(async ev => {
      const stunts = this.object.system.customAbilities || [];
      stunts.push({
        name: "New Ability",
        description: "",
        rank: "Typical",
        damageType: "",
        range: "",
        isPassiveArmor: false, // Initialize new armor fields
        armorDamageType: ""
      });
      await this.object.update({ "system.customAbilities": stunts }, {diff: false});
      this.render(true); // Re-render to show the new row immediately
    });

    // Remove custom ability handler
    html.find('.remove-custom-ability').click(async ev => {
      const index = parseInt(ev.currentTarget.dataset.index);

      let abilities = duplicate(this.object.system.customAbilities || []);
      if (!Array.isArray(abilities)) {
        abilities = []; // Ensure it's an array for splice to work
        console.warn("customAbilities was not an array, creating empty array");
      }

      if (abilities.length > index) {
        abilities.splice(index, 1);
        await this.object.update({ "system.customAbilities": abilities }, {diff: false});
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
        await this.object.update({ "system.customAbilities": newCustomAbilities }, { diff: false });
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

    // Attack Modes listeners
    html.find('.add-attack-mode').click(async ev => {
      ev.preventDefault();
      
      let modes = this.object.system.attackModes || [];
      if (!Array.isArray(modes)) {
        modes = Object.values(modes).filter(m => m);
      }
      modes = foundry.utils.duplicate(modes);
      
      modes.push({
        name: "New Mode",
        actionType: "blunt-attack",
        damageType: "BA",
        damage: this.object.system.damage || 10,
        ability: "fighting",
        description: ""
      });
      await this.object.update({ "system.attackModes": modes });
    });

    html.find('.remove-attack-mode').click(async ev => {
      ev.preventDefault();
      const index = parseInt(ev.currentTarget.dataset.index);
      
      // Ensure we're working with an array
      let modes = this.object.system.attackModes || [];
      if (!Array.isArray(modes)) {
        modes = Object.values(modes).filter(m => m); // Convert object to array
      }
      modes = foundry.utils.duplicate(modes);
      
      // Remove the mode at index
      modes.splice(index, 1);
      
      await this.object.update({ "system.attackModes": modes });
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
  _buildPresetEffect(preset) {
    const MODES = CONST.ACTIVE_EFFECT_MODES;
    const origin = this.item.uuid;
    const base = { origin, disabled: true, transfer: true };

    switch (preset) {

      // ── Visual / Token presets ──
      case "light":
        return foundry.utils.mergeObject(base, {
          name: "Light Source",
          img: "icons/svg/light.svg",
          changes: [
            { key: "faserip.token.light.bright", mode: MODES.CUSTOM, value: "4" },
            { key: "faserip.token.light.dim", mode: MODES.CUSTOM, value: "8" },
            { key: "faserip.token.light.color", mode: MODES.CUSTOM, value: "#ffdd88" },
            { key: "faserip.token.light.alpha", mode: MODES.CUSTOM, value: "0.3" },
            { key: "faserip.token.light.angle", mode: MODES.CUSTOM, value: "360" },
            { key: "faserip.token.light.animation.type", mode: MODES.CUSTOM, value: "torch" },
            { key: "faserip.token.light.animation.speed", mode: MODES.CUSTOM, value: "3" },
            { key: "faserip.token.light.animation.intensity", mode: MODES.CUSTOM, value: "3" }
          ]
        });

      case "flashlight":
        return foundry.utils.mergeObject(base, {
          name: "Flashlight Beam",
          img: "icons/svg/light.svg",
          changes: [
            { key: "faserip.token.light.bright", mode: MODES.CUSTOM, value: "6" },
            { key: "faserip.token.light.dim", mode: MODES.CUSTOM, value: "12" },
            { key: "faserip.token.light.color", mode: MODES.CUSTOM, value: "#ffffcc" },
            { key: "faserip.token.light.alpha", mode: MODES.CUSTOM, value: "0.5" },
            { key: "faserip.token.light.angle", mode: MODES.CUSTOM, value: "60" },
            { key: "faserip.token.light.animation.type", mode: MODES.CUSTOM, value: "" },
            { key: "faserip.token.light.animation.speed", mode: MODES.CUSTOM, value: "0" },
            { key: "faserip.token.light.animation.intensity", mode: MODES.CUSTOM, value: "0" }
          ]
        });

      case "darkvision":
        return foundry.utils.mergeObject(base, {
          name: "Darkvision / Infravision",
          img: "icons/svg/eye.svg",
          changes: [
            { key: "faserip.token.sight.range", mode: MODES.CUSTOM, value: "120" },
            { key: "faserip.token.sight.visionMode", mode: MODES.CUSTOM, value: "darkvision" }
          ]
        });

      case "stealth":
        return foundry.utils.mergeObject(base, {
          name: "Stealth Field",
          img: "icons/svg/invisible.svg",
          changes: [
            { key: "faserip.token.alpha", mode: MODES.CUSTOM, value: "0.4" }
          ]
        });

      case "forcefield":
        return foundry.utils.mergeObject(base, {
          name: "Force Field Aura",
          img: "icons/svg/aura.svg",
          changes: [
            { key: "faserip.token.light.bright", mode: MODES.CUSTOM, value: "0.5" },
            { key: "faserip.token.light.dim", mode: MODES.CUSTOM, value: "1.5" },
            { key: "faserip.token.light.color", mode: MODES.CUSTOM, value: "#4488ff" },
            { key: "faserip.token.light.alpha", mode: MODES.CUSTOM, value: "0.15" },
            { key: "faserip.token.light.animation.type", mode: MODES.CUSTOM, value: "pulse" },
            { key: "faserip.token.light.animation.speed", mode: MODES.CUSTOM, value: "2" },
            { key: "faserip.token.light.animation.intensity", mode: MODES.CUSTOM, value: "2" }
          ]
        });

      case "flight":
        return foundry.utils.mergeObject(base, {
          name: "Flight Active",
          img: "icons/svg/wing.svg",
          statuses: ["fly"],
          changes: [
            { key: "faserip.token.light.dim", mode: MODES.CUSTOM, value: "1" },
            { key: "faserip.token.light.color", mode: MODES.CUSTOM, value: "#ff6600" },
            { key: "faserip.token.light.alpha", mode: MODES.CUSTOM, value: "0.2" },
            { key: "faserip.token.light.animation.type", mode: MODES.CUSTOM, value: "flame" },
            { key: "faserip.token.light.animation.speed", mode: MODES.CUSTOM, value: "4" },
            { key: "faserip.token.light.animation.intensity", mode: MODES.CUSTOM, value: "3" }
          ]
        });

      // ── Mechanical presets ──
      case "body-armor":
        return foundry.utils.mergeObject(base, {
          name: "Body Armor",
          img: "icons/svg/shield.svg",
          disabled: false,
          changes: [
            { key: "system.combatMods.defenseShift", mode: MODES.ADD, value: "0" }
          ]
        });

      case "attack-bonus":
        return foundry.utils.mergeObject(base, {
          name: "Attack Bonus",
          img: "icons/svg/sword.svg",
          disabled: false,
          changes: [
            { key: "system.combatMods.attackShift", mode: MODES.ADD, value: "1" }
          ]
        });

      case "defense-bonus":
        return foundry.utils.mergeObject(base, {
          name: "Defense Bonus",
          img: "icons/svg/shield.svg",
          disabled: false,
          changes: [
            { key: "system.combatMods.defenseShift", mode: MODES.ADD, value: "1" }
          ]
        });

      case "ability-boost":
        return foundry.utils.mergeObject(base, {
          name: "Ability Boost",
          img: "icons/svg/upgrade.svg",
          disabled: false,
          changes: [
            { key: "system.combatMods.abilityShifts.strength", mode: MODES.ADD, value: "0" }
          ]
        });

      case "immobilize":
        return foundry.utils.mergeObject(base, {
          name: "Immobilized",
          img: "icons/svg/net.svg",
          changes: [
            { key: "system.combatMods.canMove", mode: MODES.OVERRIDE, value: "false" }
          ]
        });

      default:
        ui.notifications.warn(`Unknown preset: ${preset}`);
        return null;
    }
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
    const item = this.object;
    const actor = item.actor;
    if (!actor) return ui.notifications.error("No actor linked to item!");

    const type = item.system?.type || "weapon";
    if (type === "weapon") return this._rollWeapon(item, actor);
    if (type === "power")  return this._rollPowerItem(item, actor);
    if (type === "custom") return this._rollCustomAbility(item, actor);
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

              // Multiple attacks (max 3)
              const attacks = Math.max(1, Math.min(3, Number(mode.multiAttacks || item.system.multiAttacks || 1)));
              const { CombatHandler } = await import(`/systems/${game.system.id}/scripts/combat-handler.js`);

              for (let i = 1; i <= attacks; i++) {
                const sourceName = attacks > 1 ? `${item.name} (${mode.name}) [${i}/${attacks}]` : `${item.name} (${mode.name})`;
                await CombatHandler.processAttack({
                  attacker: actor,
                  target,
                  baseDamage,
                  damageType,
                  sourceName,
                  canBeStun: (color === "red" && damageType.includes("blunt")) || (color === "yellow" && damageType.includes("edged")),
                  canBeSlam: (color === "yellow" && damageType.includes("blunt")),
                  canBeKill: (color === "red" && damageType.includes("edged")),
                  originalRollResult: color
                }, {
                  variantType: null,
                  specialEffects: { heatSeeking: !!mode.heatSeeking },
                  precomputedRangePenalty: mode.heatSeeking ? 0 : rangePenaltyCS
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

  // Roll a custom ability
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
// itemSheet.js v1.14.0 - 2026-03-12
// v1.14.0: Power sheet v2 layout redesign — reorder fields, rank→value auto-fill, 520px width, conditional special strength
// v1.13.0: Power sheet v2 — single scrollable form, HQ-style, category-driven sections
// v1.12.0: Add Effects tab to power sheet with ActiveEffect presets and management
// v1.11.0: Extract contact sheet to standalone contactSheet.js
// v1.9.0: Redesign talent sheet to HQ-style with fieldsets, auto-fill from specialty data, rule summary
// v1.8.0: Add SFX preview buttons and volume controls to power sheet
// v1.7.0: Power Sheet layout reorganization
import { prepareActiveEffectCategories, onManageActiveEffect } from "../helpers/effects.mjs";
import { ps2ActivateListeners } from "./power-sheet-v2-logic.js";
export class FaseripItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "item"],
      width: 520,
      height: 600,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "overview" }],
      resizable: true,
      submitOnChange: true
    });
  }

  /** @override — power v2 uses 520x700, no tabs */
  _getHeaderButtons() {
    return super._getHeaderButtons();
  }

  get template() {
    if (this.item.type === 'power') {
      return `systems/msh-faserip/templates/power-sheet-v2.html`;
    }
    else if (this.item.type === 'vehicle') {
      return `systems/msh-faserip/templates/vehicle-sheet.html`;
    }
    // Fall back to the default item sheet for other types
    return `systems/msh-faserip/templates/item-sheet.html`;
  }

  // In itemSheet.js - revised getData() function
  getData() {
    // Keep this sync and side-effect free
    const context = super.getData();

    // Preserve what your template expects
    context.item   = this.item;
    context.system = this.item.system;

    const classes = ["faserip", "sheet", "item", this.item.type];
    context.cssClass = classes.join(" ");

    if (this.item.type === "power") {
      // Keep the magic context (even if the tab is always visible now)
      context.isMagic = context.system?.isMagic ?? false;
      context.magic   = context.system?.magic   ?? {};

      // Normalize legacy attackType values (ranged-force -> force, ranged-energy -> energy)
      const rawAttackType = context.system?.attackType || "";
      context.normalizedAttackType = rawAttackType.replace(/^ranged-/, "");

      // Your original option arrays
      context.energyTypes = ["personal", "universal", "dimensional"];
      context.abilities   = ["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"];

      // Defensive guards so a missing CONFIG block doesn't grey the sheet
      const FCFG = (globalThis.CONFIG && CONFIG.FASERIP) ? CONFIG.FASERIP : {};
      context.damageTypes       = FCFG.damageTypes        ?? {};
      context.resistanceTypes   = FCFG.resistanceTypes    ?? {};
      context.attackTypes       = FCFG.attackTypes        ?? {};
      context.primaryEffects    = FCFG.primaryEffects     ?? {};
      context.bodyArmorTypes    = FCFG.bodyArmorTypes     ?? {};
      context.resistanceEffects = FCFG.resistanceEffects  ?? {};

      context.powerTypes = [
        "Resistances", "Movement", "Matter Control", "Energy Control",
        "Body Control", "Mental", "Sensory", "Self-Alteration", "Other"
      ];

      context.rangeOptions = [
        "1 area", "2 areas", "4 areas", "6 areas", "8 areas",
        "10 areas", "20 areas", "40 areas", "60 areas", "80 areas",
        "160 areas", "400 areas", "Line of Sight"
      ];

      context.durationOptions = [
        "Instant", "Concentration", "Maintenance", "Permanent"
      ];

      // Auto-detect which action buttons will find this power (your original)
      context.detectedActions = typeof this._detectActionButtons === "function"
        ? this._detectActionButtons(context.system)
        : [];

      // ----- NEW: provide a safe calculatedRange string when range === "rank"
      if (context.system?.range === "rank") {
        // If you have a proper range engine, call it here instead.
        const rankValue = Number(context.system?.value ?? 0);
        context.calculatedRange = rankValue ? `${rankValue} areas (by rank)` : "";
      }

      // Helpful logging (kept from your original)
      console.log("Power sheet data:", context);
    }

    // Active Effects on this item (powers and any other item type)
    context.effects = prepareActiveEffectCategories(this.item.effects ?? []);

    // ANCHOR: vehicle-item-sheet-getData
      if (this.item?.type === "vehicle") {
        context.allRanks = context.allRanks || [
          "Feeble","Poor","Typical","Good","Excellent","Remarkable","Incredible","Amazing","Monstrous",
          "Unearthly","Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000"
        ];
        context.vehicleTypes = ["Road","Off-Road","Railed","GEV","Air","Space","Water","Submersible"];
      }

    return context;
  }

  _buildPowerPresetEffect(preset) {
    const MODES = CONST.ACTIVE_EFFECT_MODES;
    const origin = this.item.uuid;
    const base = { origin, disabled: true, transfer: true };

    switch (preset) {

      // ── Defensive ──
      case "body-armor":
        return foundry.utils.mergeObject(base, {
          name: "Body Armor",
          img: "icons/svg/shield.svg",
          disabled: false,
          changes: [
            { key: "system.combatMods.defenseShift", mode: MODES.ADD, value: "0" }
          ]
        });

      case "forcefield":
        return foundry.utils.mergeObject(base, {
          name: "Force Field",
          img: "icons/svg/aura.svg",
          changes: [
            { key: "system.combatMods.defenseShift", mode: MODES.ADD, value: "0" },
            { key: "faserip.token.light.bright", mode: MODES.CUSTOM, value: "0" },
            { key: "faserip.token.light.dim", mode: MODES.CUSTOM, value: "0.15" },
            { key: "faserip.token.light.color", mode: MODES.CUSTOM, value: "#4488ff" },
            { key: "faserip.token.light.alpha", mode: MODES.CUSTOM, value: "0.15" },
            { key: "faserip.token.light.animation.type", mode: MODES.CUSTOM, value: "pulse" },
            { key: "faserip.token.light.animation.speed", mode: MODES.CUSTOM, value: "2" },
            { key: "faserip.token.light.animation.intensity", mode: MODES.CUSTOM, value: "2" }
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

      case "resistance":
        return foundry.utils.mergeObject(base, {
          name: "Resistance",
          img: "icons/svg/fire-shield.svg",
          disabled: false,
          changes: [
            { key: "system.combatMods.defenseShift", mode: MODES.ADD, value: "0" }
          ]
        });

      // ── Offensive ──
      case "attack-bonus":
        return foundry.utils.mergeObject(base, {
          name: "Attack Bonus",
          img: "icons/svg/sword.svg",
          disabled: false,
          changes: [
            { key: "system.combatMods.attackShift", mode: MODES.ADD, value: "1" }
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

      // ── Visual ──
      case "light":
        return foundry.utils.mergeObject(base, {
          name: "Light Emission",
          img: "icons/svg/light.svg",
          changes: [
            { key: "faserip.token.light.bright", mode: MODES.CUSTOM, value: "0.1" },
            { key: "faserip.token.light.dim", mode: MODES.CUSTOM, value: "0.2" },
            { key: "faserip.token.light.color", mode: MODES.CUSTOM, value: "#ffdd88" },
            { key: "faserip.token.light.alpha", mode: MODES.CUSTOM, value: "0.3" },
            { key: "faserip.token.light.angle", mode: MODES.CUSTOM, value: "360" },
            { key: "faserip.token.light.animation.type", mode: MODES.CUSTOM, value: "torch" },
            { key: "faserip.token.light.animation.speed", mode: MODES.CUSTOM, value: "3" },
            { key: "faserip.token.light.animation.intensity", mode: MODES.CUSTOM, value: "3" }
          ]
        });

      case "energy-aura":
        return foundry.utils.mergeObject(base, {
          name: "Energy Aura",
          img: "icons/svg/fire.svg",
          changes: [
            { key: "faserip.token.light.bright", mode: MODES.CUSTOM, value: "0" },
            { key: "faserip.token.light.dim", mode: MODES.CUSTOM, value: "0.1" },
            { key: "faserip.token.light.color", mode: MODES.CUSTOM, value: "#ff4400" },
            { key: "faserip.token.light.alpha", mode: MODES.CUSTOM, value: "0.25" },
            { key: "faserip.token.light.animation.type", mode: MODES.CUSTOM, value: "flame" },
            { key: "faserip.token.light.animation.speed", mode: MODES.CUSTOM, value: "4" },
            { key: "faserip.token.light.animation.intensity", mode: MODES.CUSTOM, value: "4" }
          ]
        });

      case "stealth":
        return foundry.utils.mergeObject(base, {
          name: "Invisibility",
          img: "icons/svg/invisible.svg",
          changes: [
            { key: "faserip.token.alpha", mode: MODES.CUSTOM, value: "0.3" }
          ]
        });

      case "phasing":
        return foundry.utils.mergeObject(base, {
          name: "Phasing",
          img: "icons/svg/mystery-man.svg",
          changes: [
            { key: "faserip.token.alpha", mode: MODES.CUSTOM, value: "0.5" },
            { key: "faserip.token.light.dim", mode: MODES.CUSTOM, value: "0.1" },
            { key: "faserip.token.light.color", mode: MODES.CUSTOM, value: "#aaccff" },
            { key: "faserip.token.light.alpha", mode: MODES.CUSTOM, value: "0.1" },
            { key: "faserip.token.light.animation.type", mode: MODES.CUSTOM, value: "fog" },
            { key: "faserip.token.light.animation.speed", mode: MODES.CUSTOM, value: "2" },
            { key: "faserip.token.light.animation.intensity", mode: MODES.CUSTOM, value: "2" }
          ]
        });

      case "darkness":
        return foundry.utils.mergeObject(base, {
          name: "Darkness Generation",
          img: "icons/svg/blind.svg",
          changes: [
            { key: "faserip.token.light.bright", mode: MODES.CUSTOM, value: "0" },
            { key: "faserip.token.light.dim", mode: MODES.CUSTOM, value: "0.2" },
            { key: "faserip.token.light.color", mode: MODES.CUSTOM, value: "#220044" },
            { key: "faserip.token.light.alpha", mode: MODES.CUSTOM, value: "0.6" },
            { key: "faserip.token.light.luminosity", mode: MODES.CUSTOM, value: "-0.5" },
            { key: "faserip.token.light.animation.type", mode: MODES.CUSTOM, value: "fog" },
            { key: "faserip.token.light.animation.speed", mode: MODES.CUSTOM, value: "2" },
            { key: "faserip.token.light.animation.intensity", mode: MODES.CUSTOM, value: "3" }
          ]
        });

      // ── Movement ──
      case "flight":
        return foundry.utils.mergeObject(base, {
          name: "Flight Active",
          img: "icons/svg/wing.svg",
          statuses: ["fly"],
          changes: [
            { key: "faserip.token.light.dim", mode: MODES.CUSTOM, value: "0.1" },
            { key: "faserip.token.light.color", mode: MODES.CUSTOM, value: "#ff6600" },
            { key: "faserip.token.light.alpha", mode: MODES.CUSTOM, value: "0.2" },
            { key: "faserip.token.light.animation.type", mode: MODES.CUSTOM, value: "flame" },
            { key: "faserip.token.light.animation.speed", mode: MODES.CUSTOM, value: "4" },
            { key: "faserip.token.light.animation.intensity", mode: MODES.CUSTOM, value: "3" }
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

      // ── Sensory ──
      case "darkvision":
        return foundry.utils.mergeObject(base, {
          name: "Darkvision / Infravision",
          img: "icons/svg/eye.svg",
          changes: [
            { key: "faserip.token.sight.range", mode: MODES.CUSTOM, value: "120" },
            { key: "faserip.token.sight.visionMode", mode: MODES.CUSTOM, value: "darkvision" }
          ]
        });

      default:
        console.warn(`[FASERIP WARN] Unknown power effect preset: ${preset}`);
        return null;
    }
  }

  _detectActionButtons(system) {
    const detected = [];
    const cat = String(system.category || "").toLowerCase();
    const typ = String(system.type || "").toLowerCase();
    
    // Energy detection
    if (cat.includes("energy") || cat.includes("distanceattacks")) {
      if (/energy|light|electric|plasma|beam|blast|fire|ice|sound|darkforce|radiation/.test(typ)) {
        detected.push("Energy Attack");
      }
    }
    
    // Force detection
    if (cat.includes("distanceattacks") || /force|telekinesis|kinetic/.test(cat)) {
      if (/force|telekinesis|kinetic|pressure|concussion|shockwave|ram/.test(typ)) {
        detected.push("Force Attack");
      }
    }
    
    // Mental detection
    if (cat.includes("mental") || /telepathy|emotion|mind/.test(typ)) {
      detected.push("Mental Attack");
    }
    
    // Edged detection
    if (/claws|edged|slashing/.test(typ) || system.attackType === "melee-edged") {
      detected.push("Edged Attack");
    }
    
    return detected;
  }

  async activateListeners(html) {
    super.activateListeners(html);

    // ── Active Effect controls (all item types) ──
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
      const effectData = this._buildPowerPresetEffect(preset);
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

    // One-time migration: telekinesiStrength -> telekinesisStrength
    try {
      if (this.item?.type === "power") {
        const sys = this.item.system ?? {};
        if (sys.telekinesiStrength !== undefined && sys.telekinesisStrength === undefined) {
          await this.item.update({
            "system.telekinesisStrength": sys.telekinesiStrength,
            "system.-=telekinesiStrength": null
          });
        }
      }
    } catch (e) {
      console.warn("FASERIP | telekinesis migration skipped:", e);
    }


    // ============ CONDITIONAL FIELD VISIBILITY (v2: handled by ps2ActivateListeners) ============

    // Auto-expand combat section if combat data exists
    if (this.item.type === "power") {
      // Power sheet v2: category-driven section visibility and all toggle logic
      ps2ActivateListeners(html, this);

      // Battle effects column data (kept for action dialogs / combat-handler references)
      const BATTLE_EFFECTS_COLUMNS = {
        "BA": { name: "Blunt Attack", results: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" }, canPullPunch: true, canReduceEffect: true },
        "EA": { name: "Edged Attack", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" }, canPullPunch: false, canReduceEffect: false },
        "S":  { name: "Shooting", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" }, canPullPunch: false, canReduceEffect: false },
        "TE": { name: "Throwing Edged", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" }, canPullPunch: true, canReduceEffect: false },
        "TB": { name: "Throwing Blunt", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" }, canPullPunch: true, canReduceEffect: true },
        "En": { name: "Energy", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" }, canPullPunch: true, canReduceEffect: false },
        "Fo": { name: "Force", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" }, canPullPunch: true, canReduceEffect: false },
        "Ch": { name: "Charging", results: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" }, canPullPunch: true, canReduceEffect: true },
        "Gp": { name: "Grappling", results: { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" }, canPullPunch: false, canReduceEffect: false },
        "Gb": { name: "Grabbing", results: { white: "Miss", green: "Take", yellow: "Grab", red: "Break" }, canPullPunch: false, canReduceEffect: false }
      };

      // Auto-set pull punch/reduce effect when battle column changes
      html.find('#ps2-battle-col').on('change', async ev => {
        const column = ev.currentTarget.value;
        const colData = BATTLE_EFFECTS_COLUMNS[column];
        if (colData) {
          await this.item.update({
            "system.canPullPunch": colData.canPullPunch,
            "system.canReduceEffect": colData.canReduceEffect
          }, { render: false });
        }
      });

      // Emotion control checkbox -> re-render for conditional block
      html.find('input[name="system.mental.emotionControl"]').on('change', async ev => {
        await this.item.update({ "system.mental.emotionControl": ev.currentTarget.checked }, { render: false });
        this.render(true);
      });

      // Magic energy type -> re-render for conditional fields
      html.find('select[name="system.magic.energyType"]').on('change', async ev => {
        const value = ev.currentTarget.value;
        const updates = { "system.magic.energyType": value };
        if (value === 'dimensional') {
          updates["system.magic.chant"] = true;
          updates["system.magic.gesture"] = true;
          updates["system.magic.usesCeremony"] = true;
        } else if (value === 'personal' && !this.item.system?.magic?.castCost) {
          updates["system.magic.castCost"] = 1;
        }
        await this.item.update(updates, { render: false });
        this.render(true);
      });

      // Source set to 'mystical' -> pre-fill magic energy type
      html.find('select[name="system.source"]').on('change', async ev => {
        if (ev.currentTarget.value === 'mystical') {
          const current = this.item.system?.magic?.energyType || "";
          if (!current) {
            await this.item.update({ "system.magic.energyType": "universal", "system.isMagic": true });
          }
        }
      });

      // Movement type change -> re-render
      html.find('#ps2-movement-type').on('change', async ev => {
        await this.item.update({ "system.movement.type": ev.currentTarget.value }, { render: false });
        this.render(true);
      });
    }

    // Delete button
    html.find('.delete-power').click(async () => {
      const confirmed = await Dialog.confirm({
        title: "Delete Power",
        content: `<p>Are you sure you want to delete ${this.item.name}?</p>`
      });
      if (confirmed) {
        await this.item.delete();
        this.close();
      }
    });

    // Test power button (placeholder)
    html.find('.test-power').click(() => {
      ui.notifications.info("Test Power functionality coming soon!");
    });

    // Create stunt from power sheet
    html.find('.create-stunt-from-power').click(async ev => {
      const power = this.item;
      const actor = power.parent;
      
      if (!actor) {
        return ui.notifications.warn("This power must be on an actor to create stunts.");
      }
      
      const ranks = [
        "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
        "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
        "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
      ];
      
      const rankOptions = ranks.map(r => `<option value="${r}" ${r === power.system.rank ? 'selected' : ''}>${r}</option>`).join('');
      
      // Calculate suggested rank (power rank - 1CS)
      const powerRankIndex = ranks.indexOf(power.system.rank);
      const suggestedRankIndex = Math.max(0, powerRankIndex - 1);
      const suggestedRank = ranks[suggestedRankIndex];
      const suggestedValue = game.msh.getRankValue(suggestedRank);
      
      new Dialog({
        title: `Create Stunt for ${power.name}`,
        content: `
          <form>
            <div class="form-group">
              <label>Stunt Name:</label>
              <input type="text" name="name" placeholder="e.g., Enhanced ${power.name}" style="width: 100%;" />
            </div>
            <div class="form-group">
              <label>Rank:</label>
              <select name="rank" id="stunt-rank-select" style="width: 150px;">
                ${rankOptions}
              </select>
              <small style="display: block; color: #666;">Base power: ${power.system.rank} (${power.system.value}). Stunts often at -1CS.</small>
            </div>
            <div class="form-group">
              <label>Rank Number:</label>
              <input type="number" name="value" value="${suggestedValue}" min="0" style="width: 100px;" />
            </div>
            <div class="form-group">
              <label>Description:</label>
              <textarea name="description" rows="4" placeholder="Describe what this stunt does differently from the base power..." style="width: 100%;"></textarea>
            </div>
            <p style="margin-top: 10px; padding: 8px; background: #fff3e0; border: 1px solid #ff9800; border-radius: 3px; font-size: 0.9em;">
              <strong>Note:</strong> First use requires a Red FEAT and costs 100 Karma. This stunt will appear in the actor's Stunts tab.
            </p>
          </form>
        `,
        buttons: {
          create: {
            icon: '<i class="fas fa-plus"></i>',
            label: "Create Stunt",
            callback: async html => {
              const name = html.find('[name="name"]').val()?.trim();
              
              if (!name) {
                ui.notifications.warn("Stunt name is required!");
                return;
              }
              
              let existingStunts = actor.system.stunts || [];
              // Convert to array if it's an object
              if (!Array.isArray(existingStunts)) {
                existingStunts = Object.values(existingStunts).filter(s => s); // Filter out any null/undefined
              }
              const stunts = foundry.utils.deepClone(existingStunts);
              
              stunts.push({
                name: name,
                parentPower: power.name, // ← Link to parent power
                parentPowerId: power.id, // ← Store ID for future reference
                rank: html.find('[name="rank"]').val(),
                value: parseInt(html.find('[name="value"]').val()) || 6,
                description: html.find('[name="description"]').val() || "",
                timesUsed: 0
              });
              
              await actor.update({ "system.stunts": stunts });
              ui.notifications.info(`Stunt "${name}" created in ${actor.name}'s Stunts tab!`);
              
              // Optionally close the power sheet and open the actor sheet to Stunts tab
              // this.close();
              // actor.sheet.render(true, { tab: 'stunts' });
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "create",
        render: html => {
          // Auto-update value when rank changes
          html.find('#stunt-rank-select').change(ev => {
            const selectedRank = ev.currentTarget.value;
            const value = game.msh.getRankValue(selectedRank);
            html.find('[name="value"]').val(value);
          });
        }
      }).render(true);
    });

    // ANCHOR: vehicle-item-create-actor
    if (this.item?.type === "vehicle") {
      html.find(".create-vehicle-actor").on("click", async () => {
        const sys = foundry.utils.duplicate(this.item.system ?? {});
        const actor = await Actor.create({
          name: this.item.name,
          type: "vehicle",
          img: this.item.img,
          system: sys,
          prototypeToken: {
            bar1: { attribute: "system.resources.body" },
            lockRotation: true,
            disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL
          }
        });
        ui.notifications?.info(`Created Vehicle Actor: ${actor.name}`);
      });
    }
  
  } // end of activeListeners

  /**
 * Update power type options based on selected category
 */
_updatePowerTypeOptions(html, category) {
  const typeSelect = html.find('#power-type');
  typeSelect.empty();
  typeSelect.append($('<option value="">-- Select Type --</option>'));
  
  // Define power types by category
  const powerTypesByCategory = {
    "resistances": [
      "Resistance to Fire/Heat", "Resistance to Cold", "Resistance to Electricity", 
      "Resistance to Radiation", "Resistance to Toxins", "Resistance to Corrosives",
      "Resistance to Emotion Attacks", "Resistance to Mental Attacks", 
      "Resistance to Magical Attacks", "Resistance to Disease", "Invulnerability"
    ],
    "senses": [
      "Protected Senses", "Enhanced Senses", "Infravision", "Cosmic Awareness",
      "Combat Sense", "Computer Links", "Emotion Detection", "Energy Detection",
      "Magic Detection", "Magnetic Detection", "Mutant Detection", "Psionic Detection",
      "Astral Detection", "Tracking Ability"
    ],
    "movement": [
      "Flight", "Gliding", "Leaping", "Wall-Crawling", "Lightning Speed",
      "Teleportation", "Levitation", "Swimming", "Climbing", "Digging",
      "Dimensional Travel"
    ],
    "matterControl": [
      "Earth Control", "Air Control", "Fire Control", "Water Control",
      "Weather Control", "Animate Objects","Density Manipulation Others", "Body Transformation Others",
      "Animal Transformation Others"
    ],
    "energyControl": [
      "Magnetic Manipulation", "Electrical Manipulation", "Light Manipulation",
      "Sound Manipulation", "Darkforce Manipulation", "Gravity Manipulation",
      "Probability Manipulation", "Nullifying Power", "Energy Reflection", "Time Control"
    ],
    "bodyControl": [
      "Growth", "Shrinking", "Density Manipulation Self", "Phasing", "Invisibility",
      "Plasticity", "Elongation", "Shape-Shifting", "Imitation", "Body Transformation",
      "Animal Transformation Self", "Raise Lowest Ability", "Blending", "Power Absorption",
      "Alter Ego"
    ],
    "distanceAttacks": [
      "Projectile Missile", "Ensnaring Missile", "Ice Generation", "Fire Generation",
      "Energy Generation", "Sound Generation", "Stunning Missile", "Corrosive Missile",
      "Slashing Missile", "Nullifier Missile", "Darkforce Generation"
    ],
    "mentalPowers": [
      "Telepathy", "Image Generation", "Telekinesis", "Mind Control", "Emotion Control",
      "Force Field Generation", "Animal Communication and Control", "Mechanical Intuition",
      "Animal Empathy", "Empathy", "Psi-Screen", "Mental Probe", "Animate Drawings",
      "Possession", "Transferral", "Astral Projection", "Psionic Attack", "Precognition",
      "Postcognition", "Plant Control", "Ultimate Skill"
    ],
    "bodyAlterationsOffensive": [
      "Extra Body Parts", "Extra Attacks", "Energy Touch", "Paralyzing Touch",
      "Claws", "Rotting Touch", "Corrosive Touch", "Health-Drain Touch", "Blinding Touch"
    ],
    "bodyAlterationsDefensive": [
      "Body Armor", "Water Breathing", "Absorption", "Regeneration", "Solar Regeneration",
      "Recovery", "Life Support", "Pheromones", "Damage Transfer", "Healing", "Immortality"
    ]
  };
  
  // Add options based on selected category
  if (powerTypesByCategory[category]) {
    powerTypesByCategory[category].forEach(type => {
      const selected = this.item.system.type === type ? 'selected' : '';
      typeSelect.append($(`<option value="${type}" ${selected}>${type}</option>`));
    });
  }
}

  _getRangeByRank(rank) {
    const rankRanges = {
      "Feeble": "1 area",
      "Poor": "2 areas",
      "Typical": "4 areas",
      "Good": "6 areas",
      "Excellent": "8 areas",
      "Remarkable": "10 areas",
      "Incredible": "20 areas",
      "Amazing": "40 areas",
      "Monstrous": "60 areas",
      "Unearthly": "80 areas",
      "Shift-X": "160 areas",
      "Shift-Y": "400 areas",
      "Shift-Z": "Line of Sight",
      "Class 1000": "Line of Sight",
      "Class 3000": "Line of Sight",
      "Class 5000": "Line of Sight",
      "Beyond": "Unlimited"
    };
    return rankRanges[rank] || "Unknown";
  }
    
}
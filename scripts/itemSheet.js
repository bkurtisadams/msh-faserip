// itemSheet.js v1.4.0 - 2025-12-27
// v1.4.0: Phase 4 Movement - New Movement tab with type-specific options, speed reference display
// v1.3.0: Phase 3 Magic - Add school dropdown, CS modifier display for casting requirements
// v1.2.0: Phase 2 Defense - Enhanced Resistance (specific type, invulnerability), Enhanced Absorption (specific, redirect)
// v1.1.0: Added Battle Effects Column, Damage Source, Force Field, action dialog flags
export class FaseripItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "item"],
      width: 640, // a bit wider to avoid label wrap
      height: 600,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "basics" }],
      resizable: true,
      submitOnChange: true
    });
  }

  get template() {
    // Use specific templates for different item types
    if (this.item.type === 'power') {
      return `systems/msh-faserip/templates/power-sheet.html`;
    }
    else if (this.item.type === 'talent') {
      return `systems/msh-faserip/templates/talent-sheet.html`;
    }
    else if (this.item.type === 'contact') {
      return `systems/msh-faserip/templates/contact-sheet.html`;
    }
    else if (this.item.type === 'headquarters') {
      return `systems/msh-faserip/templates/hq-sheet.html`;
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


   // ============ TAB HANDLING ============
    // Manual tab switching (compatible with all Foundry versions)
    html.find('.sheet-tabs .item').click(ev => {
      ev.preventDefault();
      const tab = ev.currentTarget.dataset.tab;
      
      // Update tab nav
      html.find('.sheet-tabs .item').removeClass('active');
      ev.currentTarget.classList.add('active');
      
      // Update tab content
      html.find('.tab').removeClass('active');
      html.find(`.tab[data-tab="${tab}"]`).addClass('active');
    });

    // Respect existing active state; if none, default to the first
    if (!html.find('.sheet-tabs .item.active').length) {
      html.find('.sheet-tabs .item:first').addClass('active');
    }
    if (!html.find('.tab.active').length) {  // ← Fixed: proper if statement
      html.find('.tab:first').addClass('active');
    }
    const activeTab = html.find('.sheet-tabs .item.active').data('tab') 
                    ?? html.find('.sheet-tabs .item:first').data('tab');
    html.find(`.tab[data-tab="${activeTab}"]`).addClass('active');

    // --- HEALING ---
    html.find('#healing-type').change(async ev => {
      const value = ev.currentTarget.value || "";
      await this.item.update({ "system.healingType": value }, { render: false });
      this.render(true); // re-test {{#if system.healingType}}
    });

    html.find('input[name="system.healingMaxPerDay"]').change(async ev => {
      const num = Number(ev.currentTarget.value ?? 0) || 0;
      await this.item.update({ "system.healingMaxPerDay": num }, { render: false });
    });

    // --- REGENERATION ---
    html.find('#regen-type').change(async ev => {
      const value = ev.currentTarget.value || "";
      // If switching to solar, provide a sensible default for the rate
      const patch = { "system.regenerationType": value };
      if (value === "solar" && !this.item.system?.regenerationRate) {
        patch["system.regenerationRate"] = "10-minutes";
      }
      await this.item.update(patch, { render: false });
      this.render(true); // re-test {{#if system.regenerationType}}
    });

    html.find('select[name="system.regenerationRate"]').change(async ev => {
      const value = ev.currentTarget.value || "";
      await this.item.update({ "system.regenerationRate": value }, { render: false });
    });

    // --- ABSORPTION (same pattern so its {{#if}} toggles immediately) ---
    html.find('#absorption-type').change(async ev => {
      const value = ev.currentTarget.value || "";
      await this.item.update({ "system.absorptionType": value }, { render: false });
      this.render(true); // re-test {{#if system.absorptionType}}
    });

    html.find('input[name="system.absorptionConvertsToHealth"]').change(async ev => {
      await this.item.update({ "system.absorptionConvertsToHealth": ev.currentTarget.checked }, { render: false });
    });

    // If Source set to 'mystical', prefill energyType (if empty) and switch to Magic tab
    html.find('select[name="system.source"]').change(async ev => {
      if (ev.currentTarget.value === 'mystical') {
        const current = this.item.system?.magic?.energyType || "";
        if (!current) await this.item.update({ "system.magic.energyType": "universal" });
        html.find('.sheet-tabs .item[data-tab="magic"]').trigger('click');
      }
    });

    // ============ ADVANCED SECTION TOGGLE ============
    html.find('h4.advanced-toggle').click(ev => {
      const target = ev.currentTarget;
      const collapseId = target.dataset.collapse;
      const section = html.find(`#${collapseId}`);
      
      target.classList.toggle('collapsed');
      section.toggleClass('collapsed');
    });

    // ============ CONDITIONAL FIELD VISIBILITY ============
    // These trigger re-renders so {{#if}} conditions in template update

    html.find('#is-life-support, #healing-type, #regen-type, #absorption-type, #is-limited, #save-intensity').change(ev => {
      this.render(true);
    });


    // Handle magic energy type dropdown - MERGED VERSION (replaces both handlers)
    html.find('select[name="system.magic.energyType"]').on('change', async ev => {
      const value  = ev.currentTarget.value;
      const magic  = this.item.system?.magic ?? {};
      const updates = { "system.magic.energyType": value };

      // Ceremony only for Dimensional (Universal = chant OR gesture)
      updates["system.magic.usesCeremony"] = (value === 'dimensional');

      // Set chant/gesture defaults ONLY if both are currently undefined
      const untouched = (magic.chant === undefined) && (magic.gesture === undefined);

      if (untouched) {
        if (value === 'personal') {
          updates["system.magic.chant"]   = false;
          updates["system.magic.gesture"] = false;
        } else if (value === 'universal') {
          updates["system.magic.chant"]   = true;   // default to chant
          updates["system.magic.gesture"] = false;
        } else if (value === 'dimensional') {
          updates["system.magic.chant"]   = true;
          updates["system.magic.gesture"] = true;
        }
      }

      // Sensible resist defaults per type
      if (value === 'personal') {
        updates["system.magic.targetResistsWith"] = "";
      } else if (value === 'universal') {
        updates["system.magic.targetResistsWith"] = "psyche";
      }
      // dimensional: leave as-is (depends on emulated effect)

      // Personal default cost (1 HP/turn) if not already set
      if (value === 'personal' && !magic.castCost) {
        updates["system.magic.castCost"] = 1;
      }

      await this.item.update(updates);

      // Optional: avatar quality-of-life (skip scary notes on dimensional)
      const isAvatar = this.actor?.getFlag?.('msh-faserip', 'isAvatar') === true;
      if (value === 'dimensional' && isAvatar) {
        await this.item.update({ "system.magic.backlashNotes": "" }, { render: false });
      }
    });


    // Toggle combat properties section
    html.find('.toggle-combat-section').click(ev => {
      const button = $(ev.currentTarget);
      const section = button.next('.combat-properties');
      const icon = button.find('.toggle-icon');
      
      section.slideToggle(200);
      icon.toggleClass('fa-chevron-down fa-chevron-up');
    });

    // --- COMBAT TAB CHECKBOXES ---
    html.find('#requires-save').change(async ev => {
      const checked = ev.currentTarget.checked;
      await this.item.update({ "system.requiresSave": checked }, { render: false });
      this.render(true);
    });

    html.find('#is-body-armor').change(async ev => {
      const checked = ev.currentTarget.checked;
      await this.item.update({ "system.isBodyArmor": checked }, { render: false });
      this.render(true);
    });

    html.find('#is-resistance').change(async ev => {
      const checked = ev.currentTarget.checked;
      await this.item.update({ "system.isResistance": checked }, { render: false });
      this.render(true);
    });

    // Auto-expand combat section if combat data exists
    if (this.item.type === "power") {
      const hasAttackType = this.item.system.attackType;
      const hasBodyArmor = this.item.system.isBodyArmor;
      const hasResistance = this.item.system.isResistance;
      
      if (hasAttackType || hasBodyArmor || hasResistance) {
        html.find('.combat-properties').show();
        html.find('.toggle-icon').removeClass('fa-chevron-down').addClass('fa-chevron-up');
      }

      // ============ BATTLE EFFECTS COLUMN HANDLING ============
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

      // Update battle effects display
      const updateBattleEffectsDisplay = (column) => {
        const displayEl = html.find('#battle-effects-display')[0];
        if (!displayEl) return;
        
        if (!column || !BATTLE_EFFECTS_COLUMNS[column]) {
          displayEl.innerHTML = '<span class="no-column" style="color:#999;">Select a column to see results</span>';
          return;
        }
        
        const colData = BATTLE_EFFECTS_COLUMNS[column];
        const r = colData.results;
        displayEl.innerHTML = `
          <span style="background:#f0f0f0;padding:2px 4px;border-radius:2px;margin-right:4px;">${r.white}</span>
          <span style="background:#4CAF50;color:white;padding:2px 4px;border-radius:2px;margin-right:4px;">${r.green}</span>
          <span style="background:#FFC107;padding:2px 4px;border-radius:2px;margin-right:4px;">${r.yellow}</span>
          <span style="background:#F44336;color:white;padding:2px 4px;border-radius:2px;">${r.red}</span>
        `;
      };

      // Update pull punch/reduce effect based on column (unless override is checked)
      const updatePullPunchFromColumn = (column) => {
        const overrideCheck = html.find('#override-pull-punch')[0];
        if (overrideCheck?.checked) return;
        
        const pullPunchCheck = html.find('#can-pull-punch')[0];
        const reduceEffectCheck = html.find('#can-reduce-effect')[0];
        if (!pullPunchCheck || !reduceEffectCheck) return;
        
        if (!column || !BATTLE_EFFECTS_COLUMNS[column]) {
          pullPunchCheck.checked = false;
          reduceEffectCheck.checked = false;
        } else {
          const colData = BATTLE_EFFECTS_COLUMNS[column];
          pullPunchCheck.checked = colData.canPullPunch;
          reduceEffectCheck.checked = colData.canReduceEffect;
        }
      };

      // Initial display on load
      updateBattleEffectsDisplay(this.item.system.battleEffectsColumn);

      // Battle effects column change handler
      html.find('#battle-effects-column').change(async ev => {
        const column = ev.currentTarget.value;
        updateBattleEffectsDisplay(column);
        updatePullPunchFromColumn(column);
        
        // Auto-update the stored values if not overridden
        const overrideCheck = html.find('#override-pull-punch')[0];
        if (!overrideCheck?.checked && BATTLE_EFFECTS_COLUMNS[column]) {
          const colData = BATTLE_EFFECTS_COLUMNS[column];
          await this.item.update({
            "system.canPullPunch": colData.canPullPunch,
            "system.canReduceEffect": colData.canReduceEffect
          }, { render: false });
        }
      });

      // Override checkbox - when unchecked, resync from column
      html.find('#override-pull-punch').change(async ev => {
        if (!ev.currentTarget.checked) {
          const column = html.find('#battle-effects-column').val();
          updatePullPunchFromColumn(column);
          if (BATTLE_EFFECTS_COLUMNS[column]) {
            const colData = BATTLE_EFFECTS_COLUMNS[column];
            await this.item.update({
              "system.canPullPunch": colData.canPullPunch,
              "system.canReduceEffect": colData.canReduceEffect
            }, { render: false });
          }
        }
      });

      // ============ DAMAGE SOURCE HANDLING ============
      const updateDamageSourceUI = (source) => {
        const damageInput = html.find('[name="system.damage"]')[0];
        const hintEl = html.find('#damage-source-hint')[0];
        if (!damageInput || !hintEl) return;
        
        const rankValue = this.item.system.value || 0;
        switch (source) {
          case "rank":
            damageInput.disabled = true;
            hintEl.textContent = `Uses rank (${rankValue})`;
            break;
          case "strength":
            damageInput.disabled = true;
            hintEl.textContent = "Uses actor's Strength";
            break;
          case "endurance":
            damageInput.disabled = true;
            hintEl.textContent = "Uses actor's Endurance";
            break;
          case "fixed":
            damageInput.disabled = false;
            hintEl.textContent = "Enter fixed value";
            break;
          default:
            damageInput.disabled = true;
            hintEl.textContent = "";
        }
      };

      // Initial state
      updateDamageSourceUI(this.item.system.damageSource || "rank");

      html.find('#damage-source').change(ev => {
        updateDamageSourceUI(ev.currentTarget.value);
      });

      // ============ FORCE FIELD CHECKBOX ============
      html.find('#is-force-field').change(async ev => {
        const checked = ev.currentTarget.checked;
        await this.item.update({ "system.isForceField": checked }, { render: false });
        this.render(true);
      });

      // ============ ARMOR USE RANK VALUE TOGGLE ============
      html.find('#armor-use-rank').change(ev => {
        const armorManualValues = html.find('.armor-manual-values')[0];
        if (armorManualValues) {
          armorManualValues.style.display = ev.currentTarget.checked ? 'none' : '';
        }
      });

      // ============ ABSORPTION TYPE CHANGE (re-render to show/hide options) ============
      html.find('#absorption-type').change(async ev => {
        const value = ev.currentTarget.value;
        await this.item.update({ "system.absorptionType": value }, { render: false });
        this.render(true);
      });

      // ============ MAGIC CS MODIFIER CALCULATION ============
      const updateMagicCSDisplay = () => {
        const energyType = html.find('#magic-energy-type').val() || this.item.system.magic?.energyType || "";
        const hasChant = html.find('#magic-chant').is(':checked');
        const hasGesture = html.find('#magic-gesture').is(':checked');
        const hasCeremony = html.find('#magic-ceremony').is(':checked');
        const csDisplay = html.find('#magic-cs-display');
        
        if (!csDisplay.length) return;
        
        let csModifier = 0;
        let message = "";
        let bgColor = "#e8f5e9"; // green = good
        
        if (energyType === "personal") {
          message = "✓ Personal magic requires no verbal/somatic components";
        } else if (energyType === "universal") {
          // Universal requires chant OR gesture
          if (!hasChant && !hasGesture) {
            csModifier = -1;
            message = "⚠ Universal magic requires chant OR gesture (−1CS penalty)";
            bgColor = "#fff3e0"; // orange warning
          } else {
            message = "✓ Universal magic requirement met (chant or gesture)";
          }
        } else if (energyType === "dimensional") {
          // Dimensional requires BOTH chant AND gesture
          if (!hasChant && !hasGesture) {
            csModifier = -2;
            message = "⚠ Dimensional magic requires chant AND gesture (−2CS penalty)";
            bgColor = "#ffebee"; // red warning
          } else if (!hasChant) {
            csModifier = -1;
            message = "⚠ Missing chant for Dimensional magic (−1CS penalty)";
            bgColor = "#fff3e0";
          } else if (!hasGesture) {
            csModifier = -1;
            message = "⚠ Missing gesture for Dimensional magic (−1CS penalty)";
            bgColor = "#fff3e0";
          } else {
            message = "✓ Dimensional magic requirements met (chant + gesture)";
          }
          if (hasCeremony && csModifier < 0) {
            message += " — Ceremony can offset penalties at GM discretion";
          }
        } else {
          message = "Select an energy type to see casting requirements";
          bgColor = "#f5f5f5";
        }
        
        csDisplay.html(message);
        csDisplay.css('background', bgColor);
        
        // Store csModifier for use in action dialogs
        this.item.system.magic.csModifier = csModifier;
      };
      
      // Run on load and when checkboxes change
      updateMagicCSDisplay();
      html.find('#magic-energy-type').change(async ev => {
        updateMagicCSDisplay();
        // Re-render to show/hide conditional sections (dimensional source, universal backlash)
        const value = ev.currentTarget.value;
        await this.item.update({ "system.magic.energyType": value }, { render: false });
        this.render(true);
      });
      html.find('#magic-chant, #magic-gesture, #magic-ceremony').change(updateMagicCSDisplay);

      // ============ MOVEMENT TAB HANDLERS ============
      
      // Movement type change - re-render to show type-specific options
      html.find('#movement-type').change(async ev => {
        const value = ev.currentTarget.value;
        await this.item.update({ "system.movement.type": value }, { render: false });
        this.render(true);
      });

      // Use rank speed toggle
      html.find('#movement-use-rank').change(ev => {
        const manualSpeed = html.find('.movement-manual-speed')[0];
        if (manualSpeed) {
          manualSpeed.style.display = ev.currentTarget.checked ? 'none' : '';
        }
        updateSpeedReference();
      });

      // Passenger toggle
      html.find('#movement-passengers').change(ev => {
        const passengerLimit = html.find('.passenger-limit')[0];
        if (passengerLimit) {
          passengerLimit.style.display = ev.currentTarget.checked ? '' : 'none';
        }
      });

      // Speed reference display
      const updateSpeedReference = () => {
        const speedRef = html.find('#speed-reference');
        if (!speedRef.length) return;
        
        const useRank = html.find('#movement-use-rank').is(':checked');
        const rankValue = this.item.system.value || 0;
        const manualAreas = parseInt(html.find('input[name="system.movement.areasPerRound"]').val()) || 1;
        
        const areasPerRound = useRank ? rankValue : manualAreas;
        
        // FASERIP speed conversion (1 area = ~40 feet, 1 round = 6 seconds)
        // So areas/round * 40 * 10 = feet/minute, / 5280 * 60 = MPH
        const feetPerRound = areasPerRound * 40;
        const mph = Math.round((feetPerRound / 6) * 0.682); // ft/sec to mph
        
        const movementType = html.find('#movement-type').val() || "";
        let typeNote = "";
        if (movementType === "flight") {
          typeNote = " (Unaffected by terrain)";
        } else if (movementType === "teleportation") {
          typeNote = " (Range in areas, instantaneous)";
        } else if (movementType === "tunneling") {
          typeNote = " (Through solid material)";
        }
        
        speedRef.html(`<strong>Speed:</strong> ${areasPerRound} areas/round (~${mph} MPH)${typeNote}`);
      };
      
      updateSpeedReference();
      html.find('input[name="system.movement.areasPerRound"]').on('input', updateSpeedReference);
    }

    // Update power type options when category changes
    html.find('#power-category').change(ev => {
      const category = ev.currentTarget.value;
      this._updatePowerTypeOptions(html, category);
    });

    // If the category is already selected on load, populate the types
    const selectedCategory = html.find('#power-category').val();
    if (selectedCategory) {
      this._updatePowerTypeOptions(html, selectedCategory);
    }
    
    if (this.item.type === "power") {
      // Normalize and set attack type dropdown (handle legacy values)
      const rawAttackType = this.item.system.attackType || "";
      const legacyMap = {
        "ranged-energy": "energy",
        "ranged-force": "force",
        "ranged-projectile": "shooting",
        "ranged-thrown": "throwing-blunt",
        "melee-blunt": "blunt-attack",
        "melee-edged": "edged-attack",
        "touch": "energy",
        "grapple": "grappling",
        "charging": "charging"
      };
      const normalizedType = legacyMap[rawAttackType] || rawAttackType;
      const attackTypeSelect = html.find('#attack-type');
      if (attackTypeSelect.length && normalizedType) {
        attackTypeSelect.val(normalizedType);
      }

      // Initially show/hide custom range field based on current selection
      const currentRange = this.item.system.range;
      const customRangeInput = html.find('.custom-range-input');
      
      if (currentRange === "custom") {
        customRangeInput.show();
      } else {
        customRangeInput.hide();
      }
      
      // Handle range dropdown changes
      html.find('select[name="system.range"]').change(ev => {
        const selectedRange = ev.currentTarget.value;
        const customRangeInput = html.find('.custom-range-input');
        const calculatedRangeField = html.find('.calculated-range');
      
        if (selectedRange === "custom") {
          customRangeInput.show();
        } else {
          customRangeInput.hide();
        }
      
        if (selectedRange === "rank") {
          calculatedRangeField.show();
          const rank = html.find('select[name="system.rank"]').val();
          const rangeText = this._getRangeByRank(rank);
          html.find('#calculated-range-display').val(rangeText);
          this.item.update({ "system.calculatedRange": rangeText });
        } else {
          calculatedRangeField.hide();
          html.find('#calculated-range-display').val('');
          this.item.update({ "system.calculatedRange": "" });
        }
      });

      // On load, if range is "rank", show the calculated field and fill it
      const rangeValue = html.find('select[name="system.range"]').val();
      if (rangeValue === "rank") {
        const rank = html.find('select[name="system.rank"]').val();
        const rangeText = this._getRangeByRank(rank);
        html.find('.calculated-range').show();
        html.find('#calculated-range-display').val(rangeText);
      }

      // When Rank dropdown changes, update calculated range if using "By Rank"
      html.find('select[name="system.rank"]').change(ev => {
        const newRank = ev.currentTarget.value;
        const selectedRange = html.find('select[name="system.range"]').val();
        if (selectedRange === "rank") {
          const rangeText = this._getRangeByRank(newRank);
          html.find('#calculated-range-display').val(rangeText);
          this.item.update({ "system.calculatedRange": rangeText });
        }
      });

      // Handle duration dropdown changes
      html.find('select[name="system.duration"]').change(ev => {
        const selectedDuration = ev.currentTarget.value;
        const customDurationInput = html.find('.custom-duration-input');
        
        if (selectedDuration === "custom" || selectedDuration === "rounds") {
          customDurationInput.show();
        } else {
          customDurationInput.hide();
        }
      });

      // Initialize duration input visibility on load
      const currentDuration = html.find('select[name="system.duration"]').val();
      const customDurationInput = html.find('.custom-duration-input');
      if (currentDuration === "custom" || currentDuration === "rounds") {
        customDurationInput.show();
      } else {
        customDurationInput.hide();
      }
    }

    // Handle talent specialty dropdown (for talent sheets)
    if (this.item.type === "talent") {
      // Define talent specialties by category
      const talentSpecialties = {
        "Weapon Skill": ["Guns", "Thrown Weapons", "Bows", "Blunt Weapons", "Sharp Weapons", 
                        "Oriental Weapons", "Marksman", "Weapons Master", "Weapons Specialist"],
        "Fighting Skill": ["Martial Arts A", "Martial Arts B", "Martial Arts C", "Martial Arts D", 
                          "Martial Arts E", "Wrestling", "Thrown Objects", "Acrobatics", "Tumbling"],
        "Professional Skill": ["Medicine", "Law", "Law Enforcement", "Pilot", "Military", 
                              "Business/Finance", "Journalism", "Engineering", "Criminology", 
                              "Psychiatry", "Detective/Espionage"],
        "Scientific Skill": ["Chemistry", "Biology", "Geology", "Genetics", "Archaeology", 
                            "Physics", "Computers", "Electronics"],
        "Mystic/Mental Skill": ["Trance", "Mesmerism and Hypnosis", "Sleight of Hand", 
                              "Resist Domination", "Occult Lore", "Mystic Background"],
        "Other": ["Artist", "Languages", "First Aid", "Repair/Tinkering", "Trivia", 
                  "Performer", "Animal Training", "Heir to Fortune", "Student", "Leadership"]
      };

      // Function to update specialty dropdown based on selected category
      const updateSpecialtyDropdown = () => {
        const category = html.find('#talent-category').val();
        const specialtySelect = html.find('#talent-specialty');
        specialtySelect.empty();
        
        // Add default option
        specialtySelect.append($('<option></option>').val('').text('--Select Specialty--'));
        
        // If a category is selected, add its specialties
        if (category && talentSpecialties[category]) {
          talentSpecialties[category].forEach(specialty => {
            const option = $('<option></option>').val(specialty).text(specialty);
            // Select this option if it matches the current specialty
            if (specialty === this.item.system.specialty) {
              option.attr('selected', 'selected');
            }
            specialtySelect.append(option);
          });
        }
      };

      // Update specialty dropdown when category changes
      html.find('#talent-category').change(updateSpecialtyDropdown);
      
      // Initially populate the dropdown
      updateSpecialtyDropdown();
    }

    // Show/hide body armor fields
    html.find('#is-body-armor').change(ev => {
      const checked = ev.currentTarget.checked;
      html.find('.armor-details').toggle(checked);
    });

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
// scripts/modules/actions/edged-attack-action.js
import { AttackAction } from "./attack-action.js";
import {
  RANKS,
  shiftRank,
  getAbilityInfo,
  getStrengthInfo,
  effectsFor,
  labelFor,
  rollWithKarmaAndHistory,
  buildResultGrid,
  bannerColors,
  getTargetingContext,
  applyDamageToTargets,
  postDeathSavePrompt,
  buildMultiAttackSection,
  setupMultiAttackHandlers,
  debugLog,
  buildActionsBox
} from "./action-utils.js";
import { getItemMaterialRank } from "../../gm-utils.js";
import { makeDamageBlock, computeAfterArmor, buildDamageFlags } from "./damage-ui.js";
import { getBodyArmorValues } from "./action-utils.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { rollUniversalTable } from "../dice/universal-table.js";

export class EdgedAttackAction extends AttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "edged-attack";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);

    const ability = getAbilityInfo(actor, this.abilityName);
    const strength = getStrengthInfo(actor);

    // local helpers
    const isEdgedCapable = (it) => {
      const s = it.system || {};
      const tagHit = Array.isArray(s.tags) && (s.tags.includes("EA") || s.tags.includes("edged"));
      return (s.damageType === "EA") || (s.attackType === "edged") || tagHit;
    };
    const computeEdgedDamage = (strRank, strVal, matRank, weaponBase = 0) => {
      // Damage = max(min(STR rank value, material rank value), weapon base)
      const getVal = (r)=> game.msh.getRankValue(r) || 0;
      const sIdx = RANKS.indexOf(strRank);
      const mIdx = RANKS.indexOf(matRank);
      if (sIdx < 0 || mIdx < 0) {
        return { damage: Math.max(strVal, weaponBase), note: weaponBase ? `Using weapon base floor (${weaponBase})` : "Using Strength value" };
      }
      const strCap = getVal(strRank);
      const matVal = getVal(matRank);
      const calc = Math.min(strCap, matVal);
      const finalDmg = Math.max(calc, Number(weaponBase || 0));
      return { damage: finalDmg, note: `Damage = max(min(STR ${strCap}, MAT ${matVal}), base ${weaponBase||0})` };
    };

    // Normalize Armor Piercing across possible fields and shapes
    const getArmorPiercing = (it) => {
      const s = it?.system || {};
      const props = s.properties || {};
      // Prefer numeric; fall back to boolean (1) if present in props
      const ap =
        s.armorPiercing ??
        s.penetration ??
        s.ap ??
        (props.armorPiercing === true ? 1 : 0);
      return Number(ap) || 0;
    };

    const attackItems = actor.items.filter(isEdgedCapable);

    // restore flags
    const savedSource = await actor.getFlag("msh-faserip","lastEdgedSource") || "natural";
    const savedItemId = await actor.getFlag("msh-faserip","lastEdgedItemId") || "";
    const savedNatRank = await actor.getFlag("msh-faserip","lastNaturalWeaponRank") || "Good";
    const savedNatDmg  = await actor.getFlag("msh-faserip","lastNaturalWeaponDamage") || game.msh.getRankValue(savedNatRank);

    const savedShift = await actor.getFlag("msh-faserip","lastEdgedShift") || 0;
    const savedMultiAttacks = await actor.getFlag("msh-faserip","lastEdgedMultiAttacks") || false;
    const savedAttackCount = await actor.getFlag("msh-faserip","lastEdgedAttackCount") || 2;

    const itemOptions = attackItems.map(i =>
      `<option value="${i.id}" ${i.id===savedItemId?'selected':''}>${i.name}</option>`
    ).join("");

    // dialog HTML
    const dialogHtml = `
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Action:</label><strong>${actionName}</strong></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Ability:</label><input type="text" value="${ability.name}" style="width:140px;" readonly></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Rank:</label><input type="text" value="${ability.rank}" style="width:120px;" readonly>
        <span style="margin-left:6px;">(${ability.value})</span></div>

      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Column Shift:</label>
        <input type="number" name="shift" value="${savedShift}" style="width:52px;">
        <span style="color:#666;font-size:.9em;">(+ right, - left)</span></div>

      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Karma Points:</label>
        <input type="number" name="karma" value="${Number(this.opts.karma ?? 0)}" min="0" style="width:52px;"></div>

      <div style="margin:10px 0 6px;">
        <label style="display:inline-block;width:120px;">Source:</label>
        <label><input type="radio" name="src" value="natural" ${savedSource==='natural'?'checked':''}> Natural Weapon</label>
        <label style="margin-left:10px;"><input type="radio" name="src" value="weapon" ${savedSource==='weapon'?'checked':''}> Edged Weapon</label>
      </div>

      <div id="natural-row" style="display:none;margin-bottom:8px;">
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Rank:</label>
          <select name="natRank" style="width:170px;">
            ${RANKS.map(r => `<option value="${r}" ${r===savedNatRank?'selected':''}>${r}</option>`).join('')}
          </select>
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Damage:</label>
          <input type="number" name="natDmg" value="${savedNatDmg}" style="width:80px;">
        </div>
      </div>

      <div id="weapon-row" style="display:none;margin-bottom:8px;">
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Item:</label>
          <select name="item" style="min-width:220px;">${itemOptions || `<option value="">(No edged weapons found)</option>`}</select>
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Armor Piercing:</label>
          <input type="text" name="apDisplay" value="0" style="width:80px;" readonly>
        </div>
      </div>

      ${buildMultiAttackSection("edged-attack", game.user.targets.size, savedMultiAttacks, savedAttackCount, false)}
      <div id="preview" style="margin-top:8px;padding:6px;background:#fff3e0;border:1px solid #FF9800;border-radius:3px;font-size:.9em;">
        <strong>Damage:</strong> <span id="dmg-val">-</span>
        <span id="dmg-note" style="margin-left:6px;color:#555;"></span>
      </div>

      <div style="margin-top:8px;">
        <label><input type="checkbox" name="remember" checked> Remember these settings</label>
      </div>
      <div style="margin-top:8px;">
        <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
      </div>
    `;

    const choice = await new Promise((resolve)=>{
      new Dialog({
        title: `${actionName}: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html)=>{
              const $ = (sel)=> html.find(sel);
              const src     = $('[name="src"]:checked').val() || "natural";
              const itemId  = String($('[name="item"]').val() || "");
              const natRank = String($('[name="natRank"]').val() || savedNatRank);
              const natDmg  = Number($('[name="natDmg"]').val() || game.msh.getRankValue(natRank));
              const shift   = Number($('[name="shift"]').val() || 0);
              const karma   = Number($('[name="karma"]').val() || 0);
              
              const remember= !!$('[name="remember"]').is(':checked');
              const skipDice= !!$('[name="skipDice"]').is(':checked');
              const multiAttacks = !!$('[name="multiAttacks"]').is(':checked');
              const attackCount = parseInt($('[name="attackCount"]:checked').val() || 2);

              let weaponMat="", weaponName="", damage=natDmg, note="", ap=0, apCS=0, apMode="value";
              if (src === "natural") {
                weaponMat = natRank;
                weaponName = "Natural Weapon";
                damage = natDmg;
                note = `${natRank} rank natural weapon`;
                html.data('weaponNote', note);
              } else {
                  const item = attackItems.find(i=>i.id===itemId) || null;
                  weaponMat = item ? getItemMaterialRank(item) : "Excellent";
                  weaponName= item ? item.name : "(Edged Weapon)";
                  const base = Number(item?.system?.damage || 0);
                  ap = item ? getArmorPiercing(item) : 0;
                  apCS = item ? (Number(item.system.armorPiercingCS || 0) || 0) : 0;      // ✅ ADD
                  apMode = item ? (item.system.apMode || "value") : "value";              // ✅ ADD
                  const res = computeEdgedDamage(strength.rank, strength.value, weaponMat, base);
                  damage = res.damage; note = res.note;
                  html.data('weaponNote', note);
                }

              if (remember) {
                await actor.setFlag("msh-faserip","lastEdgedSource", src);
                await actor.setFlag("msh-faserip","lastEdgedShift", shift);
                await actor.setFlag("msh-faserip","lastEdgedMultiAttacks", multiAttacks);
                await actor.setFlag("msh-faserip","lastEdgedAttackCount", attackCount);

                if (src === "weapon") {
                  await actor.setFlag("msh-faserip","lastEdgedItemId", itemId);
                } else {
                  await actor.setFlag("msh-faserip","lastNaturalWeaponRank", natRank);
                  await actor.setFlag("msh-faserip","lastNaturalWeaponDamage", natDmg);
                }
              }

              resolve({ src, itemId, natRank, natDmg, shift, karma, skipDice, weaponMat, weaponName, damage, ap, apCS, apMode, html, multiAttacks, attackCount });

            }
          },
          cancel: { label: "Cancel", callback: ()=> resolve(null) }
        },
        default: "roll",
        render: (html)=>{
          const $dialog = html.closest('.dialog');

          const updatePreview = ()=>{
            const src = html.find('[name="src"]:checked').val() || "natural";
            const $nat = html.find('#natural-row');
            const $wep = html.find('#weapon-row');
            const $val = html.find('#dmg-val');
            const $note= html.find('#dmg-note');

            if (src === "natural") {
              $nat.show(); $wep.hide();
              const r = String(html.find('[name="natRank"]').val() || savedNatRank);
              const d = Number(html.find('[name="natDmg"]').val() || game.msh.getRankValue(r));
              $val.text(d);
              $note.text(`Natural weapon (${r})`);
            } else {
              $nat.hide(); $wep.show();
              const itemId = String(html.find('[name="item"]').val() || "");
              const item = attackItems.find(i=>i.id===itemId) || null;
              const mat = item ? getItemMaterialRank(item) : "Excellent";
              const base = Number(item?.system?.damage || 0);
              const res = computeEdgedDamage(strength.rank, strength.value, mat, base);
              const ap  = item ? getArmorPiercing(item) : 0;
              $val.text(res.damage);
              $note.text(`${item ? item.name : "(Edged Weapon)"} (${mat}) — ${res.note}`);
              html.find('[name="apDisplay"]').val(String(ap));
            }
            if ($dialog.length) $dialog[0].style.height = 'auto';
          };

          const syncNatDamage = ()=>{
            const r = String(html.find('[name="natRank"]').val() || savedNatRank);
            const v = game.msh.getRankValue(r);
            html.find('[name="natDmg"]').val(v);
            updatePreview();
          };

          // init + listeners
          updatePreview();
          html.find('[name="src"]').on('change', updatePreview);
          html.find('[name="item"]').on('change', updatePreview);
          html.find('[name="natRank"]').on('change', syncNatDamage);
          html.find('[name="natDmg"]').on('input', updatePreview);
          setupMultiAttackHandlers(html);
        }
      }).render(true);
    });
    
    if (!choice) return; // cancelled

    // Handle multi-attacks (2 or 3 attacks, must make FEAT; all attacks @-1 CS)
    let actualAttackCount = 1;
    if (choice.multiAttacks) {
      const fightingAbility = getAbilityInfo(actor, "fighting");
      const intensity = choice.attackCount === 2 ? "Remarkable" : "Amazing";
      
      // Calculate effective Fighting rank with column shift
      const effectiveFightingRank = shiftRank(fightingAbility.rank, choice.shift || 0);
      
      const featResult = await this._rollFightingFeat(
        actor, 
        { ...fightingAbility, rank: effectiveFightingRank }, 
        intensity, 
        choice.attackCount
      );
      if (featResult.cancelled) return;
      
      if (!featResult.success) {
        // Failed FEAT: 1 attack at -3CS
        choice.shift = (choice.shift || 0) - 3;
        actualAttackCount = 1;
      } else {
        // Success: Multiple attacks at -1CS each
        choice.shift = (choice.shift || 0) - 1;
        actualAttackCount = choice.attackCount;
      }
    }

    // Execute attack(s)
    for (let i = 1; i <= actualAttackCount; i++) {
      if (i > 1) {
        // Small delay between attacks for visual clarity
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      const actionLabel = actualAttackCount > 1 ? `${actionName} (${i}/${actualAttackCount})` : actionName;
      await this._executeSingleAttack(choice, actionLabel, ability, strength, effects, actionType);
    }

    // Multi-attack completion message
    if (actualAttackCount > 1) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div style="background:#e8f5e9;border:1px solid #4caf50;border-radius:3px;padding:8px;margin:5px 0;">
          <div style="color:#2e7d32;font-weight:bold;margin-bottom:5px;">Multiple Attack Sequence Complete</div>
          <div style="font-size:0.9em;">${actor.name} completed ${actualAttackCount} attacks.</div>
        </div>`
      });
    }
  } // <-- CLOSE async execute()

  async _executeSingleAttack(choice, actionLabel, ability, strength, effects, actionType) {
    const actor = this.actor;
    // effective rank + roll/karma
    const effectiveRank = shiftRank(ability.rank, choice.shift);
    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} performs ${actionLabel}`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }
    const { cappedTotal, totalKarmaUsed } =
      await rollWithKarmaAndHistory(actor, actionLabel, choice.karma, roll);

    // resolve color/effects
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color||"").toLowerCase();
    const effectResult = effects[colorLower] || color;

    const isHit = colorLower !== "white";

    // Edged damage type (prefer weapon's damageType if present)
    const dmgType =
      (choice.src === "weapon"
        ? (actor.items.get(choice.itemId)?.system?.damageType)
        : null) || "physical-edged";

    // Your choice.damage is already computed earlier in the dialog callback
    const rawDamage = isHit ? Number(choice.damage || 0) : 0;

    // Compute after-armor and target metadata
    const apValue = Number(choice.ap || 0) || 0;
    const apCSValue = Number(choice.apCS || 0) || 0;        // ✅ ADD
    const apModeValue = choice.apMode || "value";          // ✅ ADD

    const { afterArmor, targetName, multiTargetCount, targetsArray } = computeAfterArmor({
      isHit,
      rawDamage,
      damageType: dmgType,
      targets: game.user?.targets,
      getArmorFn: (tActor, dt) => {
        const vals = getBodyArmorValues(tActor, dt) || {};

        // ✅ ADD THIS DEBUG LOG:
        console.log("DEBUG armor vals:", {
          physicalRank: vals.physicalRank,
          energyRank: vals.energyRank,
          physicalArmor: vals.physical || vals.physicalArmor,
          energyArmor: vals.energy || vals.energyArmor,
          apCSValue,
          apModeValue,
          isForce: vals.isForceField
        });
        
        // Don't apply AP to force fields
        const isForce = vals.isForceField === true;
        
        if (!isForce) {
          // Handle CS-based AP
          if (apModeValue === "cs" && apCSValue > 0) {
            const relevantRank = vals.isEnergyDamage ? vals.energyRank : vals.physicalRank;
            if (relevantRank) {
              const loweredRank = shiftRank(relevantRank, -apCSValue);
              const newValue = game.msh.getRankValue(loweredRank) || 0;
              if (vals.isEnergyDamage) {
                vals.energy = newValue;
                vals.energyArmor = newValue;
              } else {
                vals.physical = newValue;
                vals.physicalArmor = newValue;
              }
              vals._apApplied = `${apCSValue} CS`;
            }
          } 
          // Handle numeric AP (legacy)
          else if (apValue > 0) {
            if (vals.isEnergyDamage) {
              vals.energyArmor = Math.max(0, Number(vals.energyArmor || 0) - apValue);
              vals.energy = vals.energyArmor;
            } else {
              vals.physicalArmor = Math.max(0, Number(vals.physicalArmor || 0) - apValue);
              vals.physical = vals.physicalArmor;
            }
            vals._apApplied = apValue;
          }
        } else {
          vals._apApplied = "Force Field (AP blocked)";
        }
        
        return vals;
      }
    });

    // Build standardized damage block
    const sourceLabel = (choice.src === "weapon")
      ? `Weapon: ${choice.weaponName || "(Edged Weapon)"} (${choice.weaponMat || "Excellent"})`
      : `Natural Weapon (${choice.natRank})`;

    const damageBlock = makeDamageBlock({
      isHit,
      rawDamage,
      afterArmor,
      note: (choice.html?.data('weaponNote') || ""),
      sourceLabel,
      targetName,
      multiTargetCount
    });

    // shared pieces
    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText||this._getResultHoverText));
    const { bg, fg } = bannerColors(colorLower);

    // Calculate penetrating damage for action chips
    let penetratingDamage = afterArmor;

    // actions: edged shows STUN (yellow/red) and KILL (red)
    const chip = (label, title, enabled, dataAttrs="") => {
      const base = "display:inline-block;font-size:12px;line-height:1.1;padding:2px 6px;border:1px solid #bbb;border-radius:3px;text-decoration:none;white-space:nowrap;";
      const style = enabled
        ? `${base}background:#fff;color:#333;cursor:pointer;`
        : `${base}background:#f7f7f7;color:#333;cursor:not-allowed;opacity:.55;filter:grayscale(.3);`;
      const key = label.toLowerCase().replace(/\s+/g,'-');
      return `<a class="faserip-chip" data-action="${key}" ${dataAttrs} ${enabled? "" : 'aria-disabled="true"'} title="${title}" style="${style}">${label}</a>`;
    };

    const parts = [];

    // Only show Apply Damage on hits - pass raw damage, let handler calculate armor
    if (isHit && rawDamage > 0) {
      parts.push(chip(
        "Apply Damage",
        "Apply damage to targeted/selected token(s)", 
        true, 
        `data-damage="${rawDamage}" 
        data-attacker-uuid="${actor.uuid}" 
        data-damage-type="${dmgType}" 
        data-attack-form="edged"
        data-bypass-armor="false"
        data-armor-piercing="${Number(choice.ap || 0)}"
        data-armor-piercing-cs="${Number(choice.apCS || 0)}"
        data-ap-mode="${choice.apMode || 'value'}"`
      ));
    }

    const enableStun = (colorLower === 'yellow' || colorLower === 'red') && canEffectsApply(penetratingDamage);
    const enableKill = (colorLower === 'red') && canEffectsApply(penetratingDamage);

    if (enableStun) parts.push(chip(
      "Resolve Stun",
      "Open Stun Check dialog",
      true,
      `data-check="stun" data-attack-form="edged" data-damage-type="${dmgType}" data-dmg="${penetratingDamage}" data-attacker-uuid="${actor.uuid}"`
    ));

    if (enableKill) parts.push(chip(
      "Resolve Kill",
      "Open Kill check dialog",
      true,
      `data-check="kill" data-attack-form="edged" data-damage-type="${dmgType}" data-dmg="${penetratingDamage}" data-attacker-uuid="${actor.uuid}"`
    ));

    if (choice.src === "weapon") {
      parts.push(chip(
        "Breaking FEAT",
        "Roll a Breaking FEAT: compare weapon material vs target armor/material (or wielder STR).",
        true,
        `data-action="breaking-feat" data-weapon-mat="${choice.weaponMat}" data-actor-uuid="${actor.uuid}"`
      ));
    }

    const actionsHtml = `
      <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;padding:8px 10px;margin:6px 10px 10px;border:1px solid #c0c0c0;background:#fafafa;border-radius:4px;">
        ${parts.join("\n")}
      </div>
      ${choice.src === "weapon" ? `<div style="padding:0 10px 8px;font-size:.8em;color:#666;">Note: If weapon Material &lt; target Armor/Material, a Breaking FEAT may apply.</div>` : "" }
    `;

    // weapon/natural context
    const weaponContext = (choice.src === "weapon")
      ? (() => {
          const note = choice.html.data('weaponNote') || "";
          const apText = Number(choice.ap || 0) > 0 ? ` — AP: ${Number(choice.ap)}` : "";
          return `
            <div>Weapon: ${choice.weaponName || "(Edged Weapon)"} (${choice.weaponMat || "Excellent"}) — Damage: ${choice.damage}${apText}</div>
            ${note ? `<div style="font-size:.85em;color:#666;">${note}</div>` : ``}
          `;
        })()
      : `<div>Attack: Claws/Teeth — Damage: ${choice.damage} (${choice.natRank})</div>`;

    // WARNING NOTE:
    const edgedWarning = `
      <div style="margin:6px 10px;padding:6px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;font-size:0.85em;">
        <strong>⚠ Edged Attack Rules:</strong> Damage cannot be reduced in effect. Minimum damage is always the weapon's listed damage.
      </div>
    `;
    
    const targetingContext = getTargetingContext(actor, actionLabel);

    // final chat card
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${actor.name} - ${actionLabel}</strong>
        </div>
        <div style="padding:5px 10px;border-bottom:1px solid #e0e0e0;font-size:.9em;">
          ${targetingContext}
        </div>
        <div style="padding:5px 10px;font-size:.9em;">
          <div>Ability: ${ability.name}</div>
          <div>Base Rank: ${ability.rank} (${ability.value})${choice.shift ? ` — Shift ${choice.shift} → ${effectiveRank}` : ""}</div>
          
          <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
        </div>
        ${damageBlock}
        ${edgedWarning}
        ${grid}
        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
        </div>
        ${actionsHtml}
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardHtml,
      flags: buildDamageFlags({
      actionId: actionType,
      damageType: dmgType,
      rawDamage,
      afterArmor,
      resultColor: colorLower,
      cappedTotal,
      targets: targetsArray,
      armorPiercing: apValue
    })

    });

    // === AUTO-APPLY DAMAGE IN FULL AUTO MODE ===
    if (this.opts?.autoApply && isHit && rawDamage > 0) {
      debugLog("Auto-applying damage in full auto mode", {
        damage: rawDamage,
        afterArmor,
        targets: (Array.from(game.user?.targets ?? [])).length || 0
      });

      /* Auto-apply in full-auto mode for Edged. */
      if (this.opts?.autoApply && isHit && rawDamage > 0) {
        await applyDamageToTargets(rawDamage, {
          attackerUuid: actor.uuid,
          damageType: (choice?.damageType || dmgType || "physical-edged"),
          attackForm: "edged",
          showNotification: true,
          bypassArmor: false,
          armorPiercing: Number(choice?.armorPiercing || choice?.ap || 0),
          armorPiercingCS: Number(choice?.armorPiercingCS || choice?.apCS || 0),
          apMode: (choice?.apMode || "value"),
          wasKillResult: (colorLower === "red")
        });
        if (typeof debugLog === "function") {
          debugLog("Edged auto-apply complete", { rawDamage, damageType: (choice?.damageType || dmgType || "physical-edged") });
        }
      }
    }
    // === END AUTO-APPLY ===

    // Play combat SFX
    const sourceName = choice.weaponName || "Natural Weapon";
    if (game.msh?.playCombatSFX) {
      await game.msh.playCombatSFX(dmgType, sourceName, colorLower);
    }
  }
}
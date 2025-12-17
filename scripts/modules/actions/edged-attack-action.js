// scripts/modules/actions/edged-attack-action.js
import { AttackAction } from "./attack-action.js";
import { 
  generateKarmaControlsHTML, 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog 
} from "../dice/dice-roller.js";
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
  applyCapabilitiesToDialog,
  buildModeSelector,
  setupModeSelector,
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

    const attackItems_base = actor.items.filter(isEdgedCapable);
    
    // If a specific item was passed via opts, ensure it's in the list and pre-selected
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    
    let attackItems = attackItems_base;
    if (passedItem && passedItem.type === "equipment") {
      // Add to list if not already present
      if (!attackItems.find(i => i.id === passedItem.id)) {
        attackItems = [passedItem, ...attackItems];
      }
    }

    // restore flags (but override with passed item if present)
    const savedSource = passedItem ? "weapon" : await actor.getFlag("msh-faserip","lastEdgedSource") || "natural";
    const savedItemId = passedItemId || await actor.getFlag("msh-faserip","lastEdgedItemId") || "";
    const savedNatRank = await actor.getFlag("msh-faserip","lastNaturalWeaponRank") || "Good";
    const savedNatDmg  = await actor.getFlag("msh-faserip","lastNaturalWeaponDamage") || game.msh.getRankValue(savedNatRank);

    const savedShift = await actor.getFlag("msh-faserip","lastEdgedShift") || 0;
    const savedMultiAttacks = await actor.getFlag("msh-faserip","lastEdgedMultiAttacks") || false;
    const savedAttackCount = await actor.getFlag("msh-faserip","lastEdgedAttackCount") || 2;
    const savedRemember = await actor.getFlag("msh-faserip","lastEdgedRemember") ?? true;
    const savedSkipDice = await actor.getFlag("msh-faserip","lastEdgedSkipDice") ?? false;

    const itemOptions = attackItems.map(i =>
      `<option value="${i.id}" ${i.id===savedItemId?'selected':''}>${i.name}</option>`
    ).join("");

    // dialog HTML
    const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}

      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Action:</label><strong>${actionName}</strong></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Ability:</label><input type="text" value="${ability.name}" style="width:140px;" readonly></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Rank:</label><input type="text" value="${ability.rank}" style="width:120px;" readonly>
        <span style="margin-left:6px;">(${ability.value})</span></div>

      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Column Shift:</label>
        <input type="number" name="shift" value="${savedShift}" style="width:52px;">
        <span style="color:#666;font-size:.9em;">(+ right, - left)</span></div>

      ${generateKarmaControlsHTML(actor, 0)}

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
        <label><input type="checkbox" name="remember" ${savedRemember ? 'checked' : ''}> Remember these settings</label>
      </div>
      <div style="margin-top:8px;">
        <label><input type="checkbox" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice animation</label>
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
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const karma   = karmaToSpend;
              
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

              // Always save remember/skipDice preferences
              await actor.setFlag("msh-faserip","lastEdgedRemember", remember);
              await actor.setFlag("msh-faserip","lastEdgedSkipDice", skipDice);

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

              resolve({ src, itemId, natRank, natDmg, shift, karma, spendKarma, skipDice, weaponMat, weaponName, damage, ap, apCS, apMode, html, multiAttacks, attackCount });

            }
          },
          cancel: { label: "Cancel", callback: ()=> resolve(null) }
        },
        default: "roll",
        render: async (html) => {
          setupKarmaControlHandlers(html);
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
          await setupModeSelector(actor, html, this.opts || {}, "lastEdgedMode");
          setupMultiAttackHandlers(html);
          applyCapabilitiesToDialog(html, "edged-attack", { actor });  // new
        }
      }).render(true);
    });
    
    if (!choice) return;

    // Reload mode from flags (user may have changed it in dialog)
    this.opts.mode = await actor.getFlag("msh-faserip", "lastEdgedMode") || "semi";
    const mode = this.opts.mode;
    if (mode === "manual") {
      this.opts.autoApply = false;
      this.opts.showConfirm = false;
    } else if (mode === "semi") {
      this.opts.autoApply = false;
      this.opts.showConfirm = true;
    } else {
      this.opts.autoApply = true;
      this.opts.showConfirm = false;
    }

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
      await this._executeSingleAttack({
      choice,
      actor: this.actor,
      ability,
      actionType,
      actionName: actionLabel,
      effects,
      damageType: "physical-edged",
      rawDamage: choice.damage,
      damageNote: choice.note || "",
      sourceName: choice.weaponName || "Natural Weapon",
      attackForm: "edged",
      breakingFeat: { weaponMat: choice.weaponMat },
      targetCount: 1
    });
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

      // Full Auto: immediately apply damage to the specific target
      if (this?.opts?.mode !== "manual" && this?.opts?.autoApply && isHit && afterArmor > 0 && target) {
        await applyDamageToTargets({
          damage: afterArmor,
          attackerUuid: actor.uuid,
          damageType,             // e.g. "physical-edged" for this action
          attackForm,             // e.g. "edged"
          showNotification: true,
          bypassArmor: false,
          armorPiercing: (choice?.ap ?? 0),
          apMode: (choice?.apMode ?? "value"),
          wasKillResult: (colorLower === "red"),
          specificTarget: target  // the TokenDocument/Token from this per-target branch
        });
      }

    }
  } // <-- CLOSE async execute()
}
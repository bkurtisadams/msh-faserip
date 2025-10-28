// scripts/modules/actions/blunt-attack-action.js
import { AttackAction } from "./attack-action.js";
import {
  RANKS, shiftRank, getAbilityInfo, getStrengthInfo,
  effectsFor, labelFor,
  isBluntCapable, computeBluntDamage,
  rollWithKarmaAndHistory, buildResultGrid, buildActionsBox, bannerColors,
  getTargetingContext, getBodyArmorValues, applyDamageToTargets,
  buildMultiAttackSection, setupMultiAttackHandlers,
  buildModeSelector, attachModeSelectorHandlers, debugLog, setupModeSelector
} from "./action-utils.js";
import { getItemMaterialRank } from "../../gm-utils.js";
import { makeDamageBlock, computeAfterArmor, buildDamageFlags } from "./damage-ui.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { buildColorOutcome } from "../dice/color-results.js";
import { applyColumnShifts } from "../dice/column-shifts.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { resolveCombatMode } from "./action-dispatcher.js";


export class BluntAttackAction extends AttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "blunt-attack";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);

    const ability = getAbilityInfo(actor, this.abilityName);
    const strength = getStrengthInfo(actor);
    const attackItems = actor.items.filter(isBluntCapable);

    // restore flags
    const savedSource = (await actor.getFlag("msh-faserip","lastBluntSource")) || "hands";
    const savedItemId = (await actor.getFlag("msh-faserip","lastBluntItemId")) || "";
    const savedObjectName = (await actor.getFlag("msh-faserip","lastBluntObjectName")) || "";
    const savedObjectRank = (await actor.getFlag("msh-faserip","lastBluntObjectRank")) || "Excellent";
    const savedObjectValue = (await actor.getFlag("msh-faserip","lastBluntObjectValue")) || 20;
    const savedPulledDamage = (await actor.getFlag("msh-faserip","lastBluntPulledDamage")) || 0;
    const savedResultCap = (await actor.getFlag("msh-faserip","lastBluntResultCap")) || "none";

    const savedMultiAttacks = await actor.getFlag("msh-faserip","lastBluntMultiAttacks") || false;
    const savedAttackCount = await actor.getFlag("msh-faserip","lastBluntAttackCount") || 2;
    const savedMultiAdjacent = await actor.getFlag("msh-faserip","lastBluntMultiAdjacent") || false;
    const savedColumnShift  = await actor.getFlag("msh-faserip","lastBluntShift") || 0;
    //const savedKarma = await actor.getFlag("msh-faserip","lastBluntKarma") || 0;

    const itemOptions = attackItems.map(i =>
      `<option value="${i.id}" ${i.id===savedItemId?'selected':''}>${i.name}</option>`
    ).join("");

    // dialog HTML
    const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}

      <div style="margin-bottom:6px;">
        <div style="display:grid;grid-template-columns:65px 1fr;gap:3px 8px;font-size:.9em;line-height:1.3;">
          <span style="font-weight:600;">Action:</span><span style="font-weight:600;">${actionName}</span>
          <span style="font-weight:600;">Target:</span><span style="color:#d32f2f;font-style:italic;">${getTargetingContext(actor, actionName).replace(/<[^>]*>/g, '').replace('Target: ', '').replace('Targets: ', '')}</span>
          <span style="font-weight:600;">Ability:</span><span>${ability.name}</span>
          <span style="font-weight:600;">Rank:</span><span>${ability.rank} (${ability.value})</span>
        </div>
      </div>
      
      <div style="margin:6px 0;padding:6px 0;border-top:1px solid #ddd;">
        <div style="margin-bottom:4px;">
          <label style="display:inline-block;width:90px;font-size:.9em;">Column Shift:</label>
          <input type="number" name="shift" value="${savedColumnShift }" style="width:45px;padding:2px;">
          <span style="color:#666;font-size:.8em;margin-left:4px;">(+/−)</span>
        </div>
        <div style="margin-bottom:4px;">
          <label style="display:inline-block;width:90px;font-size:.9em;">Karma Points:</label>
          <input type="number" name="karma" value="${Number(this.opts.karma ?? 0)}" min="0" style="width:45px;padding:2px;">
        </div>
      </div>

      <div style="margin:6px 0;padding:6px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;">
        <div style="font-weight:600;margin-bottom:6px;color:#e65100;">Pull Punch (Optional)</div>
        
        <div style="margin-bottom:4px;">
          <label style="display:inline-block;width:90px;font-size:.9em;">Damage Cap:</label>
          <input type="number" name="pulledDamage" value="${savedPulledDamage || strength.value}" min="0" max="${strength.value}" style="width:60px;padding:2px;">
          <span style="color:#666;font-size:.8em;margin-left:4px;" id="dmg-cap-note">(max: ${strength.value})</span>
        </div>
        <div style="margin-bottom:4px;">
          <label style="display:inline-block;width:90px;font-size:.9em;">Result Cap:</label>
          <select name="resultCap" style="width:140px;padding:2px;">
            <option value="none" ${savedResultCap==='none'?'selected':''}>No Limit</option>
            <option value="yellow" ${savedResultCap==='yellow'?'selected':''}>Cap at Yellow</option>
            <option value="green" ${savedResultCap==='green'?'selected':''}>Cap at Green</option>
          </select>
        </div>
        <div style="font-size:.85em;color:#666;font-style:italic;">Reduces effectiveness (subdue vs kill)</div>
      </div>

      ${buildMultiAttackSection("blunt-attack", game.user.targets.size, savedMultiAttacks, savedAttackCount, savedMultiAdjacent)}

      <div style="margin:6px 0;padding:6px;background:#f5f5f5;border:1px solid #ccc;border-radius:3px;">
        <div style="margin-bottom:4px;font-size:.9em;">
          <label style="font-weight:600;margin-right:8px;">Source:</label>
          <label><input type="radio" name="src" value="hands" ${savedSource==='hands'?'checked':''}> Bare Hands</label>
          <label style="margin-left:8px;"><input type="radio" name="src" value="weapon" ${savedSource==='weapon'?'checked':''}> Weapon</label>
          <label style="margin-left:8px;"><input type="radio" name="src" value="object" ${savedSource==='object'?'checked':''}> Object</label>
          <span style="display:inline-block;width:14px;height:14px;line-height:14px;text-align:center;border-radius:50%;background:#2196F3;color:#fff;font-size:10px;font-weight:bold;cursor:help;margin-left:4px;" title="Common improvised weapons:

  Wooden items (chair, bat): Typical (6)
  Metal pipe, crowbar: Good (10)
  Concrete chunk: Good (10)
  Brick: Typical (6)
  Trash can lid: Poor (4)
  Bottle/glass: Feeble (2)
  Rock (small): Poor (4)
  Rock (large): Typical (6)
  Car door: Excellent (20)
  Lamp post: Remarkable (30)
  Mailbox: Good (10)
  Dumpster: Incredible (40)

  BLUNT DAMAGE RULES:
  - Bare hands = Strength value
  - Weapon material ≤ Strength: damage = min(Strength, Material)
  - Weapon material > Strength: damage = next rank up from Strength">?</span>
        </div>

        <div id="weapon-row" style="display:none;font-size:.9em;padding-left:8px;">
          <label style="display:inline-block;width:50px;">Item:</label>
          <select name="item" style="width:200px;padding:2px;">${itemOptions || `<option value="">(none)</option>`}</select>
        </div>

        <div id="object-row" style="display:none;font-size:.9em;padding-left:8px;">
          <div style="display:grid;grid-template-columns:50px 1fr;gap:3px;align-items:center;">
            <label>Name:</label>
            <input type="text" name="objectName" value="${savedObjectName}" placeholder="rock, pipe..." style="width:100%;padding:2px;">
            
            <label>Material:</label>
            <div style="display:flex;gap:4px;align-items:center;">
              <select name="objectRank" style="width:110px;padding:2px;">
                <option value="Feeble" ${savedObjectRank==='Feeble'?'selected':''}>Feeble</option>
                <option value="Poor" ${savedObjectRank==='Poor'?'selected':''}>Poor</option>
                <option value="Typical" ${savedObjectRank==='Typical'?'selected':''}>Typical</option>
                <option value="Good" ${savedObjectRank==='Good'?'selected':''}>Good</option>
                <option value="Excellent" ${savedObjectRank==='Excellent'?'selected':''}>Excellent</option>
                <option value="Remarkable" ${savedObjectRank==='Remarkable'?'selected':''}>Remarkable</option>
                <option value="Incredible" ${savedObjectRank==='Incredible'?'selected':''}>Incredible</option>
                <option value="Amazing" ${savedObjectRank==='Amazing'?'selected':''}>Amazing</option>
                <option value="Monstrous" ${savedObjectRank==='Monstrous'?'selected':''}>Monstrous</option>
                <option value="Unearthly" ${savedObjectRank==='Unearthly'?'selected':''}>Unearthly</option>
              </select>
              <input type="number" name="objectValue" value="${savedObjectValue}" style="width:45px;padding:2px;">
            </div>
          </div>
        </div>
      </div>

      <div id="preview" style="margin:6px 0;padding:5px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;font-size:.85em;">
        <div><strong>Damage:</strong> <span id="dmg-val">${strength.value}</span> <span id="dmg-note" style="color:#555;">(Bare Hands = Strength)</span></div>
      </div>

      <div style="margin-top:6px;padding-top:5px;border-top:1px solid #ddd;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.9em;">
        <label><input type="checkbox" name="remember" checked> Remember settings</label>
        <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
      </div>
    `;

    const choice = await new Promise((resolve) => {
      new Dialog({
        title: `${actionName}: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const $ = (sel) => html.find(sel);
              const src    = $('[name="src"]:checked').val() || "hands";
              const itemId = $('[name="item"]').val() || "";
              const objectName  = $('[name="objectName"]').val() || "";
              const objectRank  = $('[name="objectRank"]').val() || "Excellent";
              const objectValue = parseInt($('[name="objectValue"]').val() || 20);
              const shift       = parseInt($('[name="shift"]').val() || 0);
              const karma       = parseInt($('[name="karma"]').val() || 0);
              const pulledDamage= parseInt($('[name="pulledDamage"]').val() || 0);
              const resultCap   = $('[name="resultCap"]').val() || "none";
              const skipDice    = !!$('[name="skipDice"]').is(':checked');

              let weaponMat="", weaponName="", damage=strength.value, note="";
              if (src === "weapon") {
                const item = attackItems.find(i => i.id === itemId);
                weaponMat = item ? getItemMaterialRank(item) : "Excellent";
                weaponName = item ? item.name : "";
                const res = computeBluntDamage(strength.rank, strength.value, weaponMat, RANKS);
                damage = res.damage;
                note = res.note;
              } else if (src === "object") {
                weaponMat = objectRank;
                weaponName = objectName || "Object";
                const res = computeBluntDamage(strength.rank, strength.value, weaponMat, RANKS);
                damage = res.damage;
                note = res.note;
              } else {
                damage = strength.value;
                note = "Bare Hands = Strength";
              }

              const remember = !!$('[name="remember"]').is(':checked');
              if (remember) {
                await actor.setFlag("msh-faserip","lastBluntSource", src);
                await actor.setFlag("msh-faserip","lastBluntPulledDamage", pulledDamage);
                await actor.setFlag("msh-faserip","lastBluntResultCap", resultCap);

                await actor.setFlag("msh-faserip","lastBluntShift", shift);
                await actor.setFlag("msh-faserip","lastBluntKarma", karma);
                await actor.setFlag("msh-faserip","lastBluntMultiAttacks", !!$('[name="multiAttacks"]').is(':checked'));
                await actor.setFlag("msh-faserip","lastBluntAttackCount", parseInt($('[name="attackCount"]:checked').val() || 2));
                await actor.setFlag("msh-faserip","lastBluntMultiAdjacent", !!$('[name="multiAdjacent"]').is(':checked'));

                if (src === "weapon") {
                  await actor.setFlag("msh-faserip","lastBluntItemId", itemId);
                  await actor.setFlag("msh-faserip","lastBluntColumnShift", savedColumnShift);
                } else if (src === "object") {
                  await actor.setFlag("msh-faserip","lastBluntObjectName", objectName);
                  await actor.setFlag("msh-faserip","lastBluntObjectRank", objectRank);
                  await actor.setFlag("msh-faserip","lastBluntObjectValue", objectValue);
                }
              }

              resolve({
                src, itemId, objectName, objectRank, objectValue, shift, karma,
                pulledDamage, resultCap, skipDice, weaponMat, weaponName, damage, note,
                // new code
                multiAttacks: !!$('[name="multiAttacks"]').is(':checked'),
                attackCount: parseInt($('[name="attackCount"]:checked').val() || 2),
                multiAdjacent: !!$('[name="multiAdjacent"]').is(':checked')
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: async (html) => {
          const $dialog = html.closest('.dialog');
          
          // Setup mode selector with centralized persistence
          await setupModeSelector(actor, html, this.opts || {}, "lastBluntMode");

          const update = () => {
            const src = html.find('[name="src"]:checked').val() || "hands";
            const $weaponRow = html.find('#weapon-row');
            const $objectRow = html.find('#object-row');
            const $val  = html.find('#dmg-val');
            const $note = html.find('#dmg-note');
            const $pulledDamage = html.find('[name="pulledDamage"]');
            const $dmgCapNote   = html.find('#dmg-cap-note');

            // Hide both rows first
            $weaponRow.hide();
            $objectRow.hide();

            let maxDamage = strength.value;

            if (src === "weapon") {
              $weaponRow.show();
              const itemId = String(html.find('[name="item"]').val() || "");
              const item = attackItems.find(i => i.id === itemId) || null;
              const mat  = item ? getItemMaterialRank(item) : "Excellent";
              const res  = computeBluntDamage(strength.rank, strength.value, mat, RANKS);
              maxDamage = res.damage;
              $val.text(res.damage);
              $note.text(`Weapon: ${item ? item.name : "(Object)"} (${mat}) — ${res.note}`);
            } else if (src === "object") {
              $objectRow.show();
              const mat = String(html.find('[name="objectRank"]').val() || "Excellent");
              const res = computeBluntDamage(strength.rank, strength.value, mat, RANKS);
              maxDamage = res.damage;
              $val.text(res.damage);
              const objName = html.find('[name="objectName"]').val() || "Object";
              $note.text(`Object: ${objName} (${mat}) — ${res.note}`);
            } else {
              $val.text(strength.value);
              $note.text(`(Bare Hands = Strength value)`);
            }

            // Update pull punch damage cap max
            $pulledDamage.attr('max', maxDamage);
            if (Number($pulledDamage.val()) > maxDamage) {
              $pulledDamage.val(maxDamage);
            }
            $dmgCapNote.text(`(max: ${maxDamage})`);

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };
          
          update();
          html.find('[name="src"]').on('change', update);
          html.find('[name="item"]').on('change', update);
          html.find('[name="objectRank"]').on('change', function() {
            const rank = $(this).val();
            const value = game.msh.getRankValue(rank) || 0;
            html.find('[name="objectValue"]').val(value);
            update();
          });
          html.find('[name="objectName"]').on('input', update);
          // multi attack
          setupMultiAttackHandlers(html);
        }
      }).render(true);
    });
    
    if (!choice) return;

    // Handle multiple adjacent targets (single roll @-4 CS)
    if (choice.multiAdjacent) {
      choice.shift = (choice.shift || 0) - 4;
      ui.notifications.info(`Attacking ${game.user.targets.size} adjacent targets at -4CS!`);
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
      
      if (featResult.success) {
        actualAttackCount = choice.attackCount;
        choice.shift = (choice.shift || 0) - 1; // Apply -1 CS for multi-attacks
        ui.notifications.info(`Multi-attack successful! Making ${actualAttackCount} attacks at -1CS!`);
      } else {
        ui.notifications.warn(`Multi-attack FEAT failed! Only making 1 attack.`);
        actualAttackCount = 1;
      }
    }

    // Execute attacks
    const targetCount = game.user.targets.size || 1;

    if (choice.multiAdjacent && targetCount > 1) {
      // Single roll for all adjacent targets
      await this._executeSingleAttack({
      choice, actor, ability,
      actionType, actionName, effects,
      damageType: "physical-blunt",
      rawDamage: choice.damage,
      damageNote: choice.note,
      sourceName: choice.weaponName || "Bare Hands",
      attackForm: "blunt",
      breakingFeat: (choice.src === "weapon" || choice.src === "object") ? { weaponMat: choice.weaponMat } : null,
      targetCount
    });
    } else {
      // Execute each attack separately
      for (let i = 0; i < actualAttackCount; i++) {
        if (i > 0 && MULTIPLE_PUNCH_SFX) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        await this._executeSingleAttack({
      choice, actor, ability,
      actionType, actionName, effects,
      damageType: "physical-blunt",
      rawDamage: choice.damage,
      damageNote: choice.note,
      sourceName: choice.weaponName || "Bare Hands",
      attackForm: "blunt",
      breakingFeat: (choice.src === "weapon" || choice.src === "object") ? { weaponMat: choice.weaponMat } : null,
      targetCount: 1
    });
      }
    }
  }
}
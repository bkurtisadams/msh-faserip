// scripts/modules/actions/blunt-attack-action.js
import { AttackAction } from "./attack-action.js";
import {
  RANKS, shiftRank, getAbilityInfo, getStrengthInfo,
  effectsFor, labelFor,
  isBluntCapable, computeBluntDamage,
  rollWithKarmaAndHistory, buildResultGrid, buildActionsBox, bannerColors,
  getTargetingContext, getBodyArmorValues, applyDamageToTargets  // ADD THIS IMPORT
} from "./action-utils.js";
import { getItemMaterialRank } from "../../gm-utils.js";
import { makeDamageBlock, computeAfterArmor, buildDamageFlags } from "./damage-ui.js";

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
    const savedSource = await actor.getFlag("msh-faserip","lastBluntSource") || "hands";
    const savedItemId = await actor.getFlag("msh-faserip","lastBluntItemId") || "";
    const savedObjectName = await actor.getFlag("msh-faserip","lastBluntObjectName") || "";
    const savedObjectRank = await actor.getFlag("msh-faserip","lastBluntObjectRank") || "Excellent";
    const savedObjectValue = await actor.getFlag("msh-faserip","lastBluntObjectValue") || 20;
    const savedPulledDamage = await actor.getFlag("msh-faserip","lastBluntPulledDamage") || 0;
    const savedResultCap = await actor.getFlag("msh-faserip","lastBluntResultCap") || "none";

    const itemOptions = attackItems.map(i =>
      `<option value="${i.id}" ${i.id===savedItemId?'selected':''}>${i.name}</option>`
    ).join("");

    // dialog HTML
    const dialogHtml = `
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
          <input type="number" name="shift" value="${Number(this.opts.shift ?? 0)}" style="width:45px;padding:2px;">
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

    const choice = await new Promise((resolve)=>{
      new Dialog({
        title: `${actionName}: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
          label: "Roll",
          callback: async (html)=>{
            const $ = (sel)=> html.find(sel);
            const src   = $('[name="src"]:checked').val() || "hands";
            const itemId= String($('[name="item"]').val() || "");
            const objectName = String($('[name="objectName"]').val() || "");
            const objectRank = String($('[name="objectRank"]').val() || "Excellent");
            const objectValue = Number($('[name="objectValue"]').val() || 20);
            const shift = Number($('[name="shift"]').val() || 0);
            const karma = Number($('[name="karma"]').val() || 0);
            const pulledDamage = Number($('[name="pulledDamage"]').val() || 0);
            const resultCap = String($('[name="resultCap"]').val() || "none");
            const remember = !!$('[name="remember"]').is(':checked');
            const skipDice = !!$('[name="skipDice"]').is(':checked');

            // compute damage
            let weaponMat="", weaponName="", damage=strength.value, note="";
            if (src === "weapon") {
              const item = attackItems.find(i=>i.id===itemId) || null;
              weaponMat = item ? getItemMaterialRank(item) : "Excellent";
              weaponName= item ? item.name : "(Object)";
              const res = computeBluntDamage(strength.rank, strength.value, weaponMat, RANKS);
              damage = res.damage; note = res.note;
            } else if (src === "object") {
              weaponMat = objectRank;
              weaponName = objectName || "Object";
              const res = computeBluntDamage(strength.rank, strength.value, weaponMat, RANKS);
              damage = res.damage; note = res.note;
            }

            if (remember) {
              await actor.setFlag("msh-faserip","lastBluntSource", src);
              await actor.setFlag("msh-faserip","lastBluntPulledDamage", pulledDamage);
              await actor.setFlag("msh-faserip","lastBluntResultCap", resultCap);
              if (src==="weapon") {
                await actor.setFlag("msh-faserip","lastBluntItemId", itemId);
              } else if (src==="object") {
                await actor.setFlag("msh-faserip","lastBluntObjectName", objectName);
                await actor.setFlag("msh-faserip","lastBluntObjectRank", objectRank);
                await actor.setFlag("msh-faserip","lastBluntObjectValue", objectValue);
              }
            }

            resolve({ src, itemId, objectName, objectRank, objectValue, shift, karma, pulledDamage, resultCap, skipDice, weaponMat, weaponName, damage, note });
          }
        },
          cancel: { label: "Cancel", callback: ()=> resolve(null) }
        },
        default: "roll",
        render: (html)=>{
          const $dialog = html.closest('.dialog');
          const update = ()=>{
            const src = html.find('[name="src"]:checked').val() || "hands";
            const $weaponRow = html.find('#weapon-row');
            const $objectRow = html.find('#object-row');
            const $val = html.find('#dmg-val');
            const $note= html.find('#dmg-note');
            const $pulledDamage = html.find('[name="pulledDamage"]');
            const $dmgCapNote = html.find('#dmg-cap-note');

            // Hide both rows first
            $weaponRow.hide();
            $objectRow.hide();

            let maxDamage = strength.value;

            if (src === "weapon") {
              $weaponRow.show();
              const itemId = String(html.find('[name="item"]').val() || "");
              const item = attackItems.find(i=>i.id===itemId) || null;
              const mat = item ? getItemMaterialRank(item) : "Excellent";
              const res = computeBluntDamage(strength.rank, strength.value, mat, RANKS);
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
        }
      }).render(true);
    });
    if (!choice) return; // cancelled

    // effective rank + roll/karma
    const effectiveRank = shiftRank(ability.rank, choice.shift);
    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} performs ${actionName}`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }
    const { cappedTotal, totalKarmaUsed } =
      await rollWithKarmaAndHistory(actor, actionName, choice.karma, roll);

    // resolve color/effects
    let color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    let colorLower = String(color||"").toLowerCase();
    
    // Apply result cap if set
    const colorOrder = ['white', 'green', 'yellow', 'red'];
    if (choice.resultCap !== 'none') {
      const capIndex = colorOrder.indexOf(choice.resultCap);
      const currentIndex = colorOrder.indexOf(colorLower);
      if (currentIndex > capIndex) {
        colorLower = choice.resultCap;
        color = colorLower.charAt(0).toUpperCase() + colorLower.slice(1);
      }
    }
    
    const effectResult = effects[colorLower] || color;

    // card pieces (shared)
    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText||this._getResultHoverText));
    const { bg, fg } = bannerColors(colorLower);

    const isHit = colorLower !== 'white';

    // Calculate penetrating damage by checking targeted token's Body Armor
    let penetratingDamage = 0;
    if (isHit && choice.damage > 0) {
      const targets = Array.from(game.user?.targets ?? []);
      if (targets.length === 1) {
        const targetActor = targets[0].actor;
        if (targetActor) {
          const armorData = getBodyArmorValues(targetActor, "physical-blunt");
          penetratingDamage = Math.max(0, choice.damage - armorData.applicable);
        } else {
          // No actor found for target, use raw damage
          penetratingDamage = choice.damage;
        }
      } else {
        // Multiple targets or no targets, use raw damage
        penetratingDamage = choice.damage;
      }
    }

    // Apply damage cap from pull punch
    if (choice.pulledDamage > 0 && choice.pulledDamage < penetratingDamage) {
      penetratingDamage = choice.pulledDamage;
    }

    // NOW calculate breakingFeat (after penetratingDamage is known)
    const breakingFeat = (colorLower !== "white" && penetratingDamage > 0 && (choice.src === "weapon" || choice.src === "object"))
      ? { weaponMat: choice.weaponMat }
      : null;

    const targets = Array.from(game.user?.targets ?? []);
    const rawDamage = choice.damage ?? strength.value;
    const afterArmor = penetratingDamage;

    const dmgType = "physical-blunt"; // Blunt attacks are always physical-blunt damage

    const actions = (isHit && penetratingDamage > 0)
      ? buildActionsBox({
          showSlam: colorLower === "yellow" && penetratingDamage > 0,
          showStun: colorLower === "red" && penetratingDamage > 0,
          pulled: choice.resultCap !== 'none' || (choice.pulledDamage > 0 && choice.pulledDamage < choice.damage),
          breakingFeat,
          actorUuid: actor.uuid,
          damage: penetratingDamage,      // pass penetrating, not raw
          attackForm: "blunt",
          damageType: "physical-blunt",
          bypassArmor: false
        })
      : "";

    // Build pull punch indicator
    let pullPunchNote = "";
    if (choice.pulledDamage > 0 && choice.pulledDamage < rawDamage) {
      pullPunchNote += `<div style="color:#ff6f00;">⚠ Damage pulled: ${rawDamage} → ${choice.pulledDamage}</div>`;
    }
    if (choice.resultCap !== 'none') {
      pullPunchNote += `<div style="color:#ff6f00;">⚠ Result capped at ${choice.resultCap.toUpperCase()}</div>`;
    }

    // damage line
    const damageBlock = `
      <div style="margin:6px 10px;padding:6px;border:1px solid #ccc;border-radius:3px;background:#fff;">
        <div><b>Damage (raw):</b> ${rawDamage}${choice.note ? ` <span style="color:#666;">— ${choice.note}</span>` : ``}</div>
        ${isHit ? `
          <div><b>After Armor${targets.length===1 ? ` (${targets[0].name})` : ``}:</b> ${afterArmor}</div>
        ` : ``}
        ${(choice.src === "weapon" || choice.src === "object") ? `
          <div style="font-size:.9em;color:#555;">
            Source: ${choice.weaponName || "(Object)"} (${choice.weaponMat || "Excellent"})
          </div>
        ` : `
          <div style="font-size:.9em;color:#555;">Source: Bare Hands</div>
        `}
        ${pullPunchNote}
      </div>
    `;


    const targetingContext = getTargetingContext(actor, actionName);

    // final chat card
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${actor.name} - ${actionName}</strong>
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
        ${grid}
        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
        </div>
        ${actions}
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
        targets: targets  // Note: buildDamageFlags expects the targets array, not the mapped uuids
      })
    });
  }
} // end of class BlundAttackAction
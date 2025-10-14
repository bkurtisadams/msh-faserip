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
  applyDamageToTargets  // ADD THIS IMPORT
} from "./action-utils.js";
import { getItemMaterialRank } from "../../gm-utils.js";

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

    const attackItems = actor.items.filter(isEdgedCapable);

    // restore flags
    const savedSource = await actor.getFlag("msh-faserip","lastEdgedSource") || "natural";
    const savedItemId = await actor.getFlag("msh-faserip","lastEdgedItemId") || "";
    const savedNatRank = await actor.getFlag("msh-faserip","lastNaturalWeaponRank") || "Good";
    const savedNatDmg  = await actor.getFlag("msh-faserip","lastNaturalWeaponDamage") || game.msh.getRankValue(savedNatRank);

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
        <input type="number" name="shift" value="${Number(this.opts.shift ?? 0)}" style="width:52px;">
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
        <label style="display:inline-block;width:120px;">Item:</label>
        <select name="item" style="min-width:220px;">${itemOptions || `<option value="">(No edged weapons found)</option>`}</select>
      </div>

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

              let weaponMat="", weaponName="", damage=natDmg, note="";
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
                const res = computeEdgedDamage(strength.rank, strength.value, weaponMat, base);
                damage = res.damage; note = res.note;
                html.data('weaponNote', note);
              }

              if (remember) {
                await actor.setFlag("msh-faserip","lastEdgedSource", src);
                if (src === "weapon") {
                  await actor.setFlag("msh-faserip","lastEdgedItemId", itemId);
                } else {
                  await actor.setFlag("msh-faserip","lastNaturalWeaponRank", natRank);
                  await actor.setFlag("msh-faserip","lastNaturalWeaponDamage", natDmg);
                }
              }

              resolve({ src, itemId, natRank, natDmg, shift, karma, skipDice, weaponMat, weaponName, damage, html });
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
              $val.text(res.damage);
              $note.text(`${item ? item.name : "(Edged Weapon)"} (${mat}) — ${res.note}`);
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
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color||"").toLowerCase();
    const effectResult = effects[colorLower] || color;

    // shared pieces
    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText||this._getResultHoverText));
    const { bg, fg } = bannerColors(colorLower);

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

    // Only show Apply Damage on hits (not white)
    const isHit = colorLower !== 'white';
    if (isHit && choice.damage > 0) {
      parts.push(chip(
        "Apply Damage",
        "Apply damage to targeted/selected token(s)", 
        true, 
        `data-damage="${choice.damage}" data-attacker-uuid="${actor.uuid}" data-damage-type="physical-edged"`
      ));
    }

    const enableStun = (colorLower === 'yellow' || colorLower === 'red');
    const enableKill = (colorLower === 'red');

    if (enableStun) parts.push(chip(
      "Resolve Stun",
      "Open Stun Check dialog",
      true,
      `data-check="stun" data-attack-form="edged" data-damage-type="physical-edged" data-dmg="${choice.damage}" data-attacker-uuid="${actor.uuid}"`
    ));

    if (enableKill) parts.push(chip(
      "Resolve Kill",
      "Open Kill check dialog",
      true,
      `data-check="kill" data-attack-form="edged" data-damage-type="physical-edged" data-dmg="${choice.damage}" data-attacker-uuid="${actor.uuid}"`
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
          return `
            <div>Weapon: ${choice.weaponName || "(Edged Weapon)"} (${choice.weaponMat || "Excellent"}) — Damage: ${choice.damage}</div>
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
          ${weaponContext}
          <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
        </div>
        ${edgedWarning}
        ${grid}
        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
        </div>
        ${actionsHtml}
      </div>
    `;

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

  }
}
// scripts/modules/actions/blunt-attack-action.js
import { AttackAction } from "./attack-action.js";
import {
  RANKS, shiftRank, getAbilityInfo, getStrengthInfo,
  effectsFor, labelFor,
  isBluntCapable, computeBluntDamage,
  rollWithKarmaAndHistory, buildResultGrid, buildActionsBox, bannerColors
} from "./action-utils.js";
import { getItemMaterialRank } from "../../gm-utils.js";

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
    const savedPull   = await actor.getFlag("msh-faserip","lastPullPunch") || false;

    const itemOptions = attackItems.map(i =>
      `<option value="${i.id}" ${i.id===savedItemId?'selected':''}>${i.name}</option>`
    ).join("");

    // dialog HTML
    const dialogHtml = `
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Action:</label><strong>${actionName}</strong></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Ability:</label><input type="text" value="${ability.name}" style="width:120px;" readonly></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Rank:</label><input type="text" value="${ability.rank}" style="width:120px;" readonly>
        <span style="margin-left:6px;">(${ability.value})</span></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Column Shift:</label>
        <input type="number" name="shift" value="${Number(this.opts.shift ?? 0)}" style="width:52px;">
        <span style="color:#666;font-size:.9em;">(+ right, - left)</span></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Karma Points:</label>
        <input type="number" name="karma" value="${Number(this.opts.karma ?? 0)}" min="0" style="width:52px;"></div>
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:120px;">Pull Punch:</label>
        <input type="checkbox" name="pulled" ${savedPull?'checked':''}>
        <span style="color:#666;font-size:.85em;">(lower dmg and/or color)</span></div>

      <div style="margin:10px 0 6px;">
        <label style="display:inline-block;width:120px;">Source:</label>
        <label><input type="radio" name="src" value="hands" ${savedSource==='hands'?'checked':''}> Bare Hands</label>
        <label style="margin-left:10px;"><input type="radio" name="src" value="weapon" ${savedSource==='weapon'?'checked':''}> Weapon/Object</label>
      </div>

      <div id="weapon-row" style="display:none;margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Item:</label>
        <select name="item" style="min-width:220px;">${itemOptions || `<option value="">(No blunt-capable items found)</option>`}</select>
      </div>

      <div id="preview" style="margin-top:8px;padding:6px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;font-size:.9em;">
        <strong>Damage:</strong> <span id="dmg-val">${strength.value}</span>
        <span id="dmg-note" style="margin-left:6px;color:#555;">(Bare Hands = Strength value)</span>
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
              const src   = $('[name="src"]:checked').val() || "hands";
              const itemId= String($('[name="item"]').val() || "");
              const shift = Number($('[name="shift"]').val() || 0);
              const karma = Number($('[name="karma"]').val() || 0);
              const pulled = !!$('[name="pulled"]').is(':checked');
              const remember = !!$('[name="remember"]').is(':checked');
              const skipDice = !!$('[name="skipDice"]').is(':checked');

              // compute previewed damage exactly as shown
              let weaponMat="", weaponName="", damage=strength.value, note="";
              if (src === "weapon") {
                const item = attackItems.find(i=>i.id===itemId) || null;
                weaponMat = item ? getItemMaterialRank(item) : "Excellent";
                weaponName= item ? item.name : "(Object)";
                const res = computeBluntDamage(strength.rank, strength.value, weaponMat, RANKS);
                damage = res.damage; note = res.note;
                html.data('weaponNote', note);
              }

              if (remember) {
                await actor.setFlag("msh-faserip","lastPullPunch", pulled);
                await actor.setFlag("msh-faserip","lastBluntSource", src);
                if (src==="weapon") await actor.setFlag("msh-faserip","lastBluntItemId", itemId);
              }

              resolve({ src, itemId, shift, karma, pulled, skipDice, weaponMat, weaponName, damage, html });
            }
          },
          cancel: { label: "Cancel", callback: ()=> resolve(null) }
        },
        default: "roll",
        render: (html)=>{
          const $dialog = html.closest('.dialog');
          const update = ()=>{
            const src = html.find('[name="src"]:checked').val() || "hands";
            const $row = html.find('#weapon-row');
            const $val = html.find('#dmg-val');
            const $note= html.find('#dmg-note');

            if (src === "weapon") {
              $row.show();
              const itemId = String(html.find('[name="item"]').val() || "");
              const item = attackItems.find(i=>i.id===itemId) || null;
              const mat = item ? getItemMaterialRank(item) : "Excellent";
              const res = computeBluntDamage(strength.rank, strength.value, mat, RANKS);
              $val.text(res.damage);
              $note.text(`Weapon: ${item ? item.name : "(Object)"} (${mat}) — ${res.note}`);
            } else {
              $row.hide();
              $val.text(strength.value);
              $note.text(`(Bare Hands = Strength value)`);
            }
            if ($dialog.length) $dialog[0].style.height = 'auto';
          };
          update();
          html.find('[name="src"]').on('change', update);
          html.find('[name="item"]').on('change', update);
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

    // card pieces (shared)
    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText||this._getResultHoverText));
    const { bg, fg } = bannerColors(colorLower);
    const breakingFeat = choice.src === "weapon" ? { weaponMat: choice.weaponMat } : null;
    const actions = buildActionsBox({
      showSlam: colorLower==='yellow',
      showStun: colorLower==='red',
      pulled: choice.pulled,
      breakingFeat,
      actorUuid: actor.uuid
    });

    // right after `const actions = buildActionsBox({...});`
    const makeCheckChip = (label, check, attackForm, dmg, actorUuid) => {
    const base = "display:inline-block;font-size:12px;line-height:1.1;padding:2px 6px;border:1px solid #bbb;border-radius:3px;text-decoration:none;white-space:nowrap;";
    const style = `${base}background:#fff;color:#333;cursor:pointer;`;
    return `<a class="faserip-chip" data-check="${check}" data-attack-form="${attackForm}"
                data-dmg="${dmg || 0}" data-attacker-uuid="${actorUuid}" style="${style}">${label}</a>`;
    };

    // Build the extra chips you want on Blunt
    const extraChips = [
    makeCheckChip("Open Stun Check", "stun", "blunt", choice.damage, actor.uuid),
    makeCheckChip("Open Slam Check", "slam", "blunt", choice.damage, actor.uuid),
    ].join("\n");

    // Inject them just before the actions' closing </div>
    const actionsWithChecks = actions.replace(/<\/div>\s*$/, `${extraChips}\n</div>`);


    // weapon/bare line
    const weaponContext = (choice.src === "weapon")
      ? (() => {
          const note = choice.html.data('weaponNote') || "";
          return `
            <div>Weapon: ${choice.weaponName || "(Object)"} (${choice.weaponMat || "Excellent"}) — Damage: ${choice.damage}</div>
            ${note ? `<div style="font-size:.85em;color:#666;">${note}</div>` : ``}
          `;
        })()
      : `<div>Attack: Bare Hands — Damage: ${strength.value}</div>`;

    // final chat card
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${actor.name} - ${actionName}</strong>
        </div>
        <div style="padding:5px 10px;font-size:.9em;">
          <div>Ability: ${ability.name}</div>
          <div>Base Rank: ${ability.rank} (${ability.value})${choice.shift ? ` — Shift ${choice.shift} → ${effectiveRank}` : ""}</div>
          ${weaponContext}
          <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
          ${choice.pulled ? `<div style="color:#FF9800;">⚠ Pull Punch selected (apply cap or downgrade color)</div>` : ``}
        </div>
        ${grid}
        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(effectResult).toUpperCase()}
        </div>
        ${actionsWithChecks}
      </div>
    `;

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });
  }
}

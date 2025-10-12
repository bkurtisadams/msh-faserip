import { RangedAttackAction } from "./ranged-attack-action.js";
import {
  getAbilityInfo, labelFor, effectsFor, shiftRank,
  rollWithKarmaAndHistory, buildResultGrid, bannerColors
} from "./action-utils.js";

export class ThrowingEdgedAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "throwing-edged";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");

    // Carry-based candidates (OK if empty; we'll allow ad-hoc)
    const thrownEdged = actor.items.filter(i => {
      const s = i.system || {};
      const tags = (s.tags || []).map(t => String(t).toLowerCase());
      const isThrown = s.weaponType === "thrown" || tags.includes("thrown");
      const isEdged  = s.damageType === "EA" || s.attackType === "edged" || tags.includes("edged") || tags.includes("ea");
      return isThrown && isEdged;
    });

    // Strength-based range for throwing
    const strRank = actor?.system?.abilities?.strength?.rank || "Typical";

    // Last prefs
    const savedItemId   = await actor.getFlag("msh-faserip", "lastThrowEdgedItemId") || "";
    const savedRange    = await actor.getFlag("msh-faserip", "lastThrowEdgedRange") || 1;
    const savedObstacle = await actor.getFlag("msh-faserip", "lastThrowEdgedObstacle") || false;
    const savedAdHoc    = await actor.getFlag("msh-faserip", "lastThrowEdgedAdHoc") || false;
    const savedAdHocNm  = await actor.getFlag("msh-faserip", "lastThrowEdgedAdHocName") || "Broken Bottle";
    const savedAdHocDmg = Number(await actor.getFlag("msh-faserip", "lastThrowEdgedAdHocDamage") || 10);

    const itemOptions = thrownEdged.map(i =>
      `<option value="${i.id}" ${i.id === savedItemId ? "selected" : ""}>${i.name}</option>`
    ).join("");

    // --- Dialog ---
    const dialogHtml = `
      <div style="margin-bottom:8px;"><strong>${actionName}</strong></div>
      <div style="margin-bottom:8px;">
          <span style="display:inline-block;width:110px;">Ability:</span>
          <input type="text" value="${ability.name}" style="width:120px" readonly>
          <span style="margin-left:6px;">${ability.rank} (${ability.value})</span>
      </div>
      <div style="margin-bottom:8px;">
          <span style="display:inline-block;width:110px;">Column Shift:</span>
          <input type="number" name="shift" value="${Number(this.opts.shift ?? 0)}" style="width:60px;">
      </div>
      <div style="margin-bottom:8px;">
          <span style="display:inline-block;width:110px;">Karma Points:</span>
          <input type="number" name="karma" value="${Number(this.opts.karma ?? 0)}" min="0" style="width:60px;">
      </div>

      <fieldset style="margin:10px 0;padding:8px;border:1px solid #ddd;border-radius:4px;background:#fafafa;">
          <legend style="padding:0 6px;font-weight:bold;">Weapon Source</legend>

          <div style="margin:4px 0;">
          <input type="checkbox" id="adhoc-toggle" name="adhoc" ${savedAdHoc || (!thrownEdged.length) ? "checked" : ""}>
          <label for="adhoc-toggle">Use weapon of opportunity (ad-hoc)</label>
          </div>

          <div class="adhoc-fields" style="margin-top:8px;${savedAdHoc || (!thrownEdged.length) ? "" : "display:none"}">
          <div style="margin-bottom:6px;">
              <span style="display:inline-block;width:110px;">Name:</span>
              <input type="text" name="adhocName" value="${savedAdHocNm}" style="width:220px;">
              <span style="font-size:0.85em;color:#666;margin-left:6px;">e.g., “Broken Bottle”</span>
          </div>
          <div>
              <span style="display:inline-block;width:110px;">Damage:</span>
              <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="width:80px;">
              <span style="font-size:0.85em;color:#666;margin-left:6px;">numeric damage</span>
          </div>
          </div>

          <div class="carried-fields" style="margin-top:8px;${savedAdHoc || (!thrownEdged.length) ? "display:none" : ""}">
          <span style="display:inline-block;width:110px;">Weapon:</span>
          <select name="weapon" style="min-width:220px">
              ${itemOptions || '<option value="">(none in inventory)</option>'}
          </select>
          </div>
      </fieldset>

      ${this._buildRangeInputs({
          defaultRange: savedRange,
          showObstacle: true,
          weaponMaxRange: null,
          powerRank: null,
          strengthRank: strRank
      })}

      <div style="margin-top:8px;">
          <input type="checkbox" id="throughObstacle" name="throughObstacle" ${savedObstacle ? "checked" : ""}>
          <label for="throughObstacle">Through obstacle (-2CS)</label>
      </div>
      <div style="margin-top:8px;">
          <input type="checkbox" id="remember" name="remember" checked>
          <label for="remember">Remember settings</label>
          <input type="checkbox" id="skipDice" name="skipDice" style="margin-left:12px;">
          <label for="skipDice">Skip dice animation</label>
      </div>
      `;

    const choice = await new Promise(resolve => {
      new Dialog({
        title: `${actionName}: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const $ = (sel) => html.find(sel);
              const useAdHoc = !!$('[name="adhoc"]').is(':checked');

              // Collect weapon info (either carried item or ad-hoc)
              let weaponName, weaponDamage, weaponId = null;

              if (useAdHoc) {
                weaponName = String($('[name="adhocName"]').val() || "Improvised Edged");
                weaponDamage = Number($('[name="adhocDamage"]').val() || 0);
                if (Number.isNaN(weaponDamage) || weaponDamage < 0) {
                  ui.notifications.error("Enter a valid non-negative damage value for the ad-hoc weapon.");
                  return resolve(null);
                }
              } else {
                const wid = String($('[name="weapon"]').val() || "");
                const weapon = thrownEdged.find(i => i.id === wid);
                if (!weapon) {
                  ui.notifications.error("Select a carried thrown-edged weapon or use ad-hoc.");
                  return resolve(null);
                }
                weaponId = wid;
                weaponName = weapon.name;
                weaponDamage = Number(weapon.system?.damage || 0);
              }

              const shift = Number($('[name="shift"]').val() || 0);
              const karma = Number($('[name="karma"]').val() || 0);
              const range = Number($('[name="range"]').val() || 1);
              const throughObstacle = !!$('[name="throughObstacle"]').is(':checked');
              const remember = !!$('[name="remember"]').is(':checked');
              const skipDice = !!$('[name="skipDice"]').is(':checked');

              // Remember flags
              if (remember) {
                await actor.setFlag("msh-faserip", "lastThrowEdgedAdHoc", useAdHoc);
                await actor.setFlag("msh-faserip", "lastThrowEdgedAdHocName", weaponName);
                await actor.setFlag("msh-faserip", "lastThrowEdgedAdHocDamage", weaponDamage);
                await actor.setFlag("msh-faserip", "lastThrowEdgedItemId", weaponId || "");
                await actor.setFlag("msh-faserip", "lastThrowEdgedRange", range);
                await actor.setFlag("msh-faserip", "lastThrowEdgedObstacle", throughObstacle);
              }

              // Use shared base helper: Strength path for thrown
              const { totalShift, impossible, rangeModifier, obstacleModifier } =
                this._applyRangeModifiers(shift, range, throughObstacle, null, null, strRank);
              if (impossible) {
                ui.notifications.error(`Target is beyond throwing range (${this._getThrowingRangeInAreas(strRank)} areas).`);
                return resolve(null);
              }

              resolve({
                weaponName, weaponDamage, weaponId,
                karma, range, throughObstacle, skipDice,
                totalShift, rangeModifier, obstacleModifier
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: (html) => {
          const $adhoc = html.find('#adhoc-toggle');
          const applyToggle = () => {
            const on = $adhoc.is(':checked');
            html.find('.adhoc-fields').css('display', on ? '' : 'none');
            html.find('.carried-fields').css('display', on ? 'none' : '');
          };
          $adhoc.on('change', applyToggle);
          applyToggle();

          this._setupRangePreview(html, { strengthRank: strRank });
        }

      }).render(true);
    });

    if (!choice) return;

    // Final rank -> roll -> karma -> color
    const effectiveRank = shiftRank(ability.rank, choice.totalShift);
    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} performs ${actionName}` });
    }
    const { cappedTotal, totalKarmaUsed } =
      await rollWithKarmaAndHistory(actor, actionName, choice.karma, roll);
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorKey = String(color).toLowerCase();

    // Result card
    const grid = buildResultGrid(actionType, colorKey, effects, this._getResultHoverText);
    const { bg, fg } = bannerColors(colorKey);

    const chips = [];
    chips.push(`<a class="faserip-chip" style="pointer-events:none;opacity:.6;" title="Placeholder: apply damage manually.">Apply Damage</a>`);
    if (colorKey === "yellow") {
      chips.push(`<a class="faserip-chip" data-action="resolve-stun" data-check="stun" data-attack-form="edged" data-dmg="${choice.weaponDamage}" data-attacker-uuid="${actor.uuid}" title="Open Stun Check dialog">Resolve Stun</a>`);
    }
    if (colorKey === "red") {
      chips.push(`<a class="faserip-chip" data-action="resolve-kill" data-check="kill" data-attack-form="edged" data-dmg="${choice.weaponDamage}" data-attacker-uuid="${actor.uuid}" title="Open Kill Check dialog">Resolve Kill</a>`);
    }

    const html = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;"><strong>${actor.name} — ${actionName}</strong></div>
        <div style="padding:6px 10px;font-size:.9em;">
          <div>Weapon: ${choice.weaponName} (Damage: ${choice.weaponDamage})</div>
          <div>Distance: ${choice.range} area${choice.range>1?'s':''} ${choice.rangeModifier?`(${choice.rangeModifier}CS)`:''}${choice.throughObstacle?`, obstacle (-2CS)`:''}</div>
          <div>Total Shift: ${choice.totalShift}</div>
          <div>Roll: ${roll.total}${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = ${cappedTotal}</div>
        </div>
        ${grid}
        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()}
        </div>
        <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;padding:8px 10px;margin:6px 10px 10px;border:1px solid #c0c0c0;background:#fafafa;border-radius:4px;">
          ${chips.join("")}
        </div>
      </div>
    `;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: html });
  }
}

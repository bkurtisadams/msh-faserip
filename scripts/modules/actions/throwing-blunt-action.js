// scripts/modules/actions/throwing-blunt-action.js v3.0.1 - 2026-03-16
// v3.0.1: Fix CS save/restore — strip sit tags + range (not talent chips) on save.
//         Range penalty uses autoRangeCs data-attr for clean base/penalty tracking.
//         No-range-penalty flag support. Auto range tag not removable via × close.
// v3.0.0: Port to v3 compact dialog layout matching blunt/edged/shooting/throwing-edged v3
//         - frp-header-v3 banner, inline CS + chips + situational dropdown
//         - Carried/Ad-hoc source toggle with weapon select in frp-dmg-box
//         - Range info box (compact, penalty display only — CS via sit tags)
//         - Greyed opt-rows (Pull with result cap + Karma), frp-fx-grid (Miss/Hit/Hit/Stun)
//         - Titlebar mode buttons, 360px width
//         - Talent chip detection (Thrown Objects, MA-E)
//         - No AP (blunt objects don't pierce armor)
// v2.0.0: Refactor - dialog only, delegates resolution to _executeSingleAttack
import { RangedAttackAction } from "./ranged-attack-action.js";
import {
  setupKarmaControlHandlers,
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import {
  RANKS,
  shiftRank,
  getAbilityInfo,
  effectsFor,
  labelFor,
  buildModeSelector,
  setupModeSelector,
  applyCapabilitiesToDialog,
  attachAutoFillRange,
  getTargetData,
  getBodyArmorValues,
  debugLog
} from "./action-utils.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";

export class ThrowingBluntAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "throwing-blunt";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");

    // Candidate weapons: thrown + blunt
    let thrownBlunt = actor.items.filter(i => {
      if (i.type !== "equipment" || String(i.system?.category ?? "").toLowerCase() !== "weapon") return false;
      const s = i.system ?? {};
      if (s.attackModes) {
        const modes = Object.values(s.attackModes);
        if (modes.some(m => m.actionType === "throwing-blunt" ||
            (m.damageType === "TB" && m.name?.toLowerCase().includes("throw")))) return true;
      }
      const tags = (s.tags ?? []).map(t => String(t).toLowerCase());
      const forms = Array.isArray(s.attackForms) ? s.attackForms.map(f => String(f).toLowerCase()) : [];
      const weaponType = String(s.weaponType ?? "").toLowerCase();
      const damageType = String(s.damageType ?? "").toUpperCase();
      const attackType = String(s.attackType ?? "").toLowerCase();
      const isBlunt = damageType === "BA" || damageType === "TB" ||
        attackType === "blunt" || attackType === "throwing-blunt" ||
        tags.includes("blunt") || tags.includes("ba") || tags.includes("tb") ||
        forms.includes("blunt") || forms.includes("throwing-blunt");
      const isShooting = weaponType === "shooting" || weaponType === "firearm" ||
        damageType === "S" || attackType === "shooting";
      return isBlunt && !isShooting;
    });

    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    if (passedItem && passedItem.type === "equipment") {
      if (!thrownBlunt.find(i => i.id === passedItem.id)) {
        thrownBlunt = [passedItem, ...thrownBlunt];
      }
    }

    const strRank = actor?.system?.abilities?.strength?.rank || "Typical";
    const maxThrowRange = this._getThrowingRangeInAreas(strRank);

    // Detect combat talents
    const combatTalents = [];
    for (const item of actor.items) {
      if (item.type !== "talent") continue;
      const name = (item.name || "").toLowerCase();
      const rankOverride = item.system?.rankOverride || "";

      let ultimateCS = 0;
      if (rankOverride) {
        const baseIdx = RANKS.indexOf(ability.rank);
        const overIdx = RANKS.indexOf(rankOverride);
        if (baseIdx >= 0 && overIdx >= 0) ultimateCS = overIdx - baseIdx;
      }

      if (name.includes("thrown object") || name.includes("throwing")) {
        combatTalents.push({ name: "Thr.Obj", cs: 1, flag: null, note: "+1 CS", ultimateCS, rankOverride });
      }
      else if (name.includes("martial arts e") || name.includes("martial arts-e") ||
               (name.includes("martial arts") && name.includes("(e)"))) {
        combatTalents.push({ name: "MA-E", cs: 0, flag: "initiative", note: "+1 Initiative", ultimateCS, rankOverride });
      }
    }

    // --- INITIALIZATION & DEFAULTS ---
    const lsRememberKey = "msh.tb.remember";
    const lsSkipKey = "msh.tb.skipDice";
    const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

    const storedRemember = localStorage.getItem(lsRememberKey);
    const shouldRemember = storedRemember === "1";
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";

    const savedItemId = passedItemId || (shouldRemember ? (await actor.getFlag("msh-faserip", "lastThrowBluntItemId")) : "") || "";
    const savedAdHoc = passedItem ? false : (shouldRemember ? (await actor.getFlag("msh-faserip", "lastThrowBluntAdHoc") || (!thrownBlunt.length)) : (!thrownBlunt.length));
    const savedAdHocNm = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntAdHocName")) || "Rock") : "Rock";
    const savedAdHocDmg = shouldRemember ? (Number(await actor.getFlag("msh-faserip", "lastThrowBluntAdHocDamage") || 6)) : 6;
    const savedRange = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntRange")) || 1) : 1;
    const savedColumnShift = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntShift")) ?? 0) : 0;
    const savedActiveChips = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntActiveChips")) || {}) : {};
    const savedPullEnabled = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntPullEnabled")) || false) : false;
    const savedPulledDamage = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntPulledDamage")) || 0) : 0;
    const savedResultCap = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastThrowBluntResultCap")) || "none") : "none";

    // Build weapon options for carried select
    const weaponOptions = thrownBlunt.map(i => {
      const dmg = Number(i.system?.damage || 0);
      const sel = (i.id === savedItemId) ? 'selected' : '';
      return `<option value="${i.id}" ${sel}>${i.name} &mdash; ${dmg} dmg</option>`;
    }).join('');

    // Target info
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "physical-blunt") : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorRank = targetArmorInfo?.physicalRank || "";
    const targetArmorAbbr = targetArmorRank ? (RANK_ABBR[targetArmorRank] || targetArmorRank) : "";

    // Initial damage calc
    const isAdHocInit = savedAdHoc || !thrownBlunt.length;
    const initialWeapon = isAdHocInit ? null : thrownBlunt.find(i => i.id === savedItemId) || thrownBlunt[0];
    const initialDamage = isAdHocInit ? savedAdHocDmg : Number(initialWeapon?.system?.damage || 0);
    const initialAfterArmor = Math.max(0, initialDamage - targetArmor);

    // Karma info
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    // CS display
    const csInputCls = savedColumnShift > 0 ? ' pos' : savedColumnShift < 0 ? ' neg' : '';
    const csRankStyle = savedColumnShift > 0 ? 'color:#2e7d32;' : savedColumnShift < 0 ? 'color:#c62828;' : '';
    const abilityShort = RANK_ABBR[ability.rank] || ability.rank;

    // Build talent chips HTML
    const talentChipsHtml = combatTalents.map(t => {
      const savedState = savedActiveChips[t.name] || '';
      const flagActive = savedState.includes('flag');

      if (t.rankOverride && t.ultimateCS > 0) {
        const shortRank = RANK_ABBR[t.rankOverride] || t.rankOverride;
        const ultActive = savedState === 'ultimate';
        return `<span class="frp-talent-chip${ultActive ? ' active-ultimate' : ''}" data-cs="${t.ultimateCS}" data-talent="${t.name}" data-ultimate="1">
          ★ ${t.name} <span class="chip-cs">&rarr;${shortRank}</span>
        </span>`;
      }
      if (t.cs > 0) {
        const csActive = savedState === 'cs';
        return `<span class="frp-talent-chip${csActive ? ' active-cs' : ''}" data-cs="${t.cs}" data-talent="${t.name}">
          ${t.name} <span class="chip-cs">+${t.cs}</span>
        </span>`;
      }
      if (t.flag) {
        return `<span class="frp-talent-chip${flagActive ? ' active-flag' : ''}" data-flag="${t.flag}" data-talent="${t.name}">
          ${t.name} <span class="chip-note">${t.note}</span>
        </span>`;
      }
      return '';
    }).join('');

    // ── Dialog HTML — v3 Compact Layout ──
    const dialogHtml = `
    <div class="frp-dlg">

      <!-- Header: Actor (Base Agility / Rank Value) throws at Target -->
      <div class="frp-header-v3">
        <span class="h-actor">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Base Agility:</span>
          <span class="h-stat-rank">${abilityShort} ${ability.value}</span>
        </span>
        <span class="h-paren">)</span>
        ${targetDisplay
          ? `<span class="h-verb">attacks</span><span class="h-target">${targetDisplay}</span>`
          : ''}
      </div>

      <!-- CS box: chips + situational dropdown -->
      <div class="frp-box frp-cs-box">
        <div class="frp-cs-line">
          <span class="frp-cs-label">CS</span>
          <input type="number" class="frp-cs-input${csInputCls}" name="shift" value="${savedColumnShift}" id="cs-throwblunt">
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-cs-rank" id="rank-throwblunt" style="${csRankStyle}">${shiftRank(ability.rank, savedColumnShift)}</span>
          <button type="button" class="frp-cs-reset" style="visibility:${savedColumnShift !== 0 ? 'visible' : 'hidden'}">&times;</button>
          ${combatTalents.length > 0 ? '<span class="chip-sep"></span>' : ''}
          ${talentChipsHtml}
          <span class="chip-sep"></span>
          <select class="frp-sit-select" id="sit-select">
            <option value="">+ situational&hellip;</option>
            <optgroup label="Bonuses">
              <option value="2" data-label="Blindside" title="Target unaware or distracted">Blindside +2CS</option>
              <option value="1" data-label="Ambush" title="Pre-set position, triggers when target enters area">Ambush +1CS</option>
              <option value="1" data-label="Aiming" title="Spend 1 turn not attacking = +1CS next round">Aiming +1CS</option>
              <option value="1" data-label="Higher Ground" title="Elevated position, terrain advantage">Higher Ground +1CS</option>
            </optgroup>
            <optgroup label="Target Movement">
              <option value="0" data-label="Charging" title="Target charging at attacker (0 CS)">Charging at you 0CS</option>
              <option value="-1" data-label="Moving" title="Target moving &le;5 areas/round">Moving &le;5 areas -1CS</option>
              <option value="-2" data-label="Fast" title="Target moving &le;10 areas/round">Moving &le;10 areas -2CS</option>
              <option value="-4" data-label="Very Fast" title="Target moving &gt;10 areas/round">Moving &gt;10 areas -4CS</option>
            </optgroup>
            <optgroup label="Penalties">
              <option value="-2" data-label="Obstacle" title="Through window, curtain, etc.">Through Obstacle -2CS</option>
              <option value="-2" data-label="Shielding" title="Target using object as cover">Shielding -2CS</option>
              <option value="-2" data-label="Impaired" title="Lost Endurance ranks, -2CS all actions">Impaired -2CS</option>
            </optgroup>
            <optgroup label="Target Size">
              <option value="1" data-label="Growth +1" title="Target is 12-18ft tall">Growth 12-18ft +1CS</option>
              <option value="2" data-label="Growth +2" title="Target is 18-22ft tall">Growth 18-22ft +2CS</option>
              <option value="3" data-label="Growth +3" title="Target is over 22ft tall">Growth 22ft+ +3CS</option>
              <option value="-1" data-label="Shrink -1" title="Target shrunk to ~1 inch">Shrunk 1&Prime; -1CS</option>
              <option value="-2" data-label="Shrink -2" title="Target shrunk to ~&frac14; inch">Shrunk &frac14;&Prime; -2CS</option>
              <option value="-3" data-label="Shrink -3" title="Target smaller than &frac14; inch">Shrunk smaller -3CS</option>
            </optgroup>
          </select>
        </div>
        <div class="frp-sit-tags" id="sit-tags"></div>
      </div>

      <!-- Damage: Carried/Ad-hoc source toggle + weapon select + damage inline -->
      <div class="frp-box frp-dmg-box">
        <div style="display:flex;gap:8px;margin-bottom:3px;font-size:12px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:3px;">
            <input type="radio" name="src" value="carried" ${!isAdHocInit ? 'checked' : ''}> Carried
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:3px;">
            <input type="radio" name="src" value="adhoc" ${isAdHocInit ? 'checked' : ''}> Ad-hoc
          </label>
        </div>
        <div id="carried-row" style="display:${isAdHocInit ? 'none' : 'block'};">
          <div class="frp-dmg-inline">
            <select class="frp-select" name="weapon" id="damage-source-select" style="flex:1;font-size:12px;padding:2px 3px;border:1px solid #b8b8b8;border-radius:2px;background:#fff;">
              ${weaponOptions || '<option value="">(none in inventory)</option>'}
            </select>
            <span class="frp-dmg-num" id="dmg-val">${initialDamage}</span>
            <span class="frp-cs-arrow">&rarr;</span>
            <span class="frp-dmg-after" id="after-armor-display">${primaryTarget ? `${initialAfterArmor} after armor` : `${initialDamage} damage`}</span>
          </div>
        </div>
        <div id="adhoc-row" style="display:${isAdHocInit ? 'block' : 'none'};">
          <div class="frp-dmg-inline" style="margin-bottom:3px;">
            <span class="frp-dmg-num" id="dmg-val-adhoc">${savedAdHocDmg}</span>
            <span class="frp-cs-arrow">&rarr;</span>
            <span class="frp-dmg-after" id="after-armor-display-adhoc">${primaryTarget ? `${Math.max(0, savedAdHocDmg - targetArmor)} after armor` : `${savedAdHocDmg} damage`}</span>
          </div>
          <div style="display:grid;grid-template-columns:auto 1fr auto 50px;gap:3px 6px;align-items:center;font-size:12px;">
            <label>Name:</label>
            <input type="text" name="adhocName" value="${savedAdHocNm}" placeholder="Rock, Mug, Wrench..." style="padding:3px 4px;border:1px solid #b8b8b8;border-radius:2px;font-size:12px;">
            <label>Dmg:</label>
            <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="padding:3px 4px;border:1px solid #b8b8b8;border-radius:2px;font-size:12px;width:100%;">
          </div>
        </div>
      </div>

      <!-- Range info box (blue) — auto-filled from token distance -->
      <div class="frp-box" style="padding:3px 8px;background:#e3f2fd;border-color:#90caf9;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#1565c0;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Range</span>
          <input type="number" name="range" value="${savedRange}" min="0" readonly class="frp-pull-input" style="width:36px;">
          <span style="color:#777;">areas</span>
          <span style="color:#999;font-size:11px;">(max <span id="max-range-hint">${maxThrowRange}</span>)</span>
          <span id="range-penalty-display" style="margin-left:auto;font-family:'Oswald',sans-serif;font-weight:600;font-size:12px;color:#c62828;"></span>
        </div>
      </div>

      <!-- Options: Pull (with result cap) / Karma -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${!savedPullEnabled ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="pull-punch-enabled" ${savedPullEnabled ? 'checked' : ''}> <span class="frp-opt-label orange">Pull</span></label>
          <span style="font-size:11px;color:#777;">to</span>
          <input type="number" class="frp-pull-input" name="pulledDamage" value="${savedPullEnabled && savedPulledDamage > 0 ? savedPulledDamage : initialDamage}" min="0" max="${initialDamage}" ${!savedPullEnabled ? 'disabled' : ''}>
          <span style="font-size:11px;color:#777;">Cap:</span>
          <select style="font-size:11px;padding:1px 3px;border:1px solid #bbb;border-radius:2px;" name="resultCap" ${!savedPullEnabled ? 'disabled' : ''}>
            <option value="none" ${savedResultCap==='none'?'selected':''}>None</option>
            <option value="yellow" ${savedResultCap==='yellow'?'selected':''}>Hit</option>
            <option value="green" ${savedResultCap==='green'?'selected':''}>Miss</option>
          </select>
        </div>
        <div class="frp-opt-row${!hasKarma ? ' inactive' : hasKarma ? ' inactive' : ''}">
          ${hasKarma ? `
            <label><input type="checkbox" id="spend-karma" name="spendKarma"> <span class="frp-opt-label blue">Karma</span></label>
            <span class="frp-karma-pool"><strong>${availableKarma}</strong> avail (min ${minKarma})</span>
          ` : `<span style="font-size:12px;color:#999;">No karma available</span>`}
        </div>
      </div>

      <!-- Effect preview grid -->
      <div class="frp-fx-grid">
        <div class="frp-fx-cell w">Miss</div>
        <div class="frp-fx-cell g">Hit</div>
        <div class="frp-fx-cell y">Hit</div>
        <div class="frp-fx-cell r">Stun</div>
      </div>

      <!-- Footer -->
      <div class="frp-foot">
        <label><input type="checkbox" id="msh-remember-settings" name="remember" ${shouldRemember ? 'checked' : ''}> Remember</label>
        <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
      </div>
    </div>
    `;

    const choice = await new Promise(resolve => {
      new Dialog({
        title: actionName,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const $dlg = (sel) => html.find(sel);

              const rememberSettings = !!$dlg('#msh-remember-settings').is(':checked');
              const skipDice = !!$dlg('#msh-skip-dice').is(':checked');

              try {
                localStorage.setItem(lsRememberKey, rememberSettings ? "1" : "0");
                localStorage.setItem(lsSkipKey, skipDice ? "1" : "0");
              } catch (e) {}

              const useAdHoc = html.find('[name="src"]:checked').val() === 'adhoc';

              let weaponName, weaponDamage, weaponId = null;

              if (useAdHoc) {
                weaponName = String($dlg('[name="adhocName"]').val() || "Improvised Blunt");
                weaponDamage = Number($dlg('[name="adhocDamage"]').val() || 0);
                if (!Number.isFinite(weaponDamage) || weaponDamage < 0) {
                  ui.notifications.error("Enter a valid non-negative damage value for the ad-hoc weapon.");
                  return resolve(null);
                }
              } else {
                const wid = String($dlg('[name="weapon"]').val() || "");
                const weapon = thrownBlunt.find(i => i.id === wid);
                if (!weapon) {
                  ui.notifications.error("Select a carried thrown-blunt weapon or use ad-hoc.");
                  return resolve(null);
                }
                weaponId = wid;
                weaponName = weapon.name;
                weaponDamage = Number(weapon.system?.damage || 0);
              }

              const shift = Number($dlg('[name="shift"]').val() || 0);
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const range = Number($dlg('[name="range"]').val() || 1);

              // Range validation
              if (range > maxThrowRange) {
                ui.notifications.error(`Target is beyond throwing range (${maxThrowRange} areas).`);
                return resolve(null);
              }

              // Build csNotes from active situational tags + talent chips
              const sitParts = [];
              html.find('.frp-talent-chip.active-cs, .frp-talent-chip.active-ultimate').each(function() {
                const talent = $(this).data('talent') || '';
                const cs = parseInt($(this).data('cs')) || 0;
                if (talent && cs) sitParts.push(`${talent} ${cs > 0 ? '+' : ''}${cs}`);
              });
              html.find('.frp-sit-tag').each(function() {
                const label = $(this).data('label') || '';
                const cs = parseInt($(this).data('cs')) || 0;
                if (label) sitParts.push(`${label} ${cs > 0 ? '+' : ''}${cs}`);
              });
              const csNotes = sitParts.join(', ');

              // Collect active talent flags
              const talentFlags = {};
              html.find('.frp-talent-chip.active-flag').each(function() {
                const flag = $(this).data('flag');
                if (flag) talentFlags[flag] = true;
              });

              // Collect active chip states for persistence
              const activeChips = {};
              html.find('.frp-talent-chip.active-cs, .frp-talent-chip.active-ultimate').each(function() {
                const talent = $(this).data('talent');
                const isUlt = !!$(this).data('ultimate');
                if (talent) activeChips[talent] = isUlt ? 'ultimate' : 'cs';
              });
              html.find('.frp-talent-chip.active-flag').each(function() {
                const talent = $(this).data('talent');
                if (talent) activeChips[talent] = (activeChips[talent] || '') + ',flag';
              });

              const pullEnabled = !!$dlg('#pull-punch-enabled').is(':checked');
              const pulledDamage = pullEnabled ? parseInt($dlg('[name="pulledDamage"]').val() || 0) : 0;
              const resultCap = pullEnabled ? ($dlg('[name="resultCap"]').val() || "none") : "none";

              // Save settings — strip sit tags + range (NOT talent chips) so remembered CS = manual + talents
              let sitTagCS = 0;
              html.find('.frp-sit-tag').each(function() {
                sitTagCS += parseInt($(this).data('cs')) || 0;
              });
              const baseShift = shift - sitTagCS;
              if (rememberSettings) {
                await actor.setFlag("msh-faserip", "lastThrowBluntShift", baseShift);
                await actor.setFlag("msh-faserip", "lastThrowBluntAdHoc", useAdHoc);
                await actor.setFlag("msh-faserip", "lastThrowBluntAdHocName", weaponName);
                await actor.setFlag("msh-faserip", "lastThrowBluntAdHocDamage", weaponDamage);
                await actor.setFlag("msh-faserip", "lastThrowBluntItemId", weaponId || "");
                await actor.setFlag("msh-faserip", "lastThrowBluntRange", range);
                await actor.setFlag("msh-faserip", "lastThrowBluntActiveChips", activeChips);
                await actor.setFlag("msh-faserip", "lastThrowBluntPullEnabled", pullEnabled);
                await actor.setFlag("msh-faserip", "lastThrowBluntPulledDamage", pulledDamage);
                await actor.setFlag("msh-faserip", "lastThrowBluntResultCap", resultCap);
              }
              await actor.setFlag("msh-faserip", "csNotes", csNotes);

              resolve({
                weaponId, weaponName, weaponDamage,
                totalShift: shift, shift,
                karma: karmaToSpend, spendKarma, skipDice,
                shiftBreakdown: { manual: shift, csNotes },
                talentFlags,
                pulledDamage, resultCap
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: async (html) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');

          // Inject mode buttons into titlebar
          const $titlebar = $dialog.find('.window-title, .dialog-title').first();
          if ($titlebar.length) {
            const modeHtml = buildModeSelector({ mode: "semi" });
            const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
            $titlebar.after($modeWrap);
          }
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastThrowBluntMode");

          // Set dialog width
          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          // ── Main update function ──
          const update = () => {
            const isAdHoc = html.find('[name="src"]:checked').val() === 'adhoc';
            let dmg;

            if (isAdHoc) {
              dmg = Number(html.find('[name="adhocDamage"]').val()) || 0;
              const after = Math.max(0, dmg - targetArmor);
              html.find('#dmg-val-adhoc').text(dmg);
              html.find('#after-armor-display-adhoc').text(primaryTarget ? `${after} after armor` : `${dmg} damage`);
            } else {
              const wid = html.find('[name="weapon"]').val();
              const w = thrownBlunt.find(i => i.id === wid);
              dmg = Number(w?.system?.damage || 0);
              const after = Math.max(0, dmg - targetArmor);
              html.find('#dmg-val').text(dmg);
              html.find('#after-armor-display').text(primaryTarget ? `${after} after armor` : `${dmg} damage`);
            }

            // Update pull punch max
            const $pulledDmg = html.find('[name="pulledDamage"]');
            $pulledDmg.attr('max', dmg);
            if (Number($pulledDmg.val()) > dmg) $pulledDmg.val(dmg);

            // Range penalty — auto-sync sit tag (before CS display)
            // Uses autoRangeCs data-attr on CS input to track current auto-applied range penalty
            const rangeVal = Number(html.find('[name="range"]').val() || 0);
            const $rangePenalty = html.find('#range-penalty-display');
            const oldRangeTag = html.find('.frp-sit-tag[data-auto="range"]');
            const $csI = html.find('[name="shift"]');
            const prevAutoRangeCS = Number($csI.data('autoRangeCs') ?? 0) || 0;
            const hasNoRangePenalty = html.find('.frp-talent-chip.active-flag[data-flag="no-range-penalty"]').length > 0;
            const baseShift = (parseInt($csI.val()) || 0) - prevAutoRangeCS;

            let penalty = 0;
            if (rangeVal > maxThrowRange) {
              $rangePenalty.text('OUT OF RANGE').css('color', '#c62828');
            } else {
              penalty = hasNoRangePenalty ? 0 : (rangeVal > 1 ? -(rangeVal - 1) : 0);
              $rangePenalty.text(penalty < 0 ? `${penalty}CS` : '').css('color', '#e65100');
            }

            oldRangeTag.remove();
            if (penalty < 0) {
              const tag = $(`<span class="frp-sit-tag penalty" data-cs="${penalty}" data-label="Range ${rangeVal}" data-auto="range">
                Range ${rangeVal} <span class="tag-cs">${penalty}</span>
              </span>`);
              html.find('#sit-tags').append(tag);
            }

            const displayShift = baseShift + penalty;
            $csI.val(displayShift);
            $csI.data('autoRangeCs', penalty);

            // CS display (after range sync so shift value is current)
            const cs = displayShift;
            const $csInput = html.find('.frp-cs-input');
            const $rank = html.find('#rank-throwblunt');
            const $reset = html.find('.frp-cs-reset');
            $rank.text(shiftRank(ability.rank, cs));
            $csInput.removeClass('pos neg');
            if (cs > 0) {
              $csInput.addClass('pos');
              $rank.css('color', '#2e7d32');
              $reset.css('visibility', 'visible');
            } else if (cs < 0) {
              $csInput.addClass('neg');
              $rank.css('color', '#c62828');
              $reset.css('visibility', 'visible');
            } else {
              $rank.css('color', '');
              $reset.css('visibility', 'hidden');
            }

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };

          update();

          // ── Source toggle ──
          html.find('[name="src"]').on('change', function() {
            const isAdHoc = $(this).val() === 'adhoc';
            html.find('#carried-row').css('display', isAdHoc ? 'none' : 'block');
            html.find('#adhoc-row').css('display', isAdHoc ? 'block' : 'none');
            update();
          });

          // ── Event bindings ──
          html.find('#damage-source-select').on('change', update);
          html.find('[name="adhocDamage"]').on('input', update);
          html.find('[name="shift"]').on('input change', update);
          html.find('[name="range"]').on('input change', update);

          // ── Talent chip click handler ──
          html.find('.frp-talent-chip').on('click', function() {
            const $chip = $(this);
            const cs = parseInt($chip.data('cs')) || 0;
            const flag = $chip.data('flag') || null;
            const isUltimate = !!$chip.data('ultimate');
            const $csInput = html.find('[name="shift"]');

            if (cs > 0) {
              const wasActive = $chip.hasClass('active-cs') || $chip.hasClass('active-ultimate');
              const activeClass = isUltimate ? 'active-ultimate' : 'active-cs';

              if (wasActive) {
                $chip.removeClass('active-cs active-ultimate');
                $csInput.val(parseInt($csInput.val()) - cs);
              } else {
                $chip.addClass(activeClass);
                $csInput.val(parseInt($csInput.val()) + cs);
              }
              $csInput.trigger('change');
            } else if (flag) {
              $chip.toggleClass('active-flag');
            }
          });

          // CS reset — deactivates chips and removes situational tags
          html.find('.frp-cs-reset').on('click', function(e) {
            e.preventDefault();
            html.find('[name="shift"]').val(0);
            html.find('.frp-talent-chip.active-cs, .frp-talent-chip.active-ultimate').removeClass('active-cs active-ultimate');
            html.find('#sit-tags').empty();
            html.find('[name="shift"]').trigger('change');
          });

          // ── Situational modifier: apply on select change ──
          html.find('#sit-select').on('change', function() {
            const $sel = $(this);
            const opt = $sel.find('option:selected');
            const cs = parseInt(opt.val());
            const label = opt.data('label') || '';
            if (isNaN(cs) || !label) { $sel.val(''); return; }

            // Prevent duplicate
            let exists = false;
            html.find('.frp-sit-tag').each(function() {
              if ($(this).data('label') === label) exists = true;
            });
            if (exists) { $sel.val(''); return; }

            // 0CS tags (like Charging) are informational only
            if (cs === 0) {
              const tag = $(`<span class="frp-sit-tag" style="background:#e3f2fd;border:1px solid #90caf9;color:#1565c0;" data-cs="0" data-label="${label}">
                ${label} 0CS
                <span class="tag-x">&times;</span>
              </span>`);
              html.find('#sit-tags').append(tag);
              $sel.val('');
              return;
            }

            const sign = cs > 0 ? '+' : '';
            const cls = cs < 0 ? ' penalty' : '';
            const tag = $(`<span class="frp-sit-tag${cls}" data-cs="${cs}" data-label="${label}">
              ${label} <span class="tag-cs">${sign}${cs}</span>
              <span class="tag-x">&times;</span>
            </span>`);
            html.find('#sit-tags').append(tag);

            const $csInput = html.find('[name="shift"]');
            $csInput.val(parseInt($csInput.val()) + cs).trigger('change');
            $sel.val('');
          });

          // ── Situational modifier: remove tag ──
          html.find('#sit-tags').on('click', '.tag-x', function() {
            const $tag = $(this).closest('.frp-sit-tag');
            if ($tag.data('auto') === 'range') return;
            const cs = parseInt($tag.data('cs')) || 0;
            const $csInput = html.find('[name="shift"]');
            $csInput.val(parseInt($csInput.val()) - cs).trigger('change');
            $tag.remove();
          });

          // Pull punch toggle
          html.find('#pull-punch-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            const $pulledDamage = html.find('[name="pulledDamage"]');
            const $resultCap = html.find('[name="resultCap"]');
            $row.toggleClass('inactive', !this.checked);
            if (this.checked) {
              const currentMax = Number($pulledDamage.attr('max')) || initialDamage;
              $pulledDamage.val(currentMax).prop('disabled', false);
              $resultCap.prop('disabled', false);
            } else {
              $resultCap.val('none').prop('disabled', true);
              $pulledDamage.val($pulledDamage.attr('max')).prop('disabled', true);
            }
          });

          // Karma toggle
          html.find('#spend-karma').on('change', function() {
            $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
          });

          applyCapabilitiesToDialog(html, "throwing-blunt", { actor });

          // Attach auto-fill range from token distance
          this._disposeAutoFill = attachAutoFillRange(html, actor, () => update());

          html.find('#msh-skip-dice').on('change', function() {
            setLS(lsSkipKey, this.checked ? "1" : "0");
          });
          html.find('#msh-remember-settings').on('change', function() {
            setLS(lsRememberKey, this.checked ? "1" : "0");
          });
        },
        close: () => {
          if (this._disposeAutoFill) this._disposeAutoFill();
        }
      }).render(true);
    });

    if (!choice) return;

    // Reload mode from flags — respect global mode ceiling
    let globalMode = "semi";
    try { globalMode = game.settings.get("msh-faserip", "defaultCombatMode") || "semi"; } catch (_) {}
    const modeRank = { manual: 0, semi: 1, full: 2 };
    const globalRank = modeRank[globalMode] ?? 1;
    const savedMode = await actor.getFlag("msh-faserip", "lastThrowBluntMode") || "semi";
    const savedRank = modeRank[savedMode] ?? 1;
    this.opts.mode = savedRank <= globalRank ? savedMode : globalMode;
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

    // Delegate to shared resolution pipeline
    const weaponItem = choice.weaponId ? actor.items.get(choice.weaponId) : null;
    const rawDamage = choice.weaponId ? Number(weaponItem?.system?.damage || 0) : Number(choice.weaponDamage || 0);

    await this._executeSingleAttack({
      choice: { ...choice, weapon: weaponItem },
      actor, ability, actionType, actionName, effects,
      damageType: "physical-blunt",
      rawDamage,
      damageNote: choice.weaponName || "Thrown Blunt",
      sourceName: choice.weaponName || "Thrown Blunt",
      attackForm: "blunt"
    });
  }
}
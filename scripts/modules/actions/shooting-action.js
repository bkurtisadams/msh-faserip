// shooting-action.js v3.0.1 - 2026-03-16
// v3.0.1: Fix CS save/restore — strip sit tags + range (not talent chips) on save.
//         Range penalty uses autoRangeCs data-attr for clean base/penalty tracking.
//         Marksman no-range-penalty flag now suppresses range CS in dialog.
//         Auto range tag no longer removable via × close.
// v3.0.0: Port to v3 compact layout — header-v3, CS box with talent chips + situational dropdown,
//         inline damage row with weapon select, range info box, opts box (multi x2/x3 + karma)
//         with greyed inactive rows, FX grid, titlebar mode injection, 360px width.
//         Range/movement/obstacle modifiers now applied via situational tags feeding CS total.
// v2.0.0: Complete dialog redesign to match blunt-attack-action.js structure

import { RangedAttackAction } from "./ranged-attack-action.js";
import { 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import { 
  applyDamageToTargets,
  attachAutoFillRange,
  bannerColors,
  buildActionsBox,
  buildModeSelector,
  buildResultGrid,
  debugLog,
  effectsFor,
  getAbilityInfo,
  getBodyArmorValues,
  getTargetData,
  labelFor,
  RANKS,
  rollWithKarmaAndHistory,
  setupModeSelector,
  applyCapabilitiesToDialog,
  shiftRank,
  buildInlineFeatDisplay
} from "./action-utils.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { makeDamageBlock, computeAfterArmor, buildDamageFlags } from "./damage-ui.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { playCombatSFX } from "./audio-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";

export class ShootingAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "shooting";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName);

    // === Find shooting weapons ===
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;

    let shootingWeapons = actor.items.filter(i => {
      if (i.type !== "equipment") return false;
      const s = i.system || {};
      const tagHit = Array.isArray(s.tags) && (s.tags.includes("S") || s.tags.includes("shooting"));
      return (s.damageType === "S") || (s.attackType === "shooting") || tagHit;
    });

    if (passedItem && passedItem.type === "equipment") {
      if (!shootingWeapons.find(i => i.id === passedItem.id)) {
        shootingWeapons = [passedItem, ...shootingWeapons];
      }
    }

    if (!shootingWeapons.length) {
      if (this.opts?.deviceAbility) {
        const deviceItems = actor.items.filter(i => {
          if (i.type !== "equipment") return false;
          return i.system?.category === "device";
        });
        if (deviceItems.length) shootingWeapons = deviceItems;
      }
      if (!shootingWeapons.length) {
        ui.notifications.warn(`${actor.name} has no shooting weapons.`);
        return;
      }
    }

    // --- INITIALIZATION & DEFAULTS ---
    const lsRememberKey = "msh.shooting.remember";
    const lsSkipKey = "msh.shooting.skipDice";

    const storedRemember = localStorage.getItem(lsRememberKey);
    const shouldRemember = storedRemember === "1";

    const savedItemId = passedItemId || (shouldRemember ? (await actor.getFlag("msh-faserip", "lastShootingItemId")) : "") || "";
    const savedRange = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingRange")) || 1) : 1;
    const savedColumnShift = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingShift")) || 0) : 0;
    const savedMultiAttacks = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingMultiAttacks")) || false) : false;
    const savedAttackCount = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingAttackCount")) || 2) : 2;
    const savedVariantType = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingVariant")) || "") : "";
    const savedActiveChips = shouldRemember ? (await actor.getFlag("msh-faserip", "lastShootingActiveChips") || {}) : {};
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";

    // === Detect combat talents that affect Agility/shooting ===
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

      if (name.includes("weapons specialist") || name.includes("weapon specialist") ||
          name.includes("wpn specialist")) {
        // Weapons Specialist: +2CS with single weapon of choice, +1 initiative
        combatTalents.push({ name: "Wpn Spec", cs: 2, flag: "initiative", note: "+2CS +1 Init", ultimateCS, rankOverride });
      }
      else if (name.includes("marksman")) {
        // Marksman: +1CS any line-of-sight weapon, no range penalties
        combatTalents.push({ name: "Marksman", cs: 1, flag: "no-range-penalty", note: "+1CS no range pen", ultimateCS, rankOverride });
      }
      else if (/\bguns?\b/.test(name) || name === "guns" || name.includes("gun talent")) {
        // Guns: +1CS Agility firing handguns, rifles, SMGs
        combatTalents.push({ name: "Guns", cs: 1, flag: null, note: "+1 CS", ultimateCS, rankOverride });
      }
      else if (name.includes("bow") && !name.includes("elbow")) {
        // Bows: +1CS bows/crossbows, fire+reload in 1 round
        combatTalents.push({ name: "Bows", cs: 1, flag: null, note: "+1 CS", ultimateCS, rankOverride });
      }
      else if (name.includes("oriental weapon") || name.includes("oriental wpn")) {
        // Oriental Weapons: +1CS Fighting or Agility with shuriken, crossbows, oriental swords
        combatTalents.push({ name: "Oriental", cs: 1, flag: null, note: "+1 CS", ultimateCS, rankOverride });
      }
      else if (name.includes("law enforcement") || name.includes("law-enforcement")) {
        // Law Enforcement: includes Gun talent (+1CS)
        combatTalents.push({ name: "Law Enf", cs: 1, flag: null, note: "+1CS (Guns)", ultimateCS, rankOverride });
      }
      else if (name.includes("military") && !name.includes("martial")) {
        // Military: +1CS military weapons (GM discretion)
        combatTalents.push({ name: "Military", cs: 1, flag: null, note: "+1CS mil wpn", ultimateCS, rankOverride });
      }
      else if (name.includes("martial arts e") || name.includes("martial arts-e") ||
               (name.includes("martial arts") && name.includes("(e)"))) {
        combatTalents.push({ name: "MA-E", cs: 0, flag: "initiative", note: "+1 Initiative", ultimateCS, rankOverride });
      }
    }

    // === Target info ===
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();

    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "physical-ranged") : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorRank = targetArmorInfo?.physicalRank || "";
    const targetArmorAbbr = targetArmorRank ? (RANK_ABBR[targetArmorRank] || targetArmorRank) : "";

    // === Initial weapon info ===
    const initialWeapon = shootingWeapons.find(i => i.id === savedItemId) || shootingWeapons[0];
    const initialWeaponRange = initialWeapon?.system?.range || 15;
    const initialWeaponDamage = initialWeapon?.system?.damage || 0;

    // Variant/special ammo helpers
    const _buildVariantOptions = (weapon, currentVariant) => {
      const sa = weapon?.system?.specialAmmo || {};
      const saved = currentVariant || weapon?.system?.variantType || "standard";
      const opts = [{ v: "standard", label: "Standard" }];
      if (sa.ap)         opts.push({ v: "ap",        label: "Armor Piercing" });
      if (sa.mercy)      opts.push({ v: "mercy",     label: "Mercy/Non-Lethal" });
      if (sa.rubber)     opts.push({ v: "rubber",    label: "Blunted/Rubber" });
      if (sa.explosive)  opts.push({ v: "explosive", label: "Explosive" });
      if (sa.canister)   opts.push({ v: "canister",  label: "Canister Shot" });
      if (sa.heatSeeker) opts.push({ v: "heatSeeker", label: "Heat-Seeker" });
      if (sa.powerPack)  opts.push({ v: "powerPack", label: "Power Pack" });
      if (opts.length === 1) return "";
      return opts.map(o => `<option value="${o.v}" ${o.v === saved ? "selected" : ""}>${o.label}</option>`).join("");
    };
    const _getEffectiveAPForVariant = (weapon, variantType) => {
      if (variantType === "ap") return { ap: 0, apCS: 2, apMode: "cs", bypassFF: false };
      return {
        ap: Number(weapon?.system?.armorPiercing || 0) || 0,
        apCS: Number(weapon?.system?.armorPiercingCS || 0) || 0,
        apMode: weapon?.system?.apMode || "value",
        bypassFF: !!weapon?.system?.bypassForceField
      };
    };
    const _getEffectiveArmor = (base, ap, apCS, apMode) => {
      if (apMode === "cs" && apCS > 0 && base > 0) {
        const _RV = [0,1,3,5,8,16,26,36,46,63,88,150,250,500,1000,3000,5000,Infinity];
        let _i = _RV.findIndex(v => v >= base);
        if (_i < 0) _i = _RV.length - 1;
        if (_i > 0 && _RV[_i] > base) _i--;
        return _RV[Math.max(0, _i - apCS)];
      }
      return Math.max(0, base - ap);
    };

    const initialVariant = savedVariantType || initialWeapon?.system?.variantType || "standard";
    const initialVariantOptions = _buildVariantOptions(initialWeapon, initialVariant);
    const initialAPInfo = _getEffectiveAPForVariant(initialWeapon, initialVariant);
    const initialEffArmor = _getEffectiveArmor(targetArmor, initialAPInfo.ap, initialAPInfo.apCS, initialAPInfo.apMode);
    const initialAfterArmor = Math.max(0, initialWeaponDamage - initialEffArmor);
    const initialAPLabel = (initialAPInfo.apMode === "cs" && initialAPInfo.apCS > 0) ? `${initialAPInfo.apCS}CS` : (initialAPInfo.ap > 0 ? String(initialAPInfo.ap) : "");

    // === Karma ===
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    // === CS display ===
    const csInputCls = savedColumnShift > 0 ? ' pos' : savedColumnShift < 0 ? ' neg' : '';
    const csRankStyle = savedColumnShift > 0 ? 'color:#2e7d32;' : savedColumnShift < 0 ? 'color:#c62828;' : '';
    const abilityShort = RANK_ABBR[ability.rank] || ability.rank;

    // === Build talent chips HTML ===
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

    // === Build weapon damage source <select> ===
    const damageSrcOptions = shootingWeapons.map(i => {
      const dmg = Number(i.system?.damage || 0);
      const rng = Number(i.system?.range || 0);
      const ap = Number(i.system?.armorPiercing || 0) || 0;
      const apLabel = ap > 0 ? ` [AP ${ap}]` : "";
      const sel = (i.id === savedItemId || (!savedItemId && i.id === initialWeapon?.id)) ? 'selected' : '';
      return `<option value="${i.id}" ${sel}>${i.name} &mdash; ${dmg} dmg / ${rng} areas${apLabel}</option>`;
    }).join('');

    // === Dialog HTML — v3 Compact Layout ===
    const multiEnabled = savedMultiAttacks;
    const dialogHtml = `
    <div class="frp-dlg">

      <!-- Header: Actor (Base Agility / Rank Value) shoots Target -->
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
          <input type="number" class="frp-cs-input${csInputCls}" name="shift" value="${savedColumnShift}" id="cs-shooting">
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-cs-rank" id="rank-shooting" style="${csRankStyle}">${shiftRank(ability.rank, savedColumnShift)}</span>
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
              <option value="3" data-label="Point Blank" title="Adjacent, not engaged in Slugfest/Wrestling">Point Blank +3CS</option>
            </optgroup>
            <optgroup label="Target Movement">
              <option value="-1" data-label="Moving" title="Target moving &le;5 areas/round">Moving &le;5 areas -1CS</option>
              <option value="-2" data-label="Fast" title="Target moving &le;10 areas/round">Moving &le;10 areas -2CS</option>
              <option value="-4" data-label="Very Fast" title="Target moving &gt;10 areas/round">Moving &gt;10 areas -4CS</option>
            </optgroup>
            <optgroup label="Penalties">
              <option value="-2" data-label="Obstacle" title="Through window, curtain, etc.">Through Obstacle -2CS</option>
              <option value="-2" data-label="Shielding" title="Target using object as cover">Shielding -2CS</option>
              <option value="-2" data-label="Impaired" title="Lost Endurance ranks, -2CS all actions">Impaired -2CS</option>
              <option value="-2" data-label="One-handed" title="Two-handed weapon fired one-handed">One-handed -2CS</option>
              <option value="-1" data-label="No Bow Talent" title="Bow/crossbow without Bow talent">No Bow Talent -1CS</option>
              <option value="-3" data-label="Engaged" title="Adjacent and engaged in Slugfest/Wrestling">Engaged -3CS</option>
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

      <!-- Damage: weapon select + numbers inline -->
      <div class="frp-box frp-dmg-box">
        <div class="frp-dmg-inline">
          <select class="frp-select" name="weapon" id="damage-source-select">
            ${damageSrcOptions}
          </select>
          <span class="frp-dmg-num" id="dmg-val">${initialWeaponDamage}</span>
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-dmg-after" id="after-armor-display">${primaryTarget ? `${initialAfterArmor} after armor` : `${initialWeaponDamage} damage`}</span>
        </div>
        <!-- AP indicator -->
        <div id="ap-display" style="font-size:11px;color:#1565c0;margin-top:2px;${initialAPLabel ? '' : 'display:none;'}">
          AP: <strong id="ap-val">${initialAPLabel}</strong>
        </div>
        <!-- Variant ammo row (hidden if no variants) -->
        ${initialVariantOptions ? `
        <div class="object-row" id="variant-row" style="margin-top:3px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:12px;white-space:nowrap;">Ammo:</label>
            <select name="variantType" id="variant-select" style="flex:1;font-size:12px;padding:2px 3px;border:1px solid #b8b8b8;border-radius:2px;">${initialVariantOptions}</select>
          </div>
        </div>` : ""}
      </div>

      <!-- Range info box (blue) — auto-filled from token distance -->
      <div class="frp-box" style="padding:3px 8px;background:#e3f2fd;border-color:#90caf9;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#1565c0;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Range</span>
          <input type="number" name="range" value="${savedRange}" min="0" readonly class="frp-pull-input" style="width:36px;">
          <span style="color:#777;">areas</span>
          <span style="color:#999;font-size:11px;">(max <span id="max-range-hint">${initialWeaponRange}</span>)</span>
          <span id="range-penalty-display" style="margin-left:auto;font-family:'Oswald',sans-serif;font-weight:600;font-size:12px;color:#c62828;"></span>
        </div>
      </div>

      <!-- Options: Multi / Karma — shooting can x2/x3 but NOT adjacent -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${!multiEnabled ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="multi-enabled" ${multiEnabled ? 'checked' : ''}> <span class="frp-opt-label green">Multi</span></label>
          <label style="margin-left:8px;"><input type="radio" name="multiCount" value="2" ${(!savedMultiAttacks || savedAttackCount === 2) ? 'checked' : ''} ${!multiEnabled ? 'disabled' : ''}> &times;2</label>
          <label><input type="radio" name="multiCount" value="3" ${savedAttackCount === 3 ? 'checked' : ''} ${!multiEnabled ? 'disabled' : ''}> &times;3</label>
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
        <div class="frp-fx-cell w">${effects.white}</div>
        <div class="frp-fx-cell g">${effects.green}</div>
        <div class="frp-fx-cell y">${effects.yellow}</div>
        <div class="frp-fx-cell r">${effects.red}</div>
      </div>

      <!-- Footer -->
      <div class="frp-foot">
        <label><input type="checkbox" id="msh-remember-settings" name="remember" ${shouldRemember ? 'checked' : ''}> Remember</label>
        <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
      </div>
    </div>
    `;

    const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch (_e) {} };

    const choice = await new Promise((resolve) => {
      new Dialog({
        title: actionName,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const $dlg = (sel) => html.find(sel);

              const rememberSettings = $dlg("#msh-remember-settings").is(':checked');
              const skipDice = $dlg("#msh-skip-dice").is(':checked');

              try {
                localStorage.setItem(lsRememberKey, rememberSettings ? "1" : "0");
                localStorage.setItem(lsSkipKey, skipDice ? "1" : "0");
              } catch (e) {}

              const weaponId = String($dlg('[name="weapon"]').val() || "");
              const weapon = shootingWeapons.find(i => i.id === weaponId);

              if (!weapon) {
                ui.notifications.error("No weapon selected!");
                return resolve(null);
              }

              const shift = parseInt($dlg('[name="shift"]').val() || 0);
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
              const karma = karmaToSpend;
              const range = Number($dlg('[name="range"]').val() || 1);
              const variantType = $dlg('[name="variantType"]').val() || weapon.system?.variantType || "standard";

              const multiEnabled = $dlg('#multi-enabled').is(':checked');
              const multiCountVal = $dlg('[name="multiCount"]:checked').val() || "2";
              const multiAttacks = multiEnabled;
              const attackCount = (multiCountVal === "3") ? 3 : 2;

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

              // Weapon stats + AP
              const weaponRange = weapon.system?.range || 15;
              const weaponDamage = weapon.system?.damage || 0;
              const _apInfo = _getEffectiveAPForVariant(weapon, variantType);

              // Range validation
              if (range > weaponRange) {
                ui.notifications.error(`Target is beyond weapon range (${weaponRange} areas)!`);
                return resolve(null);
              }

              // Save settings — strip sit tags + range (NOT talent chips) so remembered CS = manual + talents
              let sitTagCS = 0;
              html.find('.frp-sit-tag').each(function() {
                sitTagCS += parseInt($(this).data('cs')) || 0;
              });
              const baseShift = shift - sitTagCS;
              if (rememberSettings) {
                await actor.setFlag("msh-faserip", "lastShootingItemId", weaponId);
                await actor.setFlag("msh-faserip", "lastShootingRange", range);
                await actor.setFlag("msh-faserip", "lastShootingShift", baseShift);
                await actor.setFlag("msh-faserip", "cs_shooting", baseShift);
                await actor.setFlag("msh-faserip", "lastShootingMultiAttacks", multiAttacks);
                await actor.setFlag("msh-faserip", "lastShootingAttackCount", attackCount);
                await actor.setFlag("msh-faserip", "lastShootingVariant", variantType);
                await actor.setFlag("msh-faserip", "lastShootingActiveChips", activeChips);
              }

              await actor.setFlag("msh-faserip", "csNotes", csNotes);

              resolve({
                weapon,
                weaponDamage,
                weaponRange,
                shift,
                karma,
                spendKarma,
                range,
                skipDice,
                totalShift: shift,
                multiAttacks,
                attackCount,
                csNotes,
                talentFlags,
                armorPiercing: _apInfo.ap,
                armorPiercingCS: _apInfo.apCS,
                apMode: _apInfo.apMode,
                bypassForceField: _apInfo.bypassFF,
                shiftBreakdown: {
                  manual: shift,
                  multiAttack: 0,
                  csNotes
                }
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: async (html) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');

          // Inject mode buttons into the titlebar
          const $titlebar = $dialog.find('.window-title, .dialog-title').first();
          if ($titlebar.length) {
            const modeHtml = buildModeSelector({ mode: "semi" });
            const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
            $titlebar.after($modeWrap);
          }
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastShootingMode");

          // Set dialog width
          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

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

          // ── Main update function ──
          const update = () => {
            const weaponId = html.find('#damage-source-select').val() || "";
            const weapon = shootingWeapons.find(i => i.id === weaponId);
            const $val = html.find('#dmg-val');
            const $afterArmor = html.find('#after-armor-display');
            const $apDisplay = html.find('#ap-display');
            const $apVal = html.find('#ap-val');

            const currentDamage = weapon?.system?.damage || 0;
            const currentRange = weapon?.system?.range || 15;
            const variantType = html.find('[name="variantType"]').val() || "standard";
            const apInfo = _getEffectiveAPForVariant(weapon, variantType);

            $val.text(currentDamage);

            // Update max range hint
            html.find('#max-range-hint').text(currentRange);

            // AP display
            const apLabel = (apInfo.apMode === "cs" && apInfo.apCS > 0) ? `${apInfo.apCS}CS` : (apInfo.ap > 0 ? String(apInfo.ap) : "");
            if (apLabel) {
              $apDisplay.show();
              $apVal.text(apLabel);
            } else {
              $apDisplay.hide();
            }

            // After-armor display
            const effArmor = _getEffectiveArmor(targetArmor, apInfo.ap, apInfo.apCS, apInfo.apMode);
            const afterArmorDmg = Math.max(0, currentDamage - effArmor);
            if (primaryTarget) {
              $afterArmor.text(`${afterArmorDmg} after armor`);
            } else {
              $afterArmor.text(`${currentDamage} damage`);
            }

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
            if (rangeVal > currentRange) {
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

            // CS display update (after range sync so shift value is current)
            const cs = displayShift;
            const shiftedRankText = shiftRank(ability.rank, cs);
            const $shiftedRank = html.find('#rank-shooting');
            const $csInput = html.find('.frp-cs-input');
            $shiftedRank.text(shiftedRankText);

            const $resetBtn = html.find('.frp-cs-reset');
            $csInput.removeClass('pos neg');
            if (cs > 0) {
              $csInput.addClass('pos');
              $shiftedRank.css('color', '#2e7d32');
              $resetBtn.css('visibility', 'visible');
            } else if (cs < 0) {
              $csInput.addClass('neg');
              $shiftedRank.css('color', '#c62828');
              $resetBtn.css('visibility', 'visible');
            } else {
              $shiftedRank.css('color', '');
              $resetBtn.css('visibility', 'hidden');
            }

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };

          update();

          // ── Event bindings ──
          html.find('#damage-source-select').on('change', () => {
            // Rebuild variant selector for new weapon
            const wId = html.find('#damage-source-select').val();
            const w = shootingWeapons.find(i => i.id === wId);
            const newVariantOpts = _buildVariantOptions(w, "");
            const $variantRow = html.find('#variant-row');
            if (newVariantOpts) {
              if (html.find('#variant-select').length) {
                html.find('#variant-select').html(newVariantOpts);
              } else if ($variantRow.length === 0) {
                html.find('.frp-dmg-box').append(`<div class="object-row" id="variant-row" style="margin-top:3px;"><div style="display:flex;align-items:center;gap:6px;"><label style="font-size:12px;white-space:nowrap;">Ammo:</label><select name="variantType" id="variant-select" style="flex:1;font-size:12px;padding:2px 3px;border:1px solid #b8b8b8;border-radius:2px;">${newVariantOpts}</select></div></div>`);
                html.find('#variant-select').on('change', update);
              }
            } else {
              html.find('#variant-row').remove();
            }
            update();
          });
          html.find('[name="shift"]').on('input change', update);
          html.find('[name="range"]').on('input change', update);
          html.on('change', '[name="variantType"]', update);

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
            if (!cs || !label) return;

            // Prevent duplicate
            let exists = false;
            html.find('.frp-sit-tag').each(function() {
              if ($(this).data('label') === label) exists = true;
            });
            if (exists) { $sel.val(''); return; }

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

          // Multi-attack toggle — inactive styling + disable radios
          html.find('#multi-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            $row.toggleClass('inactive', !this.checked);
            $row.find('[name="multiCount"]').prop('disabled', !this.checked);
          });

          // Karma toggle — inactive styling
          html.find('#spend-karma').on('change', function() {
            $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
          });

          applyCapabilitiesToDialog(html, "shooting", { actor });

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
    const savedMode = await actor.getFlag("msh-faserip", "lastShootingMode") || "semi";
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

    // Track shift breakdown
    const shiftBreakdown = choice.shiftBreakdown || {
      manual: choice.shift || 0,
      multiAttack: 0,
      csNotes: choice.csNotes || ""
    };

    // Handle multi-attacks
    let actualAttackCount = 1;
    let multiAttackFeatResult = null;

    if (choice.multiAttacks) {
      const fightingAbility = getAbilityInfo(actor, "fighting");
      const intensity = choice.attackCount === 2 ? "Remarkable" : "Amazing";

      const effectiveFightingRank = shiftRank(fightingAbility.rank, choice.shift || 0);

      const featResult = await this._rollFightingFeat(
        actor,
        { ...fightingAbility, rank: effectiveFightingRank },
        intensity,
        choice.attackCount
      );
      if (featResult.cancelled) return;

      multiAttackFeatResult = { ...featResult, intensity, attackCount: choice.attackCount };

      let useConsolidated = false;
      try {
        useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
      } catch (_e) {}

      if (!useConsolidated) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div style="background:#eef6ff;border:1px solid #90caf9;border-radius:3px;padding:6px;margin:4px 0;">
            <b>Multi-Attack FEAT:</b> ${intensity} — ${
              featResult?.success ? "SUCCESS" : "FAIL"
            } ${featResult?.auto ? "(Automatic)" : ""}</div>`
        });
      }

      const featSuccess = !!(featResult?.auto || featResult?.resultColor === "AUTO" || featResult?.success);
      const featImpossible = !!(featResult?.resultColor === "IMPOSSIBLE");

      if (featSuccess && !featImpossible) {
        actualAttackCount = choice.attackCount;
        shiftBreakdown.multiAttack = -1;
        choice.totalShift = (choice.totalShift || 0) - 1;
        ui.notifications.info(`Multi-attack successful! Making ${actualAttackCount} attacks at -1CS each!`);
      } else {
        actualAttackCount = 1;
        shiftBreakdown.multiAttack = -3;
        choice.totalShift = (choice.totalShift || 0) - 3;
        ui.notifications.warn(`Multi-attack FEAT failed! Only making 1 attack at -3CS.`);
      }
    }

    choice.shiftBreakdown = shiftBreakdown;

    // Execute attack(s)
    for (let i = 1; i <= actualAttackCount; i++) {
      if (i > 1) await new Promise(resolve => setTimeout(resolve, 500));

      const actionLabel = actualAttackCount > 1 ? `${actionName} (${i}/${actualAttackCount})` : actionName;
      const targetForThisAttack = actualAttackCount === 1 ? targets[0] : targets[(i-1) % targets.length];

      await this._executeSingleAttack({
        choice: { ...choice, specificTarget: targetForThisAttack, multiAttackFeatResult: i === 1 ? multiAttackFeatResult : null },
        actor: this.actor,
        ability,
        actionType,
        actionName: actionLabel,
        effects,
        damageType: choice.weapon?.system?.damageType || "physical-ranged",
        rawDamage: choice.weaponDamage || 0,
        damageNote: "",
        sourceName: choice.weapon?.name || "Weapon",
        attackForm: "shooting",
        breakingFeat: null,
        targetCount: 1,
        attackNumber: i,
        totalAttacks: actualAttackCount
      });
    }

    // Multi-attack completion message
    if (actualAttackCount > 1) {
      let useConsolidated = false;
      try {
        useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
      } catch (_e) {}

      if (!useConsolidated) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div style="background:#e8f5e9;border:1px solid #4caf50;border-radius:3px;padding:8px;margin:5px 0;">
            <div style="color:#2e7d32;font-weight:bold;margin-bottom:5px;">Multiple Attack Sequence Complete</div>
            <div style="font-size:0.9em;">${actor.name} completed ${actualAttackCount} attacks.</div>
          </div>`
        });
      }
    }
  }
}
// scripts/modules/actions/force-action.js v3.4.0 - 2026-09-05
// v3.4.0: Automatic situational modifiers prefill the CS row (cs-modifiers v3.6.0).
// scripts/modules/actions/force-action.js v3.3.4 - 2026-07-09
// v3.3.4: Use derivePowerDamage() for the initial source damage display too,
//         including equipment force weapons routed through the Force dialog.
// scripts/modules/actions/force-action.js v3.3.3 - 2026-07-04
// v3.3.3: Honor system.damageSource when deriving force-power damage (was
//         reading s.damage first via ??, so a rank-sourced power with a
//         0/blank fixed-damage field dealt 0 — e.g. a fresh Air Control from
//         the rebuilt pack). Uses the shared action-utils derivePowerDamage()
//         at all 3 sites (dropdown label, attack derivation, #dmg-val preview).
// scripts/modules/actions/force-action.js v3.3.2 - 2026-05-23
// v3.3.2: Range penalty itemized as "Range" in the to-hit breakdown
//         (was baked into csNotes); manual CS no longer hidden by it.
// v3.3.1: CS Reason now reaches the card (was discarded — only the range
//         note was kept) and persists across reopens (lastForceReason,
//         gated by Remember), matching the other attack dialogs.
// scripts/modules/actions/force-action.js v3.3.0 - 2026-05-16
// v3.3.0: Aim tactic — Bullseye-effect reinterpretation per RAW Tactics.
//         New Aim row in options box: Neutralize only. On Force the red
//         result is already Stun (not Kill), so the "Kill→Bullseye"
//         downgrade does NOT apply — a Force red stays Stun. Neutralize
//         simply adds the disarm chat note on a yellow Bullseye. Stun aim
//         omitted since Force red is already Stun per table. Persisted via
//         lastForceAim actor flag; resolution logic in attack-action.js v1.9.24.
// v3.2.0: Custom Roll/Cancel buttons (Roll first, then Cancel).
//         Footer reordered: [Roll] [Cancel] ... [Remember] [Skip dice].
//         Hide Foundry native button row, use _resolved guard on close.
// v3.1.0: Manual CS only — remove talent/power auto-detection, chips, sit-tags.
//         CS row is manual input + range penalty + ? reference panel via cs-modifiers.js.
//         PwrHit toggle moved to checkbox, uses setAbilityRank().
// v3.0.3: Live range penalty display + auto sit tag (matches shooting pattern)
// v3.0.0: Port to v3 compact dialog layout matching blunt/edged/shooting/energy
// v2.0.0: Refactor - dialog only, delegates resolution to _executeSingleAttack
// v1.6.0: Refactor chat card to use unified card builder utilities
// v1.5.0: Add support for equipment items with Force (F) damage type
import { RangedAttackAction } from "./ranged-attack-action.js";
import { 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";

import { 
  attachAutoFillRange,
  buildModeSelector,
  effectsFor,
  getAbilityInfo,
  getBodyArmorValues,
  getTargetData,
  labelFor,
  RANKS,
  setupModeSelector,
  applyCapabilitiesToDialog,
  shiftRank,
  derivePowerDamage
} from "./action-utils.js";

import { RANK_ABBR, POWER_RANGE } from "../../rules/rules-reference.js";
import { buildCSRow, wireCSPanel, detectAutoSituational, resolveAttackerToken } from "./cs-modifiers.js";

import { showFaseripDialog } from "./dialog-shim.js";
export class ForceAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "force";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName || "agility");

    // === Candidate powers ===
    let forceItems = actor.items.filter((i) => {
      if (i.type !== "power") return false;
      const s = i.system || {};
      const cat = String(s.category || "").toLowerCase();
      const typ = String(s.type || "").toLowerCase();
      const nam = String(i.name || "").toLowerCase();

      if (s.isForceAttack === true) return true;
      if (s.isEnergyAttack || s.isBluntAttack || s.isEdgedAttack || s.isShootingAttack || s.isMentalAttack) return false;

      const looksEnergy = /\b(energy|light|electric|plasma|beam|fire|ice|cold|darkforce|radiation|heat|lightning)\b/.test(typ) ||
                          /\b(energy|light|electric|plasma|beam|fire|ice|cold|darkforce|radiation|heat|lightning)\b/.test(nam);
      if (looksEnergy) return false;

      const catLooksForce = cat === "mattercontrol" ||
        /\b(force|telekinesis|kinetic|concussion|shockwave)\b/.test(cat);
      const typeLooksForce =
        /\b(force|telekinesis|kinetic|pressure|concussion|shockwave|ram|air|wind|earth|water|magnetic|gravity|sound|sonic)\b/.test(typ) ||
        /\b(force|telekinesis|kinetic|pressure|concussion|shockwave|ram|air|wind|earth|water|magnetic|gravity|sound|sonic)\b/.test(nam);

      return catLooksForce || typeLooksForce;
    });

    const forceEquipment = actor.items.filter((i) => {
      if (i.type !== "equipment") return false;
      const s = i.system || {};
      const damageType = String(s.damageType || "").toUpperCase();
      return damageType === "F" && s.category === "weapon";
    });
    forceItems = [...forceItems, ...forceEquipment];

    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;
    if (passedItem && (passedItem.type === "power" || passedItem.type === "equipment")) {
      if (!forceItems.find(i => i.id === passedItem.id)) {
        forceItems = [passedItem, ...forceItems];
      }
    }

    // === Restore prefs ===
    const lsRememberKey = "msh.force.remember";
    const lsSkipKey = "msh.force.skipDice";
    const storedRemember = localStorage.getItem(lsRememberKey);
    const shouldRemember = storedRemember === "1";

    const savedItemId = passedItemId || (shouldRemember ? (await actor.getFlag("msh-faserip", "lastForceItemId") || "") : "");
    const savedRange = shouldRemember ? (await actor.getFlag("msh-faserip", "lastForceRange") || 1) : 1;

    let savedAdHoc = passedItem ? false : (shouldRemember ? (await actor.getFlag("msh-faserip", "lastForceAdHoc") || (!forceItems.length)) : (!forceItems.length));
    let savedAdHocName = shouldRemember ? (await actor.getFlag("msh-faserip", "lastForceAdHocName") || "Force Blast") : "Force Blast";
    let savedAdHocDmg = Number(shouldRemember ? (await actor.getFlag("msh-faserip", "lastForceAdHocDamage") || 15) : 15);
    let savedAdHocRank = shouldRemember ? (await actor.getFlag("msh-faserip", "lastForceAdHocRank") || "Remarkable") : "Remarkable";

    const deviceAbility = this.opts?.deviceAbility;
    if (deviceAbility) {
      savedAdHoc = true;
      savedAdHocName = `${deviceAbility.name}${passedItem ? ` (${passedItem.name})` : ""}`;
      savedAdHocRank = deviceAbility.rank || "Remarkable";
      savedAdHocDmg = CONFIG.FASERIP?.rankValues?.[deviceAbility.rank] || 15;
    }

    const savedUsePowerToHit = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastForceUsePowerToHit")) === true) : false;
    const savedColumnShift = shouldRemember ? (await actor.getFlag("msh-faserip", "lastForceShift") ?? 0) : 0;
    const savedMultiAdjacent = shouldRemember ? (await actor.getFlag("msh-faserip", "lastForceMultiAdjacent") || false) : false;
    const savedPullEnabled = shouldRemember ? (await actor.getFlag("msh-faserip", "lastForcePullEnabled") || false) : false;
    const savedPulledDamage = shouldRemember ? (await actor.getFlag("msh-faserip", "lastForcePulledDamage") || 0) : 0;
    const savedAim = shouldRemember ? (await actor.getFlag("msh-faserip", "lastForceAim") || "none") : "none";
    const savedReason = shouldRemember ? (await actor.getFlag("msh-faserip", "lastForceReason") || "") : "";
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";

    // === Target Info ===
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "physical-force") : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorRank = targetArmorInfo?.physicalRank || "";
    const targetArmorAbbr = targetArmorRank ? (RANK_ABBR[targetArmorRank] || targetArmorRank) : "";
    const targetArmorSource = targetArmorInfo?.source ?? "";
    const armorNote = targets.length > 1 ? " (1st)" : "";

    const targetHealth = primaryTargetActor?.system?.health;
    const targetHealthStr = targetHealth ? `${targetHealth.value}/${targetHealth.max}` : "";
    const targetEffects = (primaryTargetActor?.effects?.filter(e => !e.disabled) ?? [])
      .filter(e => {
        const n = (e.name || e.label || '').toLowerCase();
        return !n.includes('body armor') && !n.includes('force field');
      });
    const targetStatusStr = targetEffects.length > 0
      ? targetEffects.map(e => e.name || e.label).join(", ") : "";

    const armorDisplay = targetArmor > 0
      ? `BA: ${targetArmorAbbr}(${targetArmor})${armorNote}`
      : "";

    const initialPower = forceItems.find(i => i.id === savedItemId) || forceItems[0];
    const initialPowerRank = savedAdHoc ? savedAdHocRank : (initialPower?.system?.rank ?? initialPower?.system?.powerRank ?? "Remarkable");
    const initialDamage = savedAdHoc ? savedAdHocDmg : derivePowerDamage(initialPower?.system || {}, actor);
    const initialAfterArmor = Math.max(0, initialDamage - targetArmor);
    const initialDisplayRank = savedUsePowerToHit ? initialPowerRank : ability.rank;

    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    const abilityShort = RANK_ABBR[ability.rank] || ability.rank;

    // Build CS row via shared utility (manual input + range + ? reference)
    const initialRangePenalty = (() => {
      const maxRange = this._getPowerRangeInAreas(initialPowerRank);
      return (savedRange > maxRange && maxRange > 0) ? -(savedRange - maxRange) : 0;
    })();
    const autoMods = detectAutoSituational({ attacker: resolveAttackerToken(actor), target: primaryTarget, context: "ranged" });
    const csRowHtml = buildCSRow({
      savedCS: savedColumnShift,
      savedReason,
      abilityRank: initialDisplayRank,
      rangePenalty: initialRangePenalty,
      showRange: true,
      autoMods
    });

    // Build power source <select> options
    const powerSrcOptions = [];
    for (const item of forceItems) {
      const s = item.system || {};
      const dmg = derivePowerDamage(s, actor);
      const rank = s.rank ?? s.powerRank ?? "Remarkable";
      const rankAbbr = RANK_ABBR[rank] || rank;
      const sel = (!savedAdHoc && item.id === savedItemId) ? 'selected'
        : (!savedAdHoc && !savedItemId && item === forceItems[0]) ? 'selected' : '';
      powerSrcOptions.push(`<option value="power:${item.id}" ${sel}>${item.name} &mdash; ${rankAbbr} (${dmg})</option>`);
    }
    powerSrcOptions.push(`<option value="adhoc" ${savedAdHoc ? 'selected' : ''}>Ad-hoc&hellip;</option>`);

    // ── Dialog HTML — v3.1 Compact Layout ──
    const dialogHtml = `
    <div class="frp-dlg">

      <!-- Header -->
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor.name}">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Base ${ability.name}:</span>
          <span class="h-stat-rank">${abilityShort} ${ability.value}</span>
        </span>
        <span class="h-paren">)</span>
        ${targetDisplay
          ? `<span class="h-verb">attacks</span><span class="h-target" title="${targetDisplay}">${targetDisplay}</span>`
          : ''}
      </div>

      ${targetDisplay ? `
      <div class="frp-target-compact">
        ${targetHealthStr ? `<span class="t-hp">HP ${targetHealthStr}</span>` : ''}
        ${armorDisplay ? `<span class="t-armor">${armorDisplay}</span>` : '<span class="t-armor" style="color:#999;">No armor</span>'}
        ${targetStatusStr ? `<span class="t-status">${targetStatusStr}</span>` : ''}
      </div>` : ''}

      <!-- CS row (manual input + range + ? reference) -->
      ${csRowHtml}

      <!-- PwrHit toggle: use power rank instead of ability rank for to-hit -->
      <div style="padding:0 10px 2px;font-size:11px;">
        <label style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
          <input type="checkbox" id="pwr-hit-toggle" ${savedUsePowerToHit ? 'checked' : ''}>
          <span style="font-weight:600;color:#7b6b00;">PwrHit</span>
          <span style="color:#999;">use power rank to hit</span>
        </label>
      </div>

      <!-- Damage: power select + numbers inline -->
      <div class="frp-box frp-dmg-box">
        <div class="frp-dmg-inline">
          <select class="frp-select" name="powerSource" id="power-source-select">
            ${powerSrcOptions.join('')}
          </select>
          <span class="frp-dmg-num" id="dmg-val">${initialDamage}</span>
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-dmg-after" id="after-armor-display">${primaryTarget ? `${initialAfterArmor} after armor` : `${initialDamage} damage`}</span>
        </div>
        <div class="object-row" id="adhoc-row" style="display:${savedAdHoc ? 'block' : 'none'}">
          <div class="obj-grid">
            <label>Name:</label>
            <input type="text" name="adhocName" value="${savedAdHocName}" placeholder="Force Blast">
            <label>Rank:</label>
            <div class="obj-mat-row">
              <input type="text" name="adhocRank" value="${savedAdHocRank}" placeholder="Remarkable" style="flex:1;">
              <input type="number" name="adhocDamage" value="${savedAdHocDmg}" min="0" style="width:50px;">
            </div>
          </div>
        </div>
        <div style="font-size:10px;color:#999;margin-top:2px;">Force: Stun effect &bull; BA full vs physical</div>
      </div>

      <!-- Range box (blue) -->
      <div class="frp-box" style="padding:3px 8px;background:#e3f2fd;border-color:#90caf9;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#1565c0;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Range</span>
          <input type="number" name="range" value="${savedRange}" min="0" class="frp-pull-input" style="width:36px;">
          <span style="color:#777;">areas</span>
          <span style="color:#999;font-size:11px;">(max <span id="max-range-hint">${this._getPowerRangeInAreas(initialPowerRank)}</span>)</span>
          <span id="range-penalty-display" style="margin-left:auto;font-family:'Oswald',sans-serif;font-weight:600;font-size:12px;color:#c62828;"></span>
        </div>
      </div>

      <!-- Options: Reduce / Multi / Aim / Karma -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${!savedPullEnabled ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="pull-punch-enabled" ${savedPullEnabled ? 'checked' : ''}> <span class="frp-opt-label orange">Reduce</span></label>
          <span style="font-size:11px;color:#777;">to</span>
          <input type="number" class="frp-pull-input" name="pulledDamage" value="${savedPullEnabled && savedPulledDamage > 0 ? savedPulledDamage : initialDamage}" min="0" max="${initialDamage}" ${!savedPullEnabled ? 'disabled' : ''}>
          <span style="font-size:10px;color:#888;margin-left:auto;">Effect &ne; reduced</span>
        </div>
        <div class="frp-opt-row${!savedMultiAdjacent ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="multi-enabled" ${savedMultiAdjacent ? 'checked' : ''}> <span class="frp-opt-label green">Multi</span></label>
          <span style="font-size:11px;color:#777;margin-left:8px;">Adjacent targets (-4CS)</span>
        </div>
        <div class="frp-opt-row${savedAim === 'none' ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="aim-enabled" ${savedAim !== 'none' ? 'checked' : ''}> <span class="frp-opt-label red">Aim</span></label>
          <select name="aimMode" ${savedAim === 'none' ? 'disabled' : ''} style="font-size:11px;padding:1px 3px;border:1px solid #bbb;border-radius:2px;margin-left:6px;">
            <option value="neutralize" ${savedAim !== 'none' ? 'selected' : ''}>Neutralize (disarm)</option>
          </select>
          <span style="font-size:10px;color:#888;margin-left:auto;">Bullseye effect</span>
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
        <div class="frp-foot-btns">
          <button type="button" class="frp-btn-roll" id="frp-roll">Roll</button>
          <button type="button" class="frp-btn-cancel" id="frp-cancel">Cancel</button>
        </div>
        <div class="frp-foot-checks">
          <label><input type="checkbox" id="msh-remember-settings" name="remember" ${shouldRemember ? 'checked' : ''}> Remember</label>
          <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>
    </div>
    `;

    const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

    const choice = await new Promise((resolve) => {
      let _csState = null;
      let _resolved = false;
      showFaseripDialog({
        title: actionName,
        content: dialogHtml,
        render: async (html, dlg) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');

          // Hide Foundry's native button row
          $dialog.find('.dialog-buttons').hide();

          // Inject mode buttons into titlebar
          const $titlebar = $dialog.find('.window-title, .dialog-title').first();
          if ($titlebar.length) {
            const modeHtml = buildModeSelector({ mode: "semi" });
            const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
            $titlebar.after($modeWrap);
          }
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastForceMode");

          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          // ── Wire CS panel from shared utility ──
          const _getCurrentRangePenalty = () => {
            const srcVal = html.find('#power-source-select').val() || "adhoc";
            const isAdHoc = srcVal === "adhoc";
            let currentRank = "Remarkable";
            if (isAdHoc) {
              currentRank = String(html.find('[name="adhocRank"]').val() || "Remarkable");
            } else {
              const itemId = srcVal.replace("power:", "");
              const item = forceItems.find(i => i.id === itemId);
              if (item) currentRank = String(item.system?.rank ?? item.system?.powerRank ?? "Remarkable");
            }
            const maxRange = this._getPowerRangeInAreas(currentRank);
            const rangeVal = Number(html.find('[name="range"]').val() || 0);
            if (rangeVal > maxRange && maxRange > 0) return -(rangeVal - maxRange);
            return 0;
          };
          _csState = wireCSPanel(html, {
            abilityRank: initialDisplayRank,
            getRangePenalty: _getCurrentRangePenalty,
            onUpdate: () => {
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          // ── PwrHit toggle — switch base ability rank ──
          html.find('#pwr-hit-toggle').on('change', function() {
            const srcVal = html.find('#power-source-select').val() || "adhoc";
            const isAdHoc = srcVal === "adhoc";
            let currentRank = "Remarkable";
            if (isAdHoc) {
              currentRank = String(html.find('[name="adhocRank"]').val() || "Remarkable");
            } else {
              const itemId = srcVal.replace("power:", "");
              const item = forceItems.find(i => i.id === itemId);
              if (item) currentRank = String(item.system?.rank ?? item.system?.powerRank ?? "Remarkable");
            }
            _csState.setAbilityRank(this.checked ? currentRank : ability.rank);
          });

          // Auto-focus Roll button for keyboard Enter and focus ring
          html.find('#frp-roll').focus();

          // Intercept Enter key — trigger Roll instead of Foundry's native submit
          $dialog.on('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              html.find('#frp-roll').trigger('click');
            }
          });

          // ── Roll button handler ──
          html.find('#frp-roll').on('click', async () => {
            const $dlg = (sel) => html.find(sel);

            const rememberSettings = $dlg("#msh-remember-settings").is(':checked');
            const skipDice = $dlg("#msh-skip-dice").is(':checked');
            setLS(lsRememberKey, rememberSettings ? "1" : "0");
            setLS(lsSkipKey, skipDice ? "1" : "0");

            // Parse power source select
            const srcVal = $dlg('#power-source-select').val() || "adhoc";
            const useAdHoc = srcVal === "adhoc";

            let powerName = "", powerDamage = 0, powerRank = "Remarkable", powerId = null, prettyRange = "";
            let powerDamageType = "physical-force";

            if (useAdHoc) {
              powerName = String($dlg('[name="adhocName"]').val() || "Force Blast");
              powerDamage = Number($dlg('[name="adhocDamage"]').val() || 0);
              powerRank = String($dlg('[name="adhocRank"]').val() || "Remarkable");
              if (!Number.isFinite(powerDamage) || powerDamage < 0) {
                ui.notifications.error("Enter a valid non-negative damage value.");
                return;
              }
            } else {
              const itemId = srcVal.replace("power:", "");
              const item = forceItems.find(i => i.id === itemId);
              if (!item) {
                ui.notifications.error("Select a force power or use ad-hoc.");
                return;
              }
              powerId = itemId;
              const s = item.system || {};
              powerName = item.name;
              powerDamage = derivePowerDamage(s, actor);
              powerRank = String(s.rank ?? s.powerRank ?? "Remarkable");
              prettyRange = s.range === "rank"
                ? (POWER_RANGE[powerRank] || "")
                : String(s.calculatedRange || "");
              powerDamageType = "physical-force";
            }

            // Get CS from shared panel
            const csData = _csState ? _csState.get() : { totalShift: 0, manualCS: 0, rangePenalty: 0, csNotes: "" };
            const shift = csData.totalShift;
            const manualCS = csData.manualCS;

            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const karma = karmaToSpend;
            const usePowerToHit = !!$dlg('#pwr-hit-toggle').is(':checked');

            const range = Number($dlg('[name="range"]').val() || 1);

            const multiAdjacent = !!$dlg('#multi-enabled').is(':checked');

            // Guard: multiple targets need Adjacent
            const targetTokens = Array.from(game.user?.targets ?? []);
            if (targetTokens.length > 1 && !multiAdjacent) {
              ui.notifications.warn("Multiple targets selected. Enable Adjacent Multi-Attack or reduce to one target.");
              return;
            }

            const pullEnabled = !!$dlg('#pull-punch-enabled').is(':checked');
            const pulledDamage = pullEnabled ? parseInt($dlg('[name="pulledDamage"]').val() || 0) : 0;
            const aimEnabled = $dlg('#aim-enabled').is(':checked');
            const aimMode = aimEnabled ? ($dlg('[name="aimMode"]').val() || "none") : "none";

            const csNotes = csData.csNotes;

            // Save settings
            if (rememberSettings) {
              await actor.setFlag("msh-faserip", "lastForceAdHoc", useAdHoc);
              await actor.setFlag("msh-faserip", "lastForceAdHocName", powerName);
              await actor.setFlag("msh-faserip", "lastForceAdHocDamage", powerDamage);
              await actor.setFlag("msh-faserip", "lastForceAdHocRank", powerRank);
              await actor.setFlag("msh-faserip", "lastForceItemId", powerId || "");
              await actor.setFlag("msh-faserip", "lastForceRange", range);
              await actor.setFlag("msh-faserip", "lastForceUsePowerToHit", usePowerToHit);
              await actor.setFlag("msh-faserip", "lastForceShift", manualCS);
              await actor.setFlag("msh-faserip", "cs_force", manualCS);
              await actor.setFlag("msh-faserip", "lastForceMultiAdjacent", multiAdjacent);
              await actor.setFlag("msh-faserip", "lastForcePullEnabled", pullEnabled);
              await actor.setFlag("msh-faserip", "lastForcePulledDamage", pulledDamage);
              await actor.setFlag("msh-faserip", "lastForceAim", aimMode);
              await actor.setFlag("msh-faserip", "lastForceReason", csData.reason);
            }
            await actor.setFlag("msh-faserip", "csNotes", csNotes);

            _resolved = true;
            resolve({
              powerName, powerDamage, powerRank, powerId, prettyRange,
              shift, karma, spendKarma, range, skipDice: skipDice, usePowerToHit,
              totalShift: shift,
              manualCS,
              rangePenalty: csData.rangePenalty,
              multiAdjacent,
              pulledDamage, resultCap: "none",
              aimMode,
              csNotes
            });
            dlg.close();
          });

          // ── Cancel button handler ──
          html.find('#frp-cancel').on('click', () => {
            _resolved = true;
            resolve(null);
            dlg.close();
          });

          // ── Main update function (damage + range display only — CS handled by csState) ──
          const update = () => {
            const srcVal = html.find('#power-source-select').val() || "adhoc";
            const isAdHoc = srcVal === "adhoc";
            html.find('#adhoc-row').css('display', isAdHoc ? 'block' : 'none');

            let currentDamage = 0, currentRank = "Remarkable";
            if (isAdHoc) {
              currentDamage = Number(html.find('[name="adhocDamage"]').val()) || 0;
              currentRank = String(html.find('[name="adhocRank"]').val() || "Remarkable");
            } else {
              const itemId = srcVal.replace("power:", "");
              const item = forceItems.find(i => i.id === itemId);
              if (item) {
                const s = item.system || {};
                currentDamage = derivePowerDamage(s, actor);
                currentRank = String(s.rank ?? s.powerRank ?? "Remarkable");
              }
            }

            html.find('#dmg-val').text(currentDamage);

            // Armor preview
            let armor = 0;
            if (primaryTargetActor) {
              const armorData = getBodyArmorValues(primaryTargetActor, "physical-force");
              armor = armorData?.applicable ?? 0;
            }
            const after = Math.max(0, currentDamage - armor);
            html.find('#after-armor-display').text(
              primaryTarget ? `${after} after armor` : `${currentDamage} damage`
            );

            // Update max range hint based on power rank
            const powerMaxRange = this._getPowerRangeInAreas(currentRank);
            html.find('#max-range-hint').text(powerMaxRange);

            // Range penalty — update CS panel and range info display
            const rangeVal = Number(html.find('[name="range"]').val() || 0);
            const $rangePenalty = html.find('#range-penalty-display');
            if (rangeVal > powerMaxRange && powerMaxRange > 0) {
              const penalty = -(rangeVal - powerMaxRange);
              $rangePenalty.text(`${penalty}CS`).css('color', '#e65100');
              _csState.setRange(penalty);
            } else {
              $rangePenalty.text('');
              _csState.setRange(0);
            }

            // Update reduce max
            const $pulledDamage = html.find('[name="pulledDamage"]');
            const oldMax = Number($pulledDamage.attr('max')) || 0;
            $pulledDamage.attr('max', currentDamage);
            if (oldMax !== currentDamage && !html.find('#pull-punch-enabled').is(':checked')) {
              $pulledDamage.val(currentDamage);
            }

            // Update PwrHit base rank if checked
            const usePwrHit = html.find('#pwr-hit-toggle').is(':checked');
            _csState.setAbilityRank(usePwrHit ? currentRank : ability.rank);

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };

          // ── Event wiring ──
          html.find('#power-source-select').on('change', update);
          html.find('[name="adhocDamage"], [name="adhocRank"]').on('input change', update);
          html.find('[name="range"]').on('input change', update);

          // Pull punch toggle
          html.find('#pull-punch-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            const $pulledDamage = html.find('[name="pulledDamage"]');
            $row.toggleClass('inactive', !this.checked);
            if (this.checked) {
              const currentMax = Number($pulledDamage.attr('max')) || initialDamage;
              $pulledDamage.val(currentMax).prop('disabled', false);
            } else {
              $pulledDamage.val($pulledDamage.attr('max')).prop('disabled', true);
            }
          });

          // Multi toggle
          html.find('#multi-enabled').on('change', function() {
            $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
          });

          // Aim tactic toggle
          html.find('#aim-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            $row.toggleClass('inactive', !this.checked);
            $row.find('[name="aimMode"]').prop('disabled', !this.checked);
          });

          // Karma toggle
          html.find('#spend-karma').on('change', function() {
            $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
          });

          applyCapabilitiesToDialog(html, "force", { actor });
          this._disposeAutoFill = attachAutoFillRange(html, actor, update);

          html.find('#msh-skip-dice').on('change', function() {
            setLS(lsSkipKey, this.checked ? "1" : "0");
          });
          html.find('#msh-remember-settings').on('change', function() {
            setLS(lsRememberKey, this.checked ? "1" : "0");
          });

          update();
        },
        close: () => {
          if (_csState) _csState.destroy();
          if (this._disposeAutoFill) this._disposeAutoFill();
          if (!_resolved) resolve(null);
        },
      });
    });

    if (!choice) return { rawActionCancelled: true };

    // Handle adjacent multi
    if (choice.multiAdjacent) {
      choice.totalShift = (choice.totalShift || 0) - 4;
      ui.notifications.info(`Attacking ${game.user.targets.size} adjacent targets at -4CS!`);
    }

    // Mode already set by setupModeSelector during dialog render
    const mode = this.opts.mode;

    // Build shift breakdown
    const shiftBreakdown = {
      manual: choice.manualCS || 0,
      range: choice.rangePenalty || 0,
      csNotes: choice.csNotes || ""
    };
    if (choice.multiAdjacent) shiftBreakdown.adjacent = -4;
    choice.shiftBreakdown = shiftBreakdown;

    const toHitAbility = choice.usePowerToHit
      ? { name: "Power", rank: choice.powerRank, value: RANKS[choice.powerRank] || 30 }
      : ability;

    const rawDamage = choice.pulledDamage > 0 ? choice.pulledDamage : Number(choice.powerDamage) || 0;
    const powerItem = choice.powerId ? actor.items.get(choice.powerId) : null;
    const targetCount = choice.multiAdjacent ? targets.length : 1;

    await this._executeSingleAttack({
      choice: { ...choice, weapon: powerItem },
      actor,
      ability: toHitAbility,
      actionType, actionName, effects,
      damageType: "physical-force",
      rawDamage,
      damageNote: `Power: ${choice.powerName} (${choice.powerRank})`,
      sourceName: choice.powerName || "Force Blast",
      attackForm: "force",
      breakingFeat: null,
      targetCount,
      attackNumber: 1,
      totalAttacks: 1
    });

  } // end execute()
}
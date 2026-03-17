// scripts/modules/actions/grappling-action.js v3.0.0 - 2026-03-17
// v3.0.0: Port to v3 compact dialog layout matching blunt/edged/shooting/energy/force
//         - frp-dlg wrapper, frp-header-v3 banner, frp-cs-box with chips + situational dropdown
//         - Talent chip detection: Wrestling (+2CS), MA-C (+1CS), MA-B (+1CS)
//         - Grapple info box (blue) with strength/hold damage
//         - frp-fx-grid (W/G/Y/R), frp-foot, titlebar mode buttons, 360px width
//         - Auto-detect target status effects for sit tags
// v2.4.0: Consistency fixes — replace local rankValues with game.msh.getRankValue,
//         add mode selector (manual/semi/full), bump version
// v2.3.0: Add support for weapon-based grappling (whips with GP damage type use material strength)
// v2.2.3: Fix shift override - treat opts.shift=0 as "not set" to allow saved values
// v2.2.2: Fix CS persistence - decouple from global rememberSettings, use only local lastGrappleRemember flag
// v2.2.1: Fix CS modifier persistence - use localStorage for Remember Settings checkbox (matches blunt attack pattern)
// v2.2.0: Add opts.prefill support for Grapple Back from escape reverse
// v2.1.0: Add Deal Hold Damage chip on Full Hold (red) result
// v2.0.0: Compact chat card format matching blunt attack (inline result badge, CS hover, no grid)
// v1.5.0: Fix karma checkbox to always default unchecked (not persisted)
// v1.4.0: Fix DiceSoNice animation in consolidated chat cards mode
// v1.3.0: Fix escape button to pass holder info for dialog prefill
// v1.2.0: Use effect-engine wrappers for Partial Hold/Full Hold effects
// v1.1.0: Add inline rolls for consolidated chat cards
import { AttackAction } from "./attack-action.js";
import {
  RANKS,
  getStrengthInfo, 
  shiftRank, 
  rollWithKarmaAndHistory,
  buildActionsBox,
  bannerColors, 
  labelFor, 
  effectsFor,
  applyCapabilitiesToDialog,
  showDiceAnimation,
  buildModeSelector,
  setupModeSelector,
  getTargetData,
  getBodyArmorValues
} from "./action-utils.js";
import { setupKarmaControlHandlers, extractKarmaFromDialog, getAvailableKarma, getMinimumKarmaCommitment } from "../dice/dice-roller.js";
import { applyGrappled, applyHeld } from "../effects/effect-engine.js";
import { getAttackShiftBreakdown, getDefenseShiftBreakdown } from "../effects/effect-modifiers.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";

export class GrapplingAction extends AttackAction {
  constructor(args) {
    super(args);
    this.actionType = "grappling";
    this.label = labelFor(this.actionType);
    this.effects = effectsFor(this.actionType);
  }

  async execute() {
    const actor = this.actor;
    const actionName = this.label;
    
    // Check if a weapon was passed (e.g., whip with GP damage type)
    const passedItem = this.opts?.item || this.opts?.sourceItem || this.opts?.equipment || null;
    const isWeaponGrapple = passedItem?.type === "equipment" && 
                            passedItem?.system?.damageType?.toUpperCase() === "GP";
    
    // For weapon grapples, use material strength; otherwise use actor's Strength
    let strength;
    let strengthSource;
    if (isWeaponGrapple) {
      const materialRank = passedItem.system?.materialStrength || "Typical";
      strength = {
        rank: materialRank,
        value: game.msh.getRankValue(materialRank) || 6
      };
      strengthSource = passedItem.name;
    } else {
      strength = getStrengthInfo(actor);
      strengthSource = "Strength";
    }

    // Load persisted defaults (karma checkbox never persisted - always starts unchecked)
    const savedShift = await actor.getFlag("msh-faserip", "lastGrappleShift") ?? 0;

    // FIX: Decouple from global "rememberSettings" to avoid cross-action contamination.
    // We default to false so persistence is opt-in or strictly follows the specific flag.
    const savedRemember = (await actor.getFlag("msh-faserip", "lastGrappleRemember")) ?? false;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "lastGrappleSkipDice")) ?? false;

    const savedSpendKarma = false; // Always default to unchecked
    const savedCsNotes = (await actor.getFlag("msh-faserip", "lastGrappleCsNotes")) || "";

    // Only apply the saved shift if Remember was explicitly checked last time
    // Note: Use explicit undefined check - if caller passes shift:0, still use saved value
    // (callers who want to override should pass a non-zero value or use prefill)
    const optsShift = this.opts?.shift;
    const dialogShift = (optsShift !== undefined && optsShift !== null && optsShift !== 0) 
      ? optsShift 
      : (savedRemember ? savedShift : 0);

    const choice = await this._showGrapplingDialog(actor, strength, { 
      savedShift: dialogShift, 
      savedSpendKarma, 
      savedRemember, 
      savedSkipDice,
      savedCsNotes,
      isWeaponGrapple,
      weaponName: isWeaponGrapple ? passedItem.name : null,
      strengthSource
    });
    if (!choice) return;

    // Always save remember/skipDice preferences to specific flags only
    await actor.setFlag("msh-faserip", "lastGrappleRemember", choice.remember);
    await actor.setFlag("msh-faserip", "lastGrappleSkipDice", choice.skipDice);

    // Persist modifiers only if requested
    if (choice.remember) {
      await actor.setFlag("msh-faserip", "lastGrappleShift", choice.shift);
      await actor.setFlag("msh-faserip", "lastGrappleCsNotes", choice.csNotes || "");
    }

    // Build shift breakdown for hover text
    const shiftBreakdown = {
      manual: choice.shift || 0,
      csNotes: choice.csNotes || ""
    };

    // Get effect-based modifiers
    const attackerEffects = getAttackShiftBreakdown(actor);
    let targetActor = null;
    let defenderEffects = { total: 0, breakdown: [] };
    
    if (choice.targetUuid) {
      try {
        const tDoc = await fromUuid(choice.targetUuid);
        targetActor = tDoc?.actor ?? (tDoc?.documentName === "Actor" ? tDoc : null);
        if (targetActor) {
          defenderEffects = getDefenseShiftBreakdown(targetActor, false);
        }
      } catch (_e) { /* ignore */ }
    }

    // Calculate total shift including effects
    const manualShift = choice.shift || 0;
    const effectShift = (attackerEffects.total || 0) - (defenderEffects.total || 0);
    const totalShift = manualShift + effectShift;

    const effectiveRank = shiftRank(strength.rank, totalShift);

    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) { /* setting not registered yet */ }

    const roll = await (new Roll("1d100")).evaluate();
    
    // Show dice animation
    if (!choice.skipDice) {
      await showDiceAnimation(roll, actor, `${actor.name} attempts to Grapple ${choice.targetName}`, useConsolidated);
    }

    const { cappedTotal, totalKarmaUsed } =
        await rollWithKarmaAndHistory(actor, actionName, 0, roll, { spendKarma: choice.spendKarma, rank: effectiveRank, inlineRoll: useConsolidated });

    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const effect = this.effects[colorLower] || "Miss";
    const { bg, fg } = bannerColors(colorLower);

    // Show escape button for Partial Hold and Hold results
    const showEscape = (colorLower === "yellow" || colorLower === "red");
    if (showEscape && choice?.targetUuid) {
      try {
        const tDoc = await fromUuid(choice.targetUuid);
        const tActor = tDoc?.actor ?? (tDoc?.documentName === "Actor" ? tDoc : null);
        if (tActor) {
          // Remove any existing hold effects
          const existingHolds = tActor.effects?.filter(e => 
            e.statuses?.has?.("grappled") || 
            e.statuses?.has?.("held") ||
            e.statuses?.has?.("partial-hold") ||
            e.statuses?.has?.("full-hold")
          );
          for (const eff of existingHolds || []) {
            await eff.delete();
          }
          
          // Apply appropriate hold effect using effect-engine
          if (colorLower === "yellow") {
            // Partial Hold = Grappled
            await applyGrappled(tActor, { 
              holderUuid: actor.uuid, 
              holderName: actor.name,
              rounds: null  // Until escaped
            });
          } else {
            // Full Hold = Held
            await applyHeld(tActor, { 
              holderUuid: actor.uuid, 
              holderName: actor.name,
              rounds: null  // Until escaped
            });
          }
        }
      } catch (e) {
        console.warn("[FASERIP WARN] Grappling hold status failed", e);
      }
    }
    
    // For the escape button, the "defender" is the HOLDER (this actor), not the target
    // This prefills the escape dialog with the holder's name and strength
    const holderStrength = actor.system?.abilities?.strength?.rank || "Good";
    
    // Show Hold Damage button only on Full Hold (red)
    const showHoldDamage = (colorLower === "red");
    
    const actions = buildActionsBox({
      showEscape: showEscape,
      showHoldDamage: showHoldDamage,
      holdDamageMax: strength.value,
      holdDamageRank: strength.rank,
      holdTargetUuid: choice.targetUuid || "",
      holdTargetName: choice.targetName || "Target",
      // Escape chip uses targetUuid/Name/Strength for the holder (opponent to escape from)
      targetUuid: actor.uuid,
      targetName: actor.name,
      targetStrength: holderStrength,
      actorUuid: actor.uuid,
      autoApply: !!this.opts?.autoApply,
    });

    const cardHtml = this._buildChatCard({
      actor, 
      choice, 
      strength, 
      effectiveRank, 
      roll, 
      totalKarmaUsed, 
      cappedTotal, 
      color, 
      effect,
      bg, 
      fg,
      actions,
      totalShift,
      shiftBreakdown,
      attackerEffects: attackerEffects.breakdown,
      defenderEffects: defenderEffects.breakdown
    });

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

    return { roll, color, effectiveRank, cappedTotal, totalKarmaUsed };
  }

  async _showGrapplingDialog(actor, strength, { savedShift = 0, savedSpendKarma = false, savedRemember = false, savedSkipDice = false, savedCsNotes = "", isWeaponGrapple = false, weaponName = null, strengthSource = "Strength" } = {}) {
    // ── Target data ──
    let prefillTargetName = this.opts?.prefill?.targetName || "";
    let prefillTargetStr  = this.opts?.prefill?.targetStrength || "";
    let prefillTargetUuid = this.opts?.prefill?.targetUuid || "";

    if (!prefillTargetName) {
      const targets = Array.from(game.user?.targets ?? []);
      if (targets.length === 1) {
        const tok = targets[0];
        prefillTargetName = tok?.name || "";
        prefillTargetStr  = tok?.actor?.system?.abilities?.strength?.rank || "";
        prefillTargetUuid = tok?.actor?.uuid || "";
      }
    }

    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    const targetHealth = primaryTargetActor?.system?.attributes?.health;
    const targetHealthStr = targetHealth ? `${targetHealth.value}/${targetHealth.max}` : "";
    const targetStrRank = primaryTargetActor?.system?.abilities?.strength?.rank || prefillTargetStr;
    const targetStrAbbr = targetStrRank ? (RANK_ABBR[targetStrRank] || targetStrRank) : "";
    const targetStrVal = targetStrRank ? (game.msh.getRankValue(targetStrRank) || 0) : "";
    const targetEffects = (primaryTargetActor?.effects?.filter(e => !e.disabled) ?? [])
      .filter(e => {
        const n = (e.name || e.label || '').toLowerCase();
        return !n.includes('body armor') && !n.includes('force field');
      });
    const targetStatusStr = targetEffects.length > 0
      ? targetEffects.map(e => e.name || e.label).join(", ")
      : "";

    // ── Talent detection (grappling-relevant) ──
    const combatTalents = [];
    const savedActiveChips = (await actor.getFlag("msh-faserip", "lastGrappleActiveChips")) || {};

    for (const item of actor.items) {
      if (item.type !== "talent") continue;
      const name = (item.name || "").toLowerCase();
      const rankOverride = item.system?.rankOverride || "";
      let ultimateCS = 0;
      if (rankOverride) {
        const baseIdx = RANKS.indexOf(strength.rank);
        const overIdx = RANKS.indexOf(rankOverride);
        if (baseIdx >= 0 && overIdx >= 0) ultimateCS = overIdx - baseIdx;
      }

      if (name.includes("wrestling")) {
        combatTalents.push({ name: "Wrestling", cs: 2, flag: null, note: "+2CS grapple", ultimateCS, rankOverride });
      }
      else if (name.includes("martial arts c") || name.includes("martial arts-c") ||
               (name.includes("martial arts") && name.includes("(c)"))) {
        combatTalents.push({ name: "MA-C", cs: 1, flag: null, note: "+1CS grapple/escape/dodge", ultimateCS, rankOverride });
      }
      else if (name.includes("martial arts b") || name.includes("martial arts-b") ||
               (name.includes("martial arts") && name.includes("(b)"))) {
        combatTalents.push({ name: "MA-B", cs: 1, flag: null, note: "+1CS Fighting", ultimateCS, rankOverride });
      }
    }

    // ── Dialog title and ability ──
    const dialogTitle = "Grappling";
    const abilityLabel = isWeaponGrapple ? `${weaponName} (Material)` : "Base Strength";
    const strengthAbbr = RANK_ABBR[strength.rank] || strength.rank;

    // ── Karma ──
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    // ── CS display ──
    const csInputCls = savedShift > 0 ? ' pos' : savedShift < 0 ? ' neg' : '';
    const csRankStyle = savedShift > 0 ? 'color:#2e7d32;' : savedShift < 0 ? 'color:#c62828;' : '';

    // ── Build talent chips HTML ──
    const talentChipsHtml = combatTalents.map(t => {
      const savedState = savedActiveChips[t.name] || '';
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
        const flagActive = savedState.includes('flag');
        return `<span class="frp-talent-chip${flagActive ? ' active-flag' : ''}" data-flag="${t.flag}" data-talent="${t.name}">
          ${t.name} <span class="chip-note">${t.note}</span>
        </span>`;
      }
      return '';
    }).join('');

    // ── Dialog HTML — v3 Compact Layout ──
    const dialogHtml = `
    <div class="frp-dlg">

      <!-- Header: Actor (Base Strength / Rank Value) attacks Target -->
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor.name}">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">${abilityLabel}</span>
          <span class="h-stat-rank">${strengthAbbr} ${strength.value}</span>
        </span>
        <span class="h-paren">)</span>
        ${targetDisplay
          ? `<span class="h-verb">attacks</span><span class="h-target" title="${targetDisplay}">${targetDisplay}</span>`
          : ''}
      </div>

      <!-- Target compact line -->
      ${primaryTarget ? `
      <div class="frp-target-compact">
        <span class="t-name">${targetDisplay}</span>
        ${targetHealthStr ? `<span class="t-hp">HP: ${targetHealthStr}</span>` : ''}
        ${targetStatusStr ? `<span class="t-status">${targetStatusStr}</span>` : ''}
        ${targetStrRank ? `<span class="t-armor">STR: ${targetStrAbbr} ${targetStrVal}</span>` : ''}
      </div>
      ` : `
      <div class="frp-target-compact">
        <span class="t-none">No target selected</span>
        <input type="text" name="targetName" value="${prefillTargetName}" placeholder="Target name" style="flex:1;font-size:12px;padding:2px 4px;border:1px solid #ccc;border-radius:2px;">
      </div>
      `}

      <!-- CS box: chips + situational dropdown -->
      <div class="frp-box frp-cs-box">
        <div class="frp-cs-line">
          <span class="frp-cs-label">CS</span>
          <input type="number" class="frp-cs-input${csInputCls}" name="shift" value="${savedShift}" id="cs-grapple">
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-cs-rank" id="rank-grapple" style="${csRankStyle}">${shiftRank(strength.rank, savedShift)}</span>
          <button type="button" class="frp-cs-reset" style="visibility:${savedShift !== 0 ? 'visible' : 'hidden'}">&times;</button>
          <select class="frp-sit-select" id="sit-select">
            <option value="">+ situational&hellip;</option>
            <optgroup label="Bonuses">
              <option value="2" data-label="Blindside" title="Target unaware or from behind">Blindside +2CS</option>
              <option value="1" data-label="Double Team" title="Ally has Hold on target">Double Team +1CS</option>
            </optgroup>
            <optgroup label="Penalties">
              <option value="-2" data-label="Impaired" title="Lost Endurance ranks, -2CS all actions">Impaired -2CS</option>
            </optgroup>
            <optgroup label="Target Size">
              <option value="1" data-label="Growth +1" title="Target 12-18ft">Growth 12-18ft +1CS</option>
              <option value="2" data-label="Growth +2" title="Target 18-22ft">Growth 18-22ft +2CS</option>
              <option value="3" data-label="Growth +3" title="Target 22ft+">Growth 22ft+ +3CS</option>
              <option value="-1" data-label="Shrink -1" title="Target ~1 inch">Shrunk 1&Prime; -1CS</option>
              <option value="-2" data-label="Shrink -2" title="Target ~1/4 inch">Shrunk &frac14;&Prime; -2CS</option>
              <option value="-3" data-label="Shrink -3" title="Target smaller">Shrunk smaller -3CS</option>
            </optgroup>
          </select>
        </div>
        ${combatTalents.length > 0 ? `<div class="frp-chip-row">${talentChipsHtml}</div>` : ''}
        <div class="frp-sit-tags" id="sit-tags"></div>
      </div>

      <!-- Grapple info box (blue) -->
      <div class="frp-box" style="background:#f0f4ff;border-color:#90caf9;padding:3px 8px;">
        <div style="display:flex;align-items:baseline;gap:8px;font-size:13px;color:#444;">
          <span style="font-size:11px;color:#777;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">Grapple with</span>
          <span style="font-family:'Oswald',sans-serif;font-weight:700;font-size:16px;color:#1a1a1a;">${strengthSource}: ${strengthAbbr} ${strength.value}</span>
          ${isWeaponGrapple ? `<span style="font-size:11px;color:#6a1b9a;">weapon material</span>` : ''}
          <span style="margin-left:auto;font-size:12px;color:#777;">Hold dmg: ${strength.value}</span>
        </div>
      </div>

      <!-- Options: Karma -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${!hasKarma ? ' inactive' : hasKarma ? ' inactive' : ''}">
          ${hasKarma ? `
            <label><input type="checkbox" id="spend-karma" name="spendKarma"> <span class="frp-opt-label blue">Karma</span></label>
            <span class="frp-karma-pool"><strong>${availableKarma}</strong> avail (min ${minKarma})</span>
          ` : `<span style="font-size:12px;color:#999;">No karma available</span>`}
        </div>
      </div>

      <!-- Effect preview grid -->
      <div class="frp-fx-grid">
        <div class="frp-fx-cell w">Miss<br><span style="font-size:9px;font-weight:400;opacity:0.7;">no other atk</span></div>
        <div class="frp-fx-cell g">Miss<br><span style="font-size:9px;font-weight:400;opacity:0.7;">no other atk</span></div>
        <div class="frp-fx-cell y">Partial<br><span style="font-size:9px;font-weight:400;opacity:0.7;">-2CS, no move</span></div>
        <div class="frp-fx-cell r">Full Hold<br><span style="font-size:9px;font-weight:400;opacity:0.7;">restrained</span></div>
      </div>

      <!-- Footer: checkboxes + buttons on one row -->
      <div class="frp-foot">
        <label><input type="checkbox" name="remember" ${savedRemember ? 'checked' : ''}> Remember</label>
        <label><input type="checkbox" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
        <div class="frp-foot-btns">
          <button type="button" class="frp-btn-cancel" id="frp-cancel">Cancel</button>
          <button type="button" class="frp-btn-roll" id="frp-roll">Roll</button>
        </div>
      </div>

    </div>
    `;

    // Store target str from token for resolve
    const resolvedTargetStr = targetStrRank || prefillTargetStr;

    return new Promise((resolve) => {
      let _resolved = false;
      const dlg = new Dialog({
        title: dialogTitle,
        content: dialogHtml,
        buttons: {},
        render: async (html) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');

          // Hide Foundry's native button row
          $dialog.find('.dialog-buttons').hide();

          // Inject mode buttons into the titlebar
          const $titlebar = $dialog.find('.window-title, .dialog-title').first();
          if ($titlebar.length) {
            const modeHtml = buildModeSelector({ mode: "semi" });
            const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
            $titlebar.after($modeWrap);
          }
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastGrapplingMode");

          // Set dialog width
          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          // ── Roll button handler ──
          html.find('#frp-roll').on('click', async () => {
            const $dlg = (s) => html.find(s);

            const { spendKarma } = extractKarmaFromDialog(html);
            const shift = parseInt($dlg('[name="shift"]').val() || 0);

            // Build csNotes from active chips + sit tags
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

            // Strip sit tags from saved shift
            let sitTagCS = 0;
            html.find('.frp-sit-tag').each(function() {
              sitTagCS += parseInt($(this).data('cs')) || 0;
            });
            const baseShift = shift - sitTagCS;

            const rememberSettings = !!$dlg('[name="remember"]').is(':checked');
            const skipDice = !!$dlg('[name="skipDice"]').is(':checked');

            if (rememberSettings) {
              await actor.setFlag("msh-faserip", "lastGrappleShift", baseShift);
              await actor.setFlag("msh-faserip", "lastGrappleActiveChips", activeChips);
            }

            _resolved = true;
            resolve({
              targetName:     primaryTarget?.name || String($dlg('[name="targetName"]').val() || prefillTargetName || "Target"),
              targetStrength: resolvedTargetStr,
              targetUuid:     primaryTargetActor?.uuid || prefillTargetUuid,
              shift,
              csNotes,
              spendKarma,
              remember: rememberSettings,
              skipDice
            });
            dlg.close();
          });

          // ── Cancel button handler ──
          html.find('#frp-cancel').on('click', () => {
            _resolved = true;
            resolve(null);
            dlg.close();
          });

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

          // ── CS update function ──
          const update = () => {
            const cs = parseInt(html.find('[name="shift"]').val()) || 0;
            const shiftedRankText = shiftRank(strength.rank, cs);
            const $shiftedRank = html.find('#rank-grapple');
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
          html.find('[name="shift"]').on('input change', update);

          // CS reset — deactivate talent chips and remove situational tags
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
            const cs = parseInt($tag.data('cs')) || 0;
            const $csInput = html.find('[name="shift"]');
            $csInput.val(parseInt($csInput.val()) - cs).trigger('change');
            $tag.remove();
          });

          // Karma toggle — inactive styling
          html.find('#spend-karma').on('change', function() {
            $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
          });

          applyCapabilitiesToDialog(html, "grappling", { actor });
        },
        close: () => {
          if (!_resolved) resolve(null);
        }
      }).render(true);
    });
  }

  _buildChatCard({ actor, choice, strength, effectiveRank, roll, totalKarmaUsed, cappedTotal, color, effect, bg, fg, actions, totalShift, shiftBreakdown, attackerEffects = [], defenderEffects = [] }) {
    const effectLower = String(effect).toLowerCase();
    
    // Build CS hover breakdown
    let shiftDisplay = "";
    if (totalShift !== 0) {
      const parts = [];
      
      // Manual shift from dialog
      if (shiftBreakdown?.manual && shiftBreakdown.manual !== 0) {
        if (shiftBreakdown.csNotes) {
          parts.push(shiftBreakdown.csNotes);
        } else {
          parts.push(`${shiftBreakdown.manual > 0 ? '+' : ''}${shiftBreakdown.manual}`);
        }
      }

      
      // Attacker effects
      for (const eff of attackerEffects) {
        parts.push(`${eff.shift > 0 ? '+' : ''}${eff.shift} ${eff.name}`);
      }
      
      // Defender effects (flip sign)
      for (const eff of defenderEffects) {
        parts.push(`${eff.shift > 0 ? '-' : '+'}${Math.abs(eff.shift)} ${eff.name}`);
      }
      
      const breakdownText = parts.length > 0 ? parts.join(', ') : `${totalShift > 0 ? '+' : ''}${totalShift} total`;
      const csBox = `<span title="${breakdownText}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${totalShift > 0 ? '+' : ''}${totalShift}CS</span>`;
      shiftDisplay = ` (${csBox} → ${effectiveRank})`;
    }

    // Build roll display with yellow hover box
    const rollBox = `<span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span>`;
    const rollDisplay = totalKarmaUsed 
      ? `${cappedTotal} <span style="color:#666;">(${rollBox} + ${totalKarmaUsed} karma)</span>`
      : rollBox;

    // Effect-specific blocks
    const partialMovement = choice.targetStrength
      ? this._compareRanks(strength.rank, choice.targetStrength) >= 0
        ? `<div style="color:#f57f17;font-weight:bold;">Target cannot move (STR ${strength.rank} ≥ ${choice.targetStrength})</div>`
        : `<div>Target can still move (STR ${strength.rank} &lt; ${choice.targetStrength})</div>`
      : `<div style="color:#666;font-style:italic;">Movement restriction depends on relative Strength</div>`;

    const effectBlocks = {
      miss: `
        <div style="padding:6px 10px;margin:4px 10px 6px;background:#ffebee;border:1px solid #ef5350;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#c62828;">Miss</div>
          <div>No hold established. ${actor.name} may not make other attacks this round.</div>
        </div>`,
      partial: `
        <div style="padding:6px 10px;margin:4px 10px 6px;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#f57f17;">Partial Hold</div>
          <div>Target acts at -2 CS; no damage inflicted.</div>
          ${partialMovement}
        </div>`,
      hold: `
        <div style="padding:6px 10px;margin:4px 10px 6px;background:#e8f5e9;border:1px solid #66bb6a;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#2e7d32;">Full Hold</div>
          <div>Target fully restrained; cannot act.</div>
          <div>You may perform one additional action.</div>
          <div><strong>May inflict up to ${strength.rank} (${strength.value}) damage</strong> (subject to Body Armor)</div>
        </div>`
    };

    return `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <!-- Header -->
        <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#8b0000;">GRAPPLING</strong>
          <span style="color:#666;font-size:.85em;">Strength FEAT</span>
        </div>
        
        <!-- Attacker → Target -->
        <div style="padding:4px 10px;font-size:.95em;">
          <strong>${actor.name}</strong> <span style="color:#666;">→</span> <strong style="color:#d32f2f;">${choice.targetName}</strong>
          ${choice.targetStrength ? `<span style="color:#666;font-size:.85em;margin-left:8px;">(STR: ${choice.targetStrength})</span>` : ''}
        </div>
        
        <!-- Ability + Roll + Result -->
        <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
          <div>Strength: ${strength.rank}${shiftDisplay}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span>Roll: ${rollDisplay}</span>
            <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
              ${String(color).toUpperCase()} — ${String(effect).toUpperCase()}
            </span>
          </div>
        </div>
        
        ${effectBlocks[effectLower] || ""}
        ${actions}
      </div>
    `;
  }

  _compareRanks(a, b) {
    const R = ["Shift-0","Feeble","Poor","Typical","Good","Excellent","Remarkable","Incredible","Amazing","Monstrous","Unearthly","Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"];
    return Math.sign(R.indexOf(a) - R.indexOf(b));
  }
}